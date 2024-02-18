// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

contract AccountFactoryStorageBase {
    address public implementation; // keep it the 1st slot
    address public owner;     // keep it the 2nd slot
    uint8   public initialized; // for initialize method.

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "OnlyOwner allowed");
        _;
    }
    
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

contract AccountFactoryStorage is AccountFactoryStorageBase {
    // SmartAccount template => bool, save the 
    mapping(address => bool) public safeSingleton;
    // wallet address => bool,  save accounts created by this Factory.
    // mapping(address => bool) public walletWhiteList;
    

    // NOTICE: add new storage variables below
}