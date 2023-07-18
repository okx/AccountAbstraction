// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./EntryPointSimulations.sol";

contract EntryPoint is EntryPointSimulations {
    constructor(address owner) EntryPointSimulations(owner) {}
}
