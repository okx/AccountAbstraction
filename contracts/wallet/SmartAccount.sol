// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../interfaces/IStorage.sol";
import "./base/SignatureManager.sol";
import "./base/ModuleManager.sol";
import "./base/OwnerManager.sol";
import "./base/FallbackManager.sol";
import "./base/GuardManager.sol";
import "./common/EtherPaymentFallback.sol";
import "./common/Singleton.sol";
import "./common/SignatureDecoder.sol";
import "./common/SecuredTokenTransfer.sol";

contract SmartAccount is
    EtherPaymentFallback,
    Singleton,
    ModuleManager,
    OwnerManager,
    SignatureDecoder,
    SecuredTokenTransfer,
    FallbackManager,
    GuardManager,
    SignatureManager
{
    IStorage public immutable STORAGE;

    address public immutable SIMULATION;
    address public immutable FALLBACKHANDLER;

    constructor(
        address _entryPoint,
        address _simulation,
        address _fallbackHandler,
        address _storage,
        string memory _name,
        string memory _version
    ) SignatureManager(_entryPoint, _name, _version) {
        SIMULATION = _simulation;
        FALLBACKHANDLER = _fallbackHandler;
        STORAGE = IStorage(_storage);
    }

    modifier onlyEntryPointOrSimulation() {
        require(
            msg.sender == address(entryPoint()) || msg.sender == SIMULATION,
            "Not from entrypoint"
        );
        _;
    }

    modifier onlyWhiteListedBundler() {
        STORAGE.validateBundlerWhiteList(tx.origin);
        _;
    }

    modifier onlyWhiteListedModule() {
        STORAGE.validateModuleWhitelist(msg.sender);
        _;
    }

    function Initialize(address _owner) external {
        require(getOwner() == address(0), "account: have set up");
        initializeOwners(_owner);
        initializeFallbackHandler(FALLBACKHANDLER);
        initializeModules();
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    )
        public
        override
        onlyEntryPointOrSimulation
        returns (uint256 validationData)
    {
        validationData = super.validateUserOp(
            userOp,
            userOpHash,
            missingAccountFunds
        );
    }

    function execTransactionFromEntrypoint(
        address to,
        uint256 value,
        bytes calldata data
    ) public onlyEntryPointOrSimulation onlyWhiteListedBundler {
        executeWithGuard(to, value, data);
    }

    function execTransactionFromEntrypointBatch(
        ExecuteParams[] calldata _params
    ) external onlyEntryPointOrSimulation onlyWhiteListedBundler {
        executeWithGuardBatch(_params);
    }

    function execTransactionFromEntrypointBatchRevertOnFail(
        ExecuteParams[] calldata _params
    ) external onlyEntryPointOrSimulation onlyWhiteListedBundler {
        execTransactionBatchRevertOnFail(_params);
    }

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) public override onlyWhiteListedModule {
        if (operation == Enum.Operation.Call) {
            ModuleManager.execTransactionFromModule(to, value, data, operation);
        } else {
            address originalFallbackHandler = getFallbackHandler();

            setFallbackHandler(msg.sender, true);
            ModuleManager.execTransactionFromModule(to, value, data, operation);
            setFallbackHandler(originalFallbackHandler, false);
        }
    }
}
