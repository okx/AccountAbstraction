// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.6/interfaces/IEntryPoint.sol";
import "../@eth-infinitism-v0.6/interfaces/IPaymaster.sol";

interface IEntryPointSimulations is IEntryPoint {
    error ExecutionResultCostom(
        uint256 preOpGas,
        IPaymaster.PostOpMode,
        bytes result,
        uint256 paid,
        uint256 callGasCost,
        uint256 gasPrice,
        uint48 validAfter,
        uint48 validUntil,
        bool targetSuccess,
        bytes targetResult
    );
}
