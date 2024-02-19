let { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
let { expect } = require("chai");
let { generateAccount, generateUOP } = require("../Utils.js");

describe("SmartAccountProxyFactory", function () {
  async function deploy() {
    let [owner, bundler, Alice] = await ethers.getSigners();

    // setEntryPoint to owner to simplify testing
    let EntryPoint = owner.address;
    let SimulationContract = owner.address;

    let DefaultCallbackHandlerFactory = await ethers.getContractFactory(
      "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler"
    );
    let DefaultCallbackHandler = await DefaultCallbackHandlerFactory.deploy();

    let Validations = await ethers.getContractFactory("Validations");
    let validations = await Validations.deploy(owner.address);

    await validations.setBundlerOfficialWhitelist(owner.address, true);

    let SmartAccountFactory = await ethers.getContractFactory(
      "contracts/wallet/v1/SmartAccount.sol:SmartAccount"
    );
    let SmartAccount = await SmartAccountFactory.deploy(
      EntryPoint,
      SimulationContract,
      DefaultCallbackHandler.address,
      validations.address,
      "SA",
      "1.0"
    );

    let SmartAccountProxysFactory = await ethers.getContractFactory(
      "contracts/wallet/v1/SmartAccountProxyFactory.sol:SmartAccountProxyFactory"
    );
    let SmartAccountProxyFactory = await SmartAccountProxysFactory.deploy(
      SmartAccount.address,
      owner.address
    );

    return {
      owner,
      Alice,
      bundler,
      EntryPoint,
      SmartAccount,
      DefaultCallbackHandler,
      SmartAccountProxyFactory,
      validations
    };
  }

  it("should read default value correctly", async function () {
    const { owner, SmartAccountProxyFactory, SmartAccount } = await loadFixture(
      deploy
    );

    await expect(await SmartAccountProxyFactory.owner()).to.equal(
      owner.address
    );
    await expect(
      await SmartAccountProxyFactory.safeSingleton(SmartAccount.address)
    ).to.equal(true);
  });

  it("should set safeSingleton value correctly", async function () {
    const { owner, SmartAccountProxyFactory } = await loadFixture(deploy);

    const safeSingletonAddress = "0x1234567890123456789012345678901234567890";
    const value = true;

    let tx = await SmartAccountProxyFactory.setSafeSingleton(
      safeSingletonAddress,
      value
    );
    await tx.wait();

    await expect(tx)
      .to.emit(SmartAccountProxyFactory, "SafeSingletonSet")
      .withArgs(safeSingletonAddress, value);

    await expect(
      await SmartAccountProxyFactory.safeSingleton(safeSingletonAddress)
    ).to.equal(value);
  });

  it("Should depoly Account with Args expected", async function () {
    const { Alice, bundler, SmartAccount, SmartAccountProxyFactory } =
      await loadFixture(deploy);
    const random = 0;
    const initializeData = SmartAccount.interface.encodeFunctionData(
      "Initialize",
      [Alice.address]
    );

    let accountExpect = await SmartAccountProxyFactory.getAddress(
      SmartAccount.address,
      initializeData,
      random
    );

    tx = await SmartAccountProxyFactory.createAccount(
      SmartAccount.address,
      initializeData,
      random
    );
    await tx.wait();

    let events = await SmartAccountProxyFactory.queryFilter("ProxyCreation");
    await expect(events.length).to.equal(1);
    let accountDeployed = events[0].args.proxy;

    await expect(accountDeployed).to.be.equal(accountExpect);
  });

  it("Should depoly Account with Args expected", async function () {
    const {
      Alice,
      bundler,
      EntryPoint,
      SmartAccount,
      DefaultCallbackHandler,
      SmartAccountProxyFactory,
    } = await loadFixture(deploy);

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

    // await validations.validateWalletWhitelist(AA.address);
    await expect(await AA.entryPoint()).to.be.equal(EntryPoint);
    await expect(await AA.getOwner()).to.be.equal(Alice.address);
    await expect(await AA.getFallbackHandler()).to.be.equal(
      DefaultCallbackHandler.address
    );
  });

  it("should not revert if deployed", async function () {
    const { Alice, SmartAccount, SmartAccountProxyFactory } = await loadFixture(
      deploy
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
    await tx.wait();
    await expect(tx).to.emit(SmartAccountProxyFactory, "ProxyCreation");

    tx = await SmartAccountProxyFactory.createAccount(
      SmartAccount.address,
      initializeData,
      0
    );
    await tx.wait();
    await expect(tx).to.not.emit(SmartAccountProxyFactory, "ProxyCreation");
  });
});
