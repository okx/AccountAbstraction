const fs = require("fs");
const { ethers, network } = require("hardhat");

const TestingEnvironmentInformation = JSON.parse(fs.readFileSync("TestingEnvironmentInformation.json"));

async function instantiateContracts() {
    const contractInstances = {}; // 用于存储合约实例的对象

    for (const contractName in TestingEnvironmentInformation.ContractOnChain) {
        const contractInfo = TestingEnvironmentInformation.ContractOnChain[contractName];

        const contractFactory = await ethers
            .getContractFactory(contractInfo.ContractPath);

        const contractInstance = await contractFactory.attach(contractInfo.ContractAddress);

        contractInstances[contractName] = contractInstance;

        console.log(`${contractName} ${contractInstance.address}`);
    }


    for (const contractName in TestingEnvironmentInformation.ContractSetNewCode) {
        const contractInfo = TestingEnvironmentInformation.ContractSetNewCode[contractName];

        const contractFactory = await ethers
            .getContractFactory(contractInfo.ContractPath);

        const contractReDeploy = await contractFactory.deploy();

        const contractInstance = await contractFactory.attach(contractInfo.ContractAddress);

        await network.provider.send("hardhat_setCode", [
            contractInstance.address,
            await ethers.provider.getCode(contractReDeploy.address)
        ]);

        contractInstances[contractName] = contractInstance;

        console.log(`${contractName} ${contractInstance.address}`);
    }



    return contractInstances;
}


async function createTestingEnvironment() {
    let bundler, contractInstances

    BUNDLERADDRESS = TestingEnvironmentInformation["bundler"];

    await network.provider.send("hardhat_setBalance", [
        TestingEnvironmentInformation["bundler"],
        "0x1000000000000000000000000000",
    ]);

    bundler = await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [BUNDLERADDRESS],
    });

    bundler = await ethers.getSigner(BUNDLERADDRESS);

    contractInstances = await instantiateContracts();

    return { bundler: bundler, contractInstances: contractInstances }
}



module.exports = {
    createTestingEnvironment
};


