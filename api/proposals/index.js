/**
 * GET /api/proposals
 * Returns all active (Voting status) withdrawal proposals.
 *
 * Query params:
 *   network  - "base-mainnet" | "base-sepolia"
 *   status   - "Voting" | "Passed" | "Rejected" | "Executed" | "Cancelled" | "all"
 */
const { getContract } = require("../lib/contract");
const { handleCors } = require("../lib/cors");

const STATUS_MAP = {
  Voting: 0,
  Passed: 1,
  Rejected: 2,
  Executed: 3,
  Cancelled: 4,
};

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const network = req.query.network || "base-sepolia";
    const filterStatus = req.query.status || "Voting";

    const contract = getContract(network);
    const [, proposalCount] = await contract.getCounters();

    const proposals = [];
    const now = Math.floor(Date.now() / 1000);

    for (let i = 1; i <= Number(proposalCount); i++) {
      const proposal = await contract.proposals(i);
      const statusNum = Number(proposal.status);

      if (filterStatus !== "all") {
        const targetStatus = STATUS_MAP[filterStatus];
        if (targetStatus === undefined || statusNum !== targetStatus) continue;
      }

      const creatorId = Number(proposal.creatorId);
      const creator = await contract.creators(creatorId);

      const totalVotes = proposal.yesVotes + proposal.noVotes;
      const yesPercent = totalVotes > 0n
        ? Number((proposal.yesVotes * 10000n) / totalVotes) / 100
        : 0;

      proposals.push({
        id: i,
        creatorId,
        creatorHandle: creator.xHandle,
        creatorDisplayName: creator.displayName,
        title: proposal.title,
        description: proposal.description,
        amount: proposal.amount.toString(),
        amountFormatted: formatUsdc(proposal.amount),
        yesVotes: proposal.yesVotes.toString(),
        noVotes: proposal.noVotes.toString(),
        yesPercent: Math.round(yesPercent * 100) / 100,
        totalEligibleVoters: Number(proposal.totalEligibleVoters),
        deadline: Number(proposal.deadline),
        isExpired: now > Number(proposal.deadline),
        status: Object.keys(STATUS_MAP).find(k => STATUS_MAP[k] === statusNum) || "Unknown",
        executed: proposal.executed,
        createdAt: Number(proposal.createdAt),
      });
    }

    return res.status(200).json({
      proposals,
      total: proposals.length,
    });
  } catch (err) {
    console.error("[GET /api/proposals]", err);
    return res.status(500).json({ error: "Failed to fetch proposals" });
  }
};

function formatUsdc(amount) {
  return (Number(amount) / 1_000_000).toFixed(2);
}
