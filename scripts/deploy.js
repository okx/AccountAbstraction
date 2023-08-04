const fs = require("fs");

const { ethers, network } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();

let contractAddress = {},
  salt,
  owner,
  chainId,
  DeployFactory,
  EntryPoint,
  SwapHelper,
  BundlerDepositHelper,
  DefaultCallbackHandler,
  SmartAccount,
  SmartAccountProxyFactory,
  OracleAdapter,
  TokenPaymaster,
  SimulateToken;

const DeployInformation = JSON.parse(fs.readFileSync("DeployInformation.json"));

async function getDeployFactory() {
  DeployFactory = await ethers
    .getContractFactory("DeployFactory")
    .then((f) =>
      f.attach(
        JSON.parse(fs.readFileSync("DeployInformation.json"))["DeployFactory"],
      ),
    );

  return DeployFactory;
}

async function deployContractByDeployFactory(
  DeployFactory,
  contractFactory,
  DeployInformation,
  salt,
) {
  const initCode = ethers.utils.solidityPack(
    ["bytes", "bytes"],
    [ethers.utils.hexDataSlice(contractFactory.bytecode, 0), DeployInformation],
  );

  const address = await DeployFactory.getAddress(initCode, salt);

  const code = await ethers.provider.getCode(address);

  if (code !== "0x") {
    return address;
  }

  await DeployFactory.deploy(initCode, salt).then((tx) => tx.wait());

  return address;
}

async function deploy(
  contractAddress,
  DeployFactory,
  contractName,
  constructorType,
  constructorArgs,
  salt,
) {
  const contractFactory = await ethers.getContractFactory(contractName);

  const DeployInformation = ethers.utils.defaultAbiCoder.encode(
    constructorType,
    constructorArgs,
  );

  const contract = await contractFactory.attach(
    await deployContractByDeployFactory(
      DeployFactory,
      contractFactory,
      DeployInformation,
      salt,
    ),
  );

  console.log(contractName + " " + contract.address);
  contractAddress[contractName] = contract.address;

  return contract;
}

async function deployCoreContract() {
  EntryPoint = await deploy(
    contractAddress,
    DeployFactory,
    "contracts/core/EntryPoint.sol:EntryPoint",
    ["address"],
    [DeployInformation["EntryPoint"]["owner"]],
    salt,
  );

  TokenPaymaster = await deploy(
    contractAddress,
    DeployFactory,
    "TokenPaymaster",
    ["address", "address", "address"],
    [
      DeployInformation["TokenPaymaster"]["verifyingSigner"],
      DeployInformation["TokenPaymaster"]["owner"],
      EntryPoint.address,
    ],
    salt,
  );

  FreeGasPaymaster = await deploy(
    contractAddress,
    DeployFactory,
    "FreeGasPaymaster",
    ["address", "address", "address"],
    [
      DeployInformation["FreeGasPaymaster"]["verifyingSigner"],
      DeployInformation["FreeGasPaymaster"]["owner"],
      EntryPoint.address,
    ],
    salt,
  );

  DefaultCallbackHandler = await deploy(
    contractAddress,
    DeployFactory,
    "DefaultCallbackHandler",
    [],
    [],
    salt,
  );

  SmartAccount = await deploy(
    contractAddress,
    DeployFactory,
    "SmartAccount",
    ["address", "address", "string", "string"],
    [
      EntryPoint.address,
      DefaultCallbackHandler.address,
      DeployInformation["SmartAccount"]["name"],
      DeployInformation["SmartAccount"]["version"],
    ],
    salt,
  );

  SmartAccountProxyFactory = await deploy(
    contractAddress,
    DeployFactory,
    "SmartAccountProxyFactory",
    ["address", "address"],
    [
      SmartAccount.address,
      DeployInformation["SmartAccountProxyFactory"]["owner"],
    ],
    salt,
  );

  SmartAccountInitCode = await deploy(
    contractAddress,
    DeployFactory,
    "SmartAccountInitCode",
    [],
    [],
    salt,
  );
}

async function deployHelperContract() {
  if (chainId == 66) {
    OracleAdapter = await deploy(
      contractAddress,
      DeployFactory,
      DeployInformation["OracleAdapter"][chainId]["contractType"],
      ["address", "address"],
      [
        DeployInformation["OracleAdapter"]["owner"],
        DeployInformation["OracleAdapter"][chainId]["oracleAddress"],
      ],
      salt,
    );
  } else {
    OracleAdapter = await deploy(
      contractAddress,
      DeployFactory,
      DeployInformation["OracleAdapter"][chainId]["contractType"],
      ["address"],
      [DeployInformation["OracleAdapter"]["owner"]],
      salt,
    );
  }

  SwapHelper = await deploy(
    contractAddress,
    DeployFactory,
    DeployInformation["SwapHelper"][chainId]["contractType"],
    ["address", "address"],
    [
      DeployInformation["SwapHelper"][chainId]["swapRouter"],
      DeployInformation["SwapHelper"]["owner"],
    ],
    salt,
  );

  UserOperationHelper = await deploy(
    contractAddress,
    DeployFactory,
    "UserOperationHelper",
    ["address", "address", "address"],
    [
      TokenPaymaster.address,
      EntryPoint.address,
      DeployInformation["UserOperationHelper"]["owner"],
    ],
    salt,
  );

  SimulateToken = await deploy(
    contractAddress,
    DeployFactory,
    "SimulateToken",
    ["address", "uint256"],
    [UserOperationHelper.address, ethers.constants.MaxUint256],
    salt,
  );

  BundlerDepositHelper = await deploy(
    contractAddress,
    DeployFactory,
    "BundlerDepositHelper",
    ["address"],
    [DeployInformation["BundlerDepositHelper"]["owner"]],
    salt,
  );
}

async function CheckConfig() {
  await expect((await EntryPoint.owner()).toLowerCase()).to.equal(
    DeployInformation["EntryPoint"]["owner"].toLowerCase(),
  );

  await expect((await OracleAdapter.owner()).toLowerCase()).to.equal(
    DeployInformation["OracleAdapter"]["owner"].toLowerCase(),
  );

  await expect((await SwapHelper.owner()).toLowerCase()).to.equal(
    DeployInformation["SwapHelper"]["owner"].toLowerCase(),
  );

  await expect((await TokenPaymaster.owner()).toLowerCase()).to.equal(
    DeployInformation["TokenPaymaster"]["owner"].toLowerCase(),
  );

  await expect((await TokenPaymaster.verifyingSigner()).toLowerCase()).to.equal(
    DeployInformation["TokenPaymaster"]["verifyingSigner"].toLowerCase(),
  );

  await expect(
    (await TokenPaymaster.supportedEntryPoint()).toLowerCase(),
  ).to.equal(EntryPoint.address.toLowerCase());

  await expect((await FreeGasPaymaster.owner()).toLowerCase()).to.equal(
    DeployInformation["FreeGasPaymaster"]["owner"].toLowerCase(),
  );

  await expect(
    (await FreeGasPaymaster.verifyingSigner()).toLowerCase(),
  ).to.equal(
    DeployInformation["FreeGasPaymaster"]["verifyingSigner"].toLowerCase(),
  );

  await expect(
    (await FreeGasPaymaster.supportedEntryPoint()).toLowerCase(),
  ).to.equal(EntryPoint.address.toLowerCase());

  await expect((await SmartAccount.EntryPoint()).toLowerCase()).to.equal(
    EntryPoint.address.toLowerCase(),
  );

  await expect((await SmartAccount.FallbackHandler()).toLowerCase()).to.equal(
    DefaultCallbackHandler.address.toLowerCase(),
  );

  await expect(
    await SmartAccountProxyFactory.safeSingleton(SmartAccount.address),
  ).to.equal(true);

  await expect((await SmartAccountProxyFactory.owner()).toLowerCase()).to.equal(
    DeployInformation["SmartAccountProxyFactory"]["owner"].toLowerCase(),
  );

  await expect(
    await UserOperationHelper.tokenPaymasters(TokenPaymaster.address),
  ).to.equal(true);

  await expect(
    await UserOperationHelper.entryPoints(EntryPoint.address),
  ).to.equal(true);
}

async function setEntryPointConfig() {
  await EntryPoint.connect(owner)
    .setWalletProxyFactoryWhitelist(SmartAccountProxyFactory.address)
    .then((tx) => tx.wait());

  const bundlers = DeployInformation["EntryPoint"]["bundlers"];

  for (let index = 0; index < bundlers.length; index++) {
    if (!(await EntryPoint.officialBundlerWhiteList(bundlers[index]))) {
      let tx = await EntryPoint.connect(owner).setBundlerOfficialWhitelist(
        bundlers[index],
        true,
      );
      await tx.wait();

      console.log("setBundlerOfficialWhitelist", tx.hash);
      console.log("bundler setted " + bundlers[index]);
    }
  }
}

async function setTokenPaymasterOracleConfig() {
  let tx = await TokenPaymaster.connect(owner).setPriceOracle(
    OracleAdapter.address,
  );
  await tx.wait();

  console.log("setPriceOracle", tx.hash);
}

async function setTokenPaymasterSwapHelperConfig() {
  let tx = await TokenPaymaster.connect(owner).setSwapAdapter(
    SwapHelper.address,
  );
  await tx.wait();

  console.log("setSwapAdapter", tx.hash);
}

async function setTokenPaymasterPriceConfig() {
  let tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
    DeployInformation["USDT"][chainId]["address"],
    ethers.utils.parseUnits(
      DeployInformation["USDT"][chainId]["maxPrice"],
      Number(DeployInformation["USDT"][chainId]["decimal"]),
    ),
  );
  await tx.wait();
  console.log("setTokenPriceLimitMax USDT", tx.hash);

  tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMin(
    DeployInformation["USDT"][chainId]["address"],
    ethers.utils.parseUnits(
      DeployInformation["USDT"][chainId]["minPrice"],
      Number(DeployInformation["USDT"][chainId]["decimal"]),
    ),
  );
  await tx.wait();
  console.log("setTokenPriceLimitMin USDT", tx.hash);

  tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
    DeployInformation["USDC"][chainId]["address"],
    ethers.utils.parseUnits(
      DeployInformation["USDC"][chainId]["maxPrice"],
      Number(DeployInformation["USDC"][chainId]["decimal"]),
    ),
  );
  await tx.wait();
  console.log("setTokenPriceLimitMax USDC", tx.hash);

  tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMin(
    DeployInformation["USDC"][chainId]["address"],
    ethers.utils.parseUnits(
      DeployInformation["USDC"][chainId]["minPrice"],
      Number(DeployInformation["USDC"][chainId]["decimal"]),
    ),
  );
  await tx.wait();
  console.log("setTokenPriceLimitMin USDC", tx.hash);

}

async function setOracleConfig() {
  if (chainId == 66) {
    await setEXOracleAdapterConfig(owner);
  } else {
    await setChainlinkOracleAdapterConfig(owner);
  }
}

async function setChainlinkOracleAdapterConfig() {
  let tx = await OracleAdapter.connect(owner).setDecimals(
    await OracleAdapter.NATIVE_TOKEN(),
    18,
  );
  await tx.wait();
  console.log("setDecimals Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    DeployInformation["USDT"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDTPriceFeed"],
  );
  await tx.wait();
  console.log("setPriceFeed USDT", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    DeployInformation["USDC"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDCPriceFeed"],
  );
  await tx.wait();
  console.log("setPriceFeed USDC", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    await OracleAdapter.NATIVE_TOKEN(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenPriceFeed"],
  );
  await tx.wait();
  console.log("setPriceFeed Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    await SwapHelper.nativeToken(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenPriceFeed"],
  );
  await tx.wait();
  console.log("setPriceFeed Wraped Native", tx.hash);
}

async function setEXOracleAdapterConfig() {
  let tx = await OracleAdapter.connect(owner).setDecimals(
    await OracleAdapter.NATIVE_TOKEN(),
    18,
  );
  await tx.wait();
  console.log("setDecimals Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    DeployInformation["USDT"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["dataSorce"],
  );
  await tx.wait();
  console.log("setPriceFeed USDT", tx.hash);

  tx = await OracleAdapter.connect(owner).setOracleDecimals(
    DeployInformation["USDT"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDTOracleDecimals"],
  );
  await tx.wait();
  console.log("setOracleDecimals USDT", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceType(
    DeployInformation["USDT"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDTOracleDataType"],
  );
  await tx.wait();
  console.log("setPriceType USDT", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    DeployInformation["USDC"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["dataSorce"],
  );
  await tx.wait();
  console.log("setPriceFeed USDC", tx.hash);

  tx = await OracleAdapter.connect(owner).setOracleDecimals(
    DeployInformation["USDC"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDTOracleDecimals"],
  );
  await tx.wait();
  console.log("setOracleDecimals USDC", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceType(
    DeployInformation["USDC"][chainId]["address"],
    DeployInformation["OracleAdapter"][chainId]["USDTOracleDataType"],
  );
  await tx.wait();
  console.log("setPriceType USDC", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    await OracleAdapter.NATIVE_TOKEN(),
    DeployInformation["OracleAdapter"][chainId]["dataSorce"],
  );
  await tx.wait();
  console.log("setPriceFeed Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setOracleDecimals(
    await OracleAdapter.NATIVE_TOKEN(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenOracleDecimals"],
  );
  await tx.wait();
  console.log("setOracleDecimals Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceType(
    await OracleAdapter.NATIVE_TOKEN(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenOracleDataType"],
  );
  await tx.wait();
  console.log("setPriceType Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceFeed(
    await SwapHelper.nativeToken(),
    DeployInformation["OracleAdapter"][chainId]["dataSorce"],
  );
  await tx.wait();
  console.log("setPriceFeed Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setOracleDecimals(
    await SwapHelper.nativeToken(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenOracleDecimals"],
  );
  await tx.wait();
  console.log("setOracleDecimals Native Token", tx.hash);

  tx = await OracleAdapter.connect(owner).setPriceType(
    await SwapHelper.nativeToken(),
    DeployInformation["OracleAdapter"][chainId]["NativeTokenOracleDataType"],
  );
  await tx.wait();
  console.log("setPriceType Native Token", tx.hash);
}

async function setFreeGasPaymasterWhiteListConfig() {
  let tx = await FreeGasPaymaster.connect(owner).addToWhitelist(
    DeployInformation["FreeGasPaymaster"]["whiteList"],
  );
  await tx.wait();
  console.log("addToWhitelist FreGasPaymaster", tx.hash);
}

async function setTokenPaymasterWhitListConfig() {
  let tx = await TokenPaymaster.connect(owner).addToWhitelist(
    DeployInformation["TokenPaymaster"]["whiteList"],
  );
  await tx.wait();
  console.log("addToWhitelist TokenPaymaster", tx.hash);
}

async function setBundlerDepositHelperConfig() {
  let tx = await BundlerDepositHelper.connect(owner).setValidEntryPoint(
    EntryPoint.address,
    true,
  );
  await tx.wait();
  console.log("setValidEntryPoint BundlerDepositHelper", tx.hash);
}

async function setSwapHelperConfig() {
  if (
    DeployInformation["SwapHelper"][chainId]["contractType"] !=
    "UniSwapV3Adapter"
  ) {
    let tx = await SwapHelper.connect(owner).setPath(
      DeployInformation["USDT"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["paths"]["USDT"],
    );
    await tx.wait();
    console.log("setPath USDT", tx.hash);

    tx = await SwapHelper.connect(owner).setPath(
      DeployInformation["USDC"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["paths"]["USDC"],
    );
    await tx.wait();
    console.log("setPath USDC", tx.hash);
  } else {

    let tx = await SwapHelper.connect(owner).setPoolFee(
      DeployInformation["USDT"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["poolFee"]["USDT"],
    );
    await tx.wait();
    console.log("setPoolFee USDT", tx.hash);

    tx = await SwapHelper.connect(owner).setPoolFee(
      DeployInformation["USDC"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["poolFee"]["USDC"],
    );
    await tx.wait();
    console.log("setPoolFee USDC", tx.hash);

  }

  if (
    DeployInformation["SwapHelper"][chainId]["contractType"] ==
    "TradeJoeV2Adapter"
  ) {
    let tx = await SwapHelper.connect(owner).setAirBinStep(
      DeployInformation["USDT"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["airBinSteps"]["USDT"],
    );
    await tx.wait();
    console.log("setAirBinStep USDT", tx.hash);

    tx = await SwapHelper.connect(owner).setAirBinStep(
      DeployInformation["USDC"][chainId]["address"],
      DeployInformation["SwapHelper"][chainId]["airBinSteps"]["USDC"],
    );
    await tx.wait();
    console.log("setAirBinStep USDC", tx.hash);
  }
}

async function setFreeGasPaymasterConfig() {
  await setFreeGasPaymasterWhiteListConfig();
}

async function setTokenPaymasterConfig() {
  await setTokenPaymasterOracleConfig();
  await setTokenPaymasterPriceConfig();
  await setTokenPaymasterSwapHelperConfig();
  await setTokenPaymasterWhitListConfig();
}

async function deployAllContract() {
  DeployFactory = await getDeployFactory();
  await deployCoreContract();
  await deployHelperContract();
}

async function setPaymasterConfig() {
  await setTokenPaymasterConfig();
  await setFreeGasPaymasterConfig();
}

async function setAllConfig() {
  await setEntryPointConfig();
  await setPaymasterConfig();
  await setOracleConfig();
  await setSwapHelperConfig();
  await setBundlerDepositHelperConfig();
}

async function main() {
  if ((await hre.ethers.provider.getNetwork()).chainId.toString() == 31337) {
    ME = "0x794b93902449c524c3158f9e101204ecb2057f2e";
    owner = await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ME],
    });

    await network.provider.send("hardhat_setBalance", [
      ME,
      "0x1000000000000000000000000",
    ]);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ME],
    });

    owner = await ethers.getSigner(ME);
    chainId = 56;
  } else {
    owner = await ethers.getSigner();
    chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  }

  salt = DeployInformation["salt"];

  console.log("ownerAddress", owner.address);
  console.log("chainID", chainId);

  await deployAllContract();
  await CheckConfig();
  await setAllConfig();

  fs.writeFileSync(
    "ContractAddress.json",
    JSON.stringify(contractAddress, null, 2),
  );
}

main();
