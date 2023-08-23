const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");

describe("Gas", function () {
  async function deploy() {
    let [owner, signer, bundler, Alice] = await ethers.getSigners();
    let maxPrice = ethers.utils.parseEther("1");
    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

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
      "1"
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
    await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);

    await PriceOracle.connect(owner).setPriceFeed(
      TestToken.address,
      MockChainlinkOracle.address
    );
    await PriceOracle.connect(owner).setDecimals(TestToken.address, 6);

    await PriceOracle.connect(owner).setPriceFeed(
      await PriceOracle.NATIVE_TOKEN(),
      MockChainlinkOracleETH.address
    );
    await PriceOracle.connect(owner).setDecimals(
      await PriceOracle.NATIVE_TOKEN(),
      18
    );

    // await EntryPoint.connect(owner).depositTo(TokenPaymaster.address, {
    //   value: ethers.utils.parseUnits("1"),
    // });

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
    };
  }

  describe("createWithTokenPaymaster", function () {
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
      let receipt = await tx.wait();

      let gasUsed = receipt.cumulativeGasUsed;
    });
  });
});
