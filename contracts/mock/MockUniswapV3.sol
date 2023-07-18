// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "../interfaces/IWETH9.sol";

contract MockUniSwapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    address public immutable WETH9;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

    receive() external payable {}

    constructor(address _WETH9) {
        WETH9 = _WETH9;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        TransferHelper.safeTransferFrom(
            params.tokenIn,
            msg.sender,
            address(this),
            params.amountIn
        );

        TransferHelper.safeTransfer(WETH9, params.recipient, 1e18);

        amountOut = 1e18;
    }

    function deposit() public payable {
        IWETH9(WETH9).deposit{value: msg.value}();
    }
}
