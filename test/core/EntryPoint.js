const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");

describe("EntryPoint", function () {
  async function deploy() {
    let [owner, signer, bundler, Alice] = await ethers.getSigners();
    let maxPrice = ethers.utils.parseEther("1");
    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

    let FreeGasPaymasterFactory = await ethers.getContractFactory(
      "FreeGasPaymaster"
    );

    let FreeGasPaymaster = await FreeGasPaymasterFactory.deploy(
      signer.address,
      owner.address
    );
    await FreeGasPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

    await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
      bundler.address,
      true
    );

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "contracts/wallet-0.4/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let SmartAccountFactory = await ethers.getContractFactory(
      "contracts/wallet-0.4/SmartAccount.sol:SmartAccount"
    );
    let SmartAccount = await SmartAccountFactory.deploy(
      EntryPoint.address,
      DefaultCallbackHandler.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "contracts/wallet/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
    );
    let SmartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      SmartAccount.address,
      EntryPoint.address
    );

    await EntryPoint.connect(owner).setWalletProxyFactoryWhitelist(
      SmartAccountProxyFactory.address
    );

    let MockChainlinkOracleFactory = await ethers.getContractFactory(
      "MockChainlinkOracle"
    );
    let MockChainlinkOracle = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    let MockChainlinkOracleETH = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    await MockChainlinkOracle.connect(owner).setPrice(1000000);
    await MockChainlinkOracle.connect(owner).setDecimals(6);

    await MockChainlinkOracleETH.connect(owner).setPrice(2000000000);
    await MockChainlinkOracleETH.connect(owner).setDecimals(6);

    let TestTokenFactory = await ethers.getContractFactory("TestToken");
    let TestToken = await TestTokenFactory.deploy();

    let PriceOracleFactory = await ethers.getContractFactory(
      "ChainlinkOracleAdapter"
    );
    let PriceOracle = await PriceOracleFactory.deploy(owner.address);

    let TokenPaymasterFactory = await ethers.getContractFactory(
      "TokenPaymaster"
    );
    let TokenPaymaster = await TokenPaymasterFactory.deploy(
      signer.address,
      owner.address
    );

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);
    await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

    await PriceOracle.connect(owner).setPriceFeed(
      TestToken.address,
      MockChainlinkOracle.address
    );
    await PriceOracle.setDecimals(TestToken.address, 6);

    await PriceOracle.connect(owner).setPriceFeed(
      await PriceOracle.NATIVE_TOKEN(),
      MockChainlinkOracleETH.address
    );
    await PriceOracle.setDecimals(await PriceOracle.NATIVE_TOKEN(), 18);

    await EntryPoint.connect(owner).depositTo(TokenPaymaster.address, {
      value: ethers.utils.parseUnits("1"),
    });

    return {
      owner,
      signer,
      bundler,
      Alice,
      EntryPoint,
      TestToken,
      TokenPaymaster,
      SmartAccount,
      SmartAccountProxyFactory,
      PriceOracle,
      FreeGasPaymaster,
    };
  }

  it("should read default values", async function () {
    const { owner, bundler, EntryPoint, SmartAccountProxyFactory } =
      await loadFixture(deploy);

    await expect(await EntryPoint.owner()).to.equal(owner.address);
    await expect(
      await EntryPoint.officialBundlerWhiteList(bundler.address)
    ).to.equal(true);
    await expect(await EntryPoint.walletProxyFactory()).to.equal(
      SmartAccountProxyFactory.address
    );
  });

  describe("handleOp", function () {
    it("should handle op using sender stake", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
      } = await loadFixture(deploy);

      let sender = await Utils.generateAccount({
        owner: Alice,
        bundler: bundler,
        EntryPoint: EntryPoint,
        SmartAccount: SmartAccount,
        SmartAccountProxyFactory: SmartAccountProxyFactory,
        random: 0,
      });

      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      let balanceOfAliceBefore = await ethers.provider.getBalance(
        Alice.address
      );

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();
      let balanceOfAliceAfter = await ethers.provider.getBalance(Alice.address);

      let blockNumber = receipt.blockNumber;
      let depositEvents = await EntryPoint.queryFilter(
        "Deposited",
        blockNumber
      );
      let refundDepositEvents = await EntryPoint.queryFilter(
        "RefundDeposit",
        blockNumber
      );
      let userOperationEvents = await EntryPoint.queryFilter(
        "UserOperationEvent",
        blockNumber
      );

      await expect(depositEvents.length).to.equal(1);
      await expect(refundDepositEvents.length).to.equal(1);
      await expect(userOperationEvents.length).to.equal(1);

      let depositedAmount = depositEvents[0].args["increaseDeposit"];
      let refundAmount = refundDepositEvents[0].args["refundAmount"];
      let actualCost = userOperationEvents[0].args["actualGasCost"];

      await expect(depositedAmount.sub(refundAmount)).to.equal(actualCost);
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });

    it("should handle op using tokenPaymaster", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
        TokenPaymaster,
        TestToken,
        PriceOracle,
      } = await loadFixture(deploy);
      let oneEther = ethers.utils.parseEther("1.0");

      // encode initData
      let sender = await Utils.generateAccount({
        owner: Alice,
        bundler: bundler,
        EntryPoint: EntryPoint,
        SmartAccount: SmartAccount,
        SmartAccountProxyFactory: SmartAccountProxyFactory,
        random: 0,
      });

      // encode callData for TestToken transfer(Alice, oneEther)
      let transferCallData = TestToken.interface.encodeFunctionData(
        "transfer",
        [Alice.address, oneEther]
      );

      // encode callData for executeParams
      let executeParamsNested = [
        {
          allowFailed: false,
          to: TestToken.address,
          value: 0,
          data: transferCallData,
          nestedCalls: "0x",
        },
        {
          allowFailed: true,
          to: TestToken.address,
          value: 0,
          data: transferCallData,
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

      let approveCall = TestToken.interface.encodeFunctionData("approve", [
        TokenPaymaster.address,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypointBatch",
        [
          [
            {
              allowFailed: false,
              to: TestToken.address,
              value: 0,
              data: approveCall,
              nestedCalls: nestedCalls,
            },
          ],
        ]
      );

      // generate userOperation
      let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

      // encode paymasterdata
      let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
      exchangeRate = exchangeRate.div(2);

      userOp.paymasterAndData = await Utils.paymasterSign(
        {
          signer: signer,
          TokenPaymaster: TokenPaymaster,
          TestToken: TestToken,
          exchangeRate: exchangeRate,
          sigTime: 0,
        },
        userOp
      );

      // user sign the userOp
      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      // execution
      await EntryPoint.depositTo(TokenPaymaster.address, {
        value: oneEther.mul(200),
      });
      await TestToken.mint(sender, oneEther.mul(200));
      await TestToken.mint(TokenPaymaster.address, oneEther.mul(200));

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      await tx.wait();

      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.not.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      let balance = await TestToken.balanceOf(Alice.address);
      await expect(balance).to.equal(oneEther.mul(2));
    });

    it("should handle op using FreeGasPaymaster", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
        TokenPaymaster,
        TestToken,
        PriceOracle,
        FreeGasPaymaster,
      } = await loadFixture(deploy);
      let oneEther = ethers.utils.parseEther("1.0");

      // encode initData
      let sender = await Utils.generateAccount({
        owner: Alice,
        bundler: bundler,
        EntryPoint: EntryPoint,
        SmartAccount: SmartAccount,
        SmartAccountProxyFactory: SmartAccountProxyFactory,
        random: 0,
      });

      // generate userOperation
      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        "0x"
      );

      // user sign the userOp
      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      // execution
      await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.not.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
    });

    it("should handle op with initCode using sender stake", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
      } = await loadFixture(deploy);
      let oneEther = ethers.utils.parseEther("1.0");

      let initializeData = SmartAccount.interface.encodeFunctionData(
        "Initialize",
        [Alice.address]
      );

      const sender = await SmartAccountProxyFactory.getAddress(
        SmartAccount.address,
        initializeData,
        0
      );

      const data = SmartAccountProxyFactory.interface.encodeFunctionData(
        "createAccount",
        [SmartAccount.address, initializeData, 0]
      );

      const initCode = ethers.utils.solidityPack(
        ["address", "bytes"],
        [SmartAccountProxyFactory.address, data]
      );

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 0,
        initCode: initCode,
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      await owner.sendTransaction({
        value: oneEther.mul(2),
        to: sender,
      });

      let balanceOfAliceBefore = await ethers.provider.getBalance(
        Alice.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      let balanceOfAliceAfter = await ethers.provider.getBalance(Alice.address);

      // calculate deposit amount, and compensate amount later
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });

    it("should handle op with initCode using tokenPaymaster", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
        TokenPaymaster,
        TestToken,
        PriceOracle,
      } = await loadFixture(deploy);
      let oneEther = ethers.utils.parseEther("1.0");

      // encode initData
      let initializeData = SmartAccount.interface.encodeFunctionData(
        "Initialize",
        [Alice.address]
      );

      const sender = await SmartAccountProxyFactory.getAddress(
        SmartAccount.address,
        initializeData,
        0
      );

      const data = SmartAccountProxyFactory.interface.encodeFunctionData(
        "createAccount",
        [SmartAccount.address, initializeData, 0]
      );

      const initCode = ethers.utils.solidityPack(
        ["address", "bytes"],
        [SmartAccountProxyFactory.address, data]
      );

      // encode callData for TestToken transfer(Alice, oneEther)
      let transferCallData = TestToken.interface.encodeFunctionData(
        "transfer",
        [Alice.address, oneEther]
      );

      // encode callData for executeParams
      let executeParamsNested = [
        {
          allowFailed: false,
          to: TestToken.address,
          value: 0,
          data: transferCallData,
          nestedCalls: "0x",
        },
        {
          allowFailed: true,
          to: TestToken.address,
          value: 0,
          data: transferCallData,
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

      let approveCall = TestToken.interface.encodeFunctionData("approve", [
        TokenPaymaster.address,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypointBatch",
        [
          [
            {
              allowFailed: false,
              to: TestToken.address,
              value: 0,
              data: approveCall,
              nestedCalls: nestedCalls,
            },
          ],
        ]
      );

      // generate userOperation
      let userOp = await Utils.generateUOP(sender, 0, initCode, callData, "0x");

      // encode paymasterdata
      let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
      exchangeRate = exchangeRate.div(2);

      userOp.paymasterAndData = await Utils.paymasterSign(
        {
          signer: signer,
          TokenPaymaster: TokenPaymaster,
          TestToken: TestToken,
          exchangeRate: exchangeRate,
          sigTime: 0,
        },
        userOp
      );

      // user sign the userOp
      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      // execution
      await EntryPoint.depositTo(TokenPaymaster.address, {
        value: oneEther.mul(200),
      });
      await TestToken.mint(sender, oneEther.mul(200));

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      await tx.wait();

      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.not.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      let balance = await TestToken.balanceOf(Alice.address);
      await expect(balance).to.equal(oneEther.mul(2));
    });
  });

  describe("simulateHandleOpWithoutSig", function () {
    it("should revert with AA20 account not deployed", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
      } = await loadFixture(deploy);

      let sender = await Utils.generateAccount({
        owner: Alice,
        bundler: bundler,
        EntryPoint: EntryPoint,
        SmartAccount: SmartAccount,
        SmartAccountProxyFactory: SmartAccountProxyFactory,
        random: 0,
      });

      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      let balanceOfAliceBefore = await ethers.provider.getBalance(
        Alice.address
      );

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateSignedUOP({
        sender: Alice.address,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      let tx = EntryPoint.connect(bundler).simulateHandleOpWithoutSig(userOp);
      await expect(tx)
        .to.be.revertedWithCustomError(EntryPoint, "FailedOp")
        .withArgs(0, ethers.constants.AddressZero, "AA20 account not deployed");
    });

    it("should revert with AA20 account not deployed", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
      } = await loadFixture(deploy);

      let sender = await Utils.generateAccount({
        owner: Alice,
        bundler: bundler,
        EntryPoint: EntryPoint,
        SmartAccount: SmartAccount,
        SmartAccountProxyFactory: SmartAccountProxyFactory,
        random: 0,
      });

      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      let balanceOfAliceBefore = await ethers.provider.getBalance(
        Alice.address
      );

      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        paymasterAndData: Alice.address,
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      let tx = EntryPoint.connect(bundler).simulateHandleOpWithoutSig(userOp);
      await expect(tx)
        .to.be.revertedWithCustomError(EntryPoint, "FailedOp")
        .withArgs(
          0,
          ethers.constants.AddressZero,
          "AA30 paymaster not deployed"
        );
    });
  });
});
