const fs = require("fs");
let { ethers } = require("hardhat");
const { expect } = require("chai");
const Utils = require("./Utils.js");

// Define the global variables
let owner,
  sender,
  EntryPoint,
  SmartAccountV2,
  AccountFactoryProxy,
  TestAccountV2;

async function instantiateContracts() {
  // Read the contents of the JSON file
  let data = fs.readFileSync("ContractAddress.json");

  // Parse the JSON content into a JavaScript object
  let addresses = JSON.parse(data);

  // Instantiate each contract with its corresponding factory
  EntryPoint = await ethers
    .getContractFactory("contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint")
    .then((f) => f.attach(addresses["EntryPointV06"]));
  SmartAccountV2 = await ethers
    .getContractFactory("SmartAccountV2")
    .then((f) => f.attach(addresses["SmartAccountV2"]));
  AccountFactoryProxy = await ethers
    .getContractFactory("AccountFactoryV2")
    .then((f) => f.attach(addresses["AccountFactoryProxy"]));
}

async function createAA() {
  owner = await ethers.getSigner();

  TestAccountV2 = new Utils.SmartAccountV2({ ownerAddress: owner.address, random: 10001 })

  await TestAccountV2.initialize({
    SmartAccount: SmartAccountV2,
    SmartAccountProxyFactory: AccountFactoryProxy
  })

  await TestAccountV2.deploy(
    {
      owner: owner,
      bundler: owner,
      EntryPoint: EntryPoint,
      SmartAccount: SmartAccountV2,
      SmartAccountProxyFactory: AccountFactoryProxy,
      sigType: 1,
      callGasLimit: 100000,
      verificationGasLimit: 1000000,
      preVerificationGas: 0,
    }
  )
}

async function transferNativeToken() {
  let callData = SmartAccountV2.interface.encodeFunctionData(
    "execTransactionFromEntrypoint",
    [owner.address, ethers.utils.parseEther("0.001"), "0x"]
  );

  let userOp = await TestAccountV2.generateSignedUOP({
    sender: TestAccountV2.address,
    nonce: 1,
    initCode: "0x",
    callData: callData,
    paymasterAndData: "0x",
    owner: owner,
    SmartAccount: SmartAccountV2,
    EntryPoint: EntryPoint.address,
    sigType: 1,
    callGasLimit: 300000,
    verificationGasLimit: 1000000,
    preVerificationGas: 0,
  });


  let gas = 2000000;
  if ((await hre.ethers.provider.getNetwork().chainId) == 42161) {
    gas = 30000000;
  }
  let balanceOfsenderBefore = await ethers.provider.getBalance(TestAccountV2.address);
  let tx = await EntryPoint.connect(owner).handleOps([userOp], owner.address, {
    gasLimit: gas,
  });
  await tx.wait();
  console.log("handleOps tx hash", tx.hash);

  let balanceOfsenderAfter = await ethers.provider.getBalance(TestAccountV2.address);

  console.log("balanceOfsenderBefore " + balanceOfsenderBefore);
  console.log("balanceOfsenderAfter " + balanceOfsenderAfter);

  await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
}

async function smokeTest() {
  await instantiateContracts();

  await createAA();

  await transferNativeToken();
}

smokeTest();

module.exports = {
  createAA,
  transferNativeToken,
  smokeTest
};
