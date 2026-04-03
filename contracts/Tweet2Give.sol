// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Tweet2Give
 * @notice Decentralized crowdfunding platform where donors fund creators
 *         and govern withdrawals via quorum voting.
 * @dev Supports USDC (ERC20) donations on Base (EVM).
 *      Donor-governed: withdrawals require >50% YES votes from active donors.
 *      Platform fee: configurable (starts at 0% during demo phase).
 */
contract Tweet2Give is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── CONSTANTS ───────────────────────────────────────────────────
    uint256 public constant VOTING_PERIOD = 3 days;
    uint256 public constant MIN_DONATION = 1e6;        // 1 USDC (6 decimals)
    uint256 public constant MAX_FEE_BPS = 1000;        // max 10%
    uint256 public constant QUORUM_THRESHOLD_BPS = 5000; // 50% in basis points

    // ─── STATE ───────────────────────────────────────────────────────
    IERC20 public immutable usdc;
    uint256 public platformFeeBps;    // fee in basis points (100 = 1%)
    address public feeRecipient;

    uint256 private _creatorCounter;
    uint256 private _proposalCounter;

    // ─── STRUCTS ─────────────────────────────────────────────────────
    struct Creator {
        uint256 id;
        address wallet;
        string xHandle;           // Twitter/X handle (without @)
        string displayName;
        string mission;
        string location;
        bool isVerified;
        bool isActive;
        uint256 totalRaised;      // cumulative USDC received (6 decimals)
        uint256 lockedBalance;    // USDC locked pending proposals
        uint256 donorCount;
        uint256 createdAt;
    }

    struct Donation {
        address donor;
        string donorXHandle;
        uint256 amount;           // USDC amount (6 decimals)
        string tweetId;           // X tweet ID as proof
        uint256 timestamp;
        uint256 creatorId;
    }

    struct WithdrawalProposal {
        uint256 id;
        uint256 creatorId;
        string title;
        string description;
        uint256 amount;           // USDC to withdraw (6 decimals)
        uint256 yesVotes;
        uint256 noVotes;
        uint256 totalEligibleVoters;
        uint256 deadline;         // unix timestamp
        ProposalStatus status;
        bool executed;
        address proposedBy;
        uint256 createdAt;
    }

    enum ProposalStatus {
        Voting,    // 0 - currently accepting votes
        Passed,    // 1 - quorum reached, awaiting execution
        Rejected,  // 2 - did not reach quorum
        Executed,  // 3 - funds released to creator
        Cancelled  // 4 - cancelled by creator
    }

    // ─── MAPPINGS ────────────────────────────────────────────────────
    // creatorId => Creator
    mapping(uint256 => Creator) public creators;

    // xHandle (lowercase) => creatorId (for lookup by handle)
    mapping(string => uint256) public handleToCreatorId;

    // wallet => creatorId
    mapping(address => uint256) public walletToCreatorId;

    // donorAddress => creatorId => donated amount
    mapping(address => mapping(uint256 => uint256)) public donorContributions;

    // donorAddress => creatorId => isDonor (has donated >= 1 USDC)
    mapping(address => mapping(uint256 => bool)) public isDonor;

    // proposalId => Proposal
    mapping(uint256 => WithdrawalProposal) public proposals;

    // proposalId => voter => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // proposalId => voter => vote (true = yes, false = no)
    mapping(uint256 => mapping(address => bool)) public voteChoice;

    // creatorId => list of proposalIds
    mapping(uint256 => uint256[]) public creatorProposals;

    // donor address => list of creatorIds they donated to
    mapping(address => uint256[]) public donorCreatorList;

    // all donation records (for indexing/events)
    uint256 private _donationCounter;
    mapping(uint256 => Donation) public donations;

    // ─── EVENTS ──────────────────────────────────────────────────────
    event CreatorRegistered(uint256 indexed creatorId, address indexed wallet, string xHandle);
    event CreatorVerified(uint256 indexed creatorId, string xHandle);
    event CreatorDeactivated(uint256 indexed creatorId);

    event DonationReceived(
        uint256 indexed donationId,
        uint256 indexed creatorId,
        address indexed donor,
        string donorXHandle,
        uint256 amount,
        string tweetId
    );

    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 indexed creatorId,
        string title,
        uint256 amount,
        uint256 deadline
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        uint256 indexed creatorId,
        uint256 amount
    );

    event ProposalRejected(uint256 indexed proposalId, uint256 creatorId);
    event ProposalCancelled(uint256 indexed proposalId);

    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeesCollected(address indexed recipient, uint256 amount);

    // ─── ERRORS ──────────────────────────────────────────────────────
    error CreatorNotFound(uint256 creatorId);
    error CreatorNotActive(uint256 creatorId);
    error CreatorNotVerified(uint256 creatorId);
    error HandleAlreadyRegistered(string handle);
    error WalletAlreadyRegistered(address wallet);
    error InsufficientDonation(uint256 sent, uint256 minimum);
    error NotADonor(address caller, uint256 creatorId);
    error ProposalNotFound(uint256 proposalId);
    error ProposalNotActive(uint256 proposalId);
    error ProposalExpired(uint256 proposalId);
    error AlreadyVoted(address voter, uint256 proposalId);
    error ProposalNotPassed(uint256 proposalId);
    error ProposalAlreadyExecuted(uint256 proposalId);
    error InsufficientContractBalance(uint256 required, uint256 available);
    error Unauthorized(address caller);
    error InvalidFee(uint256 feeBps);
    error InvalidAddress();
    error VotingStillOpen(uint256 proposalId, uint256 deadline);
    error InvalidAmount();

    // ─── MODIFIERS ───────────────────────────────────────────────────
    modifier onlyVerifiedCreator(uint256 creatorId) {
        Creator storage c = creators[creatorId];
        if (c.wallet == address(0)) revert CreatorNotFound(creatorId);
        if (!c.isActive) revert CreatorNotActive(creatorId);
        if (!c.isVerified) revert CreatorNotVerified(creatorId);
        if (c.wallet != msg.sender) revert Unauthorized(msg.sender);
        _;
    }

    modifier creatorExists(uint256 creatorId) {
        if (creators[creatorId].wallet == address(0)) revert CreatorNotFound(creatorId);
        _;
    }

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _feeRecipient,
        uint256 _initialFeeBps
    ) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAddress();
        if (_feeRecipient == address(0)) revert InvalidAddress();
        if (_initialFeeBps > MAX_FEE_BPS) revert InvalidFee(_initialFeeBps);

        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        platformFeeBps = _initialFeeBps;
    }

    // ════════════════════════════════════════════════════════════════
    //  CREATOR MANAGEMENT
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new creator. Called by platform admin after vetting.
     * @param wallet Creator's EVM wallet address (receives withdrawals)
     * @param xHandle Creator's X handle WITHOUT @ (lowercase)
     * @param displayName Display name
     * @param mission One-line mission statement
     * @param location Creator's location (optional, can be empty)
     */
    function registerCreator(
        address wallet,
        string calldata xHandle,
        string calldata displayName,
        string calldata mission,
        string calldata location
    ) external onlyOwner returns (uint256 creatorId) {
        if (wallet == address(0)) revert InvalidAddress();
        if (walletToCreatorId[wallet] != 0) revert WalletAlreadyRegistered(wallet);
        if (handleToCreatorId[xHandle] != 0) revert HandleAlreadyRegistered(xHandle);

        _creatorCounter++;
        creatorId = _creatorCounter;

        creators[creatorId] = Creator({
            id: creatorId,
            wallet: wallet,
            xHandle: xHandle,
            displayName: displayName,
            mission: mission,
            location: location,
            isVerified: false,
            isActive: true,
            totalRaised: 0,
            lockedBalance: 0,
            donorCount: 0,
            createdAt: block.timestamp
        });

        handleToCreatorId[xHandle] = creatorId;
        walletToCreatorId[wallet] = creatorId;

        emit CreatorRegistered(creatorId, wallet, xHandle);
    }

    /**
     * @notice Verify a creator (marks them as X Blue verified).
     *         Only verified creators can receive donations.
     */
    function verifyCreator(uint256 creatorId) external onlyOwner creatorExists(creatorId) {
        creators[creatorId].isVerified = true;
        emit CreatorVerified(creatorId, creators[creatorId].xHandle);
    }

    /**
     * @notice Deactivate a creator (stops donations, keeps history).
     */
    function deactivateCreator(uint256 creatorId) external onlyOwner creatorExists(creatorId) {
        creators[creatorId].isActive = false;
        emit CreatorDeactivated(creatorId);
    }

    /**
     * @notice Allow a verified creator to update their own mission/location.
     */
    function updateCreatorProfile(
        string calldata mission,
        string calldata location
    ) external {
        uint256 creatorId = walletToCreatorId[msg.sender];
        if (creatorId == 0) revert Unauthorized(msg.sender);
        Creator storage c = creators[creatorId];
        if (!c.isActive) revert CreatorNotActive(creatorId);
        c.mission = mission;
        c.location = location;
    }

    // ════════════════════════════════════════════════════════════════
    //  DONATIONS
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Donate USDC to a creator.
     * @param creatorId Target creator
     * @param amount USDC amount in smallest unit (6 decimals). Min 1 USDC = 1_000_000
     * @param donorXHandle Donor's X handle (used for attribution/voting rights)
     * @param tweetId X tweet ID that triggered the donation (empty if direct)
     */
    function donate(
        uint256 creatorId,
        uint256 amount,
        string calldata donorXHandle,
        string calldata tweetId
    ) external nonReentrant whenNotPaused creatorExists(creatorId) {
        Creator storage creator = creators[creatorId];
        if (!creator.isActive) revert CreatorNotActive(creatorId);
        if (!creator.isVerified) revert CreatorNotVerified(creatorId);
        if (amount < MIN_DONATION) revert InsufficientDonation(amount, MIN_DONATION);

        // Transfer USDC from donor to contract
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate platform fee
        uint256 fee = (amount * platformFeeBps) / 10000;
        uint256 netAmount = amount - fee;

        // Track donor
        bool isNewDonor = !isDonor[msg.sender][creatorId];
        if (isNewDonor) {
            isDonor[msg.sender][creatorId] = true;
            donorCreatorList[msg.sender].push(creatorId);
            creator.donorCount++;
        }

        donorContributions[msg.sender][creatorId] += netAmount;
        creator.totalRaised += netAmount;
        creator.lockedBalance += netAmount;

        // Record donation
        _donationCounter++;
        donations[_donationCounter] = Donation({
            donor: msg.sender,
            donorXHandle: donorXHandle,
            amount: netAmount,
            tweetId: tweetId,
            timestamp: block.timestamp,
            creatorId: creatorId
        });

        // Collect fee to recipient immediately
        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
            emit FeesCollected(feeRecipient, fee);
        }

        emit DonationReceived(_donationCounter, creatorId, msg.sender, donorXHandle, netAmount, tweetId);
    }

    // ════════════════════════════════════════════════════════════════
    //  WITHDRAWAL PROPOSALS
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Creator submits a withdrawal proposal for donor vote.
     * @param title Short title of the proposal
     * @param description Full description of how funds will be used
     * @param amount USDC to withdraw (must be <= lockedBalance)
     */
    function createProposal(
        string calldata title,
        string calldata description,
        uint256 amount
    ) external whenNotPaused returns (uint256 proposalId) {
        uint256 creatorId = walletToCreatorId[msg.sender];
        if (creatorId == 0) revert Unauthorized(msg.sender);

        Creator storage creator = creators[creatorId];
        if (!creator.isActive) revert CreatorNotActive(creatorId);
        if (!creator.isVerified) revert CreatorNotVerified(creatorId);
        if (amount == 0 || amount > creator.lockedBalance) revert InvalidAmount();

        _proposalCounter++;
        proposalId = _proposalCounter;

        proposals[proposalId] = WithdrawalProposal({
            id: proposalId,
            creatorId: creatorId,
            title: title,
            description: description,
            amount: amount,
            yesVotes: 0,
            noVotes: 0,
            totalEligibleVoters: creator.donorCount,
            deadline: block.timestamp + VOTING_PERIOD,
            status: ProposalStatus.Voting,
            executed: false,
            proposedBy: msg.sender,
            createdAt: block.timestamp
        });

        creatorProposals[creatorId].push(proposalId);

        emit ProposalCreated(proposalId, creatorId, title, amount, proposals[proposalId].deadline);
    }

    /**
     * @notice A donor votes YES or NO on a withdrawal proposal.
     * @param proposalId Target proposal
     * @param support true = YES, false = NO
     */
    function castVote(uint256 proposalId, bool support) external nonReentrant {
        if (proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);

        WithdrawalProposal storage proposal = proposals[proposalId];

        if (proposal.status != ProposalStatus.Voting) revert ProposalNotActive(proposalId);
        if (block.timestamp > proposal.deadline) revert ProposalExpired(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(msg.sender, proposalId);

        uint256 creatorId = proposal.creatorId;
        if (!isDonor[msg.sender][creatorId]) revert NotADonor(msg.sender, creatorId);

        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender] = support;

        uint256 weight = donorContributions[msg.sender][creatorId]; // vote weight = donation amount

        if (support) {
            proposal.yesVotes += weight;
        } else {
            proposal.noVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    /**
     * @notice Finalize a proposal after voting period ends.
     *         Anyone can call this — gas is incentivized for the creator.
     * @param proposalId Target proposal to finalize
     */
    function finalizeProposal(uint256 proposalId) external nonReentrant {
        if (proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);

        WithdrawalProposal storage proposal = proposals[proposalId];

        if (proposal.status != ProposalStatus.Voting) revert ProposalNotActive(proposalId);
        if (block.timestamp <= proposal.deadline) revert VotingStillOpen(proposalId, proposal.deadline);

        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;

        // Check quorum: >50% of total donated amount votes YES
        bool passed = totalVotes > 0 &&
            (proposal.yesVotes * 10000) / totalVotes > QUORUM_THRESHOLD_BPS;

        if (passed) {
            proposal.status = ProposalStatus.Passed;
        } else {
            proposal.status = ProposalStatus.Rejected;
            emit ProposalRejected(proposalId, proposal.creatorId);
        }
    }

    /**
     * @notice Execute a passed proposal — releases funds to creator wallet.
     * @param proposalId Passed proposal to execute
     */
    function executeProposal(uint256 proposalId) external nonReentrant whenNotPaused {
        if (proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);

        WithdrawalProposal storage proposal = proposals[proposalId];

        if (proposal.status != ProposalStatus.Passed) revert ProposalNotPassed(proposalId);
        if (proposal.executed) revert ProposalAlreadyExecuted(proposalId);

        uint256 creatorId = proposal.creatorId;
        Creator storage creator = creators[creatorId];

        uint256 amount = proposal.amount;
        if (amount > creator.lockedBalance) revert InsufficientContractBalance(amount, creator.lockedBalance);

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;
        creator.lockedBalance -= amount;

        usdc.safeTransfer(creator.wallet, amount);

        emit ProposalExecuted(proposalId, creatorId, amount);
    }

    /**
     * @notice Creator cancels their own pending proposal.
     * @param proposalId Active proposal to cancel
     */
    function cancelProposal(uint256 proposalId) external {
        if (proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);

        WithdrawalProposal storage proposal = proposals[proposalId];

        uint256 creatorId = walletToCreatorId[msg.sender];
        if (proposal.creatorId != creatorId) revert Unauthorized(msg.sender);
        if (proposal.status != ProposalStatus.Voting) revert ProposalNotActive(proposalId);

        proposal.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId);
    }

    // ════════════════════════════════════════════════════════════════
    //  PLATFORM ADMIN
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Update platform fee (max 10%).
     */
    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee(newFeeBps);
        emit PlatformFeeUpdated(platformFeeBps, newFeeBps);
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Update fee recipient address.
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /**
     * @notice Pause all donations and proposal execution.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume operations.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency: recover ERC20 tokens accidentally sent to contract.
     *         Cannot recover USDC (that belongs to creators/donors).
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(usdc), "Cannot recover USDC");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Get a creator by their X handle.
     */
    function getCreatorByHandle(string calldata xHandle) external view returns (Creator memory) {
        uint256 id = handleToCreatorId[xHandle];
        if (id == 0) revert CreatorNotFound(0);
        return creators[id];
    }

    /**
     * @notice Get all proposal IDs for a creator.
     */
    function getCreatorProposals(uint256 creatorId) external view returns (uint256[] memory) {
        return creatorProposals[creatorId];
    }

    /**
     * @notice Get all creator IDs a donor has contributed to.
     */
    function getDonorCreators(address donor) external view returns (uint256[] memory) {
        return donorCreatorList[donor];
    }

    /**
     * @notice Check if an address can vote on a proposal.
     */
    function canVote(address voter, uint256 proposalId) external view returns (bool eligible, bool voted) {
        if (proposals[proposalId].id == 0) return (false, false);
        WithdrawalProposal storage proposal = proposals[proposalId];
        eligible = isDonor[voter][proposal.creatorId] && block.timestamp <= proposal.deadline;
        voted = hasVoted[proposalId][voter];
    }

    /**
     * @notice Get current proposal status details.
     */
    function getProposalStatus(uint256 proposalId) external view
        returns (
            ProposalStatus status,
            uint256 yesVotes,
            uint256 noVotes,
            uint256 deadline,
            bool isActive
        )
    {
        if (proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);
        WithdrawalProposal storage p = proposals[proposalId];
        return (
            p.status,
            p.yesVotes,
            p.noVotes,
            p.deadline,
            p.status == ProposalStatus.Voting && block.timestamp <= p.deadline
        );
    }

    /**
     * @notice Get total number of creators, proposals, and donations.
     */
    function getCounters() external view returns (uint256 creatorCount, uint256 proposalCount, uint256 donationCount) {
        return (_creatorCounter, _proposalCounter, _donationCounter);
    }
}
