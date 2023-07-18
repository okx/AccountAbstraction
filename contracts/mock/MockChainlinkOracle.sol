// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockChainlinkOracle is Ownable {
    int256 public price;
    uint8 public decimals;

    constructor(address owner) {
        _transferOwnership(owner);
    }

    function setPrice(int256 _price) external onlyOwner {
        price = _price;
    }

    function setDecimals(uint8 _decimals) external onlyOwner {
        decimals = _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, price, 0, block.timestamp, 0);
    }
}
