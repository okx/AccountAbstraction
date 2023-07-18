// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ISignatureValidator.sol";
import "../../interfaces/IAccount.sol";
import "../common/Enum.sol";
import "../common/SignatureDecoder.sol";
import "./OwnerManager.sol";

contract SignatureManager is
    IAccount,
    ISignatureValidatorConstants,
    Enum,
    OwnerManager,
    SignatureDecoder
{
    using UserOperationLib for UserOperation;

    uint256 internal constant NONCE_VALIDATION_FAILED = 2;

    bytes32 internal immutable HASH_NAME;

    bytes32 internal immutable HASH_VERSION;

    bytes32 internal immutable TYPE_HASH;

    address internal immutable ADDRESS_THIS;

    bytes32 internal immutable EIP712_ORDER_STRUCT_SCHEMA_HASH;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    struct SignMessage {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        address EntryPoint;
        uint256 sigTime;
    }

    /* solhint-enable var-name-mixedcase */

    constructor(string memory name, string memory version) {
        HASH_NAME = keccak256(bytes(name));
        HASH_VERSION = keccak256(bytes(version));
        TYPE_HASH = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        ADDRESS_THIS = address(this);

        EIP712_ORDER_STRUCT_SCHEMA_HASH = keccak256(
            abi.encodePacked(
                "SignMessage(",
                "address sender,",
                "uint256 nonce,",
                "bytes initCode,",
                "bytes callData,",
                "uint256 callGasLimit,",
                "uint256 verificationGasLimit,",
                "uint256 preVerificationGas,",
                "uint256 maxFeePerGas,",
                "uint256 maxPriorityFeePerGas,",
                "bytes paymasterAndData,",
                "address EntryPoint,",
                "uint256 sigTime",
                ")"
            )
        );
    }

    function getUOPHash(
        SignatureType sigType,
        address EntryPoint,
        UserOperation calldata userOp
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    sigType == SignatureType.EIP712Type
                        ? EIP712_ORDER_STRUCT_SCHEMA_HASH
                        : bytes32(block.chainid),
                    userOp.getSender(),
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.callGasLimit,
                    userOp.verificationGasLimit,
                    userOp.preVerificationGas,
                    userOp.maxFeePerGas,
                    userOp.maxPriorityFeePerGas,
                    keccak256(userOp.paymasterAndData),
                    EntryPoint,
                    uint256(bytes32(userOp.signature[1:33]))
                )
            );
    }

    function getUOPSignedHash(
        SignatureType sigType,
        address EntryPoint,
        UserOperation calldata userOp
    ) public view returns (bytes32) {
        return
            sigType == SignatureType.EIP712Type
                ? ECDSA.toTypedDataHash(
                    keccak256(
                        abi.encode(
                            TYPE_HASH,
                            HASH_NAME,
                            HASH_VERSION,
                            block.chainid,
                            ADDRESS_THIS
                        )
                    ),
                    keccak256(
                        abi.encode(
                            EIP712_ORDER_STRUCT_SCHEMA_HASH,
                            userOp.getSender(),
                            userOp.nonce,
                            keccak256(userOp.initCode),
                            keccak256(userOp.callData),
                            userOp.callGasLimit,
                            userOp.verificationGasLimit,
                            userOp.preVerificationGas,
                            userOp.maxFeePerGas,
                            userOp.maxPriorityFeePerGas,
                            keccak256(userOp.paymasterAndData),
                            EntryPoint,
                            uint256(bytes32(userOp.signature[1:33]))
                        )
                    )
                )
                : ECDSA.toEthSignedMessageHash(
                    keccak256(
                        abi.encode(
                            bytes32(block.chainid),
                            userOp.getSender(),
                            userOp.nonce,
                            keccak256(userOp.initCode),
                            keccak256(userOp.callData),
                            userOp.callGasLimit,
                            userOp.verificationGasLimit,
                            userOp.preVerificationGas,
                            userOp.maxFeePerGas,
                            userOp.maxPriorityFeePerGas,
                            keccak256(userOp.paymasterAndData),
                            EntryPoint,
                            uint256(bytes32(userOp.signature[1:33]))
                        )
                    )
                );
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32,
        address,
        uint256 missingAccountFunds
    ) public virtual returns (uint256) {
        if (missingAccountFunds != 0) {
            payable(msg.sender).call{
                value: missingAccountFunds,
                gas: type(uint256).max
            }("");
        }

        unchecked {
            if (userOp.nonce != nonce++) {
                return NONCE_VALIDATION_FAILED;
            }
        }

        if (
            ECDSA.recover(
                getUOPSignedHash(
                    SignatureType(uint8(bytes1(userOp.signature[0:1]))),
                    msg.sender,
                    userOp
                ),
                userOp.signature[33:]
            ) != owner
        ) {
            return SIG_VALIDATION_FAILED;
        } else {
            return uint256(bytes32(userOp.signature[1:33]));
        }
    }

    function validateUserOpWithoutSig(
        UserOperation calldata userOp,
        bytes32,
        address,
        uint256 missingAccountFunds
    ) public virtual returns (uint256) {
        if (missingAccountFunds != 0) {
            payable(msg.sender).call{
                value: missingAccountFunds,
                gas: type(uint256).max
            }("");
        }

        unchecked {
            if (userOp.nonce != nonce++) {
                return NONCE_VALIDATION_FAILED;
            }
        }

        if (
            ECDSA.recover(
                getUOPSignedHash(
                    SignatureType(uint8(bytes1(userOp.signature[0:1]))),
                    msg.sender,
                    userOp
                ),
                userOp.signature[33:]
            ) != owner
        ) {
            return uint256(bytes32(userOp.signature[1:33]));
        } else {
            return uint256(bytes32(userOp.signature[1:33]));
        }
    }

    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view returns (bytes4) {
        if (isOwner(ECDSA.recover(_hash, _signature))) {
            return 0x1626ba7e;
        } else {
            return 0xffffffff;
        }
    }
}
