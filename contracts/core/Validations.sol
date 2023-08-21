// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IValidations.sol";
import "../interfaces/ISmartAccountProxy.sol";
import "../interfaces/ISmartAccountProxyFactory.sol";

contract Validations is Ownable, IValidations {
    bool public unrestrictedWallet;
    bool public unrestrictedBundler;
    bool public unrestrictedModule;

    address public walletProxyFactory;

    mapping(address => bool) public officialBundlerWhiteList;
    mapping(address => bool) public moduleWhiteList;

    function setUnrestrictedWallet(bool allowed) public onlyOwner {
        unrestrictedWallet = allowed;
        emit UnrestrictedWalletSet(allowed);
    }

    function setUnrestrictedBundler(bool allowed) public onlyOwner {
        unrestrictedBundler = allowed;
        emit UnrestrictedBundlerSet(allowed);
    }

    function setUnrestrictedModule(bool allowed) public onlyOwner {
        unrestrictedModule = allowed;
        emit UnrestrictedModuleSet(allowed);
    }

    function setBundlerOfficialWhitelist(
        address bundler,
        bool allowed
    ) public onlyOwner {
        officialBundlerWhiteList[bundler] = allowed;
        emit BundlerWhitelistSet(bundler, allowed);
    }

    function setWalletProxyFactoryWhitelist(
        address walletFactory
    ) public onlyOwner {
        require(walletProxyFactory == address(0), "already set");
        walletProxyFactory = walletFactory;
        emit WalletFactoryWhitelistSet(walletFactory);
    }

    function setModuleWhitelist(address module, bool allowed) public onlyOwner {
        moduleWhiteList[module] = allowed;
        emit ModuleWhitelistSet(module, allowed);
    }

    function validateModuleWhitelist(address module) public view {
        if (!moduleWhiteList[module]) {
            require(unrestrictedModule, "not allowed module");
        }
    }

    function validateBundlerWhiteList(address bundler) public view {
        if (!officialBundlerWhiteList[bundler]) {
            require(
                unrestrictedBundler && bundler == tx.origin,
                "called by illegal bundler"
            );
        }
    }

    function validateWalletWhitelist(address sender) public view {
        if (!unrestrictedWallet) {
            require(
                ISmartAccountProxyFactory(walletProxyFactory).walletWhiteList(
                    sender
                ),
                "sender not created by whitelist factory"
            );

            require(
                ISmartAccountProxyFactory(walletProxyFactory).safeSingleton(
                    ISmartAccountProxy(sender).masterCopy()
                ),
                "sender implement not in whitelist"
            );
        }
    }
}
