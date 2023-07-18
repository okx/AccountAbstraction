// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;
import "@openzeppelin/contracts/utils/Create2.sol";

contract DeployFactory {
    /**
     * @notice Deploys `_initCode` using `_salt` for defining the deterministic address.
     * @param _initCode Initialization code.
     * @param _salt Arbitrary value to modify resulting address.
     * @return createdContract Created contract address.
     */
    function deploy(
        bytes memory _initCode,
        bytes32 _salt
    ) public returns (address payable createdContract) {
        address addr = getAddress(_initCode, _salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return payable(addr);
        }

        assembly {
            createdContract := create2(
                0,
                add(_initCode, 0x20),
                mload(_initCode),
                _salt
            )
            if iszero(extcodesize(createdContract)) {
                revert(0, 0)
            }
        }
    }

    function getAddress(
        bytes memory _initCode,
        bytes32 _salt
    ) public view returns (address) {
        return
            Create2.computeAddress(_salt, keccak256(_initCode), address(this));
    }
}
