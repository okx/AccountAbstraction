// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

interface IExOraclePriceData {
    function latestRoundData(
        string calldata priceType,
        address dataSource
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function get(
        string calldata priceType,
        address source
    ) external view returns (uint256 price, uint256 timestamp);

    function getOffchain(
        string calldata priceType,
        address source
    ) external view returns (uint256 price, uint256 timestamp);

    function getCumulativePrice(
        string calldata priceType,
        address source
    ) external view returns (uint256 cumulativePrice, uint32 timestamp);

    function lastResponseTime(address source) external view returns (uint256);
}
