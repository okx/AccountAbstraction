// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;
import "./SelfAuthorized.sol";

/// @title Singleton - Base for singleton contracts (should always be first super contract)
///         This contract is tightly coupled to our proxy contract
contract Singleton is SelfAuthorized {
    event ImplementUpdated(address indexed implement);
    address internal singleton;

    function updateImplement(address implement) external authorized {
        singleton = implement;
        emit ImplementUpdated(implement);
    }
}
