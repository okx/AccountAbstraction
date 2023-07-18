const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../Utils.js");

describe("TokenPaymaster", function () {
  async function deploy() {
    let [EntryPoint, owner, signer] = await ethers.getSigners();
    let maxPrice = ethers.BigNumber.from("20000000000");
    let minPrice = ethers.BigNumber.from("200000000");
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
      EntryPoint.address
    );

    await TokenPaymaster.connect(owner).setPriceOracle(PriceOracle.address)


    await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
      TestToken.address,
      maxPrice
    );
    await TokenPaymaster.connect(owner).setTokenPriceLimitMin(
      TestToken.address,
      minPrice
    );

    await PriceOracle.connect(owner).setPriceFeed(
      TestToken.address,
      MockChainlinkOracle.address
    );
    await PriceOracle.connect(owner).setDecimals(TestToken.address, 6);

    await PriceOracle.connect(owner).setPriceFeed(
      await PriceOracle.NATIVE_TOKEN(),
      MockChainlinkOracleETH.address
    );
    await PriceOracle.connect(owner).setDecimals(
      await PriceOracle.NATIVE_TOKEN(),
      18
    );

    let UserOpHelperFactory = await ethers.getContractFactory(
      "UserOperationHelper"
    );
    let UserOpHelper = await UserOpHelperFactory.deploy(
      TokenPaymaster.address,
      EntryPoint.address,
      owner.address
    );

    return {
      EntryPoint,
      signer,
      owner,
      TestToken,
      TokenPaymaster,
      PriceOracle,
      MockChainlinkOracle,
      maxPrice,
      minPrice,
      UserOpHelper,
    };
  }

  it("should read default value correctly", async function () {
    const {
      EntryPoint,
      owner,
      signer,
      TestToken,
      TokenPaymaster,
      PriceOracle,
      maxPrice,
      minPrice,
    } = await loadFixture(deploy);

    let defaultSigner = await TokenPaymaster.verifyingSigner();
    await expect(defaultSigner).to.equal(signer.address);

    let defaultOwner = await TokenPaymaster.owner();
    await expect(defaultOwner).to.equal(owner.address);

    let defaultPriceOracle = await TokenPaymaster.priceOracle();
    await expect(defaultPriceOracle).to.equal(PriceOracle.address);

    let maxTokenPrice = await TokenPaymaster.tokenPriceLimitMax(
      TestToken.address
    );
    await expect(maxTokenPrice).to.equal(maxPrice);

    let minTokenPrice = await TokenPaymaster.tokenPriceLimitMin(
      TestToken.address
    );
    await expect(minTokenPrice).to.equal(minPrice);

    let defaultEntryPoint = await TokenPaymaster.supportedEntryPoint();
    await expect(defaultEntryPoint).to.equal(EntryPoint.address);
  });

  it("should validatePaymasterUserOp", async function () {
    const {
      signer,
      TokenPaymaster,
      EntryPoint,
      TestToken,
      PriceOracle,
      minPrice,
      UserOpHelper,
    } = await loadFixture(deploy);

    let exchangeRate = minPrice.mul(2);

    let userOp = await Utils.generatePaymasterUOP(
      {
        signer: signer,
        TokenPaymaster: TokenPaymaster,
        TestToken: TestToken,
        exchangeRate: exchangeRate,
        sigTime: 1234567,
      },
      ethers.constants.AddressZero,
      0,
      "0x"
    );

    let userOpHash = await UserOpHelper.getUserOpHash(
      userOp,
      EntryPoint.address
    );

    let result = await TokenPaymaster.validatePaymasterUserOp(
      userOp,
      userOpHash,
      0
    );

    let postOpGas = (await TokenPaymaster.COST_OF_POST()).mul(
      userOp.maxFeePerGas
    );

    const expectContext = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256"],
      [userOpHash, userOp.sender, TestToken.address, exchangeRate, postOpGas]
    );

    await expect(result[0]).to.equal(expectContext);
    await expect(result[1]).to.equal(1234567);
  });

  it("should validatePaymasterUserOp using oraclePrice when above max price", async function () {
    const {
      signer,
      TokenPaymaster,
      EntryPoint,
      TestToken,
      PriceOracle,
      UserOpHelper,
      maxPrice,
    } = await loadFixture(deploy);

    let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);

    let userOp = await Utils.generatePaymasterUOP(
      {
        signer: signer,
        TokenPaymaster: TokenPaymaster,
        TestToken: TestToken,
        exchangeRate: maxPrice.mul(2),
        sigTime: 1234567,
      },
      ethers.constants.AddressZero,
      0,
      "0x"
    );

    let userOpHash = await UserOpHelper.getUserOpHash(
      userOp,
      EntryPoint.address
    );

    let result = await TokenPaymaster.validatePaymasterUserOp(
      userOp,
      userOpHash,
      0
    );

    let postOpGas = (await TokenPaymaster.COST_OF_POST()).mul(
      userOp.maxFeePerGas
    );

    const expectContext = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256"],
      [userOpHash, userOp.sender, TestToken.address, exchangeRate, postOpGas]
    );

    await expect(result[0]).to.equal(expectContext);
    await expect(result[1]).to.equal(1234567);
  });

  it("should validatePaymasterUserOp using oraclePrice when below min price", async function () {
    const {
      signer,
      TokenPaymaster,
      EntryPoint,
      TestToken,
      PriceOracle,
      UserOpHelper,
      minPrice,
    } = await loadFixture(deploy);

    let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);

    let userOp = await Utils.generatePaymasterUOP(
      {
        signer: signer,
        TokenPaymaster: TokenPaymaster,
        TestToken: TestToken,
        exchangeRate: minPrice.div(2),
        sigTime: 1234567,
      },
      ethers.constants.AddressZero,
      0,
      "0x"
    );

    let userOpHash = await UserOpHelper.getUserOpHash(
      userOp,
      EntryPoint.address
    );

    let result = await TokenPaymaster.validatePaymasterUserOp(
      userOp,
      userOpHash,
      0
    );

    let postOpGas = (await TokenPaymaster.COST_OF_POST()).mul(
      userOp.maxFeePerGas
    );

    const expectContext = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "address", "uint256", "uint256"],
      [userOpHash, userOp.sender, TestToken.address, exchangeRate, postOpGas]
    );

    await expect(result[0]).to.equal(expectContext);
    await expect(result[1]).to.equal(1234567);
  });

  it("should execute postOp", async function () {
    const {
      owner,
      signer,
      TokenPaymaster,
      EntryPoint,
      TestToken,
      PriceOracle,
      UserOpHelper,
    } = await loadFixture(deploy);

    let exchangeRate = await PriceOracle.exchangeRate(TestToken.address);
    exchangeRate = exchangeRate.div(2);

    let userOp = await Utils.generatePaymasterUOP(
      {
        signer: signer,
        TokenPaymaster: TokenPaymaster,
        TestToken: TestToken,
        exchangeRate: exchangeRate,
        sigTime: 1234567,
      },
      owner.address,
      0,
      "0x"
    );

    let userOpHash = await UserOpHelper.getUserOpHash(
      userOp,
      EntryPoint.address
    );

    let result = await TokenPaymaster.validatePaymasterUserOp(
      userOp,
      userOpHash,
      0
    );

    let postOpGas = (await TokenPaymaster.COST_OF_POST()).mul(
      userOp.maxFeePerGas
    );

    let context = result[0];
    let gasCost = 200000;
    let ERC20Cost = exchangeRate
      .mul(postOpGas.add(gasCost))
      .div(ethers.utils.parseEther("1"));

    await TestToken.connect(owner).mint(owner.address, ERC20Cost);
    await TestToken.connect(owner).approve(TokenPaymaster.address, ERC20Cost);

    let tx = await TokenPaymaster.postOp(0, context, gasCost);
    let receipt = await tx.wait();

    await expect(receipt.status).to.equal(1);
    await expect(await TestToken.balanceOf(TokenPaymaster.address)).to.equal(
      ERC20Cost
    );
  });

  it("should swap tokens to native", async function () {
    const { owner, signer, TestToken, PriceOracle, maxPrice, minPrice } =
      await loadFixture(deploy);

    let EntryPointFactory = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPoint = await EntryPointFactory.deploy(owner.address);

    let TokenPaymasterFactory = await ethers.getContractFactory(
      "TokenPaymaster"
    );

    let TokenPaymaster = await TokenPaymasterFactory.deploy(
      signer.address,
      PriceOracle.address,
      owner.address,
      EntryPoint.address
    );

    // Deploy Mock UniswapV2Router
    let MockUniswapV2RouterFactory = await ethers.getContractFactory(
      "MockUniSwapV2Router"
    );
    let MockUniswapV2Router = await MockUniswapV2RouterFactory.deploy(
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    );

    let SwapHelperFactory = await ethers.getContractFactory("UniSwapV2Adapter");
    let SwapHelper = await SwapHelperFactory.deploy(
      MockUniswapV2Router.address, owner.address
    );

    await SwapHelper.connect(owner).setPath(TestToken.address, [
      TestToken.address,
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    ]);

    // send 10 eth to SwapHelper
    await owner.sendTransaction({
      to: MockUniswapV2Router.address,
      value: ethers.utils.parseEther("10"),
    });

    // transfer 1000 TestToken to TokenPaymaster
    await TestToken.connect(owner).mint(owner.address, 1000000);
    await TestToken.connect(owner).transfer(TokenPaymaster.address, 1000000);

    await TokenPaymaster.connect(owner).setSwapAdapter(SwapHelper.address);

    await TokenPaymaster.connect(owner).swapToNative(
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
