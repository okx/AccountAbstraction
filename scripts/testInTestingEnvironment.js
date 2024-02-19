const fs = require("fs");
const { ethers, network } = require("hardhat");
const { createTestingEnvironment } = require("./createTestingEnvironment.js");
const { expect } = require("chai");
const Utils = require("./Utils.js");

let owner,
    bundler,
    EntryPoint,
    SmartAccountV2,
    AccountFactoryProxy,
    TestAccountV2;


async function instantiateContracts() {
    testingEnvironment = await createTestingEnvironment()
    bundler = testingEnvironment.bundler;
    EntryPoint = testingEnvironment.contractInstances.EntryPoint;
    SmartAccountV2 = testingEnvironment.contractInstances.SmartAccountV2;
    AccountFactoryProxy = testingEnvironment.contractInstances.AccountFactoryV2
}

async function createAA() {
    owner = await ethers.getSigner();

    await network.provider.send("hardhat_setBalance", [
        owner.address,
        "0x1000000000000000000000000000",
    ]);


    TestAccountV2 = new Utils.SmartAccountV2({ ownerAddress: owner.address, random: 12345 })

    await TestAccountV2.initialize({
        SmartAccount: SmartAccountV2,
        SmartAccountProxyFactory: AccountFactoryProxy
    })

    await TestAccountV2.deploy(
        {
            owner: owner,
            bundler: bundler,
            EntryPoint: EntryPoint,
            SmartAccount: SmartAccountV2,
            SmartAccountProxyFactory: AccountFactoryProxy,
            sigType: 1,
            callGasLimit: 0,
            verificationGasLimit: 700000,
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

async function testInTestingEnvironment() {
    await instantiateContracts();
    await createAA();
    await transferNativeToken();
}

testInTestingEnvironment();

