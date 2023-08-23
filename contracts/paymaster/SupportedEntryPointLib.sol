// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

struct SupportedEntryPoint {
    mapping(address => bool) data;
}

library SupportedEntryPointLib {
    event AddSupportedEntryPoint(address entrypoint, uint256 blockTime);
    event RemoveSupportedEntryPoint(address entrypoint, uint256 blockTime);

    /// @dev add entryPoint to list
    function addEntryPointToList(
        SupportedEntryPoint storage self,
        address entrypoint
    ) internal {
        require(entrypoint != address(0), "address can't be zero");
        // require(entrypoint.code.length > 0, "must be contract");
        require(!self.data[entrypoint], "duplicate entrypoint");

        self.data[entrypoint] = true;
        emit AddSupportedEntryPoint(entrypoint, block.timestamp);
    }

    /// @dev remove entryPoint from list
    function removeEntryPointToList(
        SupportedEntryPoint storage self,
        address entrypoint
    ) internal {
        require(self.data[entrypoint], "entrypoint not exists");

        self.data[entrypoint] = false;
        emit RemoveSupportedEntryPoint(entrypoint, block.timestamp);
    }

    /// @dev check entrypoint
    function isSupportedEntryPoint(
        SupportedEntryPoint storage self,
        address entrypoint
    ) internal view returns (bool) {
        return self.data[entrypoint];
    }
}
