const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const Utils = require("../Utils.js");

describe("EntryPoint", function () {
  async function deploy() {
    let [owner, bundler, bundlerTwo, bundlerThree] = await ethers.getSigners();
    let maxPrice = ethers.utils.parseEther("1");
    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

    let BundlerDepositHelperFactory = await ethers.getContractFactory(
      "BundlerDepositHelper"
    );
    let BundlerDepositHelper = await BundlerDepositHelperFactory.deploy(
      owner.address
    );

    await BundlerDepositHelper.connect(owner).setValidEntryPoint(
      EntryPoint.address,
      true
    );

    await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
      bundler.address,
      true
    );

    await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
      bundlerTwo.address,
      true
    );

    await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
      bundlerThree.address,
      true
    );

    return {
      owner,
      bundler,
      bundlerTwo,
      bundlerThree,
      EntryPoint,
      BundlerDepositHelper,
    };
  }

  describe("batchDepositForBundler", function () {
    describe("should revert", function () {
      it("should revert with wrong bundler", async function () {
        const { bundler, bundlerThree, EntryPoint, BundlerDepositHelper } =
          await loadFixture(deploy);

        let tx = BundlerDepositHelper.batchDepositForBundler(
          EntryPoint.address,
          [bundler.address, EntryPoint.address, bundlerThree.address],
          [
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
          ],
          { value: ethers.utils.parseEther("3") }
        );

        await expect(tx).to.be.revertedWith(
          "BundlerDepositHelper: Invalid bundler"
        );
      });

      it("should revert with worng entryPoint", async function () {
        const { bundler, bundlerTwo, bundlerThree, BundlerDepositHelper } =
          await loadFixture(deploy);

        let tx = BundlerDepositHelper.batchDepositForBundler(
          bundler.address,
          [bundler.address, bundlerTwo.address, bundlerThree.address],
          [
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
          ],
          { value: ethers.utils.parseEther("3") }
        );

        await expect(tx).to.be.revertedWith(
          "BundlerDepositHelper: Invalid EntryPoint"
        );
      });

      it("should revert with invalid length", async function () {
        const {
          bundler,
          bundlerTwo,
          bundlerThree,
          EntryPoint,
          BundlerDepositHelper,
        } = await loadFixture(deploy);

        let tx = BundlerDepositHelper.batchDepositForBundler(
          EntryPoint.address,
          [bundler.address, bundlerTwo.address, bundlerThree.address],
          [ethers.utils.parseEther("1"), ethers.utils.parseEther("1")],
          { value: ethers.utils.parseEther("3") }
        );

        await expect(tx).to.be.revertedWith(
          "BundlerDepositHelper: Invalid input"
        );
      });

      it("should revert with invalid value", async function () {
        const {
          bundler,
          bundlerTwo,
          bundlerThree,
          EntryPoint,
          BundlerDepositHelper,
        } = await loadFixture(deploy);

        let tx = BundlerDepositHelper.batchDepositForBundler(
          EntryPoint.address,
          [bundler.address, bundlerTwo.address, bundlerThree.address],
          [
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
          ],
          { value: ethers.utils.parseEther("4") }
        );

        await expect(tx).to.be.revertedWith(
          "BundlerDepositHelper: Invalid value"
        );
      });
    });

    it("should set owner", async function () {
      const { owner, BundlerDepositHelper } = await loadFixture(deploy);
      await expect(await BundlerDepositHelper.owner()).to.equal(owner.address);
    });

    it("should success", async function () {
      const {
        bundler,
        bundlerTwo,
        bundlerThree,
        EntryPoint,
        BundlerDepositHelper,
      } = await loadFixture(deploy);

      await BundlerDepositHelper.batchDepositForBundler(
        EntryPoint.address,
        [bundler.address, bundlerTwo.address, bundlerThree.address],
        [
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
        ],
        { value: ethers.utils.parseEther("3") }
      );

      await expect(await EntryPoint.balanceOf(bundler.address)).to.equal(
        ethers.utils.parseEther("1")
      );
      await expect(await EntryPoint.balanceOf(bundlerTwo.address)).to.equal(
        ethers.utils.parseEther("1")
      );
      await expect(await EntryPoint.balanceOf(bundlerThree.address)).to.equal(
        ethers.utils.parseEther("1")
      );
    });

    it("should emit deposit events", async function () {
      const {
        owner,
        bundler,
        bundlerTwo,
        bundlerThree,
        EntryPoint,
        BundlerDepositHelper,
      } = await loadFixture(deploy);

      let tx = await BundlerDepositHelper.batchDepositForBundler(
        EntryPoint.address,
        [bundler.address, bundlerTwo.address, bundlerThree.address],
        [
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
        ],
        { value: ethers.utils.parseEther("3") }
      );

      await expect(tx)
        .to.emit(EntryPoint, "Deposited")
        .withArgs(
          BundlerDepositHelper.address,
          EntryPoint.address,
          bundler.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1")
        );

      await expect(tx)
        .to.emit(EntryPoint, "Deposited")
        .withArgs(
          BundlerDepositHelper.address,
          EntryPoint.address,
          bundlerTwo.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1")
        );

      await expect(tx)
        .to.emit(EntryPoint, "Deposited")
        .withArgs(
          BundlerDepositHelper.address,
          EntryPoint.address,
          bundlerThree.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1")
        );
    });
  });
});
