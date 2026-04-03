/**
 * GET /api/creators/[handle]
 * Returns a single creator profile by X handle.
 *
 * Path params:
 *   handle - X handle (with or without @)
 *
 * Query params:
 *   network - "base-mainnet" | "base-sepolia" (default: base-sepolia)
 */
const { getContract } = require("../lib/contract");
const { handleCors } = require("../lib/cors");
const { validateXHandle } = require("../lib/validate");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawHandle = req.query.handle;
    const handle = validateXHandle(rawHandle);
    const network = req.query.network || "base-sepolia";

    const contract = getContract(network);

    let creator;
    try {
      creator = await contract.getCreatorByHandle(handle);
    } catch {
      return res.status(404).json({ error: `Creator @${handle} not found` });
    }

    if (!creator.isActive) {
      return res.status(404).json({ error: `Creator @${handle} is not active` });
    }

    const creatorId = await contract.handleToCreatorId(handle);

    // Fetch creator's proposals
    const proposalIds = await contract.getCreatorProposals(creatorId);
    const proposals = [];

    for (const pid of proposalIds) {
      const proposal = await contract.proposals(pid);
      proposals.push(formatProposal(proposal, pid));
    }

    return res.status(200).json({
      id: Number(creatorId),
      wallet: creator.wallet,
      xHandle: creator.xHandle,
      displayName: creator.displayName,
      mission: creator.mission,
      location: creator.location,
      isVerified: creator.isVerified,
      totalRaised: creator.totalRaised.toString(),
      totalRaisedFormatted: formatUsdc(creator.totalRaised),
      lockedBalance: creator.lockedBalance.toString(),
      lockedBalanceFormatted: formatUsdc(creator.lockedBalance),
      donorCount: Number(creator.donorCount),
      createdAt: Number(creator.createdAt),
      proposals,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[GET /api/creators/[handle]]", err);
    return res.status(500).json({ error: "Failed to fetch creator" });
  }
};

function formatProposal(p, id) {
  const statusMap = ["Voting", "Passed", "Rejected", "Executed", "Cancelled"];
  return {
    id: Number(id),
    title: p.title,
    description: p.description,
    amount: p.amount.toString(),
    amountFormatted: formatUsdc(p.amount),
    yesVotes: p.yesVotes.toString(),
    noVotes: p.noVotes.toString(),
    deadline: Number(p.deadline),
    status: statusMap[Number(p.status)] || "Unknown",
    executed: p.executed,
    createdAt: Number(p.createdAt),
  };
}

function formatUsdc(amount) {
  return (Number(amount) / 1_000_000).toFixed(2);
}
