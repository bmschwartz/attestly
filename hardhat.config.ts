import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

const config = defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    baseSepolia: {
      type: "http",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      chainId: 84532,
      // Admin wallet first (used by deploy scripts), relayer wallet second
      accounts: [
        configVariable("ADMIN_PRIVATE_KEY"),
        configVariable("RELAYER_PRIVATE_KEY"),
      ],
    },
    base: {
      type: "http",
      url: configVariable("BASE_RPC_URL"),
      chainId: 8453,
      accounts: [
        configVariable("ADMIN_PRIVATE_KEY"),
        configVariable("RELAYER_PRIVATE_KEY"),
      ],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("BASESCAN_API_KEY"),
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
});

export default config;
