// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

contract OwnerManager {
    event AAOwnerSet(address owner);

    address internal owner;

    uint256 public nonce;

    modifier onlyOwner() {
        require(isOwner(msg.sender), "not call by owner");
        _;
    }

    function initializeOwners(address _owner) internal {
        owner = _owner;

        emit AAOwnerSet(_owner);
    }

    function isOwner(address _owner) public view returns (bool) {
        return owner == _owner;
    }

    function getOwner() public view returns (address) {
        return owner;
    }
}
