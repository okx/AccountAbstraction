pragma solidity =0.6.6;
import "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol";

contract MockUniswapV2Router is UniswapV2Router02 {
    constructor(
        address _factory,
        address _WETH
    ) public UniswapV2Router02(_factory, _WETH) {}
}
