// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/**
 * A wrapper factory contract to deploy SmartAccount as an Account-Abstraction wallet contract.
 */
interface ISmartAccountProxy {
    function masterCopy() external view returns (address);
}
