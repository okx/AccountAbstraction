const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WalletFactoryV2", function () {

  let accountFactoryProxy;
  let accountFactoryV2;

  // let accountProxyV2;
  let accountTemplate;

  let owner;
  let creator;
  let uslessAddress;

  beforeEach(async () => {
    const signers = await ethers.getSigners();

    owner = signers[0];
    creator = signers[1];
    uslessAddress = signers[2];

    const AF = await ethers.getContractFactory("AccountFactoryV2");
    accountFactoryV2 = await AF.deploy();
    await accountFactoryV2.deployed();

    // const AP = await ethers.getContractFactory("SmartAccountProxyV2");
    // accountProxyV2 = await AP.deploy();
    // await accountProxyV2.deployed();

    const A = await ethers.getContractFactory("SmartAccountV2");
    accountTemplate = await A.deploy(
      owner.address, // entry point
      owner.address, // simulation
      owner.address, // fallback
      owner.address, // validation
      "SmartAccount",// name
      "1.0.0"        // version
    );
    await accountTemplate.deployed();


    const AFP = await ethers.getContractFactory("AccountFactoryProxy");
    accountFactoryProxy = await AFP.deploy(accountFactoryV2.address, owner.address, accountTemplate.address);
    await accountFactoryProxy.deployed();
  })

  it("deploy empty extra bytes", async () => {
    let factory = await ethers.getContractAt("AccountFactoryV2", accountFactoryProxy.address);
    let coder = new ethers.utils.AbiCoder();
    let initializer = coder.encode(["address", "bytes"], [creator.address, "0x"]);
    let proxyAddress = await factory.getAddress(accountTemplate.address, initializer, 0);

    await expect(factory.createAccount(accountTemplate.address, initializer, 0))
      .to.emit(factory, "ProxyCreation")
      .withArgs(proxyAddress, accountTemplate.address);
  })

  it("deploy account with signature bytes", async () => {
    let factory = await ethers.getContractAt("AccountFactoryV2", accountFactoryProxy.address);
    let coder = new ethers.utils.AbiCoder();

    let r = '0xd693b532a80fed6392b428604171fb32fdbf953728a3a7ecc7d4062b1652c042'
    let s = '0x24e9c602ac800b983b035700a14b23f78a253ab762deab5dc27e3555a750b354'
    let v = 27;
    let params = coder.encode(["bytes32","bytes32","uint8"],[r,s,v])

    let initializer = coder.encode(["address", "bytes"], [creator.address, params]);
    let proxyAddress = await factory.getAddress(accountTemplate.address, initializer, 0);

    // let tx = await factory.createAccount(accountTemplate.address, initializer, 0);
    await expect(factory.createAccount(accountTemplate.address, initializer, 0))
      .to.emit(factory, "ProxyCreation")
      .withArgs(proxyAddress, accountTemplate.address);
  })
});
