// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../../interfaces/IValidations.sol";
import "../base/SignatureManager.sol";
import "../base/ModuleManager.sol";
import "../base/OwnerManager.sol";
import "../base/FallbackManager.sol";
import "../base/GuardManager.sol";
import "../common/EtherPaymentFallback.sol";
import "../common/Singleton.sol";
import "../common/SignatureDecoder.sol";
import "../common/SecuredTokenTransfer.sol";

contract SmartAccountV2 is
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
    IValidations public immutable VALIDATIONS;
    address public immutable FALLBACKHANDLER;

    constructor(
        address _entryPoint,
        address _fallbackHandler,
        address _validations,
        string memory _name,
        string memory _version
    ) SignatureManager(_entryPoint, _name, _version) {
        FALLBACKHANDLER = _fallbackHandler;
        VALIDATIONS = IValidations(_validations);
    }

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint()), "Not from entrypoint");
        _;
    }

    modifier onlyWhiteListedBundler() {
        VALIDATIONS.validateBundlerWhiteList(tx.origin);
        _;
    }

    modifier onlyWhiteListedModule() {
        VALIDATIONS.validateModuleWhitelist(msg.sender);
        _;
    }

    function initialize(
        address creator,
        bytes memory /* place holder for future */
    ) external {
        require(getOwner() == address(0), "account: have set up");
        // set creator as owner by default.
        initializeOwners(creator);
        initializeFallbackHandler(FALLBACKHANDLER);
        initializeModules();
    }

    function nonce() public view virtual returns (uint256) {
        return ENTRYPOINT.getNonce(address(this), 0);
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    )
        public
        override
        onlyEntryPoint
        onlyWhiteListedBundler
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
