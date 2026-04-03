/**
 * GET  /api/vote?proposalId=1&voter=0x...
 *   Check if an address can vote and whether they've voted.
 *
 * POST /api/vote
 *   Submit a vote (requires x-api-key, used by admin/bot backend).
 *   Body: { proposalId, voterAddress, support }
 *
 * NOTE: Direct on-chain voting from the frontend is recommended via
 *       ethers.js / wagmi in the browser. This API is for backend bot use.
 */
const { getContract, getSigner } = require("../lib/contract");
const { handleCors } = require("../lib/cors");
const { requireFields, validateAddress } = require("../lib/validate");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const network = req.query.network || "base-sepolia";

  // ─── GET: Check vote eligibility ─────────────────────────────────
  if (req.method === "GET") {
    const { proposalId, voter } = req.query;

    if (!proposalId || !voter) {
      return res.status(400).json({ error: "proposalId and voter are required" });
    }

    try {
      const voterAddr = validateAddress(voter);
      const contract = getContract(network);

      const [eligible, voted] = await contract.canVote(voterAddr, Number(proposalId));

      const proposal = await contract.proposals(Number(proposalId));
      const hasVoted = await contract.hasVoted(Number(proposalId), voterAddr);
      let choice = null;
      if (hasVoted) {
        choice = await contract.voteChoice(Number(proposalId), voterAddr);
      }

      return res.status(200).json({
        proposalId: Number(proposalId),
        voter: voterAddr,
        eligible,
        voted,
        choice: hasVoted ? (choice ? "YES" : "NO") : null,
        deadline: Number(proposal.deadline),
        isOpen: proposal.status === 0n && Date.now() / 1000 < Number(proposal.deadline),
      });
    } catch (err) {
      if (err.name === "ValidationError") {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: "Failed to check vote status" });
    }
  }

  // ─── POST: Cast vote (admin/bot only) ────────────────────────────
  if (req.method === "POST") {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { proposalId, support } = req.body;
      requireFields(req.body, ["proposalId", "support"]);

      const signer = getSigner(network);
      const contract = getContract(network, signer);

      const tx = await contract.castVote(Number(proposalId), Boolean(support));
      const receipt = await tx.wait();

      return res.status(200).json({
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (err) {
      if (err.name === "ValidationError") {
        return res.status(400).json({ error: err.message });
      }
      console.error("[POST /api/vote]", err);
      return res.status(500).json({ error: "Failed to cast vote" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
