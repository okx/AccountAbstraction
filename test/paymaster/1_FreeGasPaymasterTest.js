const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
let Utils = require("../Utils.js");

describe("FreeGasPaymaster", function () {
  async function deploy() {
    let [owner, signer, Alice] = await ethers.getSigners();
    let FreeGasPaymasterFactory = await ethers.getContractFactory(
      "FreeGasPaymaster"
    );
    let MockEntryPointL1 = await ethers.getContractFactory("MockEntryPointL1");

    let EntryPointV06 = await ethers.getContractFactory(
      "contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint"
    );

    let entryPointSimulate = await MockEntryPointL1.deploy(owner.address);
    let entryPointV04 = await MockEntryPointL1.deploy(owner.address);
    let entryPointV06 = await EntryPointV06.deploy();

    let freeGasPaymaster = await FreeGasPaymasterFactory.deploy(
      signer.address,
      owner.address
    );
    // enum entryPointVersion {
    //     simulate,
    //     v04,
    //     v06
    // }
    // let version = entryPointVersion.v06;
    // let entryPoint;

    // switch version {
    // case entryPointVersion.simulate :
    //   /// if test entryPointSimulate;
    //   entryPoint = entryPointSimulate;
    // case entryPointVersion.v04 : 
    //   /// if test entryPointV04
    //   entryPoint = entryPointV04;
    // case entryPointVersion.v06 : 
    //   /// if test entryPointV06 
    //   entryPoint = entryPointV06;
    // default:
    //   entryPoint = entryPointV06; 
    // }

    
    /// change version to switch entrypoint
    let version = 2;
    let entryPoint;

    switch (version) {
    case 0 :
      /// if test entryPointSimulate;
      entryPoint = entryPointSimulate;
      break;
    case 1 : 
      /// if test entryPointV04
      entryPoint = entryPointV04;
      break;
    case 2 : 
      /// if test entryPointV06 
      entryPoint = entryPointV06;
      break;
    default:
      entryPoint = entryPointV06; 
    }

    await freeGasPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address);

    let TestToken = await ethers.getContractFactory("TestToken");
    let testToken = await TestToken.deploy();

    return {
      owner,
      signer,
      Alice,
      freeGasPaymaster,
      entryPoint,
      testToken,
      version
    };
  }

  describe("constructor", function () {
    it("should read default value correctly", async function () {
      const { owner, signer, freeGasPaymaster, entryPoint} = await loadFixture(
        deploy
      );

      let defaultSigner = await freeGasPaymaster.verifyingSigner();
      await expect(defaultSigner).to.equal(signer.address);

      let defaultOwner = await freeGasPaymaster.owner();
      await expect(defaultOwner).to.equal(owner.address);

      let isSupportedEntryPoint = await freeGasPaymaster.isSupportedEntryPoint(entryPoint.address);
      await expect(isSupportedEntryPoint).to.equal(true);
     
    });

    // it("should emit an event on", async function () {
    //     const { owner, signer, FreeGasPaymaster, entryPoint } = await loadFixture(
    //       deploy
    //     );

    //     let defaultSigner = await FreeGasPaymaster.verifyingSigner();
    //     await expect(defaultSigner).to.equal(signer.address);

    //     let defaultOwner = await FreeGasPaymaster.owner();
    //     await expect(defaultOwner).to.equal(owner.address);

    //     let defaultEntryPoint = await FreeGasPaymaster.supportedEntryPoint();
    //     await expect(defaultEntryPoint).to.equal(EntryPoint.address);
    //   });
  });

  describe("addToWhitelist", function () {
    it("should read default value correctly", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);

      let addresses = [owner.address, Alice.address];

      await freeGasPaymaster.addToWhitelist(addresses);
      expect(await freeGasPaymaster.whitelist(owner.address)).to.equal(true);
      expect(await freeGasPaymaster.whitelist(Alice.address)).to.equal(true);
    });

    it("should emit an event on AddedToWhitelist", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);

      let addresses = [owner.address, Alice.address];

      await freeGasPaymaster.addToWhitelist(addresses);
      expect(await freeGasPaymaster.whitelist(owner.address))
        .to.emit(freeGasPaymaster, "AddedToWhitelist")
        .withArgs(owner.address);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);
      let addresses = [owner.address, Alice.address];
      await expect(
        freeGasPaymaster.connect(Alice).addToWhitelist(addresses)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("removeFromWhitelist", function () {
    it("should read default value correctly", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);

      let addresses = [owner.address, Alice.address];

      await freeGasPaymaster.addToWhitelist(addresses);
      await freeGasPaymaster.removeFromWhitelist([owner.address]);
      expect(await freeGasPaymaster.whitelist(owner.address)).to.equal(false);
      expect(await freeGasPaymaster.whitelist(Alice.address)).to.equal(true);
    });

    it("should emit an event on RemovedFromWhitelist", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);

      let addresses = [owner.address, Alice.address];

      await freeGasPaymaster.addToWhitelist(addresses);
      await freeGasPaymaster.removeFromWhitelist([owner.address]);
      expect(await freeGasPaymaster.whitelist(owner.address))
        .to.emit(freeGasPaymaster, "RemovedFromWhitelist")
        .withArgs(owner.address);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, freeGasPaymaster, Alice } = await loadFixture(deploy);
      let addresses = [owner.address, Alice.address];
      await expect(
        freeGasPaymaster.connect(Alice).removeFromWhitelist(addresses)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("addSupportedEntryPoint", function () {
    it("should revert if the caller is not owner", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(deploy);

      await expect(
        freeGasPaymaster.connect(Alice).addSupportedEntryPoint(entryPoint.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the entryPoint has set", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(deploy);

      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
      await expect(
        freeGasPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address)
      ).to.be.revertedWith("duplicate entrypoint");
    });

    it("should emit an event on RemoveSupportedEntryPoint", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(deploy);

      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
      expect(await freeGasPaymaster.connect(owner).removeSupportedEntryPoint(entryPoint.address))
          .to.emit(freeGasPaymaster, "RemoveSupportedEntryPoint").withArgs(entryPoint.address);;
      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(false);
    });

    it("should emit an event on AddSupportedEntryPoint", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(deploy);

      await freeGasPaymaster.connect(owner).removeSupportedEntryPoint(entryPoint.address);
      expect(await freeGasPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address))
          .to.emit(freeGasPaymaster, "AddSupportedEntryPoint").withArgs(entryPoint.address);;
      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
    });

    it("should check correctly ", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(deploy);

      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(Alice.address)).to.equal(false);
      await freeGasPaymaster.connect(owner).addSupportedEntryPoint(Alice.address);
      expect(await freeGasPaymaster.connect(owner).isSupportedEntryPoint(Alice.address)).to.equal(true);
    });
  });

  describe("withdrawERC20", function () {
    it("should withdrawERC20 correctly", async function () {
      const { owner, freeGasPaymaster, Alice, testToken } = await loadFixture(
        deploy
      );

      let addresses = [owner.address, Alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await testToken.mint(freeGasPaymaster.address, withdrawAmount);
      await freeGasPaymaster.addToWhitelist(addresses);
      await freeGasPaymaster.withdrawERC20(
        testToken.address,
        withdrawAmount,
        owner.address
      );

      expect(await testToken.balanceOf(owner.address)).to.equal(withdrawAmount);
      expect(await testToken.balanceOf(freeGasPaymaster.address)).to.equal("0");
    });

    it("should emit an event on Withdrawal", async function () {
      const { owner, freeGasPaymaster, Alice, testToken } = await loadFixture(
        deploy
      );

      let addresses = [owner.address, Alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await testToken.mint(freeGasPaymaster.address, withdrawAmount);
      await freeGasPaymaster.addToWhitelist(addresses);
      expect(
        await freeGasPaymaster.withdrawERC20(
          testToken.address,
          withdrawAmount,
          owner.address
        )
      )
        .to.emit(freeGasPaymaster, "Withdrawal")
        .withArgs(testToken.address, withdrawAmount);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, freeGasPaymaster, Alice, testToken } = await loadFixture(
        deploy
      );
      let withdrawAmount = ethers.utils.parseEther("1");
      await expect(
        freeGasPaymaster
          .connect(Alice)
          .withdrawERC20(testToken.address, withdrawAmount, owner.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the destination address is not in the whitlist", async function () {
      const { owner, freeGasPaymaster, testToken } = await loadFixture(deploy);
      let withdrawAmount = ethers.utils.parseEther("1");
      await expect(
        freeGasPaymaster.withdrawERC20(
          testToken.address,
          withdrawAmount,
          owner.address
        )
      ).to.be.revertedWith("Address is not whitelisted");
    });
  });

  describe("withdrawDepositNativeToken", function () {
    it("should withdrawDepositNativeToken correctly", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(
        deploy
      );

      let addresses = [owner.address, Alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPoint.depositTo(freeGasPaymaster.address, {
        value: withdrawAmount,
      });

      await freeGasPaymaster.addToWhitelist(addresses);

      expect(
        await freeGasPaymaster.withdrawDepositNativeToken(
          entryPoint.address,
          Alice.address,
          withdrawAmount
        )
      ).to.changeEtherBalances(
        [entryPoint, Alice],
        [-ethers.utils.parseEther("1"), ethers.utils.parseEther("1")]
      );
    });

    it("should emit an event on Withdrawal", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(
        deploy
      );

      let addresses = [owner.address, Alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");
      await entryPoint.depositTo(freeGasPaymaster.address, {
        value: withdrawAmount,
      });

      await freeGasPaymaster.addToWhitelist(addresses);
      await expect(
        freeGasPaymaster.withdrawDepositNativeToken(
          entryPoint.address,
          Alice.address,
          withdrawAmount
        )
      )
        .to.emit(freeGasPaymaster, "Withdrawal")
        .withArgs(ethers.constants.AddressZero, withdrawAmount);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(
        deploy
      );
      let addresses = [owner.address, Alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPoint.depositTo(freeGasPaymaster.address, {
        value: withdrawAmount,
      });

      await freeGasPaymaster.addToWhitelist(addresses);
      await expect(
        freeGasPaymaster
          .connect(Alice)
          .withdrawDepositNativeToken(entryPoint.address, Alice.address, withdrawAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the destination address is not in the whitlist", async function () {
      const { owner, freeGasPaymaster, Alice, entryPoint } = await loadFixture(
        deploy
      );
      let addresses = [owner.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPoint.depositTo(freeGasPaymaster.address, {
        value: withdrawAmount,
      });

      await freeGasPaymaster.addToWhitelist(addresses);
      await expect(
        freeGasPaymaster.withdrawDepositNativeToken(
          entryPoint.address,
          Alice.address,
          withdrawAmount
        )
      ).to.be.revertedWith("Address is not whitelisted");
    });
  });

  describe("validatePaymasterUserOp", function () {
    it("Should validatePaymasterUserOp", async function () {
      const { owner, signer, freeGasPaymaster } = await loadFixture(deploy);

      let userOp = await Utils.generateFreePaymasterUOP(
        {
          signer: signer,
          FreeGasPaymaster: freeGasPaymaster,
          sigTime: 1234567,
        },
        ethers.constants.AddressZero,
        0,
        "0x"
      );

      let result = await freeGasPaymaster.validatePaymasterUserOp(
        userOp,
        ethers.constants.HashZero,
        0
      );

      await expect(result[0]).to.equal("0x");
      await expect(result[1].toNumber()).to.equal(1234567);
    });
  });

});
