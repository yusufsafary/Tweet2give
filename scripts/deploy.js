const { ethers, network } = require("hardhat");

/**
 * Deployment script for Tweet2Give contracts.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network base-sepolia
 *   npx hardhat run scripts/deploy.js --network base
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY    - Deployer wallet private key
 *   FEE_RECIPIENT           - Address to receive platform fees
 *   USDC_ADDRESS            - USDC token address (network-specific)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = network.config.chainId;

  console.log("=".repeat(60));
  console.log("Tweet2Give Deployment");
  console.log("=".repeat(60));
  console.log(`Network:   ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log("-".repeat(60));

  // ─── CONFIG PER NETWORK ───────────────────────────────────────────
  const configs = {
    // Base Sepolia testnet
    84532: {
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
      initialFeeBps: 0,  // 0% during demo
      description: "Base Sepolia (Testnet)",
    },
    // Base Mainnet
    8453: {
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      initialFeeBps: 0,  // 0% during demo phase
      description: "Base Mainnet",
    },
    // Hardhat local
    31337: {
      usdcAddress: process.env.LOCAL_USDC_ADDRESS || "",
      initialFeeBps: 0,
      description: "Hardhat Local",
    },
  };

  const config = configs[chainId];
  if (!config) {
    throw new Error(`No config for chainId ${chainId}`);
  }

  // Allow override via env
  const usdcAddress = process.env.USDC_ADDRESS || config.usdcAddress;
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const initialFeeBps = parseInt(process.env.INITIAL_FEE_BPS || config.initialFeeBps.toString());

  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS not configured for this network");
  }

  console.log(`Config:`);
  console.log(`  Network desc:    ${config.description}`);
  console.log(`  USDC:            ${usdcAddress}`);
  console.log(`  Fee recipient:   ${feeRecipient}`);
  console.log(`  Platform fee:    ${initialFeeBps / 100}%`);
  console.log("-".repeat(60));

  // ─── DEPLOY TWEET2GIVE ────────────────────────────────────────────
  console.log("\nDeploying Tweet2Give...");
  const Tweet2Give = await ethers.getContractFactory("Tweet2Give");
  const tweet2give = await Tweet2Give.deploy(usdcAddress, feeRecipient, initialFeeBps);
  await tweet2give.waitForDeployment();
  const tweet2giveAddress = await tweet2give.getAddress();
  console.log(`✓ Tweet2Give deployed:   ${tweet2giveAddress}`);

  // ─── DEPLOY GOVERNOR ─────────────────────────────────────────────
  console.log("\nDeploying Tweet2GiveGovernor...");
  const Governor = await ethers.getContractFactory("Tweet2GiveGovernor");
  const governor = await Governor.deploy(tweet2giveAddress);
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log(`✓ Governor deployed:     ${governorAddress}`);

  // ─── DEPLOY FACTORY ──────────────────────────────────────────────
  console.log("\nDeploying Tweet2GiveFactory...");
  const Factory = await ethers.getContractFactory("Tweet2GiveFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✓ Factory deployed:      ${factoryAddress}`);

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Tweet2Give:  ${tweet2giveAddress}`);
  console.log(`Governor:    ${governorAddress}`);
  console.log(`Factory:     ${factoryAddress}`);
  console.log("=".repeat(60));

  // ─── SAVE DEPLOYMENT INFO ─────────────────────────────────────────
  const fs = require("fs");
  const deploymentInfo = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      Tweet2Give: tweet2giveAddress,
      Governor: governorAddress,
      Factory: factoryAddress,
    },
    config: {
      usdcAddress,
      feeRecipient,
      initialFeeBps,
    },
  };

  const outputDir = "./deployments";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = `${outputDir}/${network.name}-${chainId}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✓ Deployment info saved to: ${outputPath}`);

  // ─── VERIFICATION HINTS ───────────────────────────────────────────
  if (chainId !== 31337) {
    console.log("\nTo verify on Basescan:");
    console.log(`npx hardhat verify --network ${network.name} ${tweet2giveAddress} "${usdcAddress}" "${feeRecipient}" ${initialFeeBps}`);
    console.log(`npx hardhat verify --network ${network.name} ${governorAddress} "${tweet2giveAddress}"`);
    console.log(`npx hardhat verify --network ${network.name} ${factoryAddress}`);
  }

  return { tweet2giveAddress, governorAddress, factoryAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
