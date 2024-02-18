const { ethers, network } = require("hardhat");
require("dotenv").config();

let contractAddress = {},
    salt,
    owner,
    DeployFactory,
    SmartAccountV2,
    errorHotFixAddress,
    AccountFactoryProxy;

const DeployInformation = {
    DeployFactory: "0xFaC897544659Fb136C064d5428947f5BC9cC1Fa2",
    salt: "0x0000000000000000000000000000000000000000000000000000000000000003",
    SmartAccountV2: {
        entryPoint: "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
        defaultCallbackHandler: "0xA0be66C8d60A3ca53E83b5f376C6259b8de02586",
        validations: "0x228E505D1F21948968fB52794ea823f65053A294",
        name: "SA",
        version: "2.0.1",
    },
    AccountFactoryProxy: {
        address: "0x22fF1Dc5998258Faa1Ea45a776B57484f8Ab80A2"
    }
}

async function getDeployFactory() {
    DeployFactory = await ethers
        .getContractFactory("DeployFactory")
        .then((f) =>
            f.attach(
                DeployInformation["DeployFactory"],
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

async function deployAllContract() {
    DeployFactory = await getDeployFactory();

    SmartAccountV2 = await deploy(
        contractAddress,
        DeployFactory,
        "SmartAccountV2",
        ["address", "address", "address", "string", "string"],
        [
            DeployInformation["SmartAccountV2"]["entryPoint"],
            DeployInformation["SmartAccountV2"]["defaultCallbackHandler"],
            DeployInformation["SmartAccountV2"]["validations"],
            DeployInformation["SmartAccountV2"]["name"],
            DeployInformation["SmartAccountV2"]["version"],
        ],
        salt
    );
}

async function setAllConfig() {
    AccountFactoryProxy = await ethers
        .getContractFactory("AccountFactoryV2")
        .then((f) => f.attach(DeployInformation["AccountFactoryProxy"]["address"]));
    /// set new singleton
    tx = await AccountFactoryProxy.setSafeSingleton(SmartAccountV2.address, true)
    await tx.wait();
    console.log("AccountFactoryProxy setSafeSingleton", tx.hash);

    let hasSet = await AccountFactoryProxy.safeSingleton(SmartAccountV2.address);
    console.log(hasSet);

    let isSingle = await AccountFactoryProxy.safeSingleton(errorHotFixAddress);
    console.log("last hotfix singleton is:",errorHotFixAddress);

    if(isSingle) {
        let cancleTx = await AccountFactoryProxy.setSafeSingleton(errorHotFixAddress, false);
        await cancleTx.wait();
        console.log("Cancle last hotfix singleton:", cancleTx.hash);
    }
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


        owner = await ethers.getSigner();
        await network.provider.send("hardhat_setBalance", [
            owner.address,
            "0x1000000000000000000000000",
        ]);
    } else {
        owner = await ethers.getSigner();
    }
    salt = DeployInformation["salt"];
    console.log("ownerAddress", owner.address);
    console.log("salt", salt);
    errorHotFixAddress = "0x9f73ECda4e7336FD854b8eE737E7753e45B0a6A0";

    await deployAllContract();
    await setAllConfig();
}

main();
