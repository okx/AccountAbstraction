// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../interfaces/IEntryPointSimulations.sol";
import "../@eth-infinitism-v0.4/interfaces/IAccount.sol";
import "./EntryPointLogic.sol";
import "../@eth-infinitism-v0.4/library/UserOperation.sol";

contract EntryPointSimulations is IEntryPointSimulations, EntryPointLogic {
    constructor(address owner) EntryPointLogic(owner) {}

    function simulateValidationWithWalletWhitelistValidate(
        UserOperation calldata op
    ) external {
        UserOpInfo memory opInfo;

        (uint256 deadline, uint256 paymasterDeadline, ) = _validatePrepayment(
            0,
            op,
            opInfo,
            SIMULATE_FIND_AGGREGATOR
        );

        _validateDeadline(0, opInfo, deadline, paymasterDeadline);

        validateWalletWhitelist(op.sender);

        (
            uint256 actualGasCost,
            uint256 callGasEstimate,
            IPaymaster.PostOpMode mode,
            bytes memory excuteResult
        ) = _executeUserOpWithResult(0, op, opInfo);

        uint256 gasPrice = getUserOpGasPrice(opInfo.mUserOp);

        revert SimulateHandleOpResult(
            opInfo.preOpGas,
            mode,
            excuteResult,
            gasPrice > 0 ? actualGasCost / gasPrice : 0,
            callGasEstimate,
            gasPrice,
            deadline,
            paymasterDeadline
        );
    }

    function simulateHandleOpWithoutSig(
        UserOperation calldata op
    ) external override {
        UserOpInfo memory opInfo;

        (
            uint256 deadline,
            uint256 paymasterDeadline,

        ) = _validatePrepaymentWithoutSig(0, op, opInfo, address(0));

        _validateDeadline(0, opInfo, deadline, paymasterDeadline);

        validateWalletWhitelist(op.sender);

        (
            uint256 actualGasCost,
            uint256 callGasEstimate,
            IPaymaster.PostOpMode mode,
            bytes memory excuteResult
        ) = _executeUserOpWithResult(0, op, opInfo);

        uint256 gasPrice = getUserOpGasPrice(opInfo.mUserOp);

        revert SimulateHandleOpResult(
            opInfo.preOpGas,
            mode,
            excuteResult,
            gasPrice > 0 ? actualGasCost / gasPrice : 0,
            callGasEstimate,
            gasPrice,
            deadline,
            paymasterDeadline
        );
    }

    function _validatePrepaymentWithoutSig(
        uint256 opIndex,
        UserOperation calldata userOp,
        UserOpInfo memory outOpInfo,
        address aggregator
    )
        internal
        returns (
            uint256 deadline,
            uint256 paymasterDeadline,
            address actualAggregator
        )
    {
        uint256 preGas = gasleft();
        MemoryUserOp memory mUserOp = outOpInfo.mUserOp;
        _copyUserOpToMemory(userOp, mUserOp);
        outOpInfo.userOpHash = getUserOpHash(userOp);

        // validate all numeric values in userOp are well below 128 bit, so they can safely be added
        // and multiplied without causing overflow
        uint256 maxGasValues = mUserOp.preVerificationGas |
            mUserOp.verificationGasLimit |
            mUserOp.callGasLimit |
            userOp.maxFeePerGas |
            userOp.maxPriorityFeePerGas;
        require(maxGasValues <= type(uint120).max, "AA94 gas values overflow");

        uint256 gasUsedByValidateAccountPrepayment;
        uint256 requiredPreFund = _getRequiredPrefund(mUserOp);
        (
            gasUsedByValidateAccountPrepayment,
            actualAggregator,
            deadline
        ) = _validateAccountPrepaymentWithoutSig(
            opIndex,
            userOp,
            outOpInfo,
            aggregator,
            requiredPreFund
        );
        //a "marker" where account opcode validation is done and paymaster opcode validation is about to start
        // (used only by off-chain simulateValidation)
        numberMarker();

        bytes memory context;
        if (mUserOp.paymaster != address(0)) {
            (
                context,
                paymasterDeadline
            ) = _validatePaymasterPrepaymentWithoutSig(
                opIndex,
                userOp,
                outOpInfo,
                requiredPreFund,
                gasUsedByValidateAccountPrepayment
            );
        }
        unchecked {
            uint256 gasUsed = preGas - gasleft();

            if (userOp.verificationGasLimit < gasUsed) {
                revert FailedOp(
                    opIndex,
                    mUserOp.paymaster,
                    "AA40 over verificationGasLimit"
                );
            }
            outOpInfo.prefund = requiredPreFund;
            outOpInfo.contextOffset = getOffsetOfMemoryBytes(context);
            outOpInfo.preOpGas = preGas - gasleft() + userOp.preVerificationGas;
        }
    }

    function _validateAccountPrepaymentWithoutSig(
        uint256 opIndex,
        UserOperation calldata op,
        UserOpInfo memory opInfo,
        address aggregator,
        uint256 requiredPrefund
    )
        internal
        returns (
            uint256 gasUsedByValidateAccountPrepayment,
            address actualAggregator,
            uint256 deadline
        )
    {
        unchecked {
            uint256 preGas = gasleft();
            MemoryUserOp memory mUserOp = opInfo.mUserOp;
            address sender = mUserOp.sender;
            _createSenderIfNeeded(opIndex, opInfo, op.initCode);

            if (sender.code.length == 0) {
                // it would revert anyway. but give a meaningful message
                revert FailedOp(0, address(0), "AA20 account not deployed");
            }

            if (
                mUserOp.paymaster != address(0) &&
                mUserOp.paymaster.code.length == 0
            ) {
                // it would revert anyway. but give a meaningful message
                revert FailedOp(0, address(0), "AA30 paymaster not deployed");
            }

            uint256 missingAccountFunds = 0;
            address paymaster = mUserOp.paymaster;

            if (paymaster == address(0)) {
                uint256 bal = balanceOf(sender);
                missingAccountFunds = bal > requiredPrefund
                    ? 0
                    : requiredPrefund - bal;
            }

            try
                IAccount(sender).validateUserOpWithoutSig{
                    gas: mUserOp.verificationGasLimit
                }(op, opInfo.userOpHash, aggregator, missingAccountFunds)
            returns (uint256 _deadline) {
                deadline = _deadline;
            } catch Error(string memory revertReason) {
                revert FailedOp(opIndex, address(0), revertReason);
            } catch {
                revert FailedOp(opIndex, address(0), "AA23 reverted (or OOG)");
            }

            if (paymaster == address(0)) {
                DepositInfo storage senderInfo = deposits[sender];
                uint256 deposit = senderInfo.deposit;
                if (requiredPrefund > deposit) {
                    revert FailedOp(
                        opIndex,
                        address(0),
                        "AA21 didn't pay prefund"
                    );
                }
                senderInfo.deposit = uint112(deposit - requiredPrefund);
            }
            gasUsedByValidateAccountPrepayment = preGas - gasleft();
        }
    }

    function _validatePaymasterPrepaymentWithoutSig(
        uint256 opIndex,
        UserOperation calldata op,
        UserOpInfo memory opInfo,
        uint256 requiredPreFund,
        uint256 gasUsedByValidateAccountPrepayment
    ) internal returns (bytes memory context, uint256 deadline) {
        unchecked {
            MemoryUserOp memory mUserOp = opInfo.mUserOp;
            uint256 verificationGasLimit = mUserOp.verificationGasLimit;
            require(
                verificationGasLimit > gasUsedByValidateAccountPrepayment,
                "AA41 too little verificationGas"
            );
            uint256 gas = verificationGasLimit -
                gasUsedByValidateAccountPrepayment;

            address paymaster = mUserOp.paymaster;
            DepositInfo storage paymasterInfo = deposits[paymaster];
            uint256 deposit = paymasterInfo.deposit;
            if (deposit < requiredPreFund) {
                revert FailedOp(
                    opIndex,
                    paymaster,
                    "AA31 paymaster deposit too low"
                );
            }
            paymasterInfo.deposit = uint112(deposit - requiredPreFund);

            try
                IPaymaster(paymaster).validatePaymasterUserOpWithoutSig{
                    gas: gas
                }(op, opInfo.userOpHash, requiredPreFund)
            returns (bytes memory _context, uint256 _deadline) {
                context = _context;
                deadline = _deadline;
            } catch Error(string memory revertReason) {
                revert FailedOp(opIndex, paymaster, revertReason);
            } catch {
                revert FailedOp(opIndex, paymaster, "AA33 reverted (or OOG)");
            }
        }
    }

    function _executeUserOpWithResult(
        uint256 opIndex,
        UserOperation calldata userOp,
        UserOpInfo memory opInfo
    )
        internal
        returns (
            uint256 collected,
            uint256 callGasCost,
            IPaymaster.PostOpMode mode,
            bytes memory excuteResult
        )
    {
        uint256 preGas = gasleft();
        bytes memory context = getMemoryBytesFromOffset(opInfo.contextOffset);

        try
            this.innerHandleOpWithResult(userOp.callData, opInfo, context)
        returns (
            uint256 _actualGasCost,
            uint256 _callGasCost,
            IPaymaster.PostOpMode _mode,
            bytes memory _excuteResult
        ) {
            collected = _actualGasCost;
            callGasCost = _callGasCost;
            mode = _mode;
            excuteResult = _excuteResult;
        } catch {
            uint256 actualGas = preGas - gasleft() + opInfo.preOpGas;
            collected = _handlePostOp(
                opIndex,
                IPaymaster.PostOpMode.postOpReverted,
                opInfo,
                context,
                actualGas
            );
            mode = IPaymaster.PostOpMode.postOpReverted;
        }
    }

    function innerHandleOpWithResult(
        bytes calldata callData,
        UserOpInfo memory opInfo,
        bytes calldata context
    )
        external
        returns (
            uint256 actualGasCost,
            uint256 callGasCost,
            IPaymaster.PostOpMode postOpMode,
            bytes memory excuteResult
        )
    {
        uint256 preGas = gasleft();
        require(msg.sender == address(this), "AA92 internal call only");
        MemoryUserOp memory mUserOp = opInfo.mUserOp;

        IPaymaster.PostOpMode mode = IPaymaster.PostOpMode.opSucceeded;
        if (callData.length > 0) {
            (bool success, bytes memory result) = address(mUserOp.sender).call{
                gas: mUserOp.callGasLimit
            }(callData);
            callGasCost = preGas - gasleft();
            if (!success) {
                if (result.length > 0) {
                    emit UserOperationRevertReason(
                        opInfo.userOpHash,
                        mUserOp.sender,
                        mUserOp.nonce,
                        result
                    );
                }
                mode = IPaymaster.PostOpMode.opReverted;
            }

            excuteResult = result;
        }

        unchecked {
            uint256 actualGas = preGas - gasleft() + opInfo.preOpGas;
            //note: opIndex is ignored (relevant only if mode==postOpReverted, which is only possible outside of innerHandleOp)
            actualGasCost = _handlePostOp(0, mode, opInfo, context, actualGas);
            postOpMode = mode;
        }
    }
}
