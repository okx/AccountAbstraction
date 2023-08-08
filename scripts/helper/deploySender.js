const fs = require("fs");
let { ethers } = require("hardhat");
const Utils = require("../Utils.js");

// Define the global variables
let owner,
  sender,
  EntryPoint,
  SmartAccount,
  SmartAccountProxyFactory;

async function instantiateContracts() {
  // Read the contents of the JSON file
  let data = fs.readFileSync("ContractAddress.json");

  // Parse the JSON content into a JavaScript object
  let addresses = JSON.parse(data);

  // Instantiate each contract with its corresponding factory
  EntryPoint = await ethers
    .getContractFactory("contracts/core/EntryPoint.sol:EntryPoint")
    .then((f) => f.attach(addresses["contracts/core/EntryPoint.sol:EntryPoint"]));
  SmartAccount = await ethers
    .getContractFactory("SmartAccount")
    .then((f) => f.attach(addresses["SmartAccount"]));
  SmartAccountProxyFactory = await ethers
    .getContractFactory("SmartAccountProxyFactory")
    .then((f) => f.attach(addresses["SmartAccountProxyFactory"]));
}

async function createAA() {
  owner = await ethers.getSigner();

  sender = await Utils.generateAccount({
    owner: owner,
    bundler: owner,
    EntryPoint: EntryPoint,
    SmartAccount: SmartAccount,
    SmartAccountProxyFactory: SmartAccountProxyFactory,
    random: 112121,
  });

  const code = await ethers.provider.getCode(sender);

  if (code !== "0x") {
    console.log("AA create success! " + sender);
    try {
      let data = await fs.promises.readFile('ContractAddress.json', 'utf-8');
      let contractAddress = JSON.parse(data);

      contractAddress.sender = sender;

      await fs.promises.writeFile("ContractAddress.json", JSON.stringify(contractAddress, null, 2));
      console.log("Successfully written sender to ContractAddress.json");

    } catch (error) {
      console.error("Error while updating ContractAddress.json:", error);
    }
  } else {
    console.log("AA create failed ");
    process.exit(1);
  }
}

async function main() {
  await instantiateContracts();

  await createAA();

}

main();

module.exports = {
  createAA
};
