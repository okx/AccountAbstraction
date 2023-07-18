// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimulateToken is ERC20 {
    address owner;

    constructor(address _owner, uint256 _amount) ERC20("SimulateToken", "ST") {
        owner = _owner;
        _mint(owner, _amount);
    }
}
