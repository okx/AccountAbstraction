// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.12;


/// build for MockTokenPaymaster.sol
/// not specify a specific instance version of entryPoint
interface MockIEntryPoint {

    /**
     * add to the deposit of the given account
     */
    function depositTo(address account) external payable;

    /**
     * withdraw from the deposit.
     * @param withdrawAddress the address to send withdrawn value.
     * @param withdrawAmount the amount to withdraw.
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
}
