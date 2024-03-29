// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ITokenPaymaster.sol";
import "../interfaces/IPriceOracle.sol";
import { MockIEntryPoint as IEntryPoint } from "./interfaces/MockIEntryPoint.sol";
import "../interfaces/ISwapAdapter.sol";
import "../paymaster/SupportedEntryPointLib.sol";

contract MockTokenPaymaster is ITokenPaymaster, Ownable {
    using UserOperationLib for UserOperation;
    using SupportedEntryPointLib for SupportedEntryPoint;
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    uint256 public constant COST_OF_POST = 20000;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    address public immutable verifyingSigner;
    address public immutable ADDRESS_THIS;

    mapping(address => uint256) public tokenPriceLimitMax;
    mapping(address => uint256) public tokenPriceLimitMin;

    SupportedEntryPoint supportedEntryPoint;
    address public priceOracle;
    address public swapAdapter;
    mapping(address => bool) public whitelist;

    mapping(address => uint256) internal slippages;
    uint256 public defaultSlippage = 10000; // 1% slippage

    struct AdditionHashData {
        address token;
        uint exchangeRate;
        uint sigTime;
    }

    constructor(
        address _verifyingSigner,
        address _priceOracle,
        address _owner
    ) {
        verifyingSigner = _verifyingSigner;
        priceOracle = _priceOracle;
        _transferOwnership(_owner);
        ADDRESS_THIS = address(this);
    }

    receive() external payable {}

    modifier onlyEntryPoint(address entrypoint) {
        require(
            supportedEntryPoint.isSupportedEntryPoint(entrypoint),
            "Not from supported entrypoint"
        );
        _;
    }

    modifier onlyWhitelisted(address _address) {
        require(whitelist[_address], "Address is not whitelisted");
        _;
    }

    function setTokenPriceLimitMax(
        address token,
        uint256 price
    ) public onlyOwner {
        tokenPriceLimitMax[token] = price;
        emit TokenPriceLimitMaxSet(token, price);
    }

    function setTokenPriceLimitMin(
        address token,
        uint256 price
    ) public onlyOwner {
        tokenPriceLimitMin[token] = price;
        emit TokenPriceLimitMinSet(token, price);
    }
    
    /// @dev add entryPoint to supported list;
    /// @param entrypoint entryPoint contract address
    function addSupportedEntryPoint(address entrypoint) external onlyOwner {
        supportedEntryPoint.addEntryPointToList(entrypoint);
    }

    /// @dev remove entryPoint from supported list;
    /// @param entrypoint entryPoint contract address
    function removeSupportedEntryPoint(address entrypoint) external onlyOwner {
        supportedEntryPoint.removeEntryPointToList(entrypoint);
    }

    /// @dev check entrypoint
    /// @param entrypoint entryPoint contract address
    function isSupportedEntryPoint(
        address entrypoint
    ) external view returns (bool) {
        return supportedEntryPoint.isSupportedEntryPoint(entrypoint);
    }

    function postOp(
        PostOpMode,
        bytes calldata context,
        uint256 gasCost
    ) external override onlyEntryPoint(msg.sender) {
        (
            bytes32 userOpHash,
            address sender,
            address token,
            uint256 exchangeRate,
            bytes memory postOpGas
        ) = abi.decode(context, (bytes32, address, address, uint256, bytes));
    }

    function getHash(
        UserOperation calldata userOp,
        address token,
        uint256 exchangeRate,
        uint256 sigTime
    ) public view returns (bytes32) {
        AdditionHashData memory additionHashData = AdditionHashData(
            token,
            exchangeRate,
            sigTime
        );

        bytes memory encodedData = abi.encode(
            userOp.getSender(),
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            block.chainid,
            ADDRESS_THIS,
            additionHashData
        );

        return keccak256(encodedData);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256
    ) external view override returns (bytes memory, uint256) {
        address token = address(bytes20(userOp.paymasterAndData[20:40]));
        uint256 exchangeRate = uint256(bytes32(userOp.paymasterAndData[40:72]));
        uint256 sigTime = uint256(bytes32(userOp.paymasterAndData[72:104]));

        require(
            sigTime != 12345,
            "MockTokenPaymaster: validatePaymasterUserOp is deprecated"
        );

        bool sigValidate = verifyingSigner ==
            getHash(userOp, token, exchangeRate, sigTime)
                .toEthSignedMessageHash()
                .recover(userOp.paymasterAndData[104:]);

        if (
            exchangeRate >= tokenPriceLimitMax[token] ||
            exchangeRate <= tokenPriceLimitMin[token]
        ) {
            exchangeRate = IPriceOracle(priceOracle).exchangeRate(token);
        }

        if (sigValidate) {
            return (
                abi.encode(
                    userOpHash,
                    userOp.sender,
                    token,
                    exchangeRate,
                    COST_OF_POST *
                        (
                            userOp.maxFeePerGas == userOp.maxPriorityFeePerGas
                                ? userOp.maxFeePerGas
                                : min(
                                    userOp.maxFeePerGas,
                                    userOp.maxPriorityFeePerGas + block.basefee
                                )
                        )
                ),
                sigTime
            );
        } else {
            return ("", SIG_VALIDATION_FAILED);
        }
    }

    function validatePaymasterUserOpWithoutSig(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) external view returns (bytes memory, uint256) {
        address token = address(bytes20(userOp.paymasterAndData[20:40]));
        uint256 exchangeRate = uint256(bytes32(userOp.paymasterAndData[40:72]));
        uint256 sigTime = uint256(bytes32(userOp.paymasterAndData[72:104]));

        bool sigValidate = verifyingSigner ==
            getHash(userOp, token, exchangeRate, sigTime)
                .toEthSignedMessageHash()
                .recover(userOp.paymasterAndData[104:]);

        if (
            exchangeRate >= tokenPriceLimitMax[token] ||
            exchangeRate <= tokenPriceLimitMin[token]
        ) {
            exchangeRate = IPriceOracle(priceOracle).exchangeRate(token);
        }

        if (sigValidate) {
            // do nothing
        }

        return (
            abi.encode(
                userOpHash,
                userOp.sender,
                token,
                exchangeRate,
                COST_OF_POST *
                    (
                        userOp.maxFeePerGas == userOp.maxPriorityFeePerGas
                            ? userOp.maxFeePerGas
                            : min(
                                userOp.maxFeePerGas,
                                userOp.maxPriorityFeePerGas + block.basefee
                            )
                    )
            ),
            sigTime
        );
    }

    // token management
    function withdrawERC20(
        address token,
        uint256 amount,
        address withdrawAddress
    ) external onlyOwner onlyWhitelisted(withdrawAddress) {
        IERC20(token).safeTransfer(withdrawAddress, amount);
        emit Withdrawal(token, amount);
    }

    function withdrawDepositNativeToken(
        address entryPoint,
        address payable withdrawAddress,
        uint256 amount
    ) public onlyOwner onlyWhitelisted(withdrawAddress) {
        IEntryPoint(entryPoint).withdrawTo(withdrawAddress, amount);
        emit Withdrawal(address(0), amount);
    }

    // ERC20 only
    function swapToNative(
        address entryPoint,
        IERC20 token,
        uint256 amount,
        uint256 minAmountOut
    ) external onlyOwner onlyEntryPoint(entryPoint) {
        address nativeAddress = ISwapAdapter(payable(swapAdapter))
            .nativeToken();
        minAmountOut = Math.max(
            (IPriceOracle(priceOracle).getValueOf(
                address(token),
                nativeAddress,
                amount
            ) * (1e6 - slippageOf(address(token)))) / 1e6,
            minAmountOut
        );

        uint256 balance = address(this).balance;

        token.safeTransfer(swapAdapter, amount);
        ISwapAdapter(payable(swapAdapter)).swapToNative(
            address(token),
            minAmountOut
        );

        uint256 amountReceived = address(this).balance - balance;

        require(
            amountReceived > minAmountOut,
            "SwapHelper: insufficient amountOut"
        );

        IEntryPoint(entryPoint).depositTo{value: balance}(address(this));

        emit SwappedToNative(address(token), amount, balance);
    }

    function slippageOf(address _token) public view virtual returns (uint256) {
        return slippages[_token] == 0 ? defaultSlippage : slippages[_token];
    }

    function setSwapHelper(address _swapAdapter) external onlyOwner {
        swapAdapter = _swapAdapter;
    }

    function setSlippage(
        address _token,
        uint256 _slippage
    ) external virtual onlyOwner {
        slippages[_token] = _slippage;
    }

    function setPriceOracle(address _priceOracle) external onlyOwner {
        priceOracle = _priceOracle;
        emit PriceOracleUpdated(_priceOracle);
    }

    function addToWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = true;
            emit AddedToWhitelist(addresses[i]);
        }
    }

    function removeFromWhitelist(
        address[] calldata addresses
    ) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = false;
            emit RemovedFromWhitelist(addresses[i]);
        }
    }
}
