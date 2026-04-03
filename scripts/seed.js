const { ethers, network } = require("hardhat");
const fs = require("fs");

/**
 * Seed script: Register demo creators on the deployed Tweet2Give contract.
 * Run after deploy.js.
 *
 * Usage:
 *   npx hardhat run scripts/seed.js --network base-sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = network.config.chainId;

  // Load deployment info
  const deploymentPath = `./deployments/${network.name}-${chainId}.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found at ${deploymentPath}. Run deploy.js first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tweet2giveAddress = deployment.contracts.Tweet2Give;

  console.log(`Connecting to Tweet2Give at: ${tweet2giveAddress}`);
  const Tweet2Give = await ethers.getContractFactory("Tweet2Give");
  const contract = Tweet2Give.attach(tweet2giveAddress);

  // Demo creators from the HTML file
  const creators = [
    {
      wallet: "0x1111111111111111111111111111111111111111",
      xHandle: "yuki_creates",
      displayName: "Yuki Tanaka",
      mission: "Documenting Okinawa's disappearing traditional crafts through film and photography.",
      location: "Okinawa, Japan",
    },
    {
      wallet: "0x2222222222222222222222222222222222222222",
      xHandle: "hana_fieldnotes",
      displayName: "Hana Kojima",
      mission: "Field ethnobotany notes from rural Aomori — preserving seed libraries and folk medicine.",
      location: "Aomori, Japan",
    },
    {
      wallet: "0x3333333333333333333333333333333333333333",
      xHandle: "zara_sound",
      displayName: "Zara Osei",
      mission: "Recording endangered oral traditions and music of the Ashanti diaspora in West Africa.",
      location: "Kumasi, Ghana",
    },
    {
      wallet: "0x4444444444444444444444444444444444444444",
      xHandle: "miguel_tierra",
      displayName: "Miguel Ramos",
      mission: "Community land rights education across Andean villages in Peru.",
      location: "Cusco, Peru",
    },
  ];

  for (const creator of creators) {
    try {
      console.log(`Registering @${creator.xHandle}...`);
      const tx = await contract.registerCreator(
        creator.wallet,
        creator.xHandle,
        creator.displayName,
        creator.mission,
        creator.location
      );
      await tx.wait();

      // Verify all creators in the seed
      const creatorId = await contract.handleToCreatorId(creator.xHandle);
      const verifyTx = await contract.verifyCreator(creatorId);
      await verifyTx.wait();

      console.log(`✓ @${creator.xHandle} registered and verified (ID: ${creatorId})`);
    } catch (err) {
      console.error(`✗ Failed for @${creator.xHandle}: ${err.message}`);
    }
  }

  console.log("\n✓ Seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
