/**
 * CORS middleware helper for Vercel serverless functions.
 */
function setCorsHeaders(res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://tweet2give.fun,https://www.tweet2give.fun").split(",");

  res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function handleCors(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { setCorsHeaders, handleCors };
