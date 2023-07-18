/**
 ** Account-Abstraction (EIP-4337) singleton EntryPoint implementation.
 ** Only one instance required on each chain.
 **/
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */

import "../core/EntryPoint.sol";

contract MockEntryPointL1 is EntryPoint {
    constructor(address _owner) EntryPoint(_owner) {}

    function mockhandleOps(UserOperation[] calldata ops) public {
        handleOps(ops);
    }

    function mockhandleOpsNoRevert(UserOperation[] calldata ops) public {
        handleOps(ops, payable(msg.sender));
    }

    function mockhandleAggregatedOps(
        UserOpsPerAggregator[] calldata ops
    ) public {
        handleAggregatedOps(ops, payable(msg.sender));
    }

    function handleOpTestGas(
        uint256 opIndex,
        UserOperation calldata userOp,
        UserOpInfo memory outOpInfo,
        address aggregator
    ) external returns (uint256) {
        require(msg.sender == address(this), "can only call by handleOps");

        (uint256 deadline, uint256 paymasterDeadline, ) = _validatePrepayment(
            opIndex,
            userOp,
            outOpInfo,
            aggregator
        );

        _validateDeadline(opIndex, outOpInfo, deadline, paymasterDeadline);

        uint256 actualGasCost = _executeUserOp(opIndex, userOp, outOpInfo);

        return actualGasCost;
    }

    function handleOpsTestGas(
        UserOperation[] calldata ops,
        address payable beneficiary
    ) public {
        uint256 opslen = ops.length;

        if (!officialBundlerWhiteList[msg.sender]) {
            require(
                unrestrictedBundler && msg.sender == tx.origin,
                "called by illegal bundler"
            );
            require(opslen == 1, "only support one op");
        }

        UserOpInfo[] memory opInfos = new UserOpInfo[](opslen);
        uint256 collected = 0;

        unchecked {
            for (uint256 i = 0; i < opslen; i++) {
                try
                    this.handleOpTestGas(i, ops[i], opInfos[i], address(0))
                returns (uint256 gasUsed) {
                    collected += gasUsed;
                } catch (bytes memory revertReason) {
                    emit HandleUserOpRevertReason(
                        ops[i].sender,
                        ops[i].nonce,
                        revertReason
                    );
                }
            }

            // console.log(collected / opslen);

            _compensate(beneficiary, collected);
        }
    }
}
