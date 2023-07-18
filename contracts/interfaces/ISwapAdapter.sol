// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.12;

interface ISwapAdapter {
    function swapToNative(
        address tokenIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    function nativeToken() external view returns (address);
}
