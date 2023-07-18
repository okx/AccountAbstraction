// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract MockTradeJoeV2Router {
    address public immutable wavax;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

    receive() external payable {}

    constructor(address _avax) {
        wavax = _avax;
    }

    function swapExactTokensForAVAX(
        uint amountIn,
        uint,
        uint256[] memory pairBinSteps,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == wavax, "TradeJoeV2: INVALID_PATH");

        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amountIn
        );

        TransferHelper.safeTransferETH(to, 1e18);
    }
}
