/**
 * GET /api/health
 * Health check endpoint.
 */
const { handleCors } = require("./lib/cors");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  return res.status(200).json({
    status: "ok",
    service: "tweet2give-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || "development",
  });
};
