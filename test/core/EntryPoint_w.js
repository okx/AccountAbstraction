const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");
const { ethers } = require("hardhat");

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
      owner.address,
      EntryPoint.address,
      EntryPoint.address,
      EntryPoint.address
    );

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
      "contracts/wallet-0.4/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
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
      owner.address,
      EntryPoint.address,
      EntryPoint.address,
      EntryPoint.address
    );

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address);

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

    let sender = await Utils.generateAccount({
      owner: Alice,
      bundler: bundler,
      EntryPoint: EntryPoint,
      SmartAccount: SmartAccount,
      SmartAccountProxyFactory: SmartAccountProxyFactory,
      random: 0,
    });

    return {
      owner,
      sender,
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

  describe("handleOp", function () {
    it("sender stake, one userOP, success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
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

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(oneEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);
    });
    it("sender stake, one userOP, unrestrictedBundler, success", async function () {
      const { owner, sender, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
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

      await expect(
        EntryPoint.connect(Alice).mockhandleOps([userOp])
      ).to.be.revertedWith("called by illegal bundler");

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let result = await EntryPoint.connect(owner).setUnrestrictedBundler(true);
      await result.wait();

      let tx = await EntryPoint.connect(owner).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(oneEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);
    });
    it("sender stake, three userOP, success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      let threeEther = ethers.utils.parseEther("3.0");
      await owner.sendTransaction({
        value: threeEther,
        to: sender,
      });

      //encode the OP
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

      let userOp1 = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 2,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      let userOp2 = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 3,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([
        userOp,
        userOp1,
        userOp2,
      ]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(threeEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(threeEther);
    });
    it("sender stake, one userOP with error sender, should emit HandleUserOpRevertReason", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
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

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute revert success
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);

      expect(beforeAABalance.sub(afterAABalance)).to.equal(actualGasCost);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(0);
    });
    it("sender stake, three userOP with a fail userOP, success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      let threeEther = ethers.utils.parseEther("3.0");
      await owner.sendTransaction({
        value: threeEther,
        to: sender,
      });

      //encode the OP
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

      let userOp1 = await Utils.generateSignedUOP({
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

      let userOp2 = await Utils.generateSignedUOP({
        sender: sender,
        nonce: 2,
        initCode: "0x",
        callData: callData,
        paymasterAndData: "0x",
        owner: Alice,
        SmartAccount: SmartAccount,
        EntryPoint: EntryPoint.address,
        sigType: 1,
        sigTime: 0,
      });

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([
        userOp,
        userOp1,
        userOp2,
      ]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //nonce error
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      let error = await getReveetReason(EntryPoint, receipt);
      expect(error).to.equal("AA25 nonce error");

      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(
        beforeAABalance.sub(afterAABalance).sub(ethers.utils.parseEther("2.0"))
      ).to.equal(actualGasCost);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(
        ethers.utils.parseEther("2.0")
      );
    });
    it("sender stake, one userOP, validateUserOp OOG", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = {
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        callGasLimit: 500000,
        verificationGasLimit: 100,
        preVerificationGas: 0,
        maxFeePerGas: 100000000,
        maxPriorityFeePerGas: 100000000,
        paymasterAndData: "0x",
        signature: "0x",
      };

      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //no userOP error
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      let error = await getReveetReason(EntryPoint, receipt);
      expect(error).to.equal("AA23 reverted (or OOG)");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance)).to.equal(0);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(0);
    });
    it("sender stake, one userOP, simple signature,success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
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
        sigType: 0,
        sigTime: 0,
      });

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(oneEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);
    });
    it("sender stake, one userOP, maxFeePerGas<maxPriorityFeePerGas,success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = {
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        callGasLimit: 500000,
        verificationGasLimit: 700000,
        preVerificationGas: 0,
        maxFeePerGas: 80000000,
        maxPriorityFeePerGas: 100000000,
        paymasterAndData: "0x",
        signature: "0x",
      };

      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(oneEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);
    });
    it("sender stake, one userOP, maxFeePerGas>maxPriorityFeePerGas,success", async function () {
      const { owner, sender, bundler, Alice, EntryPoint, SmartAccount } =
        await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = {
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        callGasLimit: 500000,
        verificationGasLimit: 700000,
        preVerificationGas: 0,
        maxFeePerGas: 150000000,
        maxPriorityFeePerGas: 100000000,
        paymasterAndData: "0x",
        signature: "0x",
      };

      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //execute deposit success
      await expect(tx).to.emit(EntryPoint, "Deposited");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");

      //refund success
      expect(afterEntryPointBalance.sub(beforeEntryPointBalance)).to.equal(0);

      //user cost right
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeAABalance.sub(afterAABalance).sub(oneEther)).to.equal(
        actualGasCost
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);
    });
    it("FreeGasPaymaster, one userOP, success", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //paymaster deposit
      let result = await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      //execute deposit success
      await expect(result).to.emit(EntryPoint, "Deposited");

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
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

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.not.emit(EntryPoint, "HandleUserOpRevertReason");

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(oneEther);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);

      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(
        actualGasCost
      );
    });
    it("FreeGasPaymaster, one userOP, deposit not enough,fail", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
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

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //no userOP error
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      let error = await getReveetReason(EntryPoint, receipt);
      expect(error).to.equal("AA31 paymaster deposit too low");
      //refund success
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(0);

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(0);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(0);
    });
    it("FreeGasPaymaster, three userOP, success", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send three ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      let threeEther = ethers.utils.parseEther("3.0");
      await owner.sendTransaction({
        value: threeEther,
        to: sender,
      });

      //paymaster deposit
      let result = await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      //execute deposit success
      await expect(result).to.emit(EntryPoint, "Deposited");

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
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

      let userOp1 = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        2,
        // "0x"
        callData
      );

      // user sign the userOp
      userOp1.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp1,
        0,
        1
      );

      let userOp2 = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        3,
        // "0x"
        callData
      );

      // user sign the userOp
      userOp2.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp2,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([
        userOp,
        userOp1,
        userOp2,
      ]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");

      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.not.emit(EntryPoint, "HandleUserOpRevertReason");

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(threeEther);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(threeEther);

      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(
        actualGasCost
      );
    });
    it("FreeGasPaymaster, three userOP with a fail userOP, success", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send three ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      let threeEther = ethers.utils.parseEther("3.0");
      await owner.sendTransaction({
        value: threeEther,
        to: sender,
      });

      //paymaster deposit
      let result = await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      //execute deposit success
      await expect(result).to.emit(EntryPoint, "Deposited");

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
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

      let userOp1 = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
      );

      // user sign the userOp
      userOp1.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp1,
        0,
        1
      );

      let userOp2 = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        2,
        // "0x"
        callData
      );

      // user sign the userOp
      userOp2.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp2,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([
        userOp,
        userOp1,
        userOp2,
      ]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");

      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      let error = await getReveetReason(EntryPoint, receipt);
      expect(error).to.equal("AA25 nonce error");

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(
        ethers.utils.parseEther("2.0")
      );

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(
        ethers.utils.parseEther("2.0")
      );

      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(
        actualGasCost
      );
    });
    it("FreeGasPaymaster, one userOP, validatePaymasterUserOp OOG", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //paymaster deposit
      let result = await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      //execute deposit success
      await expect(result).to.emit(EntryPoint, "Deposited");

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOpData = {
        sender: sender,
        nonce: 1,
        initCode: "0x",
        callData: callData,
        callGasLimit: 500000,
        verificationGasLimit: 30000,
        preVerificationGas: 0,
        maxFeePerGas: 100000000,
        maxPriorityFeePerGas: 100000000,
        paymasterAndData: "0x",
        signature: "0x",
      };

      let userOp = await Utils.generateFreePaymasterWithUOP(userOpData, {
        signer: signer,
        FreeGasPaymaster: FreeGasPaymaster,
        sigTime: 0,
      });

      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        1
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.not.emit(EntryPoint, "UserOperationEvent");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.emit(EntryPoint, "HandleUserOpRevertReason");
      let error = await getReveetReason(EntryPoint, receipt);
      expect(error).to.equal("AA33 reverted (or OOG)");

      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(actualGasCost).to.equal(0);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(0);

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(0);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(0);
    });
    it("FreeGasPaymaster, one userOP, simple signature,success", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        FreeGasPaymaster,
      } = await loadFixture(deploy);

      //send one ETH in AA contract
      let oneEther = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        value: oneEther,
        to: sender,
      });

      //paymaster deposit
      let result = await EntryPoint.depositTo(FreeGasPaymaster.address, {
        value: oneEther.mul(200),
      });

      //execute deposit success
      await expect(result).to.emit(EntryPoint, "Deposited");

      //encode the OP
      let callData = SmartAccount.interface.encodeFunctionData(
        "execTransactionFromEntrypoint",
        [Alice.address, oneEther, "0x"]
      );

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: FreeGasPaymaster,
          sigTime: 0,
        },
        sender,
        1,
        // "0x"
        callData
      );

      // user sign the userOp
      userOp.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp,
        0,
        0
      );

      const beforeAABalance = await ethers.provider.getBalance(sender);
      const beforeAliceBalance = await ethers.provider.getBalance(
        Alice.address
      );
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const afterAABalance = await ethers.provider.getBalance(sender);
      const afterAliceBalance = await ethers.provider.getBalance(Alice.address);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.not.emit(EntryPoint, "HandleUserOpRevertReason");

      //user cost right
      expect(beforeAABalance.sub(afterAABalance)).to.equal(oneEther);

      //userOP success
      expect(afterAliceBalance.sub(beforeAliceBalance)).to.equal(oneEther);

      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(
        actualGasCost
      );
    });
    it("tokenPaymaster, one userOP, with UserOperationEvent fail,success", async function () {
      const {
        owner,
        signer,
        sender,
        bundler,
        Alice,
        EntryPoint,
        SmartAccount,
        TokenPaymaster,
        TestToken,
        PriceOracle,
      } = await loadFixture(deploy);

      // paymaster deposit
      oneEther = ethers.utils.parseEther("1.0");
      await EntryPoint.depositTo(TokenPaymaster.address, {
        value: oneEther.mul(200),
      });

      //send Token to AA
      await TestToken.mint(sender, oneEther);

      // encode callData for TestToken transfer(owner, oneEther)
      let transferCallData = TestToken.interface.encodeFunctionData(
        "transfer",
        [owner.address, oneEther]
      );

      // encode callData for executeParams
      let executeParamsNested = [
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

      // generate userOperation
      let userOp1 = await Utils.generateUOP(sender, 2, "0x", callData, "0x");

      // encode paymasterdata
      exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
      exchangeRate = exchangeRate.div(2);

      userOp1.paymasterAndData = await Utils.paymasterSign(
        {
          signer: signer,
          TokenPaymaster: TokenPaymaster,
          TestToken: TestToken,
          exchangeRate: exchangeRate,
          sigTime: 0,
        },
        userOp1
      );

      // user sign the userOp
      userOp1.signature = await Utils.generateSignature(
        Alice,
        SmartAccount,
        EntryPoint.address,
        userOp1,
        0,
        1
      );

      //run the first to avoid the first transfer cost deviation
      let tx = await EntryPoint.connect(bundler).mockhandleOps([userOp]);
      let receipt = await tx.wait();

      const beforeAABalance = await TestToken.balanceOf(sender);
      const beforeEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      let tx1 = await EntryPoint.connect(bundler).mockhandleOps([userOp1]);
      let receipt1 = await tx1.wait();

      const afterAABalance = await TestToken.balanceOf(sender);
      const afterEntryPointBalance = await ethers.provider.getBalance(
        EntryPoint.address
      );

      //check
      //execute handlePostOp success
      await expect(tx).to.emit(EntryPoint, "UserOperationEvent");
      let OPresult = await getMode(receipt);
      expect(OPresult[0]).to.equal("false");

      //no userOP error
      await expect(tx).to.not.emit(EntryPoint, "UserOperationRevertReason");
      await expect(tx).to.not.emit(EntryPoint, "HandleUserOpRevertReason");

      //user cost right
      //refund success
      const actualGasCost = await getActualGasCost(EntryPoint, receipt1);

      deviation = ethers.BigNumber.from("4000000000000");
      AACost = beforeAABalance
        .sub(afterAABalance)
        .mul(ethers.utils.parseEther("1.0"))
        .div(ethers.BigNumber.from("2000000000"));

      expect(AACost.sub(actualGasCost)).to.be.greaterThan(0);
      expect(AACost.sub(actualGasCost)).to.be.lessThan(deviation);
      expect(beforeEntryPointBalance.sub(afterEntryPointBalance)).to.equal(
        actualGasCost
      );
    });
  });

  async function getActualGasCost(EntryPoint, receipt) {
    let totActualGasCost = ethers.BigNumber.from("0");

    const USER_OPERATION_EVENT = ethers.utils.id(
      "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"
    );

    const userOperationEvents = receipt.logs.filter(
      (log) => log.topics[0] === USER_OPERATION_EVENT
    );

    userOperationEvents.forEach((eventLog) => {
      finalEvent = EntryPoint.interface.parseLog(eventLog);
      totActualGasCost = totActualGasCost.add(finalEvent.args["actualGasCost"]);
    });

    return totActualGasCost;
  }

  async function getReveetReason(EntryPoint, receipt) {
    let blockNumber = receipt.blockNumber;
    let revertEvents = await EntryPoint.queryFilter(
      "HandleUserOpRevertReason",
      blockNumber
    );
    let revertEvent = revertEvents[0].args;

    return decodeReason(revertEvent.revertReason);
  }

  async function decodeReason(reason) {
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

  async function getMode(receipt) {
    const temp = [];
    receipt.logs.forEach((log) => {
      if (
        log.topics[0] ===
        ethers.utils.id(
          "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"
        )
      ) {
        const parsedLog = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "bool", "uint256", "uint256"],
          log.data
        );
        if (parsedLog[1].toString() != undefined) {
          temp.push(parsedLog[1].toString());
        }
      }
    });
    return temp;
  }
});
