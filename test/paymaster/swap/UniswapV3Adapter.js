const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../../Utils.js");

describe("UniswapV3Adapter", function () {
  async function deploy() {
    let [owner, signer] = await ethers.getSigners();

    let EntryPoin04Factory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoin06Factory = await ethers.getContractFactory(
        "contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint"
      );
    let EntryPointV04 = await EntryPoin04Factory.deploy(owner.address);
    let EntryPointV06 = await EntryPoin06Factory.deploy();        

      /// change version to switch entrypoint
    let version = 2;
    let EntryPoint;

    switch (version) {
    case 1 : 
    /// if test entryPointV04
    EntryPoint = EntryPointV04;
    break;
    case 2 : 
    /// if test entryPointV06 
    EntryPoint = EntryPointV06;
    break;
    default:
    EntryPoint = EntryPointV06; 
    }

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

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address)


    await PriceOracle.connect(owner).setPriceFeed(
      TestToken.address,
      MockChainlinkOracle.address
    );
    await PriceOracle.connect(owner).setDecimals(TestToken.address, 18);

    await PriceOracle.connect(owner).setPriceFeed(
      await PriceOracle.NATIVE_TOKEN(),
      MockChainlinkOracleETH.address
    );
    await PriceOracle.connect(owner).setDecimals(
      await PriceOracle.NATIVE_TOKEN(),
      18
    );
    let WETH9Factory = await ethers.getContractFactory("WETH9");
    let WETH9 = await WETH9Factory.deploy();

    await PriceOracle.connect(owner).setPriceFeed(
      WETH9.address,
      MockChainlinkOracleETH.address
    );
    await PriceOracle.connect(owner).setDecimals(WETH9.address, 18);

    let MockUniswapV3RouterFactory = await ethers.getContractFactory(
      "MockUniSwapV3Router"
    );
    let MockUniswapV3Router = await MockUniswapV3RouterFactory.deploy(
      WETH9.address
    );

    let SwapHelperFactory = await ethers.getContractFactory("UniSwapV3Adapter");
    let SwapHelper = await SwapHelperFactory.deploy(
      MockUniswapV3Router.address, owner.address
    );

    await MockUniswapV3Router.deposit({ value: ethers.utils.parseEther("10") });

    await TestToken.connect(owner).mint(owner.address, 1000000);
    await TestToken.connect(owner).transfer(TokenPaymaster.address, 1000000);

    await TokenPaymaster.connect(owner).setSwapAdapter(SwapHelper.address);

    return {
      EntryPoint,
      signer,
      owner,
      TestToken,
      TokenPaymaster,
      PriceOracle,
      SwapHelper,
    };
  }

  describe("setPoolFee", function () {
    it("should setPoolFee correctly", async function () {
      const {
        EntryPoint,
        signer,
        owner,
        TestToken,
        TokenPaymaster,
        PriceOracle,
        WNativeToken,
        MockOKCSwapRouter,
        SwapHelper,
      } = await loadFixture(deploy);
      const poolFee = 500;

      await SwapHelper.setPoolFee(TestToken.address, poolFee);

      expect(poolFee).to.equal(await SwapHelper.poolFee(TestToken.address));
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
        MockOKCSwapRouter,
        SwapHelper,
      } = await loadFixture(deploy);
      const poolFee = 500;
      const setPoolFeeTx = await SwapHelper.setPoolFee(
        TestToken.address,
        poolFee
      );
      const receipt = await setPoolFeeTx.wait();
      const event = receipt.events[0];

      expect(event.event).to.equal("PoolFeeSet");
      expect(event.args.token).to.equal(TestToken.address);
      expect(event.args.fee).to.eql(poolFee);
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
        MockOKCSwapRouter,
        SwapHelper,
      } = await loadFixture(deploy);
      const poolFee = 500;

      await expect(
        SwapHelper.connect(signer).setPoolFee(TestToken.address, poolFee)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("swapToNative", function () {
    it("should swap tokens to native success", async function () {
      const {
        EntryPoint,
        owner,
        signer,
        TestToken,
        PriceOracle,
        TokenPaymaster,
        MockChainlinkOracleETH,
        SwapHelper,
      } = await loadFixture(deploy);

      await expect(await TokenPaymaster.swapAdapter()).to.equal(
        SwapHelper.address
      );

      await TokenPaymaster.connect(owner).swapToNative(
        EntryPoint.address,
        TestToken.address,
        1000000,
        0
      );

      let depositInfo = await EntryPoint.deposits(TokenPaymaster.address);
      await expect(depositInfo.deposit).to.equal(ethers.utils.parseEther("1"));
    });
  });
});
