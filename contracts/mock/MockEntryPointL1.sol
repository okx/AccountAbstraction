// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */

import "../@eth-infinitism-v0.6/core/EntryPoint.sol";

contract MockEntryPointL1 is EntryPoint {
    constructor() EntryPoint() {}

    event CreatedSenderAddress(address sender);

    function incrementNonceForTarget(address target, uint192 key) public {
        nonceSequenceNumber[target][key]++;
    }

    function mockhandleOps(UserOperation[] calldata ops) public {
        handleOps(ops, payable(msg.sender));
    }

    function mockhandleOpsNoRevert(UserOperation[] calldata ops) public {
        handleOps(ops, payable(msg.sender));
    }

    function mockhandleAggregatedOps(
        UserOpsPerAggregator[] calldata ops
    ) public {
        handleAggregatedOps(ops, payable(msg.sender));
    }

    function getValidationData(
        uint256 validationData
    ) public view returns (address aggregator, bool outOfTimeRange) {
        if (validationData == 0) {
            return (address(0), false);
        }
        ValidationData memory data = _parseValidationData(validationData);
        // solhint-disable-next-line not-rely-on-time
        outOfTimeRange =
            block.timestamp > data.validUntil ||
            block.timestamp < data.validAfter;
        aggregator = data.aggregator;
    }

    function getSenderAddressByEvent(bytes calldata initCode) external {
        try this.getSenderAddress(initCode) {} catch (bytes memory data) {
            uint revertdata;
            assembly {
                let pos := data
                revertdata := mload(add(add(pos, 0x20), 0x04))
            }
            emit CreatedSenderAddress(address(uint160(revertdata)));
        }
    }
}
