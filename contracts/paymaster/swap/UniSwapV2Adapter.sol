// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/ISwapAdapter.sol";

// swapHelper is a helper contract that is used to swap tokens to native via uniV2Router
contract UniSwapV2Adapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    IUniswapV2Router02 public immutable uniV2Router;
    address public immutable nativeToken;
    mapping(address => address[]) public paths;

    event PathSet(address indexed token, address[] path);

    receive() external payable {}

    constructor(address _uniV2Router, address _owner) {
        _transferOwnership(_owner);
        uniV2Router = IUniswapV2Router02(_uniV2Router);
        nativeToken = IUniswapV2Router02(_uniV2Router).WETH();
    }

    function setPath(address token, address[] memory path) external onlyOwner {
        paths[token] = path;
        emit PathSet(token, path);
    }

    function swapToNative(
        address tokenIn,
        uint256 minAmountOut
    ) external override returns (uint256 amountOut) {
        return swapToNativeViaUniV2(tokenIn, minAmountOut);
    }

    function swapToNativeViaUniV2(
        address tokenIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        address[] memory path = paths[tokenIn];
        require(path.length > 0, "SwapHelper: path not found");

        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        IERC20(tokenIn).safeApprove(address(uniV2Router), 0);
        IERC20(tokenIn).safeApprove(address(uniV2Router), tokenInBalance);
        uniV2Router.swapExactTokensForETH(
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
