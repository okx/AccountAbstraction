const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../Utils.js");

describe("FreeGasPaymaster", function () {
  async function deploy() {
    let [EntryPoint, owner, signer, Alice] = await ethers.getSigners();

    let FreeGasPaymasterFactory = await ethers.getContractFactory(
      "FreeGasPaymaster"
    );

    let FreeGasPaymaster = await FreeGasPaymasterFactory.deploy(
      signer.address,
      owner.address
    );

    await FreeGasPaymaster.connect(owner).addSupportedEntryPoint(EntryPoint.address);

    return {
      owner,
      signer,
      Alice,
      FreeGasPaymaster,
      EntryPoint,
    };
  }

  it("should read default value correctly", async function () {
    const { owner, signer, FreeGasPaymaster, EntryPoint } = await loadFixture(
      deploy
    );

    let defaultSigner = await FreeGasPaymaster.verifyingSigner();
    await expect(defaultSigner).to.equal(signer.address);

    let defaultOwner = await FreeGasPaymaster.owner();
    await expect(defaultOwner).to.equal(owner.address);

    let isSupportedEntryPoint = await FreeGasPaymaster.isSupportedEntryPoint(EntryPoint.address);
    await expect(isSupportedEntryPoint).to.equal(true);
  });

  it("Should validatePaymasterUserOp", async function () {
    const { owner, signer, Alice, FreeGasPaymaster, EntryPoint } =
      await loadFixture(deploy);

    let userOp = await Utils.generateFreePaymasterUOP(
      {
        signer: signer,
        FreeGasPaymaster: FreeGasPaymaster,
        sigTime: 1234567,
      },
      ethers.constants.AddressZero,
      0,
      "0x"
    );

    let result = await FreeGasPaymaster.validatePaymasterUserOp(
      userOp,
      ethers.constants.HashZero,
      0
    );

    await expect(result[0]).to.equal("0x");
    await expect(result[1].toNumber()).to.equal(1234567);
  });
});
