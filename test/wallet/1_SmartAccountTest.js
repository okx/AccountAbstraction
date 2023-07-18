let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../Utils.js");

describe("SmartAccount", function () {
  async function deploy() {
    let [owner, bundler, alice] = await ethers.getSigners();

    // setEntryPoint to owner to simplify testing
    let EntryPoint = owner.address;

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "DefaultCallbackHandler"
    );
    let defaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let SmartAccount = await ethers.getContractFactory("SmartAccount");
    let smartAccount = await SmartAccount.deploy(
      EntryPoint,
      defaultCallbackHandler.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "SmartAccountProxyFactory"
    );
    let smartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      smartAccount.address,
      owner.address
    );

    let initializeData = SmartAccount.interface.encodeFunctionData(
      "Initialize",
      [alice.address]
    );

    let tx = await smartAccountProxyFactory.createAccount(
      smartAccount.address,
      initializeData,
      0
    );

    let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");

    let AA = await SmartAccount.attach(events[0].args.proxy);

    let SmartAccountProxy = await ethers.getContractFactory(
      "SmartAccountProxy"
    );
    let aliceProxyAccount = await SmartAccountProxy.attach(
      events[0].args.proxy
    );

    let UserOpHelperFactory = await ethers.getContractFactory(
      "UserOperationHelper"
    );
    let userOpHelper = await UserOpHelperFactory.deploy(
      ethers.constants.AddressZero,
      EntryPoint,
      owner.address
    );

    return {
      owner,
      EntryPoint,
      smartAccount,
      userOpHelper,
      defaultCallbackHandler,
      alice,
      AA,
      aliceProxyAccount,
      smartAccountProxyFactory,
    };
  }

  async function deployWithEntry() {
    let [owner, bundler, alice] = await ethers.getSigners();

    // setEntryPoint to owner to simplify testing
    let EntryPoint = owner.address;

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "DefaultCallbackHandler"
    );

    let MockEntryPointL1 = await ethers.getContractFactory("MockEntryPointL1");
    let entryPoint = await MockEntryPointL1.deploy(owner.address);
    let defaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let SmartAccount = await ethers.getContractFactory("MockSmartAccount");
    let smartAccount = await SmartAccount.deploy(
      entryPoint.address,
      defaultCallbackHandler.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "SmartAccountProxyFactory"
    );
    let smartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      smartAccount.address,
      owner.address
    );

    let initializeData = SmartAccount.interface.encodeFunctionData(
      "Initialize",
      [alice.address]
    );

    let tx = await smartAccountProxyFactory.createAccount(
      smartAccount.address,
      initializeData,
      0
    );

    let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");

    let AA = await SmartAccount.attach(events[0].args.proxy);

    let SmartAccountProxy = await ethers.getContractFactory(
      "SmartAccountProxy"
    );
    let aliceProxyAccount = await SmartAccountProxy.attach(
      events[0].args.proxy
    );

    let UserOpHelperFactory = await ethers.getContractFactory(
      "UserOperationHelper"
    );
    let userOpHelper = await UserOpHelperFactory.deploy(
      ethers.constants.AddressZero,
      EntryPoint,
      owner.address
    );

    return {
      owner,
      entryPoint,
      smartAccount,
      userOpHelper,
      defaultCallbackHandler,
      alice,
      AA,
      aliceProxyAccount,
      smartAccountProxyFactory,
    };
  }

  describe("createAccount", function () {
    it("should read data from proxy", async function () {
      let { smartAccount, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);
      let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");

      await expect(events.length).to.equal(1);
      await expect(events[0].args.singleton).to.equal(smartAccount.address);

      let singleton = await aliceProxyAccount.masterCopy();
      await expect(singleton).to.equal(smartAccount.address);
    });

    it("should create account with different salt", async function () {
      let { smartAccount, alice, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);
      let SmartAccount = await ethers.getContractFactory("SmartAccount");
      let initializeData = SmartAccount.interface.encodeFunctionData(
        "Initialize",
        [alice.address]
      );

      let tx = await smartAccountProxyFactory.createAccount(
        smartAccount.address,
        initializeData,
        1
      );
      let events = await smartAccountProxyFactory.queryFilter("ProxyCreation");
      expect(events[1].args.proxy).to.not.equal(aliceProxyAccount.address);
      expect(events[1].args.singleton).to.equal(smartAccount.address);
    });
    it("should not revert with the same salt", async function () {
      let { smartAccount, alice, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);
      let SmartAccount = await ethers.getContractFactory("SmartAccount");
      let initializeData = SmartAccount.interface.encodeFunctionData(
        "Initialize",
        [alice.address]
      );

      let tx = await smartAccountProxyFactory.createAccount(
        smartAccount.address,
        initializeData,
        0
      );
      let res = await tx.wait();
      expect(res.status).to.equal(1);
    });
  });

  describe("setSafeSingleton", function () {
    it("should set correct singleton", async function () {
      let { alice, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);
      await smartAccountProxyFactory.setSafeSingleton(alice.address, true);
      expect(
        await smartAccountProxyFactory.safeSingleton(alice.address)
      ).to.equal(true);
    });

    it("should emit event on  SafeSingletonSet ", async function () {
      let { alice, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);

      expect(
        await smartAccountProxyFactory.setSafeSingleton(alice.address, true)
      )
        .to.emit(smartAccountProxyFactory, "SafeSingletonSet")
        .withArgs(alice.address, true);
    });

    it("should revert if no the owner to set the singleton", async function () {
      let { alice, smartAccountProxyFactory, aliceProxyAccount } =
        await loadFixture(deploy);
      await expect(
        smartAccountProxyFactory
          .connect(alice)
          .setSafeSingleton(alice.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("execute", function () {
    it("should execute a transaction", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);

      // send 1 ether to AA from owner
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: AA.address,
      });

      let balance = await ethers.provider.getBalance(AA.address);
      let balanceOfAliceBefore = await ethers.provider.getBalance(
        alice.address
      );

      await expect(balance).to.equal(oneEther);

      await AA.execTransactionFromEntrypoint(alice.address, oneEther, "0x");

      balance = await ethers.provider.getBalance(AA.address);
      let balanceOfAliceAfter = await ethers.provider.getBalance(alice.address);

      await expect(balance).to.equal(0);
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });

    it("should execute a transaction with callData", async function () {
      let { owner, SmartAccount, alice, AA } = await loadFixture(deploy);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther);

      // encode callData for TestToken transfer(alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther,
      ]);

      await AA.execTransactionFromEntrypoint(testToken.address, 0, callData);

      let balance = await testToken.balanceOf(alice.address);
      await expect(balance).to.equal(oneEther);
    });

    it("shuold execute with the guard", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);
      let MockGuard = await ethers.getContractFactory("MockGuard");
      let mockGuard = await MockGuard.deploy();

      // encode callData for  setGuard(mockGuard)
      let callData = smartAccount.interface.encodeFunctionData("setGuard", [
        mockGuard.address,
      ]);

      await AA.execTransactionFromEntrypoint(AA.address, 0, callData);

      expect(await AA.getGuard()).to.equal(mockGuard.address);

      // send 1 ether to AA from owner
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: AA.address,
      });
      let balanceOfAliceBefore = await ethers.provider.getBalance(
        alice.address
      );

      await AA.execTransactionFromEntrypoint(alice.address, oneEther, "0x");

      balance = await ethers.provider.getBalance(AA.address);

      let balanceOfAliceAfter = await ethers.provider.getBalance(alice.address);

      await expect(balance).to.equal(0);
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });
  });

  describe("upgrade", function () {
    it("shuold upgrade proxy", async function () {
      let { alice, AA, aliceProxyAccount } = await loadFixture(deploy);

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

      let newSingleton = await aliceProxyAccount.masterCopy();
      await expect(newSingleton).to.equal(ethers.constants.AddressZero);
    });
  });

  describe("executeBatch", function () {
    it("should execute multiple transaction)", async function () {
      let { owner, SmartAccount, alice, AA } = await loadFixture(deploy);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther.mul(2));

      // encode callData for TestToken transfer(alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
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

      let balance = await testToken.balanceOf(alice.address);

      // 2 ether should be transferred to alice 1 ether should be left in AA
      await expect(balance).to.equal(oneEther.mul(2));
    });

    it("should execute multiple transaction with guard", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);
      let MockGuard = await ethers.getContractFactory("MockGuard");
      let mockGuard = await MockGuard.deploy();

      // encode callData for  setGuard(mockGuard)
      let guardCallData = smartAccount.interface.encodeFunctionData(
        "setGuard",
        [mockGuard.address]
      );

      await AA.execTransactionFromEntrypoint(AA.address, 0, guardCallData);

      expect(await AA.getGuard()).to.equal(mockGuard.address);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther.mul(2));

      // encode callData for TestToken transfer(alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
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

      let balance = await testToken.balanceOf(alice.address);

      // 2 ether should be transferred to alice 1 ether should be left in AA
      await expect(balance).to.equal(oneEther.mul(2));
    });
  });

  describe("execTransactionFromEntrypointBatchRevertOnFail", function () {
    it("should revert on fail if tx is wrong", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();
      let testTokenB = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther.mul(2));
      await testTokenB.mint(AA.address, oneEther.mul(2));

      // encode callData for TestToken transfer(alice, oneEther)
      let callDataB = testTokenB.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther.mul(3),
      ]);

      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther,
      ]);

      // encode callData for executeParams
      let executeParamsNested = [
        {
          allowFailed: false,
          to: testTokenB.address,
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

      await expect(
        AA.execTransactionFromEntrypointBatch([
          {
            allowFailed: false,
            to: testTokenB.address,
            value: 0,
            data: callDataB,
            nestedCalls: nestedCalls,
          },
        ])
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should revert on fail with guard", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);
      let MockGuard = await ethers.getContractFactory("MockGuard");
      let mockGuard = await MockGuard.deploy();

      // encode callData for  setGuard(mockGuard)
      let guardCallData = smartAccount.interface.encodeFunctionData(
        "setGuard",
        [mockGuard.address]
      );

      await AA.execTransactionFromEntrypoint(AA.address, 0, guardCallData);

      expect(await AA.getGuard()).to.equal(mockGuard.address);

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();
      let testTokenB = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther.mul(2));
      await testTokenB.mint(AA.address, oneEther.mul(2));

      // encode callData for TestToken transfer(alice, oneEther)
      let callDataB = testTokenB.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther.mul(3),
      ]);

      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther,
      ]);

      // encode callData for executeParams
      let executeParamsNested = [
        {
          allowFailed: false,
          to: testTokenB.address,
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

      await expect(
        AA.execTransactionFromEntrypointBatch([
          {
            allowFailed: false,
            to: testTokenB.address,
            value: 0,
            data: callDataB,
            nestedCalls: nestedCalls,
          },
        ])
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  describe("execTransactionFromModule", function () {
    it("should execute a transaction with module", async function () {
      let { owner, smartAccount, alice, AA, entryPoint } = await loadFixture(
        deployWithEntry
      );

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");
      await testToken.mint(AA.address, oneEther);

      // encode callData for TestToken transfer(alice, oneEther)
      let callData = testToken.interface.encodeFunctionData("transfer", [
        alice.address,
        oneEther,
      ]);

      let MockModule = await ethers.getContractFactory("MockModule");
      let mockModule = await MockModule.deploy(AA.address);
      await entryPoint.setModuleWhitelist(mockModule.address, true);

      // encode callData for  setGuard(mockGuard)
      let moduleCallData = smartAccount.interface.encodeFunctionData(
        "enableModule",
        [mockModule.address]
      );

      await AA.execTransactionFromEntrypoint1(AA.address, 0, moduleCallData);

      await mockModule.execTransaction(testToken.address, 0, callData, 0);

      let balance = await testToken.balanceOf(alice.address);
      await expect(balance).to.equal(oneEther);
    });

    it("should setFallbackHandler with module", async function () {
      let { owner, smartAccount, alice, AA, entryPoint } = await loadFixture(
        deployWithEntry
      );

      // deploy TestToken
      let TestToken = await ethers.getContractFactory("TestToken");
      let MockModule = await ethers.getContractFactory("MockModule");
      let testToken = await TestToken.deploy();

      // call TestToken mint(account, amount) to mint token to AA
      let oneEther = ethers.utils.parseEther("1.0");

      // encode callData for TestToken transfer(alice, oneEther)
      let callData = MockModule.interface.encodeFunctionData("transferToken", [
        testToken.address,
        alice.address,
        oneEther,
      ]);

      let mockModule = await MockModule.deploy(AA.address);
      await entryPoint.setModuleWhitelist(mockModule.address, true);
      await testToken.mint(AA.address, oneEther.mul(2));
      let res = await testToken.balanceOf(AA.address);

      // encode callData for enableModule(mockModule)
      let moduleCallData = smartAccount.interface.encodeFunctionData(
        "enableModule",
        [mockModule.address]
      );

      await AA.execTransactionFromEntrypoint1(AA.address, 0, moduleCallData);
      await mockModule.execTransaction(mockModule.address, 0, callData, 1);

      expect(await testToken.balanceOf(alice.address)).to.equal(oneEther);
    });
  });

  describe("setFallbackHandler", function () {
    it("should set fallBack handler correctly", async function () {
      let { owner, smartAccount, alice, AA } = await loadFixture(deploy);
      let MockGuard = await ethers.getContractFactory("MockGuard");
      let mockGuard = await MockGuard.deploy();
      // encode callData for setFallbackHandler(mockGuard)
      let handlerCallData = smartAccount.interface.encodeFunctionData(
        "setFallbackHandler",
        [mockGuard.address]
      );
      await AA.execTransactionFromEntrypoint(AA.address, 0, handlerCallData);
      expect(await AA.getFallbackHandler()).to.equal(mockGuard.address);
    });
  });
});
