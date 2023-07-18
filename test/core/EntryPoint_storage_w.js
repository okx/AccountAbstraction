const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("EntryPoint", function () {
  async function deploy() {
    let [owner] = await ethers.getSigners();

    let EntryPointFactory = await ethers.getContractFactory(
      "contracts/core/EntryPoint.sol:EntryPoint"
    );
    let EntryPoint = await EntryPointFactory.deploy(owner.address);
    return {
      owner,
      EntryPoint,
    };
  }

  describe("storage", function () {
    it("set walletWhitelistControl should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.unrestrictedWallet()).to.equal(false);

      let result = await EntryPoint.setUnrestrictedWallet(true);
      await expect(result).to.emit(EntryPoint, "UnrestrictedWalletSet");

      expect(await EntryPoint.unrestrictedWallet()).to.equal(true);
    });

    it("set UnrestrictedBundler should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.unrestrictedBundler()).to.equal(false);

      let result = await EntryPoint.setUnrestrictedBundler(true);
      await expect(result).to.emit(EntryPoint, "UnrestrictedBundlerSet");

      expect(await EntryPoint.unrestrictedBundler()).to.equal(true);
    });

    it("set ModuleWhitelistControl should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.unrestrictedModule()).to.equal(false);

      let result = await EntryPoint.setUnrestrictedModule(true);
      await expect(result).to.emit(EntryPoint, "UnrestrictedModuleSet");

      expect(await EntryPoint.unrestrictedModule()).to.equal(true);
    });

    it("set BundlerOfficialWhitelist should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.officialBundlerWhiteList(owner.address)).to.equal(
        false
      );

      let result = await EntryPoint.setBundlerOfficialWhitelist(
        owner.address,
        true
      );
      await expect(result).to.emit(EntryPoint, "BundlerWhitelistSet");

      expect(await EntryPoint.officialBundlerWhiteList(owner.address)).to.equal(
        true
      );
    });

    it("set WalletProxyFactoryWhitelist should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.walletProxyFactory()).to.equal(
        ethers.constants.AddressZero
      );

      let result = await EntryPoint.setWalletProxyFactoryWhitelist(
        owner.address
      );
      await expect(result).to.emit(EntryPoint, "WalletFactoryWhitelistSet");

      expect(await EntryPoint.walletProxyFactory()).to.equal(owner.address);
    });

    it("set ModuleWhitelist should success", async function () {
      const { owner, EntryPoint } = await loadFixture(deploy);

      expect(await EntryPoint.moduleWhiteList(owner.address)).to.equal(false);

      let result = await EntryPoint.setModuleWhitelist(owner.address, true);
      await expect(result).to.emit(EntryPoint, "ModuleWhitelistSet");

      expect(await EntryPoint.moduleWhiteList(owner.address)).to.equal(true);
    });
  });
});
