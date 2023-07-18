require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();

require("hardhat-contract-sizer");

/** @type import('hardhat/config').HardhatUserConfig */

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
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },
    BNBMainnet: {
      url: "https://bsc.publicnode.com",
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },
    AVAXMainnet: {
      url: "https://avalanche.blockpi.network/v1/rpc/public",
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },

    ETHMainnet: {
      url: "https://rpc.ankr.com/eth",
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },
    ARBMainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY],
      gas: 30000000,
    },
    OPMainnet: {
      url: "https://optimism.meowrpc.com",
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },
    PolygonMainnet: {
      url: "https://polygon.llamarpc.com",
      accounts: [process.env.PRIVATE_KEY],
      gas: 5000000,
    },
    hardhat: {
      forking: {
        allowUnlimitedContractSize: true,
        // url: "https://rpc.ankr.com/eth", //ETH
        url: "http://35.72.176.238:26659/"//OKC
        // url: "https://avalanche.public-rpc.com" //AVAX
        // url: "https://mainnet.optimism.io",//OP
        // url: "https://arb1.arbitrum.io/rpc" //ARB
        // url: "https://rpc-mainnet.matic.quiknode.pro", //Polygon
        // url: "https://bsc-dataseed4.binance.org", //BNB
      },
      allowUnlimitedContractSize: true,
      gas: 5000000,
      gasPrice: 100000000000,
      blockGasLimit: 2000000000,
    },
  },

};
