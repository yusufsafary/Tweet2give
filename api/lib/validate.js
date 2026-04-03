/**
 * Input validation helpers for API endpoints.
 */

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === "");
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(", ")}`);
  }
}

function validateUsdcAmount(amount) {
  const parsed = BigInt(amount);
  if (parsed < 1_000_000n) {
    throw new ValidationError("Minimum donation is 1 USDC (1000000 in 6-decimal units)");
  }
  if (parsed > 1_000_000_000_000n) {
    throw new ValidationError("Donation amount exceeds maximum");
  }
  return parsed;
}

function validateXHandle(handle) {
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,50}$/.test(clean)) {
    throw new ValidationError("Invalid X handle format");
  }
  return clean;
}

function validateAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new ValidationError("Invalid Ethereum address");
  }
  return address.toLowerCase();
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

module.exports = { requireFields, validateUsdcAmount, validateXHandle, validateAddress, ValidationError };
