// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

/// @title SmartAccountStorage - Storage layout of the SmartAccount contracts to be used in libraries
contract SmartAccountStorage {
    // From /common/Singleton.sol
    address internal singleton;
    // From /common/ModuleManager.sol
    mapping(address => address) internal modules;

    // From /common/OwnerManager.sol
    mapping(address => address) internal owners;

    uint256 internal ownerCount;
    uint256 internal threshold;

    // From /SmartContract.sol
    bytes32 internal nonce;
}
