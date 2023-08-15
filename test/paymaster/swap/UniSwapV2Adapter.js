const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../../Utils.js");

describe("UniSwapV2Adapter", function () {
  async function deploy() {
    let [owner, signer] = await ethers.getSigners();

    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

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

    let address = "0x32Be343B94f860124dC4fEe278FDCBD38C102D88";

    try {
      WNativeToken = ethers.utils.getAddress(address);
    } catch (error) {
      console.log("Invalid Ethereum address");
    }

    await PriceOracle.connect(owner).setPriceFeed(
      TestToken.address,
      MockChainlinkOracle.address
    );
    await PriceOracle.connect(owner).setDecimals(TestToken.address, 18);

    await PriceOracle.connect(owner).setPriceFeed(
      WNativeToken,
      MockChainlinkOracleETH.address
    );
    await PriceOracle.connect(owner).setDecimals(WNativeToken, 18);
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

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address)


    let MockUniSwapV2RouterFactory = await ethers.getContractFactory(
      "MockUniSwapV2Router"
    );
    let MockUniSwapV2Router = await MockUniSwapV2RouterFactory.deploy(
      WNativeToken
    );

    let SwapHelperFactory = await ethers.getContractFactory("UniSwapV2Adapter");
    let SwapHelper = await SwapHelperFactory.deploy(
      MockUniSwapV2Router.address, owner.address
    );

    await TokenPaymaster.connect(owner).setSwapAdapter(SwapHelper.address);

    await TestToken.connect(owner).mint(owner.address, 1000000);
    await TestToken.connect(owner).transfer(TokenPaymaster.address, 1000000);

    return {
      EntryPoint,
      signer,
      owner,
      TestToken,
      TokenPaymaster,
      PriceOracle,
      WNativeToken,
      MockUniSwapV2Router,
      SwapHelper,
    };
  }

  describe("setPath", function () {
    it("should setPath correctly", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);
      const path = [TestToken.address, WNativeToken];

      await SwapHelper.setPath(TestToken.address, path);

      for (let i = 0; i < path.length; i++) {
        expect(path[i]).to.equal(await SwapHelper.paths(TestToken.address, i));
      }
    });

    it("should emit event", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);
      const path = [TestToken.address, WNativeToken];

      const setPathTx = await SwapHelper.setPath(TestToken.address, path);
      const receipt = await setPathTx.wait();
      const event = receipt.events[0];

      expect(event.event).to.equal("PathSet");
      expect(event.args.token).to.equal(TestToken.address);
      expect(event.args.path).to.eql(path); // note: "eql" does a deep equality comparison

      for (let i = 0; i < path.length; i++) {
        expect(path[i]).to.equal(await SwapHelper.paths(TestToken.address, i));
      }
    });

    it("should revert if the caller is not owner", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);
      const path = [TestToken.address, WNativeToken];

      await expect(
        SwapHelper.connect(signer).setPath(TestToken.address, path)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("swapToNative", function () {
    it("should revert With SwapHelper: path not found ", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);

      await owner.sendTransaction({
        to: MockUniSwapV2Router.address,
        value: ethers.utils.parseEther("10"),
      });

      await expect(
        TokenPaymaster.connect(owner).swapToNative(
          EntryPoint.address,
          TestToken.address,
          1000000,
          0
        )
      ).to.be.revertedWith("SwapHelper: path not found");
    });

    it("should revert With SwapHelper: amountOut < minAmountOut ", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);

      await owner.sendTransaction({
        to: MockUniSwapV2Router.address,
        value: ethers.utils.parseEther("10"),
      });

      await SwapHelper.setPath(TestToken.address, [
        TestToken.address,
        WNativeToken,
      ]);

      await TestToken.connect(owner).mint(
        owner.address,
        ethers.utils.parseEther("100000")
      );
      await TestToken.connect(owner).transfer(
        TokenPaymaster.address,
        ethers.utils.parseEther("100000")
      );

      await expect(
        TokenPaymaster.connect(owner).swapToNative(
          EntryPoint.address,
          TestToken.address,
          ethers.utils.parseEther("100000"),
          0
        )
      ).to.be.revertedWith("TokenPaymaster: insufficient amountOut");
    });

    it("should swap tokens to native success ", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockUniSwapV2Router,
        SwapHelper,
      } = await loadFixture(deploy);

      await SwapHelper.setPath(TestToken.address, [
        TestToken.address,
        WNativeToken,
      ]);

      await owner.sendTransaction({
        to: MockUniSwapV2Router.address,
        value: ethers.utils.parseEther("10"),
      });

      await TestToken.connect(owner).mint(owner.address, 1000000);
      await TestToken.connect(owner).transfer(TokenPaymaster.address, 1000000);

      await TokenPaymaster.connect(owner).setSwapAdapter(SwapHelper.address);

      await TokenPaymaster.connect(owner).swapToNative(
        EntryPoint.address,
        TestToken.address,
        1000000,
        0
      );

      let balance = await ethers.provider.getBalance(TokenPaymaster.address);
      await expect(balance).to.equal(0);

      let depositInfo = await EntryPoint.deposits(TokenPaymaster.address);
      await expect(depositInfo.deposit).to.equal(ethers.utils.parseEther("1"));
    });
  });
});
