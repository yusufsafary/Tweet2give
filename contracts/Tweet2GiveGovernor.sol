// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Tweet2GiveGovernor
 * @notice Extended governance layer for Tweet2Give DAO features.
 *         Allows donors to collectively propose platform changes,
 *         fee adjustments, and creator status updates.
 * @dev Separate from the core contract to keep concerns distinct.
 */
contract Tweet2GiveGovernor is Ownable {

    // ─── STRUCTS ─────────────────────────────────────────────────────
    struct GovernanceProposal {
        uint256 id;
        string title;
        string description;
        ProposalType proposalType;
        bytes callData;           // encoded call for execution
        address target;           // contract to call
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        GovernanceStatus status;
        address proposedBy;
        uint256 createdAt;
    }

    enum ProposalType {
        FeeChange,        // 0 - change platform fee
        CreatorStatus,    // 1 - verify or deactivate creator
        PolicyChange,     // 2 - general policy/text proposal
        ContractUpgrade   // 3 - signal for contract upgrade
    }

    enum GovernanceStatus {
        Active,
        Passed,
        Rejected,
        Executed
    }

    // ─── STATE ───────────────────────────────────────────────────────
    uint256 public constant GOVERNANCE_PERIOD = 7 days;
    uint256 public constant MIN_QUORUM_BPS = 3000; // 30% minimum quorum

    address public coreContract;  // Tweet2Give main contract

    uint256 private _govProposalCounter;

    mapping(uint256 => GovernanceProposal) public govProposals;
    mapping(uint256 => mapping(address => bool)) public govVoted;
    mapping(address => bool) public isDaoMember; // registered donors/stakeholders
    uint256 public totalDaoMembers;

    // ─── EVENTS ──────────────────────────────────────────────────────
    event GovProposalCreated(uint256 indexed proposalId, string title, ProposalType pType, address by);
    event GovVoteCast(uint256 indexed proposalId, address indexed voter, bool support);
    event GovProposalFinalized(uint256 indexed proposalId, GovernanceStatus status);
    event DaoMemberAdded(address indexed member);

    // ─── ERRORS ──────────────────────────────────────────────────────
    error NotDaoMember(address caller);
    error AlreadyDaoMember(address member);
    error ProposalNotFound(uint256 proposalId);
    error AlreadyVoted(address voter, uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error VotingOpen(uint256 proposalId);
    error InvalidStatus(uint256 proposalId);

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────
    constructor(address _coreContract) Ownable(msg.sender) {
        coreContract = _coreContract;
    }

    // ─── DAO MEMBERSHIP ──────────────────────────────────────────────

    /**
     * @notice Add a DAO member (called by owner when donor threshold is met).
     */
    function addDaoMember(address member) external onlyOwner {
        if (isDaoMember[member]) revert AlreadyDaoMember(member);
        isDaoMember[member] = true;
        totalDaoMembers++;
        emit DaoMemberAdded(member);
    }

    /**
     * @notice Batch add DAO members.
     */
    function addDaoMembers(address[] calldata members) external onlyOwner {
        for (uint256 i = 0; i < members.length; i++) {
            if (!isDaoMember[members[i]]) {
                isDaoMember[members[i]] = true;
                totalDaoMembers++;
                emit DaoMemberAdded(members[i]);
            }
        }
    }

    // ─── GOVERNANCE PROPOSALS ────────────────────────────────────────

    /**
     * @notice Any DAO member can create a governance proposal.
     */
    function createGovProposal(
        string calldata title,
        string calldata description,
        ProposalType pType
    ) external returns (uint256 proposalId) {
        if (!isDaoMember[msg.sender]) revert NotDaoMember(msg.sender);

        _govProposalCounter++;
        proposalId = _govProposalCounter;

        govProposals[proposalId] = GovernanceProposal({
            id: proposalId,
            title: title,
            description: description,
            proposalType: pType,
            callData: "",
            target: address(0),
            yesVotes: 0,
            noVotes: 0,
            deadline: block.timestamp + GOVERNANCE_PERIOD,
            status: GovernanceStatus.Active,
            proposedBy: msg.sender,
            createdAt: block.timestamp
        });

        emit GovProposalCreated(proposalId, title, pType, msg.sender);
    }

    /**
     * @notice Vote on a governance proposal (one vote per DAO member).
     */
    function voteOnGovProposal(uint256 proposalId, bool support) external {
        if (!isDaoMember[msg.sender]) revert NotDaoMember(msg.sender);
        if (govProposals[proposalId].id == 0) revert ProposalNotFound(proposalId);
        if (govVoted[proposalId][msg.sender]) revert AlreadyVoted(msg.sender, proposalId);

        GovernanceProposal storage proposal = govProposals[proposalId];
        if (proposal.status != GovernanceStatus.Active) revert InvalidStatus(proposalId);
        if (block.timestamp > proposal.deadline) revert VotingClosed(proposalId);

        govVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.yesVotes++;
        } else {
            proposal.noVotes++;
        }

        emit GovVoteCast(proposalId, msg.sender, support);
    }

    /**
     * @notice Finalize a governance proposal after voting period.
     */
    function finalizeGovProposal(uint256 proposalId) external {
        if (govProposals[proposalId].id == 0) revert ProposalNotFound(proposalId);

        GovernanceProposal storage proposal = govProposals[proposalId];
        if (proposal.status != GovernanceStatus.Active) revert InvalidStatus(proposalId);
        if (block.timestamp <= proposal.deadline) revert VotingOpen(proposalId);

        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;
        uint256 quorum = (totalDaoMembers * MIN_QUORUM_BPS) / 10000;

        bool passed = totalVotes >= quorum &&
            proposal.yesVotes > proposal.noVotes;

        proposal.status = passed ? GovernanceStatus.Passed : GovernanceStatus.Rejected;

        emit GovProposalFinalized(proposalId, proposal.status);
    }

    /**
     * @notice Get all active proposal IDs.
     */
    function getActiveProposalCount() external view returns (uint256 count) {
        for (uint256 i = 1; i <= _govProposalCounter; i++) {
            if (govProposals[i].status == GovernanceStatus.Active) {
                count++;
            }
        }
    }
}
