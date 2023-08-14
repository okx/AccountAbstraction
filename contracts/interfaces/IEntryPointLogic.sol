// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.4/interfaces/IEntryPoint.sol";
import "../@eth-infinitism-v0.4/interfaces/IPaymaster.sol";

interface IEntryPointLogic is IEntryPoint {
    event HandleUserOpRevertReason(
        address sender,
        uint256 nonce,
        bytes revertReason
    );

    function handleOps(UserOperation[] calldata ops) external;
}
