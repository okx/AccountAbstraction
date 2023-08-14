// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;
import "../common/Enum.sol";

/// @title Executor - A contract that can execute transactions
contract Executor {
    struct ExecuteParams {
        bool allowFailed;
        address to;
        uint256 value;
        bytes data;
        bytes nestedCalls; // ExecuteParams encoded as bytes
    }

    event HandleSuccessExternalCalls();
    event HandleFailedExternalCalls(bytes revertReason);

    function execute(
        ExecuteParams memory params,
        Enum.Operation operation,
        uint256 txGas
    ) internal returns (bool success) {
        bytes memory result;

        if (operation == Enum.Operation.DelegateCall) {
            // solhint-disable-next-line no-inline-assembly
            (success, result) = params.to.delegatecall{gas: txGas}(params.data);
        } else {
            // solhint-disable-next-line no-inline-assembly
            (success, result) = payable(params.to).call{
                gas: txGas,
                value: params.value
            }(params.data);
        }

        if (!success) {
            if (!params.allowFailed) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }
}
