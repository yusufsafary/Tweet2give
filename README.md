# Tweet2Give

> Fund Creators Who Matter — Decentralized crowdfunding via X (@bankrbot) on Base.

Tweet2Give allows donors to fund grassroots creators by posting a tweet. @bankrbot processes the USDC donation on-chain (Base), and donors vote to approve how the creator spends the funds.

---

## Architecture

```
tweet2give/
├── contracts/
│   ├── Tweet2Give.sol          # Core: donations, proposals, voting
│   ├── Tweet2GiveGovernor.sol  # DAO governance layer
│   ├── Tweet2GiveFactory.sol   # Multi-deployment factory
│   └── mocks/MockERC20.sol     # Test mock token
├── scripts/
│   ├── deploy.js               # Deploy all contracts
│   └── seed.js                 # Register demo creators
├── test/
│   └── Tweet2Give.test.js      # Full test suite
├── api/                        # Vercel serverless functions
│   ├── health.js               # GET /api/health
│   ├── stats/index.js          # GET /api/stats
│   ├── creators/index.js       # GET /api/creators
│   ├── creators/[handle].js    # GET /api/creators/:handle
│   ├── proposals/index.js      # GET /api/proposals
│   ├── vote/index.js           # GET|POST /api/vote
│   └── donations/recent.js     # GET /api/donations/recent
├── frontend/                   # Static frontend (index.html built from source)
├── deployments/                # Auto-generated deployment info (git-ignored)
├── hardhat.config.js
├── vercel.json
├── package.json
└── .env.example
```

---

## Smart Contract: Tweet2Give.sol

### Core Features

| Feature | Description |
|---|---|
| **Creator Registration** | Admin registers X-verified creators with wallet + handle |
| **USDC Donations** | Donors send USDC, tracked per-donor per-creator |
| **Withdrawal Proposals** | Creators submit proposals explaining fund use |
| **Quorum Voting** | >50% YES (by donation weight) releases funds |
| **Platform Fee** | Configurable (starts at 0% during demo phase) |
| **Pausable** | Emergency pause for security incidents |
| **Reentrancy Guard** | All state-changing functions are protected |

### Supported Networks

| Network | Chain ID | USDC Address |
|---|---|---|
| Base Mainnet | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.example .env

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to Base Sepolia (testnet)
npm run deploy:testnet

# Seed demo creators
npm run seed:testnet
```

---

## API Endpoints (Vercel Serverless)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Platform-wide statistics |
| GET | `/api/creators` | List verified creators |
| GET | `/api/creators/:handle` | Get creator by X handle |
| GET | `/api/proposals?status=Voting` | List withdrawal proposals |
| GET | `/api/vote?proposalId=1&voter=0x...` | Check vote eligibility |
| POST | `/api/vote` | Cast vote (admin/bot, requires x-api-key) |
| GET | `/api/donations/recent` | Recent on-chain donations |

---

## Donation Flow

1. Donor finds a creator on tweet2give.fun
2. Donor enters USDC amount and clicks "Post & Donate"
3. X opens with pre-filled tweet: `@bankrbot send 10 USDC to @creator_handle #Tweet2Give`
4. @bankrbot processes on-chain transfer (Base network, USDC)
5. Donor gains voting rights on that creator's withdrawal proposals

## Withdrawal Flow

1. Creator submits a `WithdrawalProposal` (title, description, USDC amount)
2. Proposal open for voting for **3 days**
3. Donors vote YES/NO (vote weight = their total donation amount)
4. If >50% of total donated amount votes YES → proposal passes
5. Anyone calls `executeProposal()` → USDC released to creator's wallet
6. If rejected → creator can revise and resubmit

---

## GitHub Secrets Required

For CI/CD to work, add these secrets in your GitHub repository settings:

| Secret | Description |
|---|---|
| `VERCEL_TOKEN` | Vercel deployment token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `DEPLOYER_PRIVATE_KEY` | Contract deployer wallet private key |
| `FEE_RECIPIENT` | Fee recipient wallet address |
| `BASESCAN_API_KEY` | Basescan API key for contract verification |
| `ADMIN_API_KEY` | Secret for backend API authentication |

---

## Security

- **ReentrancyGuard** on all fund-moving functions
- **Pausable** for emergency stops
- **SafeERC20** for safe token transfers
- **Custom errors** for gas-efficient reverts
- **Ownable** with strict access control
- 0% fee during demo (no incentive to exploit fee)

---

## License

MIT © 2025 Tweet2Give.fun — Built on Base & Solana
