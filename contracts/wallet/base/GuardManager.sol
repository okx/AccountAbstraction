// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../common/Enum.sol";
import "../common/SelfAuthorized.sol";
import "./Executor.sol";

interface Guard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external;

    function checkAfterExecution(bool success) external;
}

/// @title Fallback Manager - A contract that manages fallback calls made to this contract
contract GuardManager is SelfAuthorized, Executor {
    event ChangedGuard(address guard);

    // keccak256("guard_manager.guard.address")
    bytes32 internal constant GUARD_STORAGE_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    function getGuard() public view returns (address guard) {
        bytes32 slot = GUARD_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            guard := sload(slot)
        }
    }

    function setGuard(address guard) external authorized {
        bytes32 slot = GUARD_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, guard)
        }
        emit ChangedGuard(guard);
    }

    // execute from this contract
    function execTransactionBatch(
        bytes memory executeParamBytes
    ) external authorized {
        executeWithGuardBatch(abi.decode(executeParamBytes, (ExecuteParams[])));
    }

    function execTransactionRevertOnFail(
        bytes memory executeParamBytes
    ) external authorized {
        execTransactionBatchRevertOnFail(
            abi.decode(executeParamBytes, (ExecuteParams[]))
        );
    }

    function executeWithGuard(
        address to,
        uint256 value,
        bytes calldata data
    ) internal {
        address guard = getGuard();
        if (guard != address(0)) {
            Guard(guard).checkTransaction(to, value, data, Enum.Operation.Call);
            Guard(guard).checkAfterExecution(
                execute(
                    ExecuteParams(false, to, value, data, ""),
                    Enum.Operation.Call,
                    gasleft()
                )
            );
        } else {
            execute(
                ExecuteParams(false, to, value, data, ""),
                Enum.Operation.Call,
                gasleft()
            );
        }
    }

    function execTransactionBatchRevertOnFail(
        ExecuteParams[] memory _params
    ) internal {
        address guard = getGuard();
        uint256 length = _params.length;

        if (guard == address(0)) {
            for (uint256 i = 0; i < length; ) {
                ExecuteParams memory param = _params[i];
                execute(param, Enum.Operation.Call, gasleft());

                if (param.nestedCalls.length > 0) {
                    try
                        this.execTransactionRevertOnFail(param.nestedCalls)
                    {} catch (bytes memory returnData) {
                        revert(string(returnData));
                    }
                }

                unchecked {
                    ++i;
                }
            }
        } else {
            for (uint256 i = 0; i < length; ) {
                ExecuteParams memory param = _params[i];

                Guard(guard).checkTransaction(
                    param.to,
                    param.value,
                    param.data,
                    Enum.Operation.Call
                );

                Guard(guard).checkAfterExecution(
                    execute(param, Enum.Operation.Call, gasleft())
                );

                if (param.nestedCalls.length > 0) {
                    try
                        this.execTransactionRevertOnFail(param.nestedCalls)
                    {} catch (bytes memory returnData) {
                        revert(string(returnData));
                    }
                }

                unchecked {
                    ++i;
                }
            }
        }
    }

    function executeWithGuardBatch(ExecuteParams[] memory _params) internal {
        address guard = getGuard();
        uint256 length = _params.length;

        if (guard == address(0)) {
            for (uint256 i = 0; i < length; ) {
                ExecuteParams memory param = _params[i];
                bool success = execute(param, Enum.Operation.Call, gasleft());
                if (success) {
                    emit HandleSuccessExternalCalls();
                }

                if (param.nestedCalls.length > 0) {
                    try this.execTransactionBatch(param.nestedCalls) {} catch (
                        bytes memory returnData
                    ) {
                        emit HandleFailedExternalCalls(returnData);
                    }
                }

                unchecked {
                    ++i;
                }
            }
        } else {
            for (uint256 i = 0; i < length; ) {
                ExecuteParams memory param = _params[i];

                Guard(guard).checkTransaction(
                    param.to,
                    param.value,
                    param.data,
                    Enum.Operation.Call
                );

                bool success = execute(param, Enum.Operation.Call, gasleft());
                if (success) {
                    emit HandleSuccessExternalCalls();
                }

                Guard(guard).checkAfterExecution(success);

                if (param.nestedCalls.length > 0) {
                    try this.execTransactionBatch(param.nestedCalls) {} catch (
                        bytes memory returnData
                    ) {
                        emit HandleFailedExternalCalls(returnData);
                    }
                }

                unchecked {
                    ++i;
                }
            }
        }
    }
}
