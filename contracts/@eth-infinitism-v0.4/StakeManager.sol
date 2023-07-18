// SPDX-License-Identifier: GPL-3.0
// Modified version of a Implementation of contracts for ERC-4337 account abstraction via alternative mempool.
// Original code: https://github.com/eth-infinitism/account-abstraction/tree/releases/v0.4
pragma solidity ^0.8.12;

import "../interfaces/IStakeManager.sol";

abstract contract StakeManager is IStakeManager {
    /// maps paymaster to their deposits and stakes
    mapping(address => DepositInfo) public deposits;

    function getDepositInfo(
        address account
    ) public view returns (DepositInfo memory info) {
        return deposits[account];
    }

    // internal method to return just the stake info
    function getStakeInfo(
        address addr
    ) internal view returns (StakeInfo memory info) {
        DepositInfo storage depositInfo = deposits[addr];
        info.stake = depositInfo.stake;
        info.unstakeDelaySec = depositInfo.unstakeDelaySec;
    }

    /// return the deposit (for gas payment) of the account
    function balanceOf(address account) public view returns (uint256) {
        return deposits[account].deposit;
    }

    receive() external payable {
        depositTo(msg.sender);
    }

    function internalIncrementDeposit(
        address account,
        uint256 amount
    ) internal {
        DepositInfo storage info = deposits[account];
        uint256 newAmount = info.deposit + amount;
        require(newAmount <= type(uint112).max, "deposit overflow");
        info.deposit = uint112(newAmount);
    }

    /**
     * add to the deposit of the given account
     */
    function depositTo(address account) public payable {
        internalIncrementDeposit(account, msg.value);
        DepositInfo storage info = deposits[account];
        emit Deposited(
            msg.sender,
            address(this),
            account,
            msg.value,
            info.deposit
        );
    }

    /**
     * withdraw from the deposit.
     * @param withdrawAddress the address to send withdrawn value.
     * @param withdrawAmount the amount to withdraw.
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 withdrawAmount
    ) external {
        DepositInfo storage info = deposits[msg.sender];
        require(withdrawAmount <= info.deposit, "Withdraw amount too large");
        info.deposit = uint112(info.deposit - withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAddress, withdrawAmount);
        (bool success, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "failed to withdraw");
    }

    function refundDeposit(
        address payable refundAddress,
        uint256 refundAmount
    ) internal {
        (bool success, ) = refundAddress.call{value: refundAmount, gas: 4500}(
            ""
        );

        if (success) {
            emit RefundDeposit(msg.sender, refundAddress, refundAmount);
        } else {
            internalIncrementDeposit(refundAddress, refundAmount);
        }
    }
}
