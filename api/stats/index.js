/**
 * GET /api/stats
 * Returns platform-wide statistics.
 *
 * Query params:
 *   network - "base-mainnet" | "base-sepolia"
 */
const { getContract } = require("../lib/contract");
const { handleCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const network = req.query.network || "base-sepolia";
    const contract = getContract(network);

    const [creatorCount, proposalCount, donationCount] = await contract.getCounters();
    const feeRecipient = await contract.feeRecipient();
    const feeBps = await contract.platformFeeBps();

    // Aggregate stats across all creators
    let totalRaised = 0n;
    let totalDonors = new Set();
    let activeCreators = 0;

    for (let i = 1; i <= Number(creatorCount); i++) {
      const creator = await contract.creators(i);
      if (creator.isActive && creator.isVerified) {
        activeCreators++;
        totalRaised += creator.totalRaised;
      }
    }

    return res.status(200).json({
      totalCreators: Number(creatorCount),
      activeCreators,
      totalProposals: Number(proposalCount),
      totalDonations: Number(donationCount),
      totalRaised: totalRaised.toString(),
      totalRaisedFormatted: formatUsdc(totalRaised),
      platformFeeBps: Number(feeBps),
      platformFeePercent: Number(feeBps) / 100,
      feeRecipient,
      networks: ["base", "solana"],
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/stats]", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

function formatUsdc(amount) {
  return (Number(amount) / 1_000_000).toFixed(2);
}
