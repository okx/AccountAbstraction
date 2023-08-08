const fs = require("fs");
const Utils = require("./RefundTestUtils.js");
let { ethers } = require("hardhat");

let owner,
    EntryPoint,
    SenderExample,
    SmartAccount,
    SmartAccountProxyFactory;

async function instantiateContracts() {
    // Read the contents of the JSON file
    let data = fs.readFileSync("ContractAddress.json");

    // Parse the JSON content into a JavaScript object
    let addresses = JSON.parse(data);

    owner = await ethers.getSigner();

    EntryPoint = new ethers.Contract(
        addresses["contracts/core/EntryPoint.sol:EntryPoint"],
        [
            {
                inputs: [
                    {
                        components: [
                            {
                                internalType: "address",
                                name: "sender",
                                type: "address",
                            },
                            {
                                internalType: "uint256",
                                name: "nonce",
                                type: "uint256",
                            },
                            {
                                internalType: "bytes",
                                name: "initCode",
                                type: "bytes",
                            },
                            {
                                internalType: "bytes",
                                name: "callData",
                                type: "bytes",
                            },
                            {
                                internalType: "uint256",
                                name: "callGasLimit",
                                type: "uint256",
                            },
                            {
                                internalType: "uint256",
                                name: "verificationGasLimit",
                                type: "uint256",
                            },
                            {
                                internalType: "uint256",
                                name: "preVerificationGas",
                                type: "uint256",
                            },
                            {
                                internalType: "uint256",
                                name: "maxFeePerGas",
                                type: "uint256",
                            },
                            {
                                internalType: "uint256",
                                name: "maxPriorityFeePerGas",
                                type: "uint256",
                            },
                            {
                                internalType: "bytes",
                                name: "paymasterAndData",
                                type: "bytes",
                            },
                            {
                                internalType: "bytes",
                                name: "signature",
                                type: "bytes",
                            },
                        ],
                        internalType: "struct UserOperation[]",
                        name: "ops",
                        type: "tuple[]",
                    },
                ],
                name: "handleOps",
                outputs: [],
                stateMutability: "nonpayable",
                type: "function",
            },
            {
                anonymous: false,
                inputs: [
                    {
                        indexed: true,
                        internalType: "bytes32",
                        name: "userOpHash",
                        type: "bytes32",
                    },
                    {
                        indexed: true,
                        internalType: "address",
                        name: "sender",
                        type: "address",
                    },
                    {
                        indexed: true,
                        internalType: "address",
                        name: "paymaster",
                        type: "address",
                    },
                    {
                        indexed: false,
                        internalType: "uint256",
                        name: "nonce",
                        type: "uint256",
                    },
                    {
                        indexed: false,
                        internalType: "bool",
                        name: "success",
                        type: "bool",
                    },
                    {
                        indexed: false,
                        internalType: "uint256",
                        name: "actualGasCost",
                        type: "uint256",
                    },
                    {
                        indexed: false,
                        internalType: "uint256",
                        name: "actualGasUsed",
                        type: "uint256",
                    },
                ],
                name: "UserOperationEvent",
                type: "event",
            }, {
                "inputs": [
                    {
                        "components": [
                            {
                                "internalType": "address",
                                "name": "sender",
                                "type": "address"
                            },
                            {
                                "internalType": "uint256",
                                "name": "nonce",
                                "type": "uint256"
                            },
                            {
                                "internalType": "bytes",
                                "name": "initCode",
                                "type": "bytes"
                            },
                            {
                                "internalType": "bytes",
                                "name": "callData",
                                "type": "bytes"
                            },
                            {
                                "internalType": "uint256",
                                "name": "callGasLimit",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "verificationGasLimit",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "preVerificationGas",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "maxFeePerGas",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "maxPriorityFeePerGas",
                                "type": "uint256"
                            },
                            {
                                "internalType": "bytes",
                                "name": "paymasterAndData",
                                "type": "bytes"
                            },
                            {
                                "internalType": "bytes",
                                "name": "signature",
                                "type": "bytes"
                            }
                        ],
                        "internalType": "struct UserOperation",
                        "name": "op",
                        "type": "tuple"
                    }
                ],
                "name": "simulateHandleOpWithoutSig",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "preOpGas",
                        "type": "uint256"
                    },
                    {
                        "internalType": "enum IPaymaster.PostOpMode",
                        "name": "",
                        "type": "uint8"
                    },
                    {
                        "internalType": "bytes",
                        "name": "result",
                        "type": "bytes"
                    },
                    {
                        "internalType": "uint256",
                        "name": "paid",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "callGasCost",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "gasPrice",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "deadline",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "paymasterDeadline",
                        "type": "uint256"
                    }
                ],
                "name": "SimulateHandleOpResult",
                "type": "error"
            }
        ],
        hre.ethers.provider
    );

    SmartAccount = await ethers
        .getContractFactory("SmartAccount")
        .then((f) => f.attach(addresses["SmartAccount"]));

    SmartAccountProxyFactory = await ethers
        .getContractFactory("SmartAccountProxyFactory")
        .then((f) => f.attach(addresses["SmartAccountProxyFactory"]));

    SenderExample = await ethers
        .getContractFactory("SmartAccount")
        .then((f) => f.attach(addresses["sender"]));

}


async function simulate(callData) {

    const userOp = await Utils.generateSignedUOP({
        sender: SenderExample.address,
        nonce: await SenderExample.nonce(),
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: owner,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 0,
        sigTime: 0,
        manualVerificationGasLimit: 1000000,
        manualPreVerificationGas: 0,
        manualCallGasLimit: 1000000

    });

    const callDetails = {
        to: EntryPoint.address,
        data: EntryPoint.interface.encodeFunctionData("simulateHandleOpWithoutSig", [userOp]
        )
    };

    const parsedError = EntryPoint.interface.parseError(await hre.ethers.provider.call(callDetails));

    const intToBool = (num) => {
        return num === 0 ? true : (num === 1 || num === 2) ? false : null;
    }

    console.log("callData excute result " + intToBool(parsedError.args[1]));

    console.log("verificationGasLimit " + parsedError.args.preOpGas);

    console.log("callGasLimit " + parsedError.args.callGasCost);

    return [intToBool(parsedError.args[1]), parsedError.args.preOpGas, parsedError.args.callGasCost]
}


async function handleOps(callData, verificationGasLimit, callGasLimit, k) {

    const userOp = await Utils.generateSignedUOP({
        sender: SenderExample.address,
        nonce: await SenderExample.nonce(),
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: owner,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 0,
        sigTime: 0,
        manualVerificationGasLimit: verificationGasLimit.mul(k * 10).div(10),
        manualPreVerificationGas: 0,
        manualCallGasLimit: callGasLimit.mul(k * 10).div(10)

    });

    let tx = await EntryPoint.connect(owner).handleOps([userOp]);

    await tx.wait();

    console.log("handleOps tx hash " + tx.hash);

    return tx.hash
}


async function SimulateAndExcute(callData, k) {

    const [simulateExcuteResult, verificationGasLimit, callGasLimit] = await simulate(callData);

    if (!simulateExcuteResult) {
        return {
            simulateExcuteResult: simulateExcuteResult,
            simulateVerificationGasLimit: verificationGasLimit.toString(),
            simulateVallGasLimit: callGasLimit.toString()
        };
    } else {
        const txHash = await handleOps(callData, verificationGasLimit, callGasLimit, k)
        return {
            simulateExcuteResult: simulateExcuteResult,
            simulateVerificationGasLimit: verificationGasLimit.toString(),
            simulateCallGasLimit: callGasLimit.toString(),
            HandleOpsVerificationGasLimit: verificationGasLimit.mul(k * 10).div(10).toString(),
            HandleOpsCallGasLimit: callGasLimit.mul(k * 10).div(10).toString(),
            txHash: txHash
        };
    }
}


async function main() {
    await instantiateContracts();
    const callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [owner.address, ethers.utils.parseEther("0.0000001"), "0x"]
    );
    const k = 1.2;
    SimulateAndExcute(callData, k)
}

main()


module.exports = {
    SimulateAndExcute
};
