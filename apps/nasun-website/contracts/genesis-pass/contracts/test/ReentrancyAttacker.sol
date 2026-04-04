// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

interface INasunGenesisPass {
    function mint(uint256 tokenId, uint256 quantity, uint256 maxQuantity, uint256 deadline, bytes calldata signature) external payable;
}

/// @notice Test contract for reentrancy attack via ERC1155 onERC1155Received callback
contract ReentrancyAttacker is IERC1155Receiver {
    INasunGenesisPass public target;
    uint256 public attackCount;
    uint256 public maxAttacks;

    // Stored params for re-entrant calls in allowlist stages
    uint256 private _maxQuantity;
    uint256 private _deadline;
    bytes private _signature;
    uint256 private _payment;

    constructor(address _target) {
        target = INasunGenesisPass(_target);
        maxAttacks = 3;
    }

    /// @notice Attack in PUBLIC stage (no signature needed)
    function attackPublic() external payable {
        attackCount = 0;
        _payment = msg.value / maxAttacks;
        target.mint{value: _payment}(1, 1, 0, 0, "");
    }

    /// @notice Attack in allowlist stage (with valid signature)
    function attackWithSignature(uint256 maxQty, uint256 deadline, bytes calldata signature) external payable {
        attackCount = 0;
        _maxQuantity = maxQty;
        _deadline = deadline;
        _signature = signature;
        _payment = msg.value / maxAttacks;
        target.mint{value: _payment}(1, 1, maxQty, deadline, signature);
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        attackCount++;
        if (attackCount < maxAttacks) {
            // Attempt re-entrant mint
            try target.mint{value: _payment}(1, 1, _maxQuantity, _deadline, _signature) {} catch {}
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }

    receive() external payable {}
}
