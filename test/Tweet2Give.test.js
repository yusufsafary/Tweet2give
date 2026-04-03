const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC_DECIMALS = 6;
const ONE_USDC = ethers.parseUnits("1", USDC_DECIMALS);
const TEN_USDC = ethers.parseUnits("10", USDC_DECIMALS);
const HUNDRED_USDC = ethers.parseUnits("100", USDC_DECIMALS);

describe("Tweet2Give", function () {
  let usdc, tweet2give;
  let owner, feeRecipient, creator1, creator2, donor1, donor2, donor3, other;

  beforeEach(async function () {
    [owner, feeRecipient, creator1, creator2, donor1, donor2, donor3, other] =
      await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Mint USDC to donors
    await usdc.mint(donor1.address, HUNDRED_USDC * 10n);
    await usdc.mint(donor2.address, HUNDRED_USDC * 10n);
    await usdc.mint(donor3.address, HUNDRED_USDC * 10n);

    // Deploy Tweet2Give (0% fee during demo)
    const Tweet2Give = await ethers.getContractFactory("Tweet2Give");
    tweet2give = await Tweet2Give.deploy(
      await usdc.getAddress(),
      feeRecipient.address,
      0
    );

    // Approve contract to spend USDC
    await usdc.connect(donor1).approve(await tweet2give.getAddress(), ethers.MaxUint256);
    await usdc.connect(donor2).approve(await tweet2give.getAddress(), ethers.MaxUint256);
    await usdc.connect(donor3).approve(await tweet2give.getAddress(), ethers.MaxUint256);
  });

  // ─── HELPER ───────────────────────────────────────────────────────
  async function registerAndVerifyCreator(wallet, handle, displayName = "Test Creator") {
    await tweet2give.registerCreator(
      wallet,
      handle,
      displayName,
      "Test mission statement",
      "Test City"
    );
    const creatorId = await tweet2give.handleToCreatorId(handle);
    await tweet2give.verifyCreator(creatorId);
    return creatorId;
  }

  // ─── REGISTRATION ─────────────────────────────────────────────────
  describe("Creator Registration", function () {
    it("registers a creator successfully", async function () {
      await tweet2give.registerCreator(
        creator1.address, "yuki_creates", "Yuki Tanaka", "Documenting traditional crafts", "Okinawa"
      );

      const creatorId = await tweet2give.handleToCreatorId("yuki_creates");
      expect(creatorId).to.equal(1);

      const creator = await tweet2give.creators(creatorId);
      expect(creator.xHandle).to.equal("yuki_creates");
      expect(creator.isVerified).to.equal(false);
      expect(creator.isActive).to.equal(true);
    });

    it("reverts if wallet already registered", async function () {
      await tweet2give.registerCreator(creator1.address, "yuki_creates", "Yuki", "Mission", "Loc");
      await expect(
        tweet2give.registerCreator(creator1.address, "other_handle", "Other", "Mission", "Loc")
      ).to.be.revertedWithCustomError(tweet2give, "WalletAlreadyRegistered");
    });

    it("reverts if handle already registered", async function () {
      await tweet2give.registerCreator(creator1.address, "yuki_creates", "Yuki", "Mission", "Loc");
      await expect(
        tweet2give.registerCreator(creator2.address, "yuki_creates", "Yuki2", "Mission", "Loc")
      ).to.be.revertedWithCustomError(tweet2give, "HandleAlreadyRegistered");
    });

    it("only owner can register creators", async function () {
      await expect(
        tweet2give.connect(other).registerCreator(creator1.address, "handle", "Name", "Mission", "Loc")
      ).to.be.reverted;
    });

    it("verifies a creator", async function () {
      await tweet2give.registerCreator(creator1.address, "yuki_creates", "Yuki", "Mission", "Okinawa");
      const creatorId = await tweet2give.handleToCreatorId("yuki_creates");
      await tweet2give.verifyCreator(creatorId);

      const creator = await tweet2give.creators(creatorId);
      expect(creator.isVerified).to.equal(true);
    });
  });

  // ─── DONATIONS ────────────────────────────────────────────────────
  describe("Donations", function () {
    let creatorId;

    beforeEach(async function () {
      creatorId = await registerAndVerifyCreator(creator1.address, "yuki_creates");
    });

    it("accepts a valid donation", async function () {
      await tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "alex_web3", "tweet123");

      const creator = await tweet2give.creators(creatorId);
      expect(creator.totalRaised).to.equal(TEN_USDC);
      expect(creator.lockedBalance).to.equal(TEN_USDC);
      expect(creator.donorCount).to.equal(1);
    });

    it("tracks donor contributions correctly", async function () {
      await tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet1");
      await tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet2");

      const contribution = await tweet2give.donorContributions(donor1.address, creatorId);
      expect(contribution).to.equal(TEN_USDC * 2n);

      // Should still be 1 donor (not 2)
      const creator = await tweet2give.creators(creatorId);
      expect(creator.donorCount).to.equal(1);
    });

    it("multiple donors counted correctly", async function () {
      await tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet1");
      await tweet2give.connect(donor2).donate(creatorId, TEN_USDC, "donor2", "tweet2");

      const creator = await tweet2give.creators(creatorId);
      expect(creator.donorCount).to.equal(2);
    });

    it("reverts if below minimum donation", async function () {
      const tooLittle = ONE_USDC - 1n;
      await expect(
        tweet2give.connect(donor1).donate(creatorId, tooLittle, "donor1", "tweet1")
      ).to.be.revertedWithCustomError(tweet2give, "InsufficientDonation");
    });

    it("reverts if creator not verified", async function () {
      await tweet2give.registerCreator(creator2.address, "unverified_creator", "Name", "Mission", "Loc");
      const unverifiedId = await tweet2give.handleToCreatorId("unverified_creator");

      await expect(
        tweet2give.connect(donor1).donate(unverifiedId, TEN_USDC, "donor1", "tweet1")
      ).to.be.revertedWithCustomError(tweet2give, "CreatorNotVerified");
    });

    it("collects platform fee correctly", async function () {
      // Set 2% fee
      await tweet2give.setFee(200);

      const feeRecipientBefore = await usdc.balanceOf(feeRecipient.address);
      await tweet2give.connect(donor1).donate(creatorId, HUNDRED_USDC, "donor1", "tweet1");
      const feeRecipientAfter = await usdc.balanceOf(feeRecipient.address);

      const expectedFee = (HUNDRED_USDC * 200n) / 10000n; // 2 USDC
      expect(feeRecipientAfter - feeRecipientBefore).to.equal(expectedFee);

      // Creator should have net amount
      const creator = await tweet2give.creators(creatorId);
      expect(creator.totalRaised).to.equal(HUNDRED_USDC - expectedFee);
    });

    it("emits DonationReceived event", async function () {
      await expect(
        tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet_abc")
      ).to.emit(tweet2give, "DonationReceived");
    });
  });

  // ─── PROPOSALS ────────────────────────────────────────────────────
  describe("Withdrawal Proposals", function () {
    let creatorId;

    beforeEach(async function () {
      creatorId = await registerAndVerifyCreator(creator1.address, "yuki_creates");

      // Fund the creator
      await tweet2give.connect(donor1).donate(creatorId, HUNDRED_USDC, "donor1", "t1");
      await tweet2give.connect(donor2).donate(creatorId, HUNDRED_USDC, "donor2", "t2");
      await tweet2give.connect(donor3).donate(creatorId, HUNDRED_USDC, "donor3", "t3");
    });

    it("creator can create a proposal", async function () {
      await tweet2give.connect(creator1).createProposal(
        "Equipment Batch",
        "Buy camera equipment for field documentation",
        TEN_USDC
      );

      const proposal = await tweet2give.proposals(1);
      expect(proposal.title).to.equal("Equipment Batch");
      expect(proposal.amount).to.equal(TEN_USDC);
      expect(proposal.status).to.equal(0); // Voting
    });

    it("donors can vote YES", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);

      await tweet2give.connect(donor1).castVote(1, true);
      await tweet2give.connect(donor2).castVote(1, true);

      const proposal = await tweet2give.proposals(1);
      expect(proposal.yesVotes).to.equal(HUNDRED_USDC * 2n);
    });

    it("donors can vote NO", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);

      await tweet2give.connect(donor1).castVote(1, false);

      const proposal = await tweet2give.proposals(1);
      expect(proposal.noVotes).to.equal(HUNDRED_USDC);
    });

    it("reverts if double vote", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);
      await tweet2give.connect(donor1).castVote(1, true);

      await expect(
        tweet2give.connect(donor1).castVote(1, true)
      ).to.be.revertedWithCustomError(tweet2give, "AlreadyVoted");
    });

    it("reverts if non-donor tries to vote", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);

      await expect(
        tweet2give.connect(other).castVote(1, true)
      ).to.be.revertedWithCustomError(tweet2give, "NotADonor");
    });

    it("finalizes and executes a passed proposal", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);

      // All 3 donors vote YES (100% yes)
      await tweet2give.connect(donor1).castVote(1, true);
      await tweet2give.connect(donor2).castVote(1, true);
      await tweet2give.connect(donor3).castVote(1, true);

      // Fast-forward past voting period (3 days)
      await time.increase(3 * 24 * 60 * 60 + 1);

      // Finalize
      await tweet2give.finalizeProposal(1);
      const proposalAfterFinalize = await tweet2give.proposals(1);
      expect(proposalAfterFinalize.status).to.equal(1); // Passed

      // Execute
      const creatorBalanceBefore = await usdc.balanceOf(creator1.address);
      await tweet2give.executeProposal(1);
      const creatorBalanceAfter = await usdc.balanceOf(creator1.address);

      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(TEN_USDC);

      const proposalAfterExec = await tweet2give.proposals(1);
      expect(proposalAfterExec.status).to.equal(3); // Executed
    });

    it("finalizes as rejected if quorum not met", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);

      // Only 1 of 3 votes yes (33%)
      await tweet2give.connect(donor1).castVote(1, true);
      await tweet2give.connect(donor2).castVote(1, false);
      await tweet2give.connect(donor3).castVote(1, false);

      await time.increase(3 * 24 * 60 * 60 + 1);
      await tweet2give.finalizeProposal(1);

      const proposal = await tweet2give.proposals(1);
      expect(proposal.status).to.equal(2); // Rejected
    });

    it("creator can cancel a proposal during voting", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);
      await tweet2give.connect(creator1).cancelProposal(1);

      const proposal = await tweet2give.proposals(1);
      expect(proposal.status).to.equal(4); // Cancelled
    });

    it("reverts if proposal not yet ended", async function () {
      await tweet2give.connect(creator1).createProposal("Title", "Desc", TEN_USDC);
      await tweet2give.connect(donor1).castVote(1, true);

      await expect(
        tweet2give.finalizeProposal(1)
      ).to.be.revertedWithCustomError(tweet2give, "VotingStillOpen");
    });
  });

  // ─── ADMIN ────────────────────────────────────────────────────────
  describe("Admin Functions", function () {
    it("owner can update fee", async function () {
      await tweet2give.setFee(500);
      expect(await tweet2give.platformFeeBps()).to.equal(500);
    });

    it("reverts if fee exceeds max", async function () {
      await expect(tweet2give.setFee(1001)).to.be.revertedWithCustomError(tweet2give, "InvalidFee");
    });

    it("owner can pause and unpause", async function () {
      await tweet2give.pause();
      expect(await tweet2give.paused()).to.equal(true);

      await tweet2give.unpause();
      expect(await tweet2give.paused()).to.equal(false);
    });

    it("donations are blocked when paused", async function () {
      const creatorId = await registerAndVerifyCreator(creator1.address, "yuki_creates");
      await tweet2give.pause();

      await expect(
        tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet1")
      ).to.be.reverted;
    });
  });

  // ─── VIEW FUNCTIONS ───────────────────────────────────────────────
  describe("View Functions", function () {
    it("getCreatorByHandle returns correct creator", async function () {
      await registerAndVerifyCreator(creator1.address, "yuki_creates", "Yuki Tanaka");
      const c = await tweet2give.getCreatorByHandle("yuki_creates");
      expect(c.displayName).to.equal("Yuki Tanaka");
    });

    it("canVote returns correct eligibility", async function () {
      const creatorId = await registerAndVerifyCreator(creator1.address, "yuki_creates");
      await tweet2give.connect(donor1).donate(creatorId, TEN_USDC, "donor1", "tweet1");
      await tweet2give.connect(creator1).createProposal("Title", "Desc", ONE_USDC);

      const [eligible, voted] = await tweet2give.canVote(donor1.address, 1);
      expect(eligible).to.equal(true);
      expect(voted).to.equal(false);
    });

    it("getCounters returns correct values", async function () {
      const [cc, pc, dc] = await tweet2give.getCounters();
      expect(cc).to.equal(0);
      expect(pc).to.equal(0);
      expect(dc).to.equal(0);
    });
  });
});
