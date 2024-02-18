// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IValidations.sol";
import "../@eth-infinitism-v0.6/interfaces/IStakeManager.sol";

contract BundlerDepositHelper is Ownable {
    mapping(address => bool) public vaildEntryPoint;
    address public immutable validations;

    constructor(address _owner, address _validations) {
        _transferOwnership(_owner);
        validations = _validations;
    }

    function setValidEntryPoint(
        address entryPoint,
        bool isValid
    ) public onlyOwner {
        vaildEntryPoint[entryPoint] = isValid;
    }

    function batchDepositForBundler(
        address entryPoint,
        address[] memory bundlers,
        uint256[] memory amounts
    ) public payable {
        uint256 loopLength = bundlers.length;

        require(
            vaildEntryPoint[entryPoint],
            "BundlerDepositHelper: Invalid EntryPoint"
        );
        require(
            loopLength == amounts.length,
            "BundlerDepositHelper: Invalid input"
        );

        for (uint256 i = 0; i < loopLength; i++) {
            address bundler = bundlers[i];
            uint256 amount = amounts[i];

            require(
                IValidations(validations).officialBundlerWhiteList(bundler),
                "BundlerDepositHelper: Invalid bundler"
            );

            payable(bundler).transfer(amount);
        }

        require(
            address(this).balance == 0,
            "BundlerDepositHelper: Invalid value"
        );
    }
}
