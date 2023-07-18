// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.10;

interface ILBRouter {
    function wavax() external view returns (address);

    function swapExactTokensForAVAX(
        uint256 amountIn,
        uint256 amountOutMinAVAX,
        uint256[] memory pairBinSteps,
        address[] memory tokenPath,
        address payable to,
        uint256 deadline
    ) external returns (uint256 amountOut);
}
