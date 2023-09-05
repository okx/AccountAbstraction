// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.6/interfaces/IPaymaster.sol";

interface ITokenPaymaster is IPaymaster {
    event TokenPriceLimitMaxSet(address indexed token, uint256 price);
    event TokenPriceLimitMinSet(address indexed token, uint256 price);
    event SlippageSet(address indexed token, uint256 slippage);
    event SwapAdapterSet(address indexed swapAdapter);
    event AddedToWhitelist(address indexed account);
    event RemovedFromWhitelist(address indexed account);
    event Withdrawal(address indexed token, uint256 amount);
    event PriceOracleUpdated(address indexed priceOracle);
    event SwappedToNative(
        address token,
        uint256 amountSwapped,
        uint256 amountDeposited
    );

    event TokenCost(
        bytes32 indexed userOpHash,
        address indexed sender,
        address indexed token,
        uint256 ERC20Cost,
        uint256 gasCost
    );
}
