// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

interface INasunGenesisPass {
    function mint(uint256 tokenId, uint256 quantity, uint256 deadline, bytes calldata signature) external payable;
}

/// @notice Attempts reentrancy via ERC1155 onERC1155Received callback
contract ReentrancyAttacker is IERC1155Receiver {
    INasunGenesisPass public target;
    uint256 public attackCount;
    uint256 public maxAttacks;

    constructor(address _target) {
        target = INasunGenesisPass(_target);
        maxAttacks = 3;
    }

    function attack() external payable {
        attackCount = 0;
        target.mint{value: msg.value}(1, 1, 0, "");
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
            try target.mint{value: address(this).balance}(1, 1, 0, "") {} catch {}
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
