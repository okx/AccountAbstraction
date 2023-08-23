const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../Utils.js");

const UniswapV2Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const UniswapV2Router = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

describe("TokenPaymaster", function () {
  async function deploy() {
    let [owner, signer, alice] = await ethers.getSigners();

    let MockEntryPointL1 = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPointV06 = await ethers.getContractFactory(
      "contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint"
    );
    let entryPointSimulate = await MockEntryPointL1.deploy(owner.address);
    let entryPointV04 = await MockEntryPointL1.deploy(owner.address);
    let entryPointV06 = await EntryPointV06.deploy();

    /// change version to switch entrypoint
    let version = 2;
    let entryPoint;

    switch (version) {
      case 0:
        /// if test entryPointSimulate;
        entryPoint = entryPointSimulate;
        break;
      case 1:
        /// if test entryPointV04
        entryPoint = entryPointV04;
        break;
      case 2:
        /// if test entryPointV06 
        entryPoint = entryPointV06;
        break;
      default:
        entryPoint = entryPointV06;
    }


    let MockWETH9 = await ethers.getContractFactory("WETH9");

    let weth = await MockWETH9.deploy();

    let MockUniswapV2Factory = await ethers.getContractFactory(
      UniswapV2Factory.abi,
      UniswapV2Factory.bytecode
    );
    let factory = await MockUniswapV2Factory.deploy(owner.address);

    let MockUniswapV2Router = await ethers.getContractFactory(
      UniswapV2Router.abi,
      UniswapV2Router.bytecode
    );

    let router = await MockUniswapV2Router.deploy(
      factory.address,
      weth.address
    );

    let MockChainlinkOracleFactory = await ethers.getContractFactory(
      "MockChainlinkOracle"
    );
    let mockChainlinkOracle = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    let mockChainlinkOracleETH = await MockChainlinkOracleFactory.deploy(
      owner.address
    );

    await mockChainlinkOracle.connect(owner).setPrice(100000000);
    await mockChainlinkOracle.connect(owner).setDecimals(8);

    await mockChainlinkOracleETH.connect(owner).setPrice(200000000000);
    await mockChainlinkOracleETH.connect(owner).setDecimals(8);

    let TestTokenFactory = await ethers.getContractFactory("MockUSDT");
    let testToken = await TestTokenFactory.deploy();
    await testToken.mint(owner.address, ethers.utils.parseEther("400000"));

    let PriceOracleFactory = await ethers.getContractFactory(
      "ChainlinkOracleAdapter"
    );
    let priceOracle = await PriceOracleFactory.deploy(owner.address);

    let TokenPaymasterFactory = await ethers.getContractFactory(
      "TokenPaymaster"
    );
    let tokenPaymaster = await TokenPaymasterFactory.deploy(
      signer.address,
      owner.address
    );

    await tokenPaymaster.connect(owner).setPriceOracle(priceOracle.address)
    await tokenPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address);

    await priceOracle
      .connect(owner)
      .setPriceFeed(testToken.address, mockChainlinkOracle.address);

    await priceOracle.connect(owner).setDecimals(testToken.address, 6);

    await priceOracle
      .connect(owner)
      .setPriceFeed(weth.address, mockChainlinkOracleETH.address);
    await priceOracle.connect(owner).setDecimals(weth.address, 18);

    let UserOpHelperFactory = await ethers.getContractFactory(
      "contracts/helper/UserOperationHelper.sol:UserOperationHelper"
    );

    let userOpHelper = await UserOpHelperFactory.deploy(
      tokenPaymaster.address,
      entryPoint.address,
      owner.address
    );

    //approve to router
    await testToken.approve(router.address, ethers.utils.parseEther("20000"));

    //addLiquidity
    await router.addLiquidityETH(
      testToken.address,
      "2000000000000",
      "0",
      "0",
      owner.address,
      "9999999999",
      { value: ethers.utils.parseEther("1000") }
    );

    return {
      entryPoint,
      signer,
      owner,
      alice,
      testToken,
      tokenPaymaster,
      priceOracle,
      userOpHelper,
      router,
      weth,
      version
    };
  }

  describe("swapToNative by fork the UniswapV2", function () {
    it("should swap tokens to native", async function () {
      const {
        owner,
        entryPoint,
        tokenPaymaster,
        priceOracle,
        router,
        testToken,
        weth
      } = await loadFixture(deploy);

      let SwapHelperFactory = await ethers.getContractFactory(
        "UniSwapV2Adapter"
      );
      let swapAdapter = await SwapHelperFactory.deploy(router.address, owner.address);
      await swapAdapter.setPath(testToken.address, [
        testToken.address,
        weth.address
      ]);
      await testToken.mint(
        tokenPaymaster.address,
        ethers.utils.parseEther("100")
      );

      await tokenPaymaster.connect(owner).setSwapAdapter(swapAdapter.address);

      await tokenPaymaster
        .connect(owner)
        .swapToNative(entryPoint.address, testToken.address, "200000000", 0);
      let balance = await ethers.provider.getBalance(tokenPaymaster.address);
      await expect(balance).to.equal(0);

      let depositInfo = await entryPoint.deposits(tokenPaymaster.address);
      await expect(depositInfo.deposit).to.equal("99690060900928177");
    });

    it("should emit the event on SwappedToNative", async function () {
      const {
        owner,
        entryPoint,
        tokenPaymaster,
        priceOracle,
        router,
        testToken,
        weth,
      } = await loadFixture(deploy);

      let SwapHelperFactory = await ethers.getContractFactory(
        "UniSwapV2Adapter"
      );
      let swapAdapter = await SwapHelperFactory.deploy(router.address, owner.address);
      await swapAdapter.setPath(testToken.address, [
        testToken.address,
        weth.address,
      ]);

      await testToken.mint(
        tokenPaymaster.address,
        ethers.utils.parseEther("100")
      );

      await tokenPaymaster.connect(owner).setSwapAdapter(swapAdapter.address);

      expect(
        await tokenPaymaster
          .connect(owner)
          .swapToNative(entryPoint.address, testToken.address, "200000000", 0)
      )
        .to.emit(tokenPaymaster, "SwappedToNative")
        .withArgs(testToken.address, "200000000", "99690060900928177");
    });
  });
});
