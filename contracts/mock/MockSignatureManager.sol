// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;
import "../wallet/base/SignatureManager.sol";


/// mock SignatureManager contract
contract MockSignatureManager is SignatureManager {
    constructor(
        address _EntryPoint,
        string memory _name,
        string memory _version
    ) SignatureManager(_EntryPoint, _name, _version) {}

    event Validation(uint256 data);

    /// @dev validate uop signature 
    /// @param userOp uop info and signature
    /// @param userOpHash userOp's hash 
    /// @return validation
    function getValidateSignatureReturn(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) 
        public 
        returns (uint256 validation) 
    {

        validation = _validateSignature(
                userOp,
                getUOPSignedHash(
                    SignatureType(uint8(bytes1(userOp.signature[0:1]))),
                    msg.sender,
                    userOp
                )
            );
        emit Validation(validation);
    }

    function changeOwner(address _newOwner) external {
        owner = _newOwner;
    }

    // function getRecoverAddr(
    //     bytes memory userOp, 
    //     bytes32 userOpHash
    // ) external pure returns(address, address) {
    //     address recoveredAddress = ECDSA.recover(userOpHash, userOp.signature[33:]);
    //     return (recoveredAddress, owner);
    // }

}
