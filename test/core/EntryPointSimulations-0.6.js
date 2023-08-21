let { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let Utils = require("../Utils.js");

describe("EntryPointSimulations-0.6", function () {
  async function deploy() {
    let [owner, bundler, alice, signer] = await ethers.getSigners();

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
      "contracts/helper/UserOperationHelper-0.6.sol:UserOperationHelper"
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
    let MockEntryPointSimulationFactory0_6 = await ethers.getContractFactory(
      "MockEntryPointSimulations"
    );
    let mockEntryPointSimulation0_6 =
      await MockEntryPointSimulationFactory0_6.deploy(entrypoint0_6.address);

    let EntryPointSimulationFactory0_6 = await ethers.getContractFactory(
      "contracts/helper/EntryPointSimulations-0.6.sol:EntryPointSimulations"
    );
    let entryPointSimulation0_6 = await EntryPointSimulationFactory0_6.deploy(
      entrypoint0_6.address
    );

    // deploy storage
    let Validations = await ethers.getContractFactory("Validations");
    let validations = await Validations.deploy(owner.address);
    await validations.setBundlerOfficialWhitelist(bundler.address, true);

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
      entryPointSimulation0_6.address,
      defaultCallbackHandler0_6.address,
      validations.address,
      "SA",
      "1.0"
    );

    let maxPrice = ethers.BigNumber.from("20000000000");
    let minPrice = ethers.BigNumber.from("200000000");

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
      owner.address,
      entryPointSimulation0_6.address,
      entrypoint0_4.address,
      entrypoint0_6.address
    );

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);

    await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
      TestToken.address,
      maxPrice
    );
    await TokenPaymaster.connect(owner).setTokenPriceLimitMin(
      TestToken.address,
      minPrice
    );

    return {
      owner,
      bundler,
      alice,
      signer,
      entrypoint0_4,
      entrypoint0_6,
      smartAccount0_4,
      smartAccount0_6,
      entryPointSimulation0_6,
      mockEntryPointSimulation0_6,
      smartAccountProxyFactory,
      TestToken,
      TokenPaymaster,
      minPrice,
    };
  }

  describe("syncNonce", function () {
    it("should sync target's nonce", async function () {
      const { owner, entrypoint0_6, mockEntryPointSimulation0_6 } =
        await loadFixture(deploy);

      await entrypoint0_6.connect(owner).incrementNonce(0);
      await entrypoint0_6.connect(owner).incrementNonce(0);
      await entrypoint0_6.connect(owner).incrementNonce(0);

      await expect(await entrypoint0_6.getNonce(owner.address, 0)).to.equal(3);

      await mockEntryPointSimulation0_6
        .connect(owner)
        .syncNonce(owner.address, 0);

      await expect(
        await mockEntryPointSimulation0_6.getNonce(owner.address, 0)
      ).to.equal(3);
    });
  });

  describe("syncDeposit", function () {
    it("should sync target's deposit", async function () {
      const { owner, entrypoint0_6, mockEntryPointSimulation0_6 } =
        await loadFixture(deploy);

      await entrypoint0_6
        .connect(owner)
        .depositTo(owner.address, { value: ethers.utils.parseEther("1") });

      await expect(await entrypoint0_6.balanceOf(owner.address)).to.equal(
        ethers.utils.parseEther("1")
      );
      await expect(
        await mockEntryPointSimulation0_6.balanceOf(owner.address)
      ).to.equal(ethers.utils.parseEther("0"));

      await mockEntryPointSimulation0_6
        .connect(owner)
        .syncDeposit(owner.address);

      await expect(
        await mockEntryPointSimulation0_6.balanceOf(owner.address)
      ).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("syncSenderAndePaymasterDeposits", function () {
    it("should sync sender and paymaster's deposits", async function () {
      const {
        owner,
        bundler,
        alice,
        signer,
        entrypoint0_4,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        mockEntryPointSimulation0_6,
        smartAccountProxyFactory,
        TestToken,
        TokenPaymaster,
        minPrice,
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

      let exchangeRate = minPrice.mul(2);

      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: TokenPaymaster,
          TestToken: TestToken,
          exchangeRate: exchangeRate,
          sigTime: 1234567,
        },
        aliceProxyAccount.address,
        0,
        "0x"
      );

      await entrypoint0_6.connect(owner).depositTo(aliceProxyAccount.address, {
        value: ethers.utils.parseEther("1"),
      });
      await entrypoint0_6.connect(owner).depositTo(TokenPaymaster.address, {
        value: ethers.utils.parseEther("1"),
      });

      await expect(
        await entrypoint0_6.balanceOf(aliceProxyAccount.address)
      ).to.equal(ethers.utils.parseEther("1"));
      await expect(
        await entrypoint0_6.balanceOf(TokenPaymaster.address)
      ).to.equal(ethers.utils.parseEther("1"));
      await expect(
        await mockEntryPointSimulation0_6.balanceOf(aliceProxyAccount.address)
      ).to.equal(ethers.utils.parseEther("0"));
      await expect(
        await mockEntryPointSimulation0_6.balanceOf(TokenPaymaster.address)
      ).to.equal(ethers.utils.parseEther("0"));

      await mockEntryPointSimulation0_6.syncSenderAndePaymasterDeposits(userOp);

      await expect(
        await mockEntryPointSimulation0_6.balanceOf(aliceProxyAccount.address)
      ).to.equal(ethers.utils.parseEther("1"));
      await expect(
        await mockEntryPointSimulation0_6.balanceOf(TokenPaymaster.address)
      ).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("simulateHandleOps", function () {
    it("Should correctly revert call revert reason", async function () {
      let {
        owner,
        alice,
        bundler,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        smartAccountProxyFactory,
        entryPointSimulation0_6,
        TestToken,
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

      oneEther = ethers.utils.parseEther("1.0");

      let transferCallData = TestToken.interface.encodeFunctionData(
        "transfer",
        [owner.address, oneEther]
      );

      callData = smartAccount0_6.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [TestToken.address, ethers.utils.parseEther("0"), transferCallData]
      );

      let userOp = await Utils.generateSignedUOP({
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

      const callDetails = {
        to: entryPointSimulation0_6.address,
        data: entryPointSimulation0_6.interface.encodeFunctionData(
          "simulateHandleOp",
          [userOp, ethers.constants.AddressZero, "0x"]
        ),
      };

      const parsedError = entryPointSimulation0_6.interface.parseError(
        await bundler.call(callDetails)
      );

      const expectRevertReason = "ERC20: transfer amount exceeds balance";
      const bytes = ethers.utils.toUtf8Bytes(expectRevertReason);
      const hex = ethers.utils.hexlify(bytes).substring(2); // remove the '0x' prefix

      await expect(parsedError.args.result.includes(hex)).to.equal(true);
    });

    it("Should correctly revert postOpMode", async function () {
      let {
        owner,
        alice,
        bundler,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        smartAccountProxyFactory,
        entryPointSimulation0_6,
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

      let userOp = await Utils.generateSignedUOP({
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

      let callDetails = {
        to: entryPointSimulation0_6.address,
        data: entryPointSimulation0_6.interface.encodeFunctionData(
          "simulateHandleOp",
          [userOp, ethers.constants.AddressZero, "0x"]
        ),
      };

      let parsedError = entryPointSimulation0_6.interface.parseError(
        await bundler.call(callDetails)
      );

      await expect(parsedError.args[1]).to.equal(0);

      callData = smartAccount0_6.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [alice.address, ethers.utils.parseEther("2"), "0x"]
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

      callDetails = {
        to: entryPointSimulation0_6.address,
        data: entryPointSimulation0_6.interface.encodeFunctionData(
          "simulateHandleOp",
          [userOp, ethers.constants.AddressZero, "0x"]
        ),
      };

      parsedError = entryPointSimulation0_6.interface.parseError(
        await bundler.call(callDetails)
      );

      await expect(parsedError.args[1]).to.equal(1);
    });

    it("Should correctly revert gas Limit", async function () {
      let {
        owner,
        alice,
        bundler,
        entrypoint0_6,
        smartAccount0_4,
        smartAccount0_6,
        smartAccountProxyFactory,
        entryPointSimulation0_6,
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

      let userOp = await Utils.generateSignedUOP({
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

      const callDetails = {
        to: entryPointSimulation0_6.address,
        data: entryPointSimulation0_6.interface.encodeFunctionData(
          "simulateHandleOp",
          [userOp, ethers.constants.AddressZero, "0x"]
        ),
      };

      const parsedError = entryPointSimulation0_6.interface.parseError(
        await bundler.call(callDetails)
      );

      k = 1.5;

      userOp = await Utils.generateSignedUOPWithManualGasLimit({
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
        manualVerificationGasLimit: parsedError.args.preOpGas
          .sub(parsedError.args.callGasCost)
          .mul(k * 10)
          .div(10),
        manualPreVerificationGas: 0,
        manualCallGasLimit: parsedError.args.callGasCost.mul(k * 10).div(10),
      });

      let tx = await entrypoint0_6
        .connect(bundler)
        .handleOps([userOp], owner.address);

      await tx.wait();
    });
  });
});
