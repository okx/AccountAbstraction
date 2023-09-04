// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Create2.sol";
import "./SmartAccountV2.sol";
import "./SmartAccountProxyV2.sol";
import {AccountFactoryStorage} from "./AccountFactoryStorage.sol";

/**
 * A wrapper factory contract to deploy SmartAccount as an Account-Abstraction wallet contract.
 */
contract AccountFactoryV2 is AccountFactoryStorage {
    event ProxyCreation(SmartAccountProxyV2 proxy, address singleton);
    event SafeSingletonSet(address safeSingleton, bool value);

    function initialize(address walletTemplate) public {
        require(initialized == 0, "only initialize once");
        initialized = 1;
        safeSingleton[walletTemplate] = true;
        emit SafeSingletonSet(walletTemplate, true);
    }

    function setSafeSingleton(
        address _safeSingleton,
        bool value
    ) public onlyOwner {
        safeSingleton[_safeSingleton] = value;
        emit SafeSingletonSet(_safeSingleton, value);
    }

    /// @dev Allows to retrieve the runtime code of a deployed Proxy. This can be used to check that the expected Proxy was deployed.
    function proxyRuntimeCode() public pure returns (bytes memory) {
        return type(SmartAccountProxyV2).runtimeCode;
    }

    /// @dev Allows to retrieve the creation code used for the Proxy deployment. With this it is easily possible to calculate predicted address.
    function proxyCreationCode() public pure returns (bytes memory) {
        return type(SmartAccountProxyV2).creationCode;
    }

    /// @dev Allows to create new proxy contact using CREATE2 but it doesn't run the initializer.
    ///      This method is only meant as an utility to be called from other methods
    /// @param initializer Payload for message call sent to new proxy contract.
    /// @param saltNonce Nonce that will be used to generate the salt to calculate the address of the new proxy contract.
    function deployProxyWithNonce(
        address, /* keep for external apis */
        bytes memory initializer,
        uint256 saltNonce
    ) internal returns (SmartAccountProxyV2 proxy) {
        // If the initializer changes the proxy address should change too. Hashing the initializer data is cheaper than just concatinating it
        address creator = abi.decode(initializer, (address));

        bytes32 salt = keccak256(
            abi.encodePacked(creator, saltNonce)
        );

        bytes memory deploymentData = abi.encodePacked(
            type(SmartAccountProxyV2).creationCode
        );
        // solhint-disable-next-line no-inline-assembly
        assembly {
            proxy := create2(
                0x0,
                add(0x20, deploymentData),
                mload(deploymentData),
                salt
            )
        }
        require(address(proxy) != address(0), "Create2 call failed");
        walletWhiteList[address(proxy)] = true;
    }

    /// @dev Allows to create new proxy contact and execute a message call to the new proxy within one transaction.
    /// @param _singleton Address of singleton contract.
    /// @param initializer Payload for message call sent to new proxy contract.
    /// @param saltNonce Nonce that will be used to generate the salt to calculate the address of the new proxy contract.
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) internal returns (SmartAccountProxyV2 proxy) {
        proxy = deployProxyWithNonce(_singleton, initializer, saltNonce);

        if (initializer.length > 0) {
            // solhint-disable-next-line no-inline-assembly
            bytes memory initdata = abi.encodeWithSelector(
                SmartAccountProxyV2.initialize.selector,
                _singleton,
                initializer
            );

            assembly {
                if eq(
                    call(
                        gas(),
                        proxy,
                        0,
                        add(initdata, 0x20),
                        mload(initdata),
                        0,
                        0
                    ),
                    0
                ) {
                    revert(0, 0)
                }
            }
        }

        emit ProxyCreation(proxy, _singleton);
    }

    function createAccount(
        address _safeSingleton,
        bytes memory initializer,
        uint256 salt
    ) public returns (address) {
        require(safeSingleton[_safeSingleton], "Invalid singleton");

        address addr = getAddress(_safeSingleton, initializer, salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return addr;
        }

        return address(createProxyWithNonce(_safeSingleton, initializer, salt));
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     * (uses the same "create2 signature" used by SmartAccountProxyFactory.createProxyWithNonce)
     */
    function getAddress(
        address, /* useless value, keep for external apis */
        bytes memory initializer,
        uint256 salt
    ) public view returns (address) {
        //copied from deployProxyWithNonce
        // omit another parameters while create wallet address
        address creator = abi.decode(initializer, (address));

        bytes32 salt2 = keccak256(
            abi.encodePacked(creator, salt)
        );
        bytes memory deploymentData = abi.encodePacked(
            type(SmartAccountProxyV2).creationCode
        );
        return
            Create2.computeAddress(
                bytes32(salt2),
                keccak256(deploymentData),
                address(this)
            );
    }
}
