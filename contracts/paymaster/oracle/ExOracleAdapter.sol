// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;
import "../../interfaces/IPriceOracle.sol";
import "../../interfaces/IExOraclePriceData.sol";

contract EXOracleAdapter is PriceOracle {
    IExOraclePriceData public exOracle;
    mapping(address => string) public priceType;
    mapping(address => uint8) public oracleDecimals;

    uint256 public immutable DEFAULT_TIMEOUT = 1 days;
    mapping(address => uint256) public timeouts;

    function setExOraclePriceData(
        IExOraclePriceData _exOracle
    ) public onlyOwner {
        require(address(_exOracle) != address(0), "invalid address");
        exOracle = _exOracle;
    }

    function setPriceType(
        address _address,
        string memory _priceType
    ) public onlyOwner {
        priceType[_address] = _priceType;
    }

    function setOracleDecimals(
        address _address,
        uint8 _decimals
    ) public onlyOwner {
        oracleDecimals[_address] = _decimals;
    }

    constructor(
        address _owner,
        IExOraclePriceData _oracle
    ) PriceOracle(_owner) {
        exOracle = _oracle;
    }

    function exchangePrice(
        address token
    ) public view virtual override returns (uint256 price, uint8 decimals) {
        uint256 timestamp;
        address feed = priceFeed[token];

        decimals = oracleDecimals[token];
        require(feed != address(0), "Oracle Price feed not set yet");
        require(decimals != 0, "Oracle Decimals not set yet");
        (price, timestamp) = IExOraclePriceData(exOracle).get(
            priceType[token],
            priceFeed[token]
        );

        require(
            timestamp + getTimeout(token) > block.timestamp,
            "price is outdated"
        );
        require(price != 0, "price is negative");
    }

    function setTimeout(address token, uint256 timeout) public onlyOwner {
        timeouts[token] = timeout;
    }

    function getTimeout(address token) public view returns (uint256) {
        uint256 timeout = timeouts[token];
        return timeout == 0 ? DEFAULT_TIMEOUT : timeout;
    }
}
