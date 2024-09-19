import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "@typechain/hardhat";
import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

import "hardhat-contract-sizer";

/** @type import('hardhat/config').HardhatUserConfig */

dotenv.config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [""];
const config: HardhatUserConfig = {
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
    eth: {
      url: "https://rpc.ankr.com/eth",
      accounts,
     // gas: 3000000,
    },
    ARBMainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts,
      gas: 50000000,
    },
    OPMainnet: {
      url: "https://endpoints.omniatech.io/v1/op/mainnet/public",
      accounts,
      gas: 5000000,
    },
    LineaMainnet: {
      url: "https://1rpc.io/linea",
      accounts,
      gas: 5000000,
    },
    PolygonMainnet: {
      url: "https://rpc-mainnet.matic.quiknode.pro",
      accounts,
      gas: 5000000,
      gasPrice: 240000000000,
    },
    PolygonMainnet: {
      url: "https://rpc-mainnet.matic.quiknode.pro",
      accounts,
      gas: 5000000,
      gasPrice: 240000000000,
    },
    local: {
      url: "http://127.0.0.1:8545/",
      accounts,
      gas: 5000000,
      gasPrice: 240000000000,
    },
    hardhat: {
      allowUnlimitedContractSize: true,
      forking: {
        // url: "https://rpc.ankr.com/eth", //ETH
        // url: "https://1rpc.io/avax/c" //AVAX
        // url: "https://1rpc.io/linea" //Linea
        // url: "https://mainnet.optimism.io",//OP
        // url: "https://arb1.arbitrum.io/rpc" //ARB
        // url: "https://rpc-mainnet.matic.quiknode.pro", //Polygon
        // url: "https://bsc-dataseed4.binance.org", //BNB
        url: "https://1rpc.io/linea" //Linea
      },
      gas: 5000000,
      gasPrice: 1000000000000,
      blockGasLimit: 2000000000,
    },
  },
  typechain: {
    outDir: "types",
  },
  etherscan: {
        apiKey: "",
        customChains: [
            {
                network: "ETH",
                chainId: 1,
                urls: {
                    apiURL: "https://www.oklink.com/api/explorer/v1/contract/verify/async/api/ETH",
                    browserURL: "https://www.oklink.com/cn/ETH"
                }
            }
        ]
    }
};

export default config;
