// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import {AccountFactoryStorageBase} from "./AccountFactoryStorage.sol";

contract AccountFactoryProxy is AccountFactoryStorageBase {
    
    event ImplementationSet(address indexed oldImpl, address indexed newImpl);

    constructor(address impl, address _owner, address walletTemplate) {
        implementation = impl;
        owner = _owner;

        (bool success, bytes memory returnData) = implementation.delegatecall(
            abi.encodeWithSignature("initialize(address)", 
            walletTemplate
        ));
        require(success, string(returnData));
    }

    function setImplementation(address impl) external onlyOwner {
        require(impl != address(0), "implementation is address 0");
        address oldImpl = implementation;
        implementation = impl;
        emit ImplementationSet(oldImpl, impl);
    }

    receive() external payable {
        revert("do not transfer to me");
    }

    /// @dev Fallback function forwards all transactions and returns all received return data.
    fallback() external payable {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let _singleton := and(
                sload(0),
                0xffffffffffffffffffffffffffffffffffffffff
            )
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(
                gas(),
                _singleton,
                0,
                calldatasize(),
                0,
                0
            )
            returndatacopy(0, 0, returndatasize())
            if eq(success, 0) {
                revert(0, returndatasize())
            }
            return(0, returndatasize())
        }
    }
}
