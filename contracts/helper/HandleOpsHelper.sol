// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.6/core/EntryPoint.sol";

contract HandleOpsHelper {
    EntryPoint public immutable ENTRYPOINT;

    constructor(address payable _entryPoint) {
        ENTRYPOINT = EntryPoint(_entryPoint);
    }

    function handleOps(UserOperation[] calldata ops) public {
        ENTRYPOINT.handleOps(ops, payable(msg.sender));
    }
}
