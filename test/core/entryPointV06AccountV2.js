const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");

describe("entryPointV06AccountV2", function () {
  async function deploy() {
    let [owner, signer, bundler, Alice] = await ethers.getSigners();
    let maxPrice = ethers.utils.parseEther("1");
    let EntryPointFactory = await ethers.getContractFactory(
      "MockEntryPointV06"
    );
    let EntryPoint = await EntryPointFactory.deploy();

    let FreeGasPaymasterFactory = await ethers.getContractFactory(
      "FreeGasPaymaster"
    );

    let FreeGasPaymaster = await FreeGasPaymasterFactory.deploy(
      signer.address,
      owner.address
    );
    await FreeGasPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let Validations = await ethers.getContractFactory("Validations");
    let validations = await Validations.deploy(owner.address);

    await validations.connect(owner).setBundlerOfficialWhitelist(bundler.address, true);

    let SmartAccountFactory = await ethers.getContractFactory(
      "contracts/wallet/v2/SmartAccountV2.sol:SmartAccountV2"
    );

    let SmartAccount = await SmartAccountFactory.deploy(
      EntryPoint.address,
      DefaultCallbackHandler.address,
      validations.address,
      "SA",
      "1.0"
    );

    let SmartAccountFactoryV2Factory = await ethers.getContractFactory(
      "contracts/wallet/v2/AccountFactoryV2.sol:AccountFactoryV2"
    );
    let SmartAccountFactoryV2 = await SmartAccountFactoryV2Factory.deploy();

    let AccountFactoryProxyFactory = await ethers.getContractFactory(
      "contracts/wallet/v2/AccountFactoryProxy.sol:AccountFactoryProxy"
    );

    let AccountFactoryProxy = await AccountFactoryProxyFactory.deploy(
      SmartAccountFactoryV2.address,
      owner.address,
      SmartAccount.address
    );

    let SmartAccountProxyFactory = await ethers
        .getContractFactory("contracts/wallet/v2/AccountFactoryV2.sol:AccountFactoryV2")
        .then((f) => f.attach(AccountFactoryProxy.address));

    let MockChainlinkOracleFactory = await ethers.getContractFactory(
      "MockChainlinkOracle"
    );
    let MockChainlinkOracle = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    let MockChainlinkOracleETH = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    await MockChainlinkOracle.connect(owner).setPrice(1_000_000);
    await MockChainlinkOracle.connect(owner).setDecimals(6);

    await MockChainlinkOracleETH.connect(owner).setPrice(200_0000_000);
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
      validations
    };
  }

  it("should read default values", async function () {
    const { owner, bundler, signer, validations, EntryPoint, TokenPaymaster, SmartAccount, SmartAccountProxyFactory } =
      await loadFixture(deploy);

    await expect(await validations.validateBundlerWhiteList(bundler.address))
      .to.not.revertedWith("called by illegal bundler");

    await expect(
      await TokenPaymaster.verifyingSigner()
    ).to.equal(signer.address);
    await expect(
      await SmartAccount.entryPoint()
    ).to.equal(EntryPoint.address);
    await expect(await SmartAccount.VALIDATIONS()).to.equal(
      validations.address
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

      let sender = await Utils.generateAccountV2({
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

      let params = {
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
      }
      let userOp = await Utils.generateSignedUOP(params);

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();
      let balanceOfAliceAfter = await ethers.provider.getBalance(Alice.address);

      let blockNumber = receipt.blockNumber;
      let depositEvents = await EntryPoint.queryFilter(
        "Deposited",
        blockNumber
      );

      let userOperationEvents = await EntryPoint.queryFilter(
        "UserOperationEvent",
        blockNumber
      );

      await expect(depositEvents.length).to.equal(1);
      await expect(userOperationEvents.length).to.equal(1);

      let depositedAmount = depositEvents[0].args["totalDeposit"];
      let actualCost = userOperationEvents[0].args["actualGasCost"];

      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      await expect(tx).to.emit(EntryPoint, "Deposited");
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(balanceOfAliceAfter.sub(balanceOfAliceBefore)).to.equal(
        oneEther
      );
    });

     it("should revert if caller is not bundler", async function () {
      const {
        owner,
        bundler,
        signer,
        Alice,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory,
      } = await loadFixture(deploy);

      let sender = await Utils.generateAccountV2({
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

      let params = {
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
      }
      let userOp = await Utils.generateSignedUOP(params);

      await expect(EntryPoint.connect(Alice).mockhandleOps([userOp]))
      .to.be.revertedWithCustomError(EntryPoint, 'FailedOp')
      .withArgs(0, "AA23 reverted: called by illegal bundler");;
     
    });

    it("should use sigTime on signature", async function () {
      const {
        bundler,
        EntryPoint,
      } = await loadFixture(deploy);

      let sigTime = Utils.getSigTime(0, true);

      let result = await EntryPoint.connect(bundler).getValidationData(sigTime);

      await expect(result.aggregator).to.equal("0x0000000000000000000000000000000000000000");
      await expect(result.outOfTimeRange).to.equal(false);
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
      let sender = await Utils.generateAccountV2({
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
        userOp,
        true
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
      let receipt = await tx.wait();

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
      let sender = await Utils.generateAccountV2({
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

      let initializeData = ethers.utils.defaultAbiCoder.encode(
        [ "address", "bytes" ], 
        [ Alice.address, "0x" ]
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
      let initializeData = ethers.utils.defaultAbiCoder.encode(
        [ "address", "bytes" ], 
        [ Alice.address, "0x" ]
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
        userOp,
        true
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
});
