// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../@eth-infinitism-v0.6/core/BaseAccount.sol";
import "../common/Enum.sol";
import "../common/SignatureDecoder.sol";
import "./OwnerManager.sol";

contract SignatureManager is BaseAccount, Enum, OwnerManager, SignatureDecoder {
    using UserOperationLib for UserOperation;

    IEntryPoint internal immutable ENTRYPOINT;

    bytes32 internal immutable HASH_NAME;

    bytes32 internal immutable HASH_VERSION;

    bytes32 internal immutable TYPE_HASH;

    address internal immutable ADDRESS_THIS;

    bytes32 internal immutable EIP712_ORDER_STRUCT_SCHEMA_HASH;

    // keccak256("isValidSignature(bytes32 _hash)")
    bytes32 public constant ERC1271_TYPE_HASH = 0x0c000213b8f2b5d6b75cba966002ab299d4108f2bf3d1dd73953ad6092f72e75;

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

    constructor(address entrypoint, string memory name, string memory version) {
        ENTRYPOINT = IEntryPoint(entrypoint);

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
        uint256 missingAccountFunds
    ) public virtual override returns (uint256) {
        if (missingAccountFunds != 0) {
            payable(msg.sender).call{
                value: missingAccountFunds,
                gas: type(uint256).max
            }("");
        }

        return
            _validateSignature(
                userOp,
                getUOPSignedHash(
                    SignatureType(uint8(bytes1(userOp.signature[0:1]))),
                    msg.sender,
                    userOp
                )
            );
    }

    function _validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal virtual override returns (uint256 validationData) {
        uint256 sigTime = uint256(bytes32(userOp.signature[1:33]));

        uint formatSigTime = _formatSigtimeToValidationData(sigTime);
        if (ECDSA.recover(userOpHash, userOp.signature[33:]) != owner) {
            return SIG_VALIDATION_FAILED;
        } else {
            return formatSigTime;
        }
    }

    /// @dev format sigtime to validationData struct
    /// @param sigTime: 0x[address 20 bytes][after 6 bytes][until 6 bytes]
    /// @return data: ValidationData
    function _formatSigtimeToValidationData(
        uint256 sigTime
    ) private pure returns (uint256) {
        uint48 validUntil = uint48(sigTime);
        if (validUntil == 0) {
            validUntil = type(uint48).max;
        }
        uint48 validAfter = uint48(sigTime >> 48);
        address aggregator = address(uint160(sigTime >> (48 + 48)));

        return
            _packValidationData(
                ValidationData(aggregator, validAfter, validUntil)
            );
    }

    function entryPoint() public view virtual override returns (IEntryPoint) {
        return ENTRYPOINT;
    }

    function getERC1271SignInfo() external view returns (bytes32, bytes32, bytes32) {
        return (HASH_NAME, HASH_VERSION, ERC1271_TYPE_HASH);
    }

    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view returns (bytes4) {
        bytes32 domainSeparator = keccak256(abi.encode(
            TYPE_HASH,
            HASH_NAME,
            HASH_VERSION,
            bytes32(block.chainid),
            address(this)
        ));

        bytes32 boundHash = keccak256(abi.encode(
            ERC1271_TYPE_HASH,
            _hash
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            boundHash
        ));

        address signer = ECDSA.recover(digest, _signature);

        if (isOwner(signer)) {
            return 0x1626ba7e;
        } else {
            return 0xffffffff;
        }
    }
}
