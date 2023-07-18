// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/ILBRouter.sol";
import "../../interfaces/ISwapAdapter.sol";
import "../../interfaces/IPriceOracle.sol";

contract TradeJoeV2Adapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    ILBRouter public immutable TradeJoeLBRouter;
    address public immutable nativeToken;
    mapping(address => address[]) public paths;
    mapping(address => uint256[]) public airBinSteps;

    event PathSet(address indexed token, address[] path);
    event AirBinStepSet(address indexed token, uint256[] airBinStep);

    receive() external payable {}

    constructor(address _TradeJoeLBRouter, address _owner) {
        _transferOwnership(_owner);
        TradeJoeLBRouter = ILBRouter(_TradeJoeLBRouter);
        nativeToken = ILBRouter(_TradeJoeLBRouter).wavax();
    }

    function setPath(address token, address[] memory path) external onlyOwner {
        paths[token] = path;
        emit PathSet(token, path);
    }

    function setAirBinStep(
        address token,
        uint256[] memory airBinStep
    ) external onlyOwner {
        airBinSteps[token] = airBinStep;
        emit AirBinStepSet(token, airBinStep);
    }

    function swapToNative(
        address tokenIn,
        uint256 minAmountOut
    ) external override returns (uint256 amountOut) {
        return swapToNativeViaTradeJoeV2(tokenIn, minAmountOut);
    }

    function swapToNativeViaTradeJoeV2(
        address tokenIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        address[] memory path = paths[tokenIn];
        uint256[] memory airBinStep = airBinSteps[tokenIn];
        require(path.length > 0, "SwapHelper: path not found");
        require(
            airBinStep.length == path.length - 1,
            "SwapHelper: airBinStep not found"
        );

        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        IERC20(tokenIn).safeApprove(address(TradeJoeLBRouter), 0);
        IERC20(tokenIn).safeApprove(address(TradeJoeLBRouter), tokenInBalance);
        TradeJoeLBRouter.swapExactTokensForAVAX(
            tokenInBalance,
            minAmountOut,
            airBinStep,
            path,
            payable(address(this)),
            block.timestamp
        );

        amountOut = address(this).balance;
        payable(msg.sender).transfer(amountOut);
    }
}
