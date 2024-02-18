// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IPeripheryImmutableState.sol";
import "../../interfaces/IWETH9.sol";
import "../../interfaces/ISwapAdapter.sol";

contract UniSwapV3Adapter is ISwapAdapter, Ownable {
    ISwapRouter public immutable uniV3Router;
    address public immutable nativeToken;
    mapping(address => uint24) public poolFee;

    event PoolFeeSet(address indexed token, uint24 fee);

    receive() external payable {}

    constructor(address _uniV3Router, address _owner) {
        _transferOwnership(_owner);
        uniV3Router = ISwapRouter(_uniV3Router);
        nativeToken = IPeripheryImmutableState(_uniV3Router).WETH9();
    }

    function setPoolFee(address token, uint24 fee) external onlyOwner {
        poolFee[token] = fee;
        emit PoolFeeSet(token, fee);
    }

    function swapToNative(
        address tokenIn,
        uint256 minAmountOut
    ) external override returns (uint256 amountOut) {
        return swapToNativeViaUniV3(tokenIn, minAmountOut);
    }

    function swapToNativeViaUniV3(
        address tokenIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        TransferHelper.safeApprove(tokenIn, address(uniV3Router), 0);
        TransferHelper.safeApprove(
            tokenIn,
            address(uniV3Router),
            tokenInBalance
        );

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: nativeToken,
                fee: poolFee[tokenIn],
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: tokenInBalance,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            });

        amountOut = uniV3Router.exactInputSingle(params);
        IWETH9(nativeToken).withdraw(amountOut);

        payable(msg.sender).transfer(address(this).balance);
    }
}
