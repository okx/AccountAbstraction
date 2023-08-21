// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../interfaces/IEntryPointLogic.sol";
import {EntryPoint as EntryPoint0_4} from "../@eth-infinitism-v0.4/core/EntryPoint.sol";
import "./Validations.sol";

contract EntryPointLogic is IEntryPointLogic, EntryPoint0_4, Validations {
    constructor(address owner) {
        _transferOwnership(owner);
    }

    function handleOps(
        UserOperation[] calldata ops,
        address payable beneficiary
    ) public override(EntryPoint0_4, IEntryPoint) {
        uint256 opslen = ops.length;

        if (!officialBundlerWhiteList[msg.sender]) {
            require(
                unrestrictedBundler && msg.sender == tx.origin,
                "called by illegal bundler"
            );
            require(opslen == 1, "only support one op");
        }

        UserOpInfo[] memory opInfos = new UserOpInfo[](opslen);
        uint256 collected;
        unchecked {
            for (uint256 i = 0; i < opslen; ++i) {
                try this.handleOp(i, ops[i], opInfos[i], address(0)) returns (
                    uint256 gasUsed
                ) {
                    collected += gasUsed;
                } catch (bytes memory revertReason) {
                    emit HandleUserOpRevertReason(
                        ops[i].sender,
                        ops[i].nonce,
                        revertReason
                    );
                }
            }
            _compensate(beneficiary, collected);
        }
    }

    function handleOps(UserOperation[] calldata ops) public override {
        handleOps(ops, payable(msg.sender));
    }

    function handleOp(
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

        return _executeUserOp(opIndex, userOp, outOpInfo);
    }

    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata,
        address payable
    ) public pure override(EntryPoint0_4, IEntryPoint) {
        revert("Not support aggregator yet");
    }
}
