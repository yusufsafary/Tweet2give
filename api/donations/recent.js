/**
 * GET /api/donations/recent
 * Returns the most recent on-chain donations (reads DonationReceived events).
 *
 * Query params:
 *   network - "base-mainnet" | "base-sepolia"
 *   limit   - number of events (default: 10, max: 50)
 */
const { getContract, getProvider, CHAIN_CONFIG } = require("../lib/contract");
const { handleCors } = require("../lib/cors");
const { ethers } = require("ethers");
const Tweet2GiveABI = require("../../artifacts/contracts/Tweet2Give.sol/Tweet2Give.json");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const network = req.query.network || "base-sepolia";
    const limit = Math.min(parseInt(req.query.limit || "10"), 50);

    const config = CHAIN_CONFIG[network];
    if (!config?.contractAddress) {
      return res.status(400).json({ error: `Contract not configured for network: ${network}` });
    }

    const provider = getProvider(network);
    const contract = getContract(network, provider);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // last ~10k blocks

    const filter = contract.filters.DonationReceived();
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);

    const recent = events
      .slice(-limit)
      .reverse()
      .map((e) => ({
        donationId: Number(e.args.donationId),
        creatorId: Number(e.args.creatorId),
        donor: e.args.donor,
        donorXHandle: e.args.donorXHandle,
        amount: e.args.amount.toString(),
        amountFormatted: formatUsdc(e.args.amount),
        tweetId: e.args.tweetId,
        blockNumber: e.blockNumber,
        txHash: e.transactionHash,
      }));

    return res.status(200).json({ donations: recent, network });
  } catch (err) {
    console.error("[GET /api/donations/recent]", err);
    return res.status(500).json({ error: "Failed to fetch recent donations" });
  }
};

function formatUsdc(amount) {
  return (Number(amount) / 1_000_000).toFixed(2);
}
