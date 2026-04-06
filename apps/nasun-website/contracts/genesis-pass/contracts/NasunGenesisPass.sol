// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract NasunGenesisPass is
    ERC1155,
    EIP712,
    Ownable2Step,
    ReentrancyGuard,
    ERC2981
{
    using ECDSA for bytes32;
    using Address for address payable;

    // ──────────────────────── Types ────────────────────────

    enum Stage {
        PAUSED,
        FREE_MINT,
        GTD_ALLOWLIST,
        FCFS_ALLOWLIST,
        PUBLIC
    }

    // ──────────────────────── Errors ────────────────────────

    error StagePaused();
    error SoldOut();
    error NotEligible();
    error InvalidSignature();
    error SignatureExpired();
    error WalletLimitExceeded();
    error InvalidPayment();
    error InvalidTokenId();
    error SupplyBelowMinted();
    error ZeroAddress();
    error ZeroQuantity();
    error ContractMinter();
    error BackwardStageTransition();
    error MintingEnded();
    error TransfersLocked();
    error StageNotPriced();

    // ──────────────────────── Events ────────────────────────

    event StageChanged(Stage indexed newStage);
    event SignerChanged(address indexed newSigner);
    event StagePriceChanged(Stage indexed stage, uint256 price);
    event MintDeadlineChanged(uint256 newDeadline);
    event TransfersUnlocked();

    // ──────────────────────── Constants ────────────────────────

    uint256 public constant NUM_TOKEN_TYPES = 7;

    bytes32 public constant MINT_TYPEHASH = keccak256(
        "Mint(address minter,uint8 stage,uint256 maxQuantity,uint256 deadline)"
    );

    // ──────────────────────── State ────────────────────────

    Stage public currentStage;
    address public signer;

    mapping(uint256 tokenId => uint256) public totalMinted;
    mapping(uint256 tokenId => uint256) public maxSupply;
    mapping(Stage => mapping(address => uint256)) public mintedPerStage;
    mapping(Stage => uint256) public walletLimitPerStage;
    mapping(Stage => uint256) public mintPricePerStage;

    uint8 public highWaterMark;
    uint256 public mintDeadline;
    bool public transfersUnlocked;

    string private _baseURI;
    string private _contractURI;

    // ──────────────────────── Constructor ────────────────────────

    constructor(
        string memory baseURI_,
        string memory contractURI_,
        address signer_,
        uint256 defaultMaxSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    )
        ERC1155("")
        EIP712("NasunGenesisPass", "1")
        Ownable(msg.sender)
    {
        if (signer_ == address(0)) revert ZeroAddress();

        _baseURI = baseURI_;
        _contractURI = contractURI_;
        signer = signer_;

        for (uint256 i = 1; i <= NUM_TOKEN_TYPES; i++) {
            maxSupply[i] = defaultMaxSupply;
        }

        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    // ──────────────────────── Mint ────────────────────────

    function mint(
        uint256 tokenId,
        uint256 quantity,
        uint256 maxQuantity,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        if (currentStage == Stage.PAUSED) revert StagePaused();
        if (mintDeadline != 0 && block.timestamp > mintDeadline) revert MintingEnded();
        // Block contract-based bots in PUBLIC stage
        if (currentStage == Stage.PUBLIC && msg.sender != tx.origin) revert ContractMinter();
        if (quantity == 0) revert ZeroQuantity();
        if (tokenId < 1 || tokenId > NUM_TOKEN_TYPES) revert InvalidTokenId();
        if (totalMinted[tokenId] + quantity > maxSupply[tokenId]) revert SoldOut();
        if (mintedPerStage[currentStage][msg.sender] + quantity > walletLimitPerStage[currentStage]) {
            revert WalletLimitExceeded();
        }

        if (currentStage != Stage.PUBLIC) {
            // Allowlist stages require a valid EIP-712 signature
            if (block.timestamp > deadline) revert SignatureExpired();

            // Signature grants up to maxQuantity mints total for this stage
            if (mintedPerStage[currentStage][msg.sender] + quantity > maxQuantity) {
                revert WalletLimitExceeded();
            }

            bytes32 structHash = keccak256(abi.encode(
                MINT_TYPEHASH,
                msg.sender,
                uint8(currentStage),
                maxQuantity,
                deadline
            ));
            bytes32 digest = _hashTypedDataV4(structHash);
            address recovered = digest.recover(signature);
            if (recovered != signer) revert InvalidSignature();
        }

        // Payment validation
        if (currentStage == Stage.FREE_MINT) {
            if (msg.value != 0) revert InvalidPayment();
        } else {
            // Defense-in-depth: independently verify price even if setStage() guard passed
            uint256 price = mintPricePerStage[currentStage];
            if (price == 0) revert StageNotPriced();
            if (msg.value != price * quantity) revert InvalidPayment();
        }

        totalMinted[tokenId] += quantity;
        mintedPerStage[currentStage][msg.sender] += quantity;

        _mint(msg.sender, tokenId, quantity, "");
    }

    // ──────────────────────── Admin ────────────────────────

    function setStage(Stage stage_) external onlyOwner {
        // Forward-only progression; PAUSED(0) always allowed as emergency brake
        // highWaterMark prevents backward regression via PAUSED bypass
        if (stage_ != Stage.PAUSED && uint8(stage_) <= highWaterMark) {
            revert BackwardStageTransition();
        }
        // Paid stages must have a price configured before activation
        if (stage_ != Stage.PAUSED && stage_ != Stage.FREE_MINT && mintPricePerStage[stage_] == 0) {
            revert StageNotPriced();
        }
        currentStage = stage_;
        if (uint8(stage_) > highWaterMark) {
            highWaterMark = uint8(stage_);
        }
        emit StageChanged(stage_);
    }

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        emit SignerChanged(signer_);
    }

    function setStagePrice(Stage stage_, uint256 price) external onlyOwner {
        // Cannot set price for FREE_MINT (hardcoded 0) or PAUSED (no minting)
        if (stage_ == Stage.FREE_MINT || stage_ == Stage.PAUSED) revert StageNotPriced();
        // Paid stages must have price > 0
        if (price == 0) revert StageNotPriced();
        mintPricePerStage[stage_] = price;
        emit StagePriceChanged(stage_, price);
    }

    function setMaxSupply(uint256 tokenId, uint256 supply) external onlyOwner {
        if (tokenId < 1 || tokenId > NUM_TOKEN_TYPES) revert InvalidTokenId();
        if (supply < totalMinted[tokenId]) revert SupplyBelowMinted();
        maxSupply[tokenId] = supply;
    }

    function setWalletLimit(Stage stage_, uint256 limit) external onlyOwner {
        walletLimitPerStage[stage_] = limit;
    }

    function setURI(string calldata newURI) external onlyOwner {
        _baseURI = newURI;
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        _contractURI = newContractURI;
    }

    function setMintDeadline(uint256 deadline_) external onlyOwner {
        mintDeadline = deadline_;
        emit MintDeadlineChanged(deadline_);
    }

    function withdrawTo(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        to.sendValue(address(this).balance);
    }

    /// @notice One-way transfer unlock. Cannot be re-locked after calling.
    function unlockTransfers() external onlyOwner {
        transfersUnlocked = true;
        emit TransfersUnlocked();
    }

    // ──────────────────────── View ────────────────────────

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(_baseURI, "/", _toString(tokenId), ".json"));
    }

    function contractURI() public view returns (string memory) {
        return _contractURI;
    }

    function currentMintPrice() external view returns (uint256) {
        if (currentStage == Stage.FREE_MINT) return 0;
        return mintPricePerStage[currentStage];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function renounceOwnership() public view override onlyOwner {
        revert("Renounce disabled");
    }

    // ──────────────────────── Internal ────────────────────────

    /// @notice Transfer lock: blocks all transfers while locked, minting (from=0x0) always allowed
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override
    {
        if (from != address(0) && !transfersUnlocked) revert TransfersLocked();
        super._update(from, to, ids, values);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
