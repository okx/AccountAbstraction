// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../interfaces/IValidations.sol";
import "../wallet-0.4/base/SignatureManager.sol";
import "../wallet-0.4/base/ModuleManager.sol";
import "../wallet-0.4/base/OwnerManager.sol";
import "../wallet-0.4/base/FallbackManager.sol";
import "../wallet-0.4/base/GuardManager.sol";
import "../wallet-0.4/common/EtherPaymentFallback.sol";
import "../wallet-0.4/common/Singleton.sol";
import "../wallet-0.4/common/SignatureDecoder.sol";
import "../wallet-0.4/common/SecuredTokenTransfer.sol";

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
        IValidations(EntryPoint).validateModuleWhitelist(msg.sender);

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
