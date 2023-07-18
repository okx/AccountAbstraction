// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;
import "../wallet/common/Enum.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISmartAccount {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external;
}

contract MockModule {
    ISmartAccount public aa;

    constructor(address aaAccount) {
        aa = ISmartAccount(aaAccount);
    }

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external {
        aa.execTransactionFromModule(to, value, data, operation);
    }

    function transferToken(address token, address to, uint256 amount) public {
        IERC20(token).transfer(to, amount);
    }
}
