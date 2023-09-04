const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
let Utils = require("../Utils.js");

describe("TokenPaymaster", function () {
  async function deploy() {
    let [owner, signer, alice, entryPoint] = await ethers.getSigners();

    let MockEntryPointL1 = await ethers.getContractFactory("MockEntryPointL1");
    let EntryPointV06 = await ethers.getContractFactory(
      "contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint"
    );
    let entryPointContractSimulate = await MockEntryPointL1.deploy(owner.address);
    let entryPointContractV04 = await MockEntryPointL1.deploy(owner.address);
    let entryPointContractV06 = await EntryPointV06.deploy();


    /// change version to switch entrypoint
    let version = 2;
    let entryPointContract;

    switch (version) {
      case 0:
        /// if test entryPointSimulate;
        entryPointContract = entryPointContractSimulate;
        break;
      case 1:
        /// if test entryPointV04
        entryPointContract = entryPointContractV04;
        break;
      case 2:
        /// if test entryPointV06 
        entryPointContract = entryPointContractV06;
        break;
      default:
        entryPointContract = entryPointContractV06;
    }

    let MockChainlinkOracleFactory = await ethers.getContractFactory(
      "MockChainlinkOracle",
    );
    let MockChainlinkOracle = await MockChainlinkOracleFactory.deploy(
      owner.address,
    );

    let MockChainlinkOracleETH = await MockChainlinkOracleFactory.deploy(
      owner.address,
    );

    await MockChainlinkOracle.connect(owner).setPrice(100000000);
    await MockChainlinkOracle.connect(owner).setDecimals(8);

    await MockChainlinkOracleETH.connect(owner).setPrice(200000000000);
    await MockChainlinkOracleETH.connect(owner).setDecimals(8);

    let TestTokenFactory = await ethers.getContractFactory("TestToken");
    let testToken = await TestTokenFactory.deploy();

    let PriceOracleFactory = await ethers.getContractFactory(
      "ChainlinkOracleAdapter",
    );
    let priceOracle = await PriceOracleFactory.deploy(owner.address);

    let TokenPaymasterFactory = await ethers.getContractFactory(
      "TokenPaymaster",
    );
    let tokenPaymaster = await TokenPaymasterFactory.deploy(
      signer.address,
      owner.address
    );
    await tokenPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address);
    await tokenPaymaster.connect(owner).setPriceOracle(priceOracle.address);

    await priceOracle
      .connect(owner)
      .setPriceFeed(testToken.address, MockChainlinkOracle.address);
    await priceOracle.connect(owner).setDecimals(testToken.address, 6);

    await priceOracle
      .connect(owner)
      .setPriceFeed(
        await priceOracle.NATIVE_TOKEN(),
        MockChainlinkOracleETH.address,
      );
    await priceOracle
      .connect(owner)
      .setDecimals(await priceOracle.NATIVE_TOKEN(), 18);

    let UserOpHelperFactory = await ethers.getContractFactory(
      "contracts/helper/UserOperationHelper.sol:UserOperationHelper"
    );
    let userOpHelper = await UserOpHelperFactory.deploy(
      tokenPaymaster.address,
      entryPoint.address,
      owner.address,
    );

    let tokenPaymasterWithEntryPoint = await TokenPaymasterFactory.deploy(
      signer.address,
      owner.address
    );

    await tokenPaymasterWithEntryPoint
      .connect(owner)
      .setPriceOracle(priceOracle.address);
    await tokenPaymasterWithEntryPoint.connect(owner).addSupportedEntryPoint(entryPointContract.address);

    return {
      entryPoint,
      signer,
      owner,
      alice,
      testToken,
      tokenPaymaster,
      priceOracle,
      MockChainlinkOracle,
      userOpHelper,
      entryPointContract,
      tokenPaymasterWithEntryPoint,
    };
  }
  describe("constructor", function () {
    it("should read default value correctly", async function () {
      const { entryPoint, owner, signer, tokenPaymaster, priceOracle } =
        await loadFixture(deploy);

      let defaultSigner = await tokenPaymaster.verifyingSigner();
      await expect(defaultSigner).to.equal(signer.address);

      let defaultOwner = await tokenPaymaster.owner();
      await expect(defaultOwner).to.equal(owner.address);

      let defaultPriceOracle = await tokenPaymaster.priceOracle();
      await expect(defaultPriceOracle).to.equal(priceOracle.address);

      let isSupportedEntryPoint = await tokenPaymaster.isSupportedEntryPoint(entryPoint.address);
      await expect(isSupportedEntryPoint).to.equal(true);
    });
  });

  describe("setTokenPriceLimitMax", function () {
    it("should read value correctly", async function () {
      const { tokenPaymaster, testToken } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");

      await tokenPaymaster.setTokenPriceLimitMax(testToken.address, maxPrice);
      expect(
        await tokenPaymaster.tokenPriceLimitMax(testToken.address),
      ).to.equal(maxPrice);
    });
    it("should emit an event on TokenPriceLimitMaxSet", async function () {
      const { tokenPaymaster, testToken } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");
      await expect(
        tokenPaymaster.setTokenPriceLimitMax(testToken.address, maxPrice),
      )
        .to.emit(tokenPaymaster, "TokenPriceLimitMaxSet")
        .withArgs(testToken.address, maxPrice);
    });

    it("should revert if the caller is not owner", async function () {
      const { tokenPaymaster, testToken, alice } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");
      await expect(
        tokenPaymaster
          .connect(alice)
          .setTokenPriceLimitMax(testToken.address, maxPrice),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("setTokenPriceLimitMin", function () {
    it("should read value correctly", async function () {
      const { tokenPaymaster, testToken } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");

      await tokenPaymaster.setTokenPriceLimitMin(testToken.address, minPrice);
      expect(
        await tokenPaymaster.tokenPriceLimitMin(testToken.address),
      ).to.equal(minPrice);
    });
    it("should emit an event on TokenPriceLimitMinSet", async function () {
      const { tokenPaymaster, testToken } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");
      await expect(
        tokenPaymaster.setTokenPriceLimitMin(testToken.address, minPrice),
      )
        .to.emit(tokenPaymaster, "TokenPriceLimitMinSet")
        .withArgs(testToken.address, minPrice);
    });

    it("should revert if the caller is not owner", async function () {
      const { tokenPaymaster, testToken, alice } = await loadFixture(deploy);
      let maxPrice = ethers.utils.parseEther("1");
      let minPrice = ethers.utils.parseEther("0.00001");
      await expect(
        tokenPaymaster
          .connect(alice)
          .setTokenPriceLimitMin(testToken.address, minPrice),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

   describe("addSupportedEntryPoint", function () {
    it("should revert if the caller is not owner", async function () {
      const { owner, tokenPaymaster, alice, entryPoint } = await loadFixture(deploy);

      await expect(
        tokenPaymaster.connect(alice).addSupportedEntryPoint(entryPoint.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the entryPoint has set", async function () {
      const { owner, tokenPaymaster, alice, entryPoint } = await loadFixture(deploy);

      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
      await expect(
        tokenPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address)
      ).to.be.revertedWith("duplicate entrypoint");
    });

    it("should emit an event on RemoveSupportedEntryPoint", async function () {
      const { owner, tokenPaymaster, alice, entryPoint } = await loadFixture(deploy);

      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
      expect(await tokenPaymaster.connect(owner).removeSupportedEntryPoint(entryPoint.address))
          .to.emit(tokenPaymaster, "RemoveSupportedEntryPoint").withArgs(entryPoint.address);
      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(false);
    });

    it("should emit an event on AddSupportedEntryPoint", async function () {
      const { owner, tokenPaymaster, alice, entryPoint } = await loadFixture(deploy);

      await tokenPaymaster.connect(owner).removeSupportedEntryPoint(entryPoint.address);
      expect(await tokenPaymaster.connect(owner).addSupportedEntryPoint(entryPoint.address))
          .to.emit(tokenPaymaster, "AddSupportedEntryPoint").withArgs(entryPoint.address);
      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(entryPoint.address)).to.equal(true);
    });

    it("should check correctly ", async function () {
      const { owner, tokenPaymaster, alice, entryPoint } = await loadFixture(deploy);

      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(alice.address)).to.equal(false);
      await tokenPaymaster.connect(owner).addSupportedEntryPoint(alice.address);
      expect(await tokenPaymaster.connect(owner).isSupportedEntryPoint(alice.address)).to.equal(true);
    });
  });

  describe("validatePaymasterUserOp", function () {
    it("should validatePaymasterUserOp", async function () {
      const { signer, tokenPaymaster, entryPoint, testToken, userOpHelper } =
        await loadFixture(deploy);

      let exchangeRate = 2000000000;
      let costGas = 5000000000000;

      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: tokenPaymaster,
          TestToken: testToken,
          exchangeRate: exchangeRate,
          sigTime: 1234567,
        },
        ethers.constants.AddressZero,
        0,
        "0x",
      );

      let userOpHash = await userOpHelper.getUserOpHash(
        userOp,
        entryPoint.address,
      );

      let result = await tokenPaymaster.validatePaymasterUserOp(
        userOp,
        userOpHash,
        0,
      );

      const expectContext = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "address", "uint256", "uint256"],
        [userOpHash, userOp.sender, testToken.address, exchangeRate, costGas],
      );

      await expect(result[0]).to.equal(expectContext);
      await expect(result[1]).to.equal(1234567);
    });

    it("should validatePaymasterUserOp using oraclePrice when above max price", async function () {
      const {
        signer,
        tokenPaymaster,
        entryPoint,
        priceOracle,
        testToken,
        userOpHelper,
      } = await loadFixture(deploy);

      let exchangeRateFromOracle = await priceOracle.exchangeRate(
        testToken.address,
      );
      let exchangeRate = ethers.utils.parseEther("1900000000");

      let maxPrice = ethers.utils.parseEther("3000000000");
      let costGas = 5000000000000;

      await tokenPaymaster.setTokenPriceLimitMax(testToken.address, maxPrice);

      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: tokenPaymaster,
          TestToken: testToken,
          exchangeRate: exchangeRate.mul(2),
          sigTime: 1234567,
        },
        ethers.constants.AddressZero,
        0,
        "0x",
      );

      let userOpHash = await userOpHelper.getUserOpHash(
        userOp,
        entryPoint.address,
      );

      let result = await tokenPaymaster.validatePaymasterUserOp(
        userOp,
        userOpHash,
        0,
      );

      const expectContext = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "address", "uint256", "uint256"],
        [
          userOpHash,
          userOp.sender,
          testToken.address,
          exchangeRateFromOracle,
          costGas,
        ],
      );

      await expect(result[0]).to.equal(expectContext);
      await expect(result[1]).to.equal(1234567);
    });

    it("should validatePaymasterUserOp using oraclePrice when below min price", async function () {
      const {
        signer,
        tokenPaymaster,
        entryPoint,
        testToken,
        priceOracle,
        userOpHelper,
      } = await loadFixture(deploy);

      let exchangeRate = await priceOracle.exchangeRate(testToken.address);
      let minPrice = ethers.utils.parseEther("1500000000");
      let costGas = 5000000000000;

      await tokenPaymaster.setTokenPriceLimitMin(testToken.address, minPrice);

      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: tokenPaymaster,
          TestToken: testToken,
          exchangeRate: minPrice.div(2),
          sigTime: 1234567,
        },
        ethers.constants.AddressZero,
        0,
        "0x",
      );

      let userOpHash = await userOpHelper.getUserOpHash(
        userOp,
        entryPoint.address,
      );

      let result = await tokenPaymaster.validatePaymasterUserOp(
        userOp,
        userOpHash,
        0,
      );

      const expectContext = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "address", "uint256", "uint256"],
        [userOpHash, userOp.sender, testToken.address, exchangeRate, costGas],
      );

      await expect(result[0]).to.equal(expectContext);
      await expect(result[1]).to.equal(1234567);
    });
  });

  describe("postOp", function () {
    it("should execute postOp", async function () {
      const {
        owner,
        signer,
        tokenPaymaster,
        entryPoint,
        testToken,
        priceOracle,
        userOpHelper,
      } = await loadFixture(deploy);
      let exchangeRate = await priceOracle.exchangeRate(testToken.address);
      expect(exchangeRate.toString()).to.equal("2000000000");
      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: tokenPaymaster,
          TestToken: testToken,
          exchangeRate: exchangeRate,
          sigTime: 1234567,
        },
        owner.address,
        0,
        "0x",
      );

      let userOpHash = await userOpHelper.getUserOpHash(
        userOp,
        entryPoint.address,
      );

      let result = await tokenPaymaster.validatePaymasterUserOp(
        userOp,
        userOpHash,
        0,
      );

      let context = result[0];
      let gasPrice = ethers.utils.parseUnits("0.1", "gwei");
      let executeCost = gasPrice.mul(20000);

      await testToken
        .connect(owner)
        .mint(owner.address, ethers.utils.parseEther("1"));
      await testToken
        .connect(owner)
        .approve(tokenPaymaster.address, ethers.utils.parseEther("1"));

      let tx = await tokenPaymaster
        .connect(entryPoint)
        .postOp(0, context, executeCost);
      let receipt = await tx.wait();

      await expect(receipt.status).to.equal(1);
      expect(await testToken.balanceOf(tokenPaymaster.address)).to.equal(14000);
    });

    it("should emit an event on TokenCost", async function () {
      const {
        owner,
        signer,
        tokenPaymaster,
        entryPoint,
        testToken,
        priceOracle,
        userOpHelper,
      } = await loadFixture(deploy);
      let exchangeRate = await priceOracle.exchangeRate(testToken.address);
      expect(exchangeRate.toString()).to.equal("2000000000");
      let userOp = await Utils.generatePaymasterUOP(
        {
          signer: signer,
          TokenPaymaster: tokenPaymaster,
          TestToken: testToken,
          exchangeRate: exchangeRate,
          sigTime: 1234567,
        },
        owner.address,
        0,
        "0x",
      );

      let userOpHash = await userOpHelper.getUserOpHash(
        userOp,
        entryPoint.address,
      );

      let result = await tokenPaymaster.validatePaymasterUserOp(
        userOp,
        userOpHash,
        0,
      );

      let context = result[0];
      let gasPrice = ethers.utils.parseUnits("0.1", "gwei");
      let executeCost = gasPrice.mul(20000);

      await testToken
        .connect(owner)
        .mint(owner.address, ethers.utils.parseEther("1"));
      await testToken
        .connect(owner)
        .approve(tokenPaymaster.address, ethers.utils.parseEther("1"));

      await expect(
        tokenPaymaster.connect(entryPoint).postOp(0, context, executeCost),
      )
        .to.emit(tokenPaymaster, "TokenCost")
        .withArgs(
          userOpHash,
          owner.address,
          testToken.address,
          "14000",
          "7000000000000",
        );
    });
  });

  describe("addToWhitelist", function () {
    it("should read default value correctly", async function () {
      const { owner, tokenPaymaster, alice } = await loadFixture(deploy);

      let addresses = [owner.address, alice.address];

      await tokenPaymaster.addToWhitelist(addresses);
      expect(await tokenPaymaster.whitelist(owner.address)).to.equal(true);
      expect(await tokenPaymaster.whitelist(alice.address)).to.equal(true);
    });

    it("should emit an event on AddedToWhitelist", async function () {
      const { owner, signer, alice, tokenPaymaster } = await loadFixture(
        deploy,
      );
      let addresses = [owner.address, alice.address];

      await expect(tokenPaymaster.addToWhitelist(addresses))
        .to.emit(tokenPaymaster, "AddedToWhitelist")
        .withArgs(owner.address);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, tokenPaymaster, alice } = await loadFixture(deploy);
      let addresses = [owner.address, alice.address];
      await expect(
        tokenPaymaster.connect(alice).addToWhitelist(addresses),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("removeFromWhitelist", function () {
    it("should read default value correctly", async function () {
      const { owner, tokenPaymaster, alice } = await loadFixture(deploy);

      let addresses = [owner.address, alice.address];

      await tokenPaymaster.addToWhitelist(addresses);
      await tokenPaymaster.removeFromWhitelist([owner.address]);
      expect(await tokenPaymaster.whitelist(owner.address)).to.equal(false);
      expect(await tokenPaymaster.whitelist(alice.address)).to.equal(true);
    });

    it("should emit an event on RemovedFromWhitelist", async function () {
      const { owner, signer, alice, tokenPaymaster } = await loadFixture(
        deploy,
      );
      let addresses = [owner.address, alice.address];

      await expect(tokenPaymaster.removeFromWhitelist(addresses))
        .to.emit(tokenPaymaster, "RemovedFromWhitelist")
        .withArgs(owner.address);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, tokenPaymaster, alice } = await loadFixture(deploy);
      let addresses = [owner.address, alice.address];
      await expect(
        tokenPaymaster.connect(alice).removeFromWhitelist(addresses),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("withdrawERC20", function () {
    it("should withdrawERC20 correctly", async function () {
      const { owner, tokenPaymaster, alice, testToken } = await loadFixture(
        deploy,
      );

      let addresses = [owner.address, alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await testToken.mint(tokenPaymaster.address, withdrawAmount);
      await tokenPaymaster.addToWhitelist(addresses);
      await tokenPaymaster.withdrawERC20(
        testToken.address,
        withdrawAmount,
        owner.address,
      );

      expect(await testToken.balanceOf(owner.address)).to.equal(withdrawAmount);
      expect(await testToken.balanceOf(tokenPaymaster.address)).to.equal("0");
    });

    it("should emit an event on Withdrawal", async function () {
      const { owner, tokenPaymaster, alice, testToken } = await loadFixture(
        deploy,
      );

      let addresses = [owner.address, alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await testToken.mint(tokenPaymaster.address, withdrawAmount);
      await tokenPaymaster.addToWhitelist(addresses);
      await expect(
        tokenPaymaster.withdrawERC20(
          testToken.address,
          withdrawAmount,
          owner.address,
        ),
      )
        .to.emit(tokenPaymaster, "Withdrawal")
        .withArgs(testToken.address, withdrawAmount);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, tokenPaymaster, alice, testToken } = await loadFixture(
        deploy,
      );
      let withdrawAmount = ethers.utils.parseEther("1");
      await expect(
        tokenPaymaster
          .connect(alice)
          .withdrawERC20(testToken.address, withdrawAmount, owner.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the destination address is not in the whitlist", async function () {
      const { owner, tokenPaymaster, testToken } = await loadFixture(deploy);
      let withdrawAmount = ethers.utils.parseEther("1");
      await expect(
        tokenPaymaster.withdrawERC20(
          testToken.address,
          withdrawAmount,
          owner.address,
        ),
      ).to.be.revertedWith("Address is not whitelisted");
    });
  });

  describe("withdrawDepositNativeToken", function () {
    it("should withdrawDepositNativeToken correctly", async function () {
      const { owner, tokenPaymasterWithEntryPoint, alice, entryPointContract } =
        await loadFixture(deploy);

      let addresses = [owner.address, alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPointContract.depositTo(tokenPaymasterWithEntryPoint.address, {
        value: withdrawAmount,
      });

      await tokenPaymasterWithEntryPoint.addToWhitelist(addresses);

      expect(
        await tokenPaymasterWithEntryPoint.withdrawDepositNativeToken(
          entryPointContract.address,
          alice.address,
          withdrawAmount,
        ),
      ).to.changeEtherBalances(
        [entryPointContract, alice],
        [-ethers.utils.parseEther("1"), ethers.utils.parseEther("1")],
      );
    });

    it("should emit an event on Withdrawal", async function () {
      const { owner, tokenPaymasterWithEntryPoint, alice, entryPointContract } =
        await loadFixture(deploy);

      let addresses = [owner.address, alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");
      await entryPointContract.depositTo(tokenPaymasterWithEntryPoint.address, {
        value: withdrawAmount,
      });

      await tokenPaymasterWithEntryPoint.addToWhitelist(addresses);
      await expect(
        tokenPaymasterWithEntryPoint.withdrawDepositNativeToken(
          entryPointContract.address,
          alice.address,
          withdrawAmount,
        ),
      )
        .to.emit(tokenPaymasterWithEntryPoint, "Withdrawal")
        .withArgs(ethers.constants.AddressZero, withdrawAmount);
    });

    it("should revert if the caller is not owner", async function () {
      const { owner, tokenPaymasterWithEntryPoint, alice, entryPointContract } =
        await loadFixture(deploy);
      let addresses = [owner.address, alice.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPointContract.depositTo(tokenPaymasterWithEntryPoint.address, {
        value: withdrawAmount,
      });

      await tokenPaymasterWithEntryPoint.addToWhitelist(addresses);
      await expect(
        tokenPaymasterWithEntryPoint
          .connect(alice)
          .withdrawDepositNativeToken(entryPointContract.address, alice.address, withdrawAmount),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the destination address is not in the whitlist", async function () {
      const { owner, tokenPaymasterWithEntryPoint, alice, entryPointContract } =
        await loadFixture(deploy);
      let addresses = [owner.address];
      let withdrawAmount = ethers.utils.parseEther("1");

      await entryPointContract.depositTo(tokenPaymasterWithEntryPoint.address, {
        value: withdrawAmount,
      });

      await tokenPaymasterWithEntryPoint.addToWhitelist(addresses);
      await expect(
        tokenPaymasterWithEntryPoint.withdrawDepositNativeToken(
          entryPointContract.address,
          alice.address,
          withdrawAmount,
        ),
      ).to.be.revertedWith("Address is not whitelisted");
    });
  });

  describe("setPriceOracle", function () {
    it("should read default value correctly", async function () {
      const { owner, tokenPaymaster } = await loadFixture(deploy);

      let PriceOracleFactory = await ethers.getContractFactory(
        "ChainlinkOracleAdapter",
      );
      let newPriceOracle = await PriceOracleFactory.deploy(owner.address);

      await tokenPaymaster.setPriceOracle(newPriceOracle.address);
      expect(await tokenPaymaster.priceOracle()).to.equal(
        newPriceOracle.address,
      );
    });

    it("should emit an event on PriceOracleUpdated", async function () {
      const { owner, tokenPaymaster } = await loadFixture(deploy);
      let PriceOracleFactory = await ethers.getContractFactory(
        "ChainlinkOracleAdapter",
      );
      let newPriceOracle = await PriceOracleFactory.deploy(owner.address);

      await expect(tokenPaymaster.setPriceOracle(newPriceOracle.address))
        .to.emit(tokenPaymaster, "PriceOracleUpdated")
        .withArgs(newPriceOracle.address);
    });
  });
});
