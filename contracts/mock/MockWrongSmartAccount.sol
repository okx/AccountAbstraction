// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../interfaces/IStorage.sol";
import "../wallet/base/SignatureManager.sol";
import "../wallet/base/ModuleManager.sol";
import "../wallet/base/OwnerManager.sol";
import "../wallet/base/FallbackManager.sol";
import "../wallet/base/GuardManager.sol";
import "../wallet/common/EtherPaymentFallback.sol";
import "../wallet/common/Singleton.sol";
import "../wallet/common/SignatureDecoder.sol";
import "../wallet/common/SecuredTokenTransfer.sol";

contract MockWrongSmartAccount is
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
    address public immutable EntryPoint;
    address public immutable FallbackHandler;

    constructor(
        address _EntryPoint,
        address _FallbackHandler,
        string memory _name,
        string memory _version
    ) SignatureManager(_name, _version) {
        EntryPoint = _EntryPoint;
        FallbackHandler = _FallbackHandler;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == EntryPoint, "Not from entrypoint");
        _;
    }

    function Initialize(address _owner) external {
        require(getOwner() == address(0), "account: have set up");
        initializeOwners(_owner);
        initializeFallbackHandler(FallbackHandler);
        initializeModules();
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        address aggregatorAddress,
        uint256 missingAccountFunds
    ) public override onlyEntryPoint returns (uint256 deadline) {
        require(userOp.nonce != 1000, "MockWrongSmartAccount: invalid nonce");

        deadline = super.validateUserOp(
            userOp,
            userOpHash,
            aggregatorAddress,
            missingAccountFunds
        );
    }

    function validateUserOpWithoutSig(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        address aggregatorAddress,
        uint256 missingAccountFunds
    ) public override onlyEntryPoint returns (uint256 deadline) {
        deadline = super.validateUserOpWithoutSig(
            userOp,
            userOpHash,
            aggregatorAddress,
            missingAccountFunds
        );
    }

    function execTransactionFromEntrypoint(
        address to,
        uint256 value,
        bytes calldata data
    ) public onlyEntryPoint {
        executeWithGuard(to, value, data);
    }

    function execTransactionFromEntrypointBatch(
        ExecuteParams[] calldata _params
    ) external onlyEntryPoint {
        executeWithGuardBatch(_params);
    }

    function execTransactionFromEntrypointBatchRevertOnFail(
        ExecuteParams[] calldata _params
    ) external onlyEntryPoint {
        execTransactionBatchRevertOnFail(_params);
    }

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) public override {
        IStorage(EntryPoint).validateModuleWhitelist(msg.sender);

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
