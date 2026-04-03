/**
 * GET /api/creators
 * Returns list of registered and verified creators.
 *
 * Query params:
 *   network  - "base-mainnet" | "base-sepolia" (default: base-sepolia)
 *   limit    - number of creators to return (default: 20, max: 100)
 *   offset   - pagination offset (default: 0)
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
    const limit = Math.min(parseInt(req.query.limit || "20"), 100);
    const offset = parseInt(req.query.offset || "0");

    const contract = getContract(network);
    const [creatorCount] = await contract.getCounters();

    const creators = [];

    for (let i = 1 + offset; i <= Number(creatorCount) && creators.length < limit; i++) {
      const creator = await contract.creators(i);
      if (creator.isActive && creator.isVerified) {
        creators.push(formatCreator(creator, i));
      }
    }

    return res.status(200).json({
      creators,
      total: Number(creatorCount),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[GET /api/creators]", err);
    return res.status(500).json({ error: "Failed to fetch creators" });
  }
};

function formatCreator(c, id) {
  return {
    id: Number(id),
    wallet: c.wallet,
    xHandle: c.xHandle,
    displayName: c.displayName,
    mission: c.mission,
    location: c.location,
    isVerified: c.isVerified,
    totalRaised: c.totalRaised.toString(),        // USDC in 6 decimals
    totalRaisedFormatted: formatUsdc(c.totalRaised),
    lockedBalance: c.lockedBalance.toString(),
    donorCount: Number(c.donorCount),
    createdAt: Number(c.createdAt),
  };
}

function formatUsdc(amount) {
  return (Number(amount) / 1_000_000).toFixed(2);
}
