const { ethers } = require("ethers");
const Tweet2GiveABI = require("../../artifacts/contracts/Tweet2Give.sol/Tweet2Give.json");

const CHAIN_CONFIG = {
  "base-mainnet": {
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    chainId: 8453,
    contractAddress: process.env.CONTRACT_ADDRESS_BASE,
  },
  "base-sepolia": {
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    chainId: 84532,
    contractAddress: process.env.CONTRACT_ADDRESS_BASE_SEPOLIA,
  },
};

function getProvider(network = "base-sepolia") {
  const config = CHAIN_CONFIG[network];
  if (!config) throw new Error(`Unknown network: ${network}`);
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

function getContract(network = "base-sepolia", signerOrProvider = null) {
  const config = CHAIN_CONFIG[network];
  if (!config?.contractAddress) {
    throw new Error(`Contract address not set for network: ${network}`);
  }
  const provider = signerOrProvider || getProvider(network);
  return new ethers.Contract(config.contractAddress, Tweet2GiveABI.abi, provider);
}

function getSigner(network = "base-sepolia") {
  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) throw new Error("ADMIN_PRIVATE_KEY not set");
  const provider = getProvider(network);
  return new ethers.Wallet(pk, provider);
}

module.exports = { getProvider, getContract, getSigner, CHAIN_CONFIG };
