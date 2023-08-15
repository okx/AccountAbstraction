// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "../@eth-infinitism-v0.4/library/UserOperation.sol";

import "../wallet-0.4/SmartAccount.sol";
import "../interfaces/IEntryPointSimulations.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract UserOperationHelper is Ownable {
    using UserOperationLib for UserOperation;

    mapping(address => bool) public tokenPaymasters;
    mapping(address => bool) public entryPoints;

    receive() external payable {}

    constructor(address _tokenPaymaster, address _entryPoint, address _owner) {
        tokenPaymasters[_tokenPaymaster] = true;
        entryPoints[_entryPoint] = true;
        _transferOwnership(_owner);
    }

    function getUserOpHash(
        UserOperation calldata userOp,
        address entrypoint
    ) external view returns (bytes32) {
        return keccak256(abi.encode(userOp.hash(), entrypoint, block.chainid));
    }

    function gasEstimate(
        UserOperation calldata userOp,
        address entryPoint,
        bool preTransfer
    ) external {
        require(
            entryPoints[entryPoint],
            "UserOperationHelper: invalid entrypoint"
        );

        UserOperation memory mUserOp = modifyCalldata(userOp);

        if (preTransfer) {
            transferPaymaster(userOp);
        }

        IEntryPointSimulations(entryPoint).simulateHandleOpWithoutSig(mUserOp);
    }

    function modifyCalldata(
        UserOperation calldata userOp
    ) public pure returns (UserOperation memory mUserOp) {
        // no function call
        if (userOp.callData.length == 0) {
            return userOp;
        }

        if (userOp.callData.length < 4) {
            revert("UserOperationHelper: invalid callData");
        }

        bytes4 callSelector = bytes4(userOp.callData[:4]);

        // function not overrided
        if (
            callSelector == SmartAccount.execTransactionFromEntrypoint.selector
        ) {
            return userOp;
        }

        // function override
        if (
            callSelector ==
            SmartAccount.execTransactionFromEntrypointBatch.selector
        ) {
            mUserOp = userOp;
            mUserOp.callData = replaceSelector(
                SmartAccount
                    .execTransactionFromEntrypointBatchRevertOnFail
                    .selector,
                userOp.callData
            );

            return mUserOp;
        }

        // function not found
        revert("UserOperationHelper: unsupported selector");
    }

    function replaceSelector(
        bytes4 newSelector,
        bytes memory data
    ) public pure returns (bytes memory) {
        for (uint256 i = 0; i < 4; i++) {
            data[i] = newSelector[i];
        }

        return data;
    }

    function transferPaymaster(UserOperation calldata userOp) internal {
        uint256 gasPrice = userOp.maxFeePerGas == userOp.maxPriorityFeePerGas
            ? userOp.maxFeePerGas
            : min(
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas + block.basefee
            );

        // if pay with native
        if (userOp.paymasterAndData.length == 0) {
            (bool success, ) = userOp.sender.call{
                value: (userOp.callGasLimit +
                    userOp.verificationGasLimit +
                    userOp.preVerificationGas) * gasPrice
            }("");
            require(success, "UserOperationHelper: transfer failed");
            return;
        }

        if (userOp.paymasterAndData.length < 20) {
            revert("UserOperationHelper: invalid paymasterAndData");
        }

        address paymaster = address(bytes20(userOp.paymasterAndData[:20]));
        // other paymasters not concerning in this matter
        if (!tokenPaymasters[paymaster]) {
            return;
        }

        if (userOp.paymasterAndData.length < 104) {
            revert("UserOperationHelper: invalid tokenPaymasterAndData");
        }

        address token = address(bytes20(userOp.paymasterAndData[20:40]));
        uint256 exchangeRate = uint256(bytes32(userOp.paymasterAndData[40:72]));

        if (token == address(0)) {
            revert("UserOperationHelper: invalid token");
        }

        // calculating amount of ERC20 to transfer
        uint256 requiredGas = userOp.callGasLimit +
            userOp.verificationGasLimit *
            3 +
            userOp.preVerificationGas;

        uint256 requiredPrefund = (requiredGas * gasPrice * exchangeRate) /
            1e18;

        IERC20(token).transfer(userOp.sender, requiredPrefund);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function setEntryPoint(address entryPoint, bool status) external onlyOwner {
        entryPoints[entryPoint] = status;
    }

    function setPaymaster(address paymaster, bool status) external onlyOwner {
        tokenPaymasters[paymaster] = status;
    }

    function withdrawNative(address to, uint256 amount) external onlyOwner {
        (bool success, ) = to.call{value: amount}("");
        require(success, "UserOperationHelper: transfer failed");
    }
}
