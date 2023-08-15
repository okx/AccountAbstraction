let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../Utils.js");

describe("SmartAccount", function () {
  async function deploy() {
    let [owner, bundler, alice] = await ethers.getSigners();

    // deploy entrypoint
    let EntryPoint0_4 = await ethers.getContractFactory("MockEntryPointL1");
    let entrypoint0_4 = await EntryPoint0_4.deploy(owner.address);
    await entrypoint0_4
      .connect(owner)
      .setBundlerOfficialWhitelist(bundler.address, true);

    // deploy smartAccount
    let DefaultCallbackHandler0_4 = await ethers.getContractFactory(
      "contracts/wallet-0.4/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let defaultCallbackHandler0_4 = await DefaultCallbackHandler0_4.deploy();
    let SmartAccount0_4 = await ethers.getContractFactory(
      "contracts/wallet-0.4/SmartAccount.sol:SmartAccount"
    );
    let smartAccount0_4 = await SmartAccount0_4.deploy(
      entrypoint0_4.address,
      defaultCallbackHandler0_4.address,
      "SA",
      "1.0"
    );

    // deploy smartAccountProxyFactory
    let SmartAccountProxyFactory = await ethers.getContractFactory(
      "contracts/wallet/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
    );
    let smartAccountProxyFactory = await SmartAccountProxyFactory.deploy(
      smartAccount0_4.address,
      owner.address
    );

    // deploy userOpHelper
    let UserOpHelperFactory = await ethers.getContractFactory(
      "UserOperationHelper"
    );
    let userOpHelper = await UserOpHelperFactory.deploy(
      ethers.constants.AddressZero,
      entrypoint0_4.address,
      owner.address
    );

    // deploy entrypoint-0.6
    let EntryPoint0_6 = await ethers.getContractFactory(
      "contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint"
    );
    let entrypoint0_6 = await EntryPoint0_6.deploy();

    let simulationContract = owner.address;

    // deploy storage
    let Storage = await ethers.getContractFactory("Storage");
    let storage = await Storage.deploy();
    await storage.setBundlerOfficialWhitelist(bundler.address, true);

    // deploy smartAccount-0.6
    let DefaultCallbackHandlerFactory0_6 = await ethers.getContractFactory(
      "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let defaultCallbackHandler0_6 =
      await DefaultCallbackHandlerFactory0_6.deploy();
    let SmartAccount0_6 = await ethers.getContractFactory(
      "contracts/wallet/SmartAccount.sol:SmartAccount"
    );
    let smartAccount0_6 = await SmartAccount0_6.deploy(
      entrypoint0_6.address,
      simulationContract,
      defaultCallbackHandler0_6.address,
      storage.address,
      "SA",
      "1.0"
    );

    return {
      owner,
      bundler,
      alice,
      entrypoint0_4,
      entrypoint0_6,
      smartAccount0_4,
      smartAccount0_6,
      smartAccountProxyFactory,
    };
  }

  describe("upgrade", function () {
    it("should upgrade deployed AA proxy", async function () {
      let {
        owner,
        bundler,
        alice,
        entrypoint0_4,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        smartAccountProxyFactory,
      } = await loadFixture(deploy);

      // deploy smartAccountProxy
      let initializeData = smartAccount0_4.interface.encodeFunctionData(
        "Initialize",
        [alice.address]
      );

      await smartAccountProxyFactory.createAccount(
        smartAccount0_4.address,
        initializeData,
        0
      );
      let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");
      let AA = await ethers.getContractAt(
        "contracts/wallet-0.4/SmartAccount.sol:SmartAccount",
        events[0].args.proxy
      );

      let aliceProxyAccount = await ethers.getContractAt(
        "contracts/wallet/SmartAccountProxy.sol:SmartAccountProxy",
        events[0].args.proxy
      );

      // add some fund
      await owner.sendTransaction({
        value: ethers.utils.parseEther("1.0"),
        to: aliceProxyAccount.address,
      });

      // send a trasaction through 0.4 proxy
      let callData = smartAccount0_4.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [alice.address, ethers.utils.parseEther("0.1"), "0x"]
      );

      let userOp = await Utils.generateSignedUOP({
        sender: aliceProxyAccount.address,
        nonce: 0,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: alice,
        SmartAccount: smartAccount0_4,
        EntryPoint: entrypoint0_4.address,
        sigType: 1,
        sigTime: 0,
      });

      let balanceBefore = await ethers.provider.getBalance(alice.address);
      await entrypoint0_4.connect(bundler).mockhandleOps([userOp]);
      let balanceAfter = await ethers.provider.getBalance(alice.address);
      expect(balanceAfter.sub(balanceBefore)).to.equal(
        ethers.utils.parseEther("0.1")
      );

      let updateCallData = smartAccount0_4.interface.encodeFunctionData(
        "updateImplement",
        [smartAccount0_6.address]
      );

      callData = smartAccount0_4.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [AA.address, 0, updateCallData]
      );

      userOp = await Utils.generateSignedUOP({
        sender: aliceProxyAccount.address,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: alice,
        SmartAccount: smartAccount0_4,
        EntryPoint: entrypoint0_4.address,
        sigType: 1,
        sigTime: 0,
      });

      let tx = await entrypoint0_4.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      let blockNumber = receipt.blockNumber;
      let updateEvents = await AA.queryFilter("ImplementUpdated", blockNumber);
      await expect(updateEvents.length).to.equal(1);
      let updateEvent = updateEvents[0].args;
      await expect(updateEvent.implement).to.equal(smartAccount0_6.address);

      // send a trasaction through 0.6 proxy
      callData = smartAccount0_6.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [alice.address, ethers.utils.parseEther("0.1"), "0x"]
      );

      userOp = await Utils.generateSignedUOP({
        sender: aliceProxyAccount.address,
        nonce: 0,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: alice,
        SmartAccount: smartAccount0_6,
        EntryPoint: entrypoint0_6.address,
        sigType: 1,
        sigTime: 0,
      });

      balanceBefore = await ethers.provider.getBalance(alice.address);
      await entrypoint0_6.connect(bundler).handleOps([userOp], bundler.address);
      balanceAfter = await ethers.provider.getBalance(alice.address);
      await expect(balanceAfter.sub(balanceBefore)).to.equal(
        ethers.utils.parseEther("0.1")
      );
    });

    it("should upgrade undeployed AA proxy ", async function () {
      let {
        owner,
        bundler,
        alice,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        smartAccountProxyFactory,
      } = await loadFixture(deploy);

      let initializeData = smartAccount0_4.interface.encodeFunctionData(
        "Initialize",
        [alice.address]
      );

      let AAAddress = await smartAccountProxyFactory.getAddress(
        smartAccount0_6.address,
        initializeData,
        0
      );

      // add some fund
      await owner.sendTransaction({
        value: ethers.utils.parseEther("1.0"),
        to: AAAddress,
      });

      // update safeSingleton to 0.6
      await smartAccountProxyFactory.setSafeSingleton(
        smartAccount0_6.address,
        true
      );

      await smartAccountProxyFactory.setSafeSingleton(
        smartAccount0_4.address,
        false
      );

      await smartAccountProxyFactory.createAccount(
        smartAccount0_6.address,
        initializeData,
        0
      );

      let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");
      await expect(events[0].args.proxy).to.equal(AAAddress);

      callData = smartAccount0_6.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [alice.address, ethers.utils.parseEther("0.1"), "0x"]
      );

      userOp = await Utils.generateSignedUOP({
        sender: AAAddress,
        nonce: 0,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: alice,
        SmartAccount: smartAccount0_6,
        EntryPoint: entrypoint0_6.address,
        sigType: 1,
        sigTime: 0,
      });

      balanceBefore = await ethers.provider.getBalance(alice.address);
      await entrypoint0_6.connect(bundler).handleOps([userOp], bundler.address);
      balanceAfter = await ethers.provider.getBalance(alice.address);
      await expect(balanceAfter.sub(balanceBefore)).to.equal(
        ethers.utils.parseEther("0.1")
      );
    });
  });
});
