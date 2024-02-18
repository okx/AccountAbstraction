// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IFreeGasPaymaster.sol";
import "../interfaces/IPriceOracle.sol";
import "../@eth-infinitism-v0.6/interfaces/IEntryPoint.sol";
import "./SupportedEntryPointLib.sol";

contract FreeGasPaymaster is IFreeGasPaymaster, Ownable {
    using UserOperationLib for UserOperation;
    using SupportedEntryPointLib for SupportedEntryPoint;
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    address public immutable verifyingSigner;
    address public immutable ADDRESS_THIS;
    SupportedEntryPoint supportedEntryPoint;
    mapping(address => bool) public whitelist;

    constructor(address _verifyingSigner, address _owner) {
        verifyingSigner = _verifyingSigner;
        _transferOwnership(_owner);
        ADDRESS_THIS = address(this);
    }

    modifier validEntryPoint(address entrypoint) {
        require(
            supportedEntryPoint.isSupportedEntryPoint(entrypoint),
            "Not from supported entrypoint"
        );
        _;
    }

    modifier onlyWhitelisted(address _address) {
        require(whitelist[_address], "Address is not whitelisted");
        _;
    }

    /// @dev add entryPoint to supported list;
    /// @param entrypoint entryPoint contract address
    function addSupportedEntryPoint(address entrypoint) external onlyOwner {
        supportedEntryPoint.addEntryPointToList(entrypoint);
    }

    /// @dev remove entryPoint from supported list;
    /// @param entrypoint entryPoint contract address
    function removeSupportedEntryPoint(address entrypoint) external onlyOwner {
        supportedEntryPoint.removeEntryPointToList(entrypoint);
    }

    /// @dev check entrypoint
    /// @param entrypoint entryPoint contract address
    function isSupportedEntryPoint(
        address entrypoint
    ) external view returns (bool) {
        return supportedEntryPoint.isSupportedEntryPoint(entrypoint);
    }

    function addToWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = true;
            emit AddedToWhitelist(addresses[i]);
        }
    }

    function removeFromWhitelist(
        address[] calldata addresses
    ) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = false;
            emit RemovedFromWhitelist(addresses[i]);
        }
    }

    function withdrawERC20(
        address token,
        uint256 amount,
        address withdrawAddress
    ) external onlyOwner onlyWhitelisted(withdrawAddress) {
        IERC20(token).safeTransfer(withdrawAddress, amount);
        emit Withdrawal(token, amount);
    }

    function withdrawDepositNativeToken(
        address entryPoint,
        address payable withdrawAddress,
        uint256 amount
    )
        public
        onlyOwner
        onlyWhitelisted(withdrawAddress)
        validEntryPoint(entryPoint)
    {
        IEntryPoint(entryPoint).withdrawTo(withdrawAddress, amount);
        emit Withdrawal(address(0), amount);
    }

    function getHash(
        UserOperation calldata userOp,
        uint256 sigTime
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    userOp.getSender(),
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.callGasLimit,
                    userOp.verificationGasLimit,
                    userOp.preVerificationGas,
                    userOp.maxFeePerGas,
                    userOp.maxPriorityFeePerGas,
                    block.chainid,
                    ADDRESS_THIS,
                    sigTime
                )
            );
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256
    ) external view override returns (bytes memory, uint256) {
        uint256 sigTime = uint256(bytes32(userOp.paymasterAndData[20:52]));

        if (
            verifyingSigner !=
            getHash(userOp, sigTime).toEthSignedMessageHash().recover(
                userOp.paymasterAndData[52:]
            )
        ) {
            return ("", SIG_VALIDATION_FAILED);
        } else {
            return ("", sigTime);
        }
    }

    function validatePaymasterUserOpWithoutSig(
        UserOperation calldata userOp,
        bytes32,
        uint256
    ) external view returns (bytes memory, uint256) {
        uint256 sigTime = uint256(bytes32(userOp.paymasterAndData[20:52]));

        bool sigValidate = verifyingSigner !=
            getHash(userOp, sigTime).toEthSignedMessageHash().recover(
                userOp.paymasterAndData[52:]
            );

        return ("", sigTime);
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 gasCost
    ) external override {}
}
