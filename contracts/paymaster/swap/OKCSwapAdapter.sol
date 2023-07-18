// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/ISwapRouter.sol";
import "../../interfaces/ISwapAdapter.sol";

contract OKCSwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable swapRouter;
    address public immutable nativeToken;
    mapping(address => address[]) public paths;

    event PathSet(address indexed token, address[] path);

    receive() external payable {}

    constructor(address _swapRouter, address _owner) {
        _transferOwnership(_owner);
        swapRouter = ISwapRouter(_swapRouter);
        nativeToken = ISwapRouter(_swapRouter).WOKT();
    }

    function setPath(address token, address[] memory path) external onlyOwner {
        paths[token] = path;
        emit PathSet(token, path);
    }

    function swapToNative(
        address tokenIn,
        uint256 minAmountOut
    ) external override returns (uint256 amountOut) {
        return swapToNativeViaOKCSwap(tokenIn, minAmountOut);
    }

    function swapToNativeViaOKCSwap(
        address tokenIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        address[] memory path = paths[tokenIn];
        require(path.length > 0, "SwapHelper: path not found");

        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        IERC20(tokenIn).safeApprove(address(swapRouter), 0);
        IERC20(tokenIn).safeApprove(address(swapRouter), tokenInBalance);
        swapRouter.swapExactTokensForOKT(
            tokenInBalance,
            minAmountOut,
            path,
            address(this),
            block.timestamp
        );

        amountOut = address(this).balance;
        payable(msg.sender).transfer(amountOut);
    }
}
