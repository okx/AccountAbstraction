const fs = require("fs");
let { ethers } = require("hardhat");
const { send } = require("process");
const Utils = require("./Utils.js");

// Define the global variables
let owner,
  sender,
  EntryPoint,
  DefaultCallbackHandler,
  SmartAccount,
  SmartAccountProxyFactory,
  PriceOracle,
  TokenPaymaster,
  TestToken;

async function instantiateContracts() {
  // Read the contents of the JSON file
  let data = fs.readFileSync("ContractAddress.json");

  // Parse the JSON content into a JavaScript object
  let addresses = JSON.parse(data);

  // Instantiate each contract with its corresponding factory
  EntryPoint = await ethers
    .getContractFactory("contracts/core/EntryPoint.sol:EntryPoint")
    .then((f) => f.attach(addresses["EntryPoint"]));
  SmartAccount = await ethers
    .getContractFactory("SmartAccount")
    .then((f) => f.attach(addresses["SmartAccount"]));
  SmartAccountProxyFactory = await ethers
    .getContractFactory("SmartAccountProxyFactory")
    .then((f) => f.attach(addresses["SmartAccountProxyFactory"]));
}

async function createAA() {
  owner = await ethers.getSigner();

  sender = await Utils.generateAccount({
    owner: owner,
    bundler: owner,
    EntryPoint: EntryPoint,
    SmartAccount: SmartAccount,
    SmartAccountProxyFactory: SmartAccountProxyFactory,
    random: 0,
  });

  const code = await ethers.provider.getCode(sender);

  if (code !== "0x") {
    console.log("AA create success! " + sender);
  } else {
    console.log("AA create failed ");
    process.exit(1);
  }
}

async function transferNativeToken() {
  let callData = SmartAccount.interface.encodeFunctionData(
    "execTransactionFromEntrypoint",
    [owner.address, ethers.utils.parseEther("0.001"), "0x"]
  );

  let userOp = await Utils.generateSignedUOP({
    sender: sender,
    nonce: 1,
    initCode: "0x",
    callData: callData,
    paymasterAndData: "0x",
    owner: owner,
    SmartAccount: SmartAccount,
    EntryPoint: EntryPoint.address,
    sigType: 0,
    sigTime: 0,
  });

  let abi = [
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
    },
  ];

  EntryPoint = new ethers.Contract(
    EntryPoint.address,
    abi,
    hre.ethers.provider
  );

  let gas = 2000000;
  if ((await hre.ethers.provider.getNetwork().chainId) == 42161) {
    gas = 30000000;
  }
  let balanceOfsenderBefore = await ethers.provider.getBalance(sender);
  let tx = await EntryPoint.connect(owner).handleOps([userOp], {
    gasLimit: gas,
  });
  await tx.wait();
  console.log("handleOps tx hash", tx.hash);

  let balanceOfsenderAfter = await ethers.provider.getBalance(sender);

  console.log("balanceOfsenderBefore " + balanceOfsenderBefore);
  console.log("balanceOfsenderAfter " + balanceOfsenderAfter);

  await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
}

async function main() {
  await instantiateContracts();

  await createAA();

  await transferNativeToken();
}

main();

module.exports = {
  createAA,
  transferNativeToken,
};
