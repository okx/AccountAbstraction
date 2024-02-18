// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.6/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UserOperationHelper is Ownable {
    using UserOperationLib for UserOperation;

    mapping(address => bool) public tokenPaymasters;
    mapping(address => bool) public entryPointSimulations;

    receive() external payable {}

    constructor(
        address _tokenPaymaster,
        address _entryPointSimulation,
        address _owner
    ) {
        tokenPaymasters[_tokenPaymaster] = true;
        entryPointSimulations[_entryPointSimulation] = true;
        _transferOwnership(_owner);
    }

    function getUserOpHash(
        UserOperation calldata userOp,
        address entrypoint
    ) external view returns (bytes32) {
        return keccak256(abi.encode(userOp.hash(), entrypoint, block.chainid));
    }
}
