const fs = require("fs");
const { ethers, network } = require("hardhat");
const { expect } = require("chai");
require("dotenv").config();

let contractAddress = {},
    salt,
    circleSalt,
    owner,
    chainId,
    DeployFactory,
    EntryPointV06,
    SwapHelper,
    BundlerDepositHelper,
    DefaultCallbackHandler,
    SmartAccountV2,
    AccountFactoryProxy,
    OracleAdapter,
    TokenPaymaster,
    FreeGasPaymaster,
    CirclePaymaster,
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

async function instantiateContracts() {
    EntryPointV06 = await ethers
        .getContractFactory("contracts/@eth-infinitism-v0.6/core/EntryPoint.sol:EntryPoint")
        .then((f) => f.attach(DeployInformation["OfficialEntryPointV06"]));
    contractAddress["EntryPointV06"] = EntryPointV06.address;

    console.log("EntryPointV06" + " " + EntryPointV06.address);

    OracleAdapter = await ethers
        .getContractFactory(DeployInformation["OracleAdapter"][chainId]["contractType"])
        .then((f) => f.attach(DeployInformation["OracleAdapter"][chainId]["contractAddress"]));

    console.log("OracleAdapter" + " " + OracleAdapter.address);

    SwapHelper = await ethers
        .getContractFactory(DeployInformation["SwapHelper"][chainId]["contractType"])
        .then((f) => f.attach(DeployInformation["SwapHelper"][chainId]["contractAddress"]));
    console.log("SwapHelper" + " " + SwapHelper.address);
}


async function deployCoreContract() {

    Validations = await deploy(
        contractAddress,
        DeployFactory,
        "Validations",
        ["address"],
        [DeployInformation["Validations"]["owner"]],
        salt,
    );


    BundlerDepositHelper = await deploy(
        contractAddress,
        DeployFactory,
        "BundlerDepositHelper",
        ["address", "address"],
        [DeployInformation["BundlerDepositHelper"]["owner"], Validations.address],
        salt,
    );

    TokenPaymaster = await deploy(
        contractAddress,
        DeployFactory,
        "TokenPaymaster",
        ["address", "address"],
        [
            DeployInformation["TokenPaymaster"]["verifyingSigner"],
            DeployInformation["TokenPaymaster"]["owner"]
        ],
        salt,
    );

    FreeGasPaymaster = await deploy(
        contractAddress,
        DeployFactory,
        "FreeGasPaymaster",
        ["address", "address"],
        [
            DeployInformation["FreeGasPaymaster"]["verifyingSigner"],
            DeployInformation["FreeGasPaymaster"]["owner"]
        ],
        salt,
    );


    CirclePaymaster = await deploy(
        contractAddress,
        DeployFactory,
        "FreeGasPaymaster",
        ["address", "address"],
        [
            DeployInformation["CirclePaymaster"]["verifyingSigner"],
            DeployInformation["CirclePaymaster"]["owner"]
        ],
        circleSalt,
    );
    console.log("CirclePaymaster address is:", CirclePaymaster.address);

    DefaultCallbackHandler = await deploy(
        contractAddress,
        DeployFactory,
        "contracts/wallet/handler/DefaultCallbackHandler.sol:DefaultCallbackHandler",
        [],
        [],
        salt,
    );


    SmartAccountV2 = await deploy(
        contractAddress,
        DeployFactory,
        "SmartAccountV2",
        ["address", "address", "address", "string", "string"],
        [
            EntryPointV06.address,
            DefaultCallbackHandler.address,
            Validations.address,
            DeployInformation["SmartAccountV2"]["name"],
            DeployInformation["SmartAccountV2"]["version"],
        ],
        salt,
    );

    AccountFactoryV2 = await deploy(
        contractAddress,
        DeployFactory,
        "AccountFactoryV2",
        [],
        [],
        salt,
    );

    AccountFactoryProxy = await deploy(
        contractAddress,
        DeployFactory,
        "AccountFactoryProxy",
        ["address", "address", "address"],
        [AccountFactoryV2.address, owner.address, SmartAccountV2.address],
        salt,
    );

}

async function deployHelperContract() {
    SimulateToken = await deploy(
        contractAddress,
        DeployFactory,
        "SimulateToken",
        ["address", "uint256"],
        [EntryPointV06.address, ethers.constants.MaxUint256],
        salt,
    );
}


async function setAccountFactoryProxyConfig() {

    AccountFactoryProxy = await ethers
        .getContractFactory("AccountFactoryV2")
        .then((f) => f.attach(AccountFactoryProxy.address));


    let tx = await AccountFactoryProxy.connect(owner)
        .setSafeSingleton(SmartAccountV2.address, true);

    await tx.wait();

    console.log("setAccountFactoryProxyConfig", tx.hash);
}


async function setValidationsConfig() {
    await Validations.connect(owner)
        .setWalletProxyFactoryWhitelist(AccountFactoryProxy.address)
        .then((tx) => tx.wait());

    const bundlers = DeployInformation["Validations"]["bundlers"];

    const allowed = new Array(bundlers.length).fill(true);

    const tx = await Validations.connect(owner).setBundlerOfficialWhitelistBatch(
        bundlers,
        allowed
    );

    await tx.wait();

    console.log("Batch setBundlerOfficialWhitelist completed.");
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

    if (chainId == 10 || chainId == 42161) {
        tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
            DeployInformation["USDC.e"][chainId]["address"],
            ethers.utils.parseUnits(
                DeployInformation["USDC.e"][chainId]["maxPrice"],
                Number(DeployInformation["USDC.e"][chainId]["decimal"]),
            ),
        );
        await tx.wait();
        console.log("setTokenPriceLimitMax USDC.e", tx.hash);

        tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMin(
            DeployInformation["USDC.e"][chainId]["address"],
            ethers.utils.parseUnits(
                DeployInformation["USDC.e"][chainId]["minPrice"],
                Number(DeployInformation["USDC.e"][chainId]["decimal"]),
            ),
        );
        await tx.wait();
        console.log("setTokenPriceLimitMin USDC.e", tx.hash);
    }


    tx = await TokenPaymaster.connect(owner).setTokenPriceLimitMax(
        SimulateToken.address,
        ethers.constants.MaxUint256,
    );
    await tx.wait();
    console.log("setTokenPriceLimitMax SimulateToken", tx.hash);
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
        EntryPointV06.address,
        true,
    );
    await tx.wait();
    console.log("setValidEntryPoint BundlerDepositHelper", tx.hash);
}

async function setTokenPaymasterEntryPointConfig() {
    let tx = await TokenPaymaster.connect(owner).addSupportedEntryPoint(EntryPointV06.address);

    await tx.wait();
    console.log("set TokenPaymaster ValidEntryPoint EntryPoint", tx.hash);
}



async function setFreeGasPaymasterWhiteListConfig() {
    let tx = await FreeGasPaymaster.connect(owner).addToWhitelist(
        DeployInformation["FreeGasPaymaster"]["whiteList"],
    );
    await tx.wait();
    console.log("addToWhitelist FreeGasPaymaster", tx.hash);
}


async function setFreeGasPaymasterEntryPointConfig() {
    let tx = await FreeGasPaymaster.connect(owner).addSupportedEntryPoint(EntryPointV06.address);

    await tx.wait();
    console.log("set FreeGasPaymaster ValidEntryPoint EntryPoint", tx.hash);
}


async function setFreeGasPaymasterConfig() {
    await setFreeGasPaymasterWhiteListConfig();
    await setFreeGasPaymasterEntryPointConfig();
}


async function setCirclePaymasterWhiteListConfig() {
    let tx = await CirclePaymaster.connect(owner).addToWhitelist(
        DeployInformation["CirclePaymaster"]["whiteList"],
    );
    await tx.wait();
    console.log("addToWhitelist CirclePaymaster", tx.hash);
}

async function setCirclePaymasterEntryPointConfig() {
    let tx = await CirclePaymaster.connect(owner).addSupportedEntryPoint(EntryPointV06.address);

    await tx.wait();
    console.log("set CirclePaymaster ValidEntryPoint EntryPoint", tx.hash);
}


async function setCirclePaymasterConfig() {
    await setCirclePaymasterWhiteListConfig();
    await setCirclePaymasterEntryPointConfig();
}


async function setTokenPaymasterConfig() {
    await setTokenPaymasterOracleConfig();
    await setTokenPaymasterPriceConfig();
    await setTokenPaymasterSwapHelperConfig();
    await setTokenPaymasterWhitListConfig();
    await setTokenPaymasterEntryPointConfig();
}


async function setPaymasterConfig() {
    await setTokenPaymasterConfig();
    await setFreeGasPaymasterConfig();
    await setCirclePaymasterConfig();
}

async function setAllConfig() {
    await setAccountFactoryProxyConfig()
    await setValidationsConfig();
    await setPaymasterConfig();
    await setBundlerDepositHelperConfig();
}

async function deployAllContract() {
    DeployFactory = await getDeployFactory();
    await deployCoreContract();
    await deployHelperContract();
}








async function main() {
    if ((await hre.ethers.provider.getNetwork()).chainId.toString() == 31337) {
        // ME = "0x794b93902449c524c3158f9e101204ecb2057f2e";
        // owner = await network.provider.request({
        //     method: "hardhat_impersonateAccount",
        //     params: [ME],
        // });

        // await network.provider.send("hardhat_setBalance", [
        //     ME,
        //     "0x1000000000000000000000000",
        // ]);

        // await network.provider.request({
        //     method: "hardhat_impersonateAccount",
        //     params: [ME],
        // });

        // owner = await ethers.getSigner(ME);
        owner = await ethers.getSigner();
        chainId = 43114;
    } else {
        owner = await ethers.getSigner();
        chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
    }


    salt = DeployInformation["salt"];
    circleSalt = DeployInformation["circleSalt"];

    console.log("ownerAddress", owner.address);
    console.log("chainID", chainId);

    await instantiateContracts();
    await deployAllContract();
    await setAllConfig();

    fs.writeFileSync(
        "ContractAddress.json",
        JSON.stringify(contractAddress, null, 2),
    );

}

main();


