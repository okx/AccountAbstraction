// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../SmartAccount.sol";

/// @title Simulate Transaction Accessor - can be used with StorageAccessible to simulate Safe transactions
/// @author Richard Meissner - <richard@gnosis.pm>
contract SmartAccountInitCode {
    function getInitCode(
        address SmartAccountProxyFactory,
        address SmartAccountImplement,
        address owner,
        uint256 salt
    ) public pure returns (bytes memory initCode) {
        bytes memory initializeData = abi.encodeWithSignature(
            "Initialize(address)",
            owner
        );

        bytes memory data = abi.encodeWithSignature(
            "createAccount(address,bytes,uint256)",
            SmartAccountImplement,
            initializeData,
            salt
        );

        initCode = abi.encodePacked(
            abi.encodePacked(SmartAccountProxyFactory, data)
        );
    }
}
