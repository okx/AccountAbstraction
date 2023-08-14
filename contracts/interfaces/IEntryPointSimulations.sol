// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.4/interfaces/IEntryPoint.sol";
import "../@eth-infinitism-v0.4/interfaces/IPaymaster.sol";

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
