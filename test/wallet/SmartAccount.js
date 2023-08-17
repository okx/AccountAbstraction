let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../Utils.js");

describe("SmartAccount", function () {
  async function deploy() {
    let [owner, bundler, Alice] = await ethers.getSigners();

    // setEntryPoint to owner to simplify testing
    let EntryPoint = owner.address;
    let SimulationContract = owner.address;

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let StorageFactory = await ethers.getContractFactory("Storage");
    let storage = await StorageFactory.deploy();

    await storage.setBundlerOfficialWhitelist(owner.address, true);

    let SmartAccountFactory = await ethers.getContractFactory(
      "contracts/wallet/SmartAccount.sol:SmartAccount"
    );
    let SmartAccount = await SmartAccountFactory.deploy(
      EntryPoint,
      SimulationContract,
      DefaultCallbackHandler.address,
      storage.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "contracts/wallet/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
    );
    let SmartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      SmartAccount.address,
      owner.address
    );

    let initializeData = SmartAccount.interface.encodeFunctionData(
      "Initialize",
      [Alice.address]
    );

    let tx = await SmartAccountProxyFactory.createAccount(
      SmartAccount.address,
      initializeData,
      0
    );

    let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
    await expect(events.length).to.equal(1);
    let AA = await SmartAccount.attach(events[0].args.proxy);

    let SmartAccountProxy = await ethers.getContractFactory(
      "contracts/wallet/SmartAccountProxy.sol:SmartAccountProxy"
    );
    let AAProxy = await SmartAccountProxy.attach(AA.address);

    let UserOpHelperFactory = await ethers.getContractFactory(
      "contracts/helper/UserOperationHelper.sol:UserOperationHelper"
    );
    let UserOpHelper = await UserOpHelperFactory.deploy(
      ethers.constants.AddressZero,
      EntryPoint,
      owner.address
    );

    return {
      owner,
      EntryPoint,
      SmartAccount,
      UserOpHelper,
      DefaultCallbackHandler,
      Alice,
      AA,
      AAProxy,
    };
  }

  describe("proxy", function () {
    it("should read data from proxy", async function () {
      let { SmartAccount, AA, AAProxy } = await loadFixture(deploy);

      let singleton = await AAProxy.masterCopy();
      await expect(singleton).to.equal(SmartAccount.address);
    });
  });

  describe("validate", function () {
    it("should read default data from AA", async function () {
      let { EntryPoint, SmartAccount, DefaultCallbackHandler, Alice, AA } =
        await loadFixture(deploy);

      const storageValue = await ethers.provider.send("eth_getStorageAt", [
        AA.address,
        "0x0",
      ]);

      let singleton = ethers.utils.getAddress(storageValue.slice(26, 66));
      await expect(singleton).to.equal(SmartAccount.address);

      let owner = await AA.getOwner();
      await expect(owner).to.equal(Alice.address);

      let etryPoint = await AA.entryPoint();
      await expect(EntryPoint).to.equal(EntryPoint);

      let fallbackHandler = await AA.FALLBACKHANDLER();
      await expect(fallbackHandler).to.equal(DefaultCallbackHandler.address);
    });

    it("191 sigType", async function () {
      let { EntryPoint, SmartAccount, Alice, AA, UserOpHelper } =
        await loadFixture(deploy);
      let userOp = await Utils.generateSignedUOP({
        sender: AA.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x12345678",
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint,
        sigType: 1,
        sigTime: 123456,
      });

      let userOpHash = await UserOpHelper.getUserOpHash(userOp, EntryPoint);

      let validateData = await AA.callStatic.validateUserOp(
        userOp,
        userOpHash,
        0
      );

      let deadlineExtracted = await validateData.div(
        ethers.BigNumber.from(2).pow(160)
      );

      await expect(deadlineExtracted.toNumber()).to.equal(123456);

      let tx = await AA.validateUserOp(userOp, userOpHash, 0);
      let receipt = await tx.wait();

      await expect(receipt.status).to.equal(1);
    });

    it("712 sigType", async function () {
      let { EntryPoint, SmartAccount, Alice, AA, UserOpHelper } =
        await loadFixture(deploy);
      let userOp = await Utils.generateSignedUOP({
        sender: AA.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x12345678",
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint,
        sigType: 0,
        sigTime: 123456,
      });

      let userOpHash = await UserOpHelper.getUserOpHash(userOp, EntryPoint);

      let validateData = await AA.callStatic.validateUserOp(
        userOp,
        userOpHash,
        0
      );

      let deadlineExtracted = await validateData.div(
        ethers.BigNumber.from(2).pow(160)
      );

      await expect(deadlineExtracted.toNumber()).to.equal(123456);

      let tx = await AA.validateUserOp(userOp, userOpHash, 0);
      let receipt = await tx.wait();

      await expect(receipt.status).to.equal(1);
    });

    it("should return 1 if wrong nonce", async function () {
      let { EntryPoint, SmartAccount, Alice, AA, UserOpHelper } =
        await loadFixture(deploy);
      let userOp = await Utils.generateSignedUOP({
        sender: AA.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x12345678",
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint,
        sigType: 0,
        sigTime: 123456,
      });

      let userOpHash = await UserOpHelper.getUserOpHash(userOp, EntryPoint);

      let validateData = await AA.callStatic.validateUserOp(
        userOp,
        userOpHash,
        0
      );

      let deadlineExtracted = await validateData.div(
        ethers.BigNumber.from(2).pow(160)
      );

      await expect(deadlineExtracted.toNumber()).to.equal(123456);
    });

    it("should return 2 if wrong nonce", async function () {
      let { EntryPoint, SmartAccount, Alice, AA, UserOpHelper } =
        await loadFixture(deploy);
      let userOp = await Utils.generateSignedUOP({
        sender: AA.address,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint,
      });

      userOp.signature =
        "0x00000000000000000000000000000000000000000000000000000000000001e2406d5add035827e9f14a4f5498511855cfc1a5138e548621f5490b5bcbb41c385d54e1da7cdd66e3f9a3e4b4103fb9ab7468cdc4044868ebf6679e5d4a905057f71b";

      let userOpHash = await UserOpHelper.getUserOpHash(userOp, EntryPoint);
      let deadlineExtracted = await AA.callStatic.validateUserOp(
        userOp,
        userOpHash,
        0
      );

      await expect(deadlineExtracted.toNumber()).to.equal(1);
    });
  });

  describe("execute", function () {
    it("should execute a transaction", async function () {
      let { owner, SmartAccount, Alice, AA } = await loadFixture(deploy);

      // send 1 ether to AA from owner
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: AA.address,
      });

      let balance = await ethers.provider.getBalance(AA.address);
      let balanceOfAliceBefore = await ethers.provider.getBalance(
        Alice.address
      );

      await expect(balance).to.equal(oneEther);

      await AA.execTransactionFromEntrypoint(Alice.address, oneEther, "0x");

      balance = await ethers.provider.getBalance(AA.address);
      let balanceOfAliceAfter = await ethers.provider.getBalance(Alice.address);

      await expect(balance).to.equal(0);
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });

    it("should execute a transaction with callData", async function () {
      let { owner, SmartAccount, Alice, AA } = await loadFixture(deploy);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther);

      // encode callData for TestToken transfer(Alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        Alice.address,
        oneEther,
      ]);

      await AA.execTransactionFromEntrypoint(testToken.address, 0, callData);

      let balance = await testToken.balanceOf(Alice.address);
      await expect(balance).to.equal(oneEther);
    });

    it("should execute multiple transaction)", async function () {
      let { owner, SmartAccount, Alice, AA } = await loadFixture(deploy);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther.mul(2));

      // encode callData for TestToken transfer(Alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        Alice.address,
        oneEther,
      ]);

      // encode callData for executeParams
      let executeParamsNested = [
        {
          allowFailed: false,
          to: testToken.address,
          value: 0,
          data: callData,
          nestedCalls: "0x",
        },
        {
          allowFailed: true,
          to: testToken.address,
          value: 0,
          data: callData,
          nestedCalls: "0x",
        },
      ];

      let nestedCalls = ethers.utils.defaultAbiCoder.encode(
        [
          {
            type: "tuple[]",
            name: "ExecuteParams",
            components: [
              { type: "bool", name: "allowFailed" },
              { type: "address", name: "to" },
              { type: "uint256", name: "value" },
              { type: "bytes", name: "data" },
              { type: "bytes", name: "nestedCalls" },
            ],
          },
        ],
        [executeParamsNested]
      );

      await AA.execTransactionFromEntrypointBatch([
        {
          allowFailed: false,
          to: testToken.address,
          value: 0,
          data: callData,
          nestedCalls: nestedCalls,
        },
      ]);

      let balance = await testToken.balanceOf(Alice.address);

      // 2 ether should be transferred to Alice 1 ether should be left in AA
      await expect(balance).to.equal(oneEther.mul(2));
    });

    it("shuold upgrade proxy", async function () {
      let { Alice, AA, AAProxy } = await loadFixture(deploy);

      // enocde functioncall of updateImplement
      let updateImplementCalldata = AA.interface.encodeFunctionData(
        "updateImplement",
        [ethers.constants.AddressZero]
      );

      let tx = await AA.execTransactionFromEntrypoint(
        AA.address,
        0,
        updateImplementCalldata
      );

      let newSingleton = await AAProxy.masterCopy();
      await expect(newSingleton).to.equal(ethers.constants.AddressZero);
    });
  });
});
