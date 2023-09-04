require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();

require("hardhat-contract-sizer");

/** @type import('hardhat/config').HardhatUserConfig */

const accounts =  process.env.PRIVATE_KEY ?   
  [process.env.PRIVATE_KEY] : 
  ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"]
module.exports = {
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },

  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.14",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },

  networks: {
    OKCMainnet: {
      url: "https://exchainrpc.okex.org",
      accounts,
      gas: 5000000,
    },
    BNBMainnet: {
      url: "https://bsc.publicnode.com",
      accounts,
      gas: 5000000,
    },
    AVAXMainnet: {
      url: "https://avalanche.blockpi.network/v1/rpc/public",
      accounts,
      gas: 5000000,
    },

    ETHMainnet: {
      url: "https://rpc.ankr.com/eth",
      accounts,
      gas: 5000000,
    },
    ARBMainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts,
      gas: 50000000,
    },
    OPMainnet: {
      url: "https://optimism.meowrpc.com",
      accounts,
      gas: 5000000,
    },
    PolygonMainnet: {
      url: "https://polygon.llamarpc.com",
      accounts,
      gas: 5000000,
      gasPrice: 240000000000,
    },
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 5000000,
      gasPrice: 100000000000,
      blockGasLimit: 2000000000,
    },
  },
};
