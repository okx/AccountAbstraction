// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract MockOKCSwapRouter {
    address public immutable WOKT;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

    receive() external payable {}

    constructor(address _WOKT) {
        WOKT = _WOKT;
    }

    function swapExactTokensForOKT(
        uint amountIn,
        uint,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == WOKT, "OKVSwap: INVALID_PATH");

        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amountIn
        );

        TransferHelper.safeTransferETH(to, 1e18);
    }
}
