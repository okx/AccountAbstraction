// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "./IEntryPoint.sol";

interface IEntryPointSimulations is IEntryPoint {

    /**
     * return value of simulateHandleOp
     */
    error SimulateHandleOpResult(
        uint48 validAfter,
        uint48 validUntil,
        address validationAggregator,
        uint256 preOpGas,
        bool execSuccess,
        bytes execErrMsg,
        uint256 actualGasUsed,
        uint256 postOpGas,
        uint256 paid,
        bool targetSuccess,
        bytes targetResult);

    /**
     * Simulate full execution of a UserOperation (including both validation and target execution)
     * It performs full validation of the UserOperation, but ignores signature error.
     * An optional target address is called after the userop succeeds,
     * and its value is returned (before the entire call is reverted).
     * @param op The UserOperation to simulate.
     * @param target         - If nonzero, a target address to call after userop simulation. If called,
     *                         the targetSuccess and targetResult are set to the return from that call.
     * @param targetCallData - CallData to pass to target address.
     */
    function simulateHandleOp(
        UserOperation calldata op,
        address target,
        bytes calldata targetCallData
    )
    external;

    function estimateGas(
        UserOperation calldata op,
        address target,
        bytes calldata targetCallData
    ) external;
}
