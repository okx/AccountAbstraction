// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../../interfaces/IPriceOracle.sol";

contract ChainlinkOracleAdapter is PriceOracle {
    constructor(address _owner) PriceOracle(_owner) {}

    uint256 public immutable DEFAULT_TIMEOUT = 1 days;
    mapping(address => uint256) public timeouts;

    function exchangePrice(
        address token
    ) public view virtual override returns (uint256 price, uint8 decimals) {
        AggregatorV3Interface tokenPriceFeed = AggregatorV3Interface(
            priceFeed[token]
        );
        require(
            tokenPriceFeed != AggregatorV3Interface(address(0)),
            "tokenPriceFeed is not setted"
        );
        (
            ,
            /* uint80 roundID */ int256 _price /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/,
            ,
            uint256 timeStamp,

        ) = tokenPriceFeed.latestRoundData();

        require(
            timeStamp + getTimeout(token) > block.timestamp,
            "price is outdated"
        );
        //  price -> uint256
        require(_price >= 0, "price is negative");
        price = uint256(_price);
        decimals = tokenPriceFeed.decimals();
    }

    function setTimeout(address token, uint256 timeout) public onlyOwner {
        timeouts[token] = timeout;
    }

    function getTimeout(address token) public view returns (uint256) {
        uint256 timeout = timeouts[token];
        return timeout == 0 ? DEFAULT_TIMEOUT : timeout;
    }
}
