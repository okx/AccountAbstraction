// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;
import "../wallet/common/Enum.sol";

contract MockGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external {}

    function checkAfterExecution(bool success) external {}
}
