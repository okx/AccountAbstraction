// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;
import "../wallet-0.4/SmartAccount.sol";

contract MockSmartAccount is SmartAccount {
    constructor(
        address _EntryPoint,
        address _FallbackHandler,
        string memory _name,
        string memory _version
    ) SmartAccount(_EntryPoint, _FallbackHandler, _name, _version) {}

    function execTransactionFromEntrypoint1(
        address to,
        uint256 value,
        bytes calldata data
    ) public {
        executeWithGuard(to, value, data);
    }
}
