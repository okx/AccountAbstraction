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
      owner.address
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
      "MockTokenPaymasterV04"
    );
    let TokenPaymaster = await TokenPaymasterFactory.deploy(
      signer.address,
      PriceOracle.address,
      owner.address
    );

    // await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);
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

  async function createSender(
    owner,
    user,
    bundler,
    EntryPoint,
    SmartAccount,
    SmartAccountProxyFactory
  ) {
    let sender = await Utils.generateAccount({
      owner: user,
      bundler: bundler,
      EntryPoint: EntryPoint,
      SmartAccount: SmartAccount,
      SmartAccountProxyFactory: SmartAccountProxyFactory,
      random: 0,
    });

    // send ETH to sender
    let oneEther = ethers.utils.parseEther("1.0");
    await owner.sendTransaction({
      value: oneEther,
      to: sender,
    });

    return sender;
  }

  // decode HandleUserOpRevertReason reason
  async function decodeReason(reason) {
    if (reason.length < 10 + 64 * 4) {
      return "";
    }

    let selector = reason.substring(0, 10);
    let reasonStart = ethers.BigNumber.from(
      "0x" + reason.substring(10 + 64 * 2, 10 + 64 * 3)
    )
      .add(32)
      .mul(2)
      .add(10);

    let reasonLength = ethers.BigNumber.from(
      "0x" + reason.substring(10 + 64 * 3, 10 + 64 * 4)
    ).mul(2);

    let reasonData =
      "0x" + reason.substring(reasonStart, reasonStart.add(reasonLength));

    return ethers.utils.toUtf8String(reasonData);
  }

  async function getInitCode(SmartAccount, SmartAccountProxyFactory, user) {
    let initializeData = SmartAccount.interface.encodeFunctionData(
      "Initialize",
      [user.address]
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

    return { sender, initCode };
  }

  // handleOps
  describe("handleOps", function () {
    it("should revert if simulating", async function () {
      let {
        owner,
        bundler,
        Alice,
        SmartAccount,
        SmartAccountProxyFactory,
        EntryPoint,
      } = await loadFixture(deploy);

      // create sender
      let sender = await createSender(
        owner,
        Alice,
        bundler,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory
      );

      // construct callData
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, 100, "0x"]
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

      let tx = EntryPoint.simulateValidationWithWalletWhitelistValidate(userOp);
      await expect(tx).to.be.revertedWithCustomError(
        EntryPoint,
        "SimulateHandleOpResult"
      );

      tx = EntryPoint.simulateHandleOpWithoutSig(userOp);

      await expect(tx).to.be.revertedWithCustomError(
        EntryPoint,
        "SimulateHandleOpResult"
      );
    });

    it("should revert if bundler is not whitelisted", async function () {
      let {
        owner,
        bundler,
        Alice,
        SmartAccount,
        SmartAccountProxyFactory,
        EntryPoint,
      } = await loadFixture(deploy);

      // create sender
      let sender = await createSender(
        owner,
        Alice,
        bundler,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory
      );

      // construct callData
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, 100, "0x"]
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

      let tx = EntryPoint.mockhandleOps([userOp]);
      await expect(tx).to.be.revertedWith("called by illegal bundler");
    });

    it("should revert if mulitple ops performed with unrestrictedBundler", async function () {
      let {
        owner,
        bundler,
        Alice,
        SmartAccount,
        SmartAccountProxyFactory,
        EntryPoint,
      } = await loadFixture(deploy);

      // create sender
      let sender = await createSender(
        owner,
        Alice,
        bundler,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory
      );

      // construct callData
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, 100, "0x"]
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

      await EntryPoint.setUnrestrictedBundler(true);

      let tx = EntryPoint.mockhandleOps([userOp, userOp]);
      await expect(tx).to.be.revertedWith("only support one op");
    });

    it("should revert if not unrestrictedModule", async function () {
      let {
        owner,
        bundler,
        Alice,
        SmartAccount,
        SmartAccountProxyFactory,
        EntryPoint,
      } = await loadFixture(deploy);

      // create sender
      let sender = await createSender(
        owner,
        Alice,
        bundler,
        EntryPoint,
        SmartAccount,
        SmartAccountProxyFactory
      );

      let smartAccount = await ethers.getContractAt(
        "contracts/wallet-0.4/SmartAccount.sol:SmartAccount",
        sender
      );

      let tx = smartAccount.execTransactionFromModule(
        Alice.address,
        1,
        "0x",
        0
      );

      await expect(tx).to.be.revertedWith("not allowed module");
    });
  });

  // handleOp
  describe("handleOp", function () {
    describe("createSender", function () {
      it("should revert if factory function not exists", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        initCode = owner.address + initCode.slice(42);

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

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        let expectRevertReason = "AA13 initCode failed or OOG";

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          expectRevertReason
        );
      });

      it("should revert if failed to deploy", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        initCode = initCode.slice(0, 42) + "12345678" + initCode.slice(42 + 8);

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

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        let expectRevertReason = "AA13 initCode failed or OOG";

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          expectRevertReason
        );
      });

      it("should revert if initcode is empty", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateSignedUOP({
          sender: sender,
          nonce: 0,
          initCode: "0x",
          callData: callData,
          paymasterAndData: "0x",
          owner: Alice,
          SmartAccount: SmartAccount,
          EntryPoint: EntryPoint.address,
          sigType: 1,
          sigTime: 0,
        });

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(revertEvent.revertReason).to.equal("0x");
      });

      it("should revert if sender already constructed", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        let { initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateSignedUOP({
          sender: sender,
          nonce: 1,
          initCode: initCode,
          callData: callData,
          paymasterAndData: "0x",
          owner: Alice,
          SmartAccount: SmartAccount,
          EntryPoint: EntryPoint.address,
          sigType: 1,
          sigTime: 0,
        });

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA10 sender already constructed"
        );
      });

      it("should revert if wrong sender created AA14 initCode must return sender", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateSignedUOP({
          sender: owner.address,
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

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(owner.address);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA14 initCode must return sender"
        );
      });

      it("should revert if no code deployed AA15 initCode must create sender", async function () {
        let { owner, bundler, Alice, SmartAccount, EntryPoint } =
          await loadFixture(deploy);

        let MockWrongDeployFactory = await ethers.getContractFactory(
          "MockWrongDeployFactory"
        );

        let SmartAccountProxyFactory = await MockWrongDeployFactory.deploy(
          SmartAccount.address,
          owner.address
        );

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
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

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA15 initCode must create sender"
        );
      });

      it("should revert if insufficent verificationGasLimit", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender, initCode } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(
          sender,
          0,
          initCode,
          callData,
          "0x"
        );

        userOp.verificationGasLimit = 0;
        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal("");
      });
    });

    describe("wallet validation", function () {
      it("should revert if sender not exists", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        let { sender } = await getInitCode(
          SmartAccount,
          SmartAccountProxyFactory,
          Alice
        );

        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateSignedUOP({
          sender: sender,
          nonce: 0,
          initCode: "0x",
          callData: callData,
          paymasterAndData: "0x",
          owner: Alice,
          SmartAccount: SmartAccount,
          EntryPoint: EntryPoint.address,
          sigType: 1,
          sigTime: 0,
        });

        // send ETH to sender
        await owner.sendTransaction({
          value: ethers.utils.parseEther("1.0"),
          to: sender,
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(0);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal("");
      });

      it("should revert if validation revert without reason insufficent verificationGasLimit", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        userOp.verificationGasLimit = 0;
        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA23 reverted (or OOG)"
        );
      });

      it("should revert if validation failed", async function () {
        let { owner, bundler, Alice, SmartAccountProxyFactory, EntryPoint } =
          await loadFixture(deploy);

        let MockWrongSmartAccount = await ethers.getContractFactory(
          "MockWrongSmartAccount"
        );

        let SmartAccount = await MockWrongSmartAccount.deploy(
          EntryPoint.address,
          owner.address,
          "SA",
          "1.0"
        );

        await SmartAccountProxyFactory.connect(owner).setSafeSingleton(
          SmartAccount.address,
          true
        );

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        userOp = await Utils.generateSignedUOP({
          sender: sender,
          nonce: 1000,
          initCode: "0x",
          callData: callData,
          paymasterAndData: "0x",
          owner: Alice,
          SmartAccount: SmartAccount,
          EntryPoint: EntryPoint.address,
          sigType: 1,
          sigTime: 0,
        });

        tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1000);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "MockWrongSmartAccount: invalid nonce"
        );
      });

      it("should revert if not pay prefund", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        // create sender
        let sender = await Utils.deploy(
          Alice,
          SmartAccountProxyFactory,
          SmartAccount,
          0
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA21 didn't pay prefund"
        );
      });

      it("should revert if using aggregated signature", async function () {
        let {
          owner,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        let userOpPerAggregator = {
          userOps: [userOp],
          aggregator: owner.address,
          signature: "0x",
        };

        let tx = EntryPoint.connect(bundler).mockhandleAggregatedOps([
          userOpPerAggregator,
        ]);

        await expect(tx).to.be.revertedWith("Not support aggregator yet");
      });
    });

    describe("paymaster validation", function () {
      it("should revert if insufficient gas", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");
        userOp.verificationGasLimit = 25000;

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

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA41 too little verificationGas"
        );
      });

      it("should revert if insufficient stake of paymaster", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
        exchangeRate = exchangeRate.mul(2);

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

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA31 paymaster deposit too low"
        );
      });

      it("should revert if paymaster not exists", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
        exchangeRate = exchangeRate.mul(2);

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

        userOp.paymasterAndData =
          owner.address + userOp.paymasterAndData.slice(42);

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        await EntryPoint.depositTo(owner.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal("");
      });

      it("should revert if paymaster validation reverted", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        let MockTokenPaymaster = await ethers.getContractFactory(
          "MockTokenPaymasterV04"
        );
        let TokenPaymaster = await MockTokenPaymaster.deploy(
          signer.address,
          PriceOracle.address,
          owner.address
        );
        await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
        exchangeRate = exchangeRate.mul(2);

        userOp.paymasterAndData = await Utils.paymasterSign(
          {
            signer: signer,
            TokenPaymaster: TokenPaymaster,
            TestToken: TestToken,
            exchangeRate: exchangeRate,
            sigTime: 12345,
          },
          userOp
        );

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "MockTokenPaymaster: validatePaymasterUserOp is deprecated"
        );
      });

      it("should revert if paymaster validation revert with no reason", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

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
        userOp.paymasterAndData = userOp.paymasterAndData.slice(0, 42);

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA33 reverted (or OOG)"
        );
      });
    });

    describe("deadline", function () {
      it("should revert if wrong nonce", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 2, "0x", callData, "0x");

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(2);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA25 nonce error"
        );
      });
      it("should revert if deadline passed", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        userOp.deadline = 0;

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          12345,
          1
        );

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA22 expired"
        );
      });

      it("should revert if paymaster validation failed", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

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
        userOp.paymasterAndData = userOp.paymasterAndData.slice(0, -4) + "001c";

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA34 signature error"
        );
      });

      it("should revert if paymaster deadline passed", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

        let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
        exchangeRate = exchangeRate.div(2);

        userOp.paymasterAndData = await Utils.paymasterSign(
          {
            signer: signer,
            TokenPaymaster: TokenPaymaster,
            TestToken: TestToken,
            exchangeRate: exchangeRate,
            sigTime: 123456,
          },
          userOp
        );

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await TestToken.mint(sender, ethers.utils.parseEther("200"));

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let receipt = await tx.wait();
        let blockNumber = receipt.blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );

        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA32 paymaster expired"
        );
      });
    });

    describe("postOp", function () {
      it("should revert if postOp failed", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TokenPaymaster,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

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

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA50 postOp revert"
        );
      });

      it("should revert if postOp failed with no reason", async function () {
        let {
          owner,
          signer,
          bundler,
          Alice,
          SmartAccount,
          SmartAccountProxyFactory,
          EntryPoint,
          TestToken,
          PriceOracle,
        } = await loadFixture(deploy);

        let MockTokenPaymaster = await ethers.getContractFactory(
          "MockTokenPaymasterV04"
        );

        let TokenPaymaster = await MockTokenPaymaster.deploy(
          signer.address,
          PriceOracle.address,
          owner.address
        );
        await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

        // create sender
        let sender = await createSender(
          owner,
          Alice,
          bundler,
          EntryPoint,
          SmartAccount,
          SmartAccountProxyFactory
        );

        // construct callData
        let callData = SmartAccount.interface.encodeFunctionData(
          "execTransactionFromEntrypoint",
          [Alice.address, 100, "0x"]
        );

        let userOp = await Utils.generateUOP(sender, 1, "0x", callData, "0x");

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

        userOp.signature = await Utils.generateSignature(
          Alice,
          SmartAccount,
          EntryPoint.address,
          userOp,
          0,
          1
        );

        await EntryPoint.depositTo(TokenPaymaster.address, {
          value: ethers.utils.parseEther("200"),
        });

        let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);

        let blockNumber = (await tx.wait()).blockNumber;
        let revertEvents = await EntryPoint.queryFilter(
          "HandleUserOpRevertReason",
          blockNumber
        );
        await expect(revertEvents.length).to.equal(1);
        let revertEvent = revertEvents[0].args;

        await expect(revertEvent.sender).to.equal(sender);
        await expect(revertEvent.nonce).to.equal(1);
        await expect(await decodeReason(revertEvent.revertReason)).to.equal(
          "AA50 postOp revert"
        );
      });
    });
  });
});
