// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./IEntryPoint.sol";
import "./IPaymaster.sol";

interface IEntryPointSimulations {
    function simulateHandleOpWithoutSig(UserOperation calldata op) external;

    error SimulateHandleOpResult(
        uint256 preOpGas,
        IPaymaster.PostOpMode,
        bytes result,
        uint256 paid,
        uint256 callGasCost,
        uint256 gasPrice,
        uint256 deadline,
        uint256 paymasterDeadline
    );
}
