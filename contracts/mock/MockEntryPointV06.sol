/**
 ** Account-Abstraction (EIP-4337) singleton EntryPoint implementation.
 ** Only one instance required on each chain.
 **/
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */

import "../@eth-infinitism-v0.6/core/EntryPoint.sol";

contract MockEntryPointV06 is EntryPoint {
    constructor() EntryPoint() {}

    function mockhandleOps(UserOperation[] calldata ops) public {
        handleOps(ops, payable(msg.sender));
    }

    function mockhandleOpsNoRevert(UserOperation[] calldata ops) public {
        handleOps(ops, payable(msg.sender));
    }

    function mockhandleAggregatedOps(
        UserOpsPerAggregator[] calldata ops
    ) public {
        handleAggregatedOps(ops, payable(msg.sender));
    }
}
