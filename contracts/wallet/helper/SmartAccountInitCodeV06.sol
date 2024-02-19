// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

/// @title Simulate Transaction Accessor - can be used with StorageAccessible to simulate Safe transactions
/// @author Richard Meissner - <richard@gnosis.pm>
contract SmartAccountInitCodeV06 {

    function getInitCode(
        address smartAccountProxyV2Factory,
        address smartAccountV2Implement,
        address owner,
        bytes memory extradata,
        uint256 salt
    ) public pure returns (bytes memory initCode) {
        bytes memory initializeData = abi.encode(
            owner,
            extradata
        );

        bytes memory data = abi.encodeWithSignature(
            "createAccount(address,bytes,uint256)",
            smartAccountV2Implement,
            initializeData,
            salt
        );

        initCode = abi.encodePacked(
            abi.encodePacked(smartAccountProxyV2Factory, data)
        );
    }
}
