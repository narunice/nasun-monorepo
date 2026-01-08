/**
 * E2E Security Tests for Governance API
 *
 * These tests verify the security measures in the /sponsor endpoint:
 * 1. Prevent mint_certificate-only transactions
 * 2. Enforce correct command order (mint → vote)
 * 3. Certificate-proposal binding
 *
 * Run: npx jest test/security-e2e.test.ts
 *
 * Prerequisites:
 * - GOVERNANCE_API_URL environment variable
 * - Test wallet with NASUN balance
 * - Active proposal for testing
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";

// Test configuration
const API_URL = process.env.GOVERNANCE_API_URL || "https://__GOVERNANCE_API_ID__.execute-api.ap-northeast-2.amazonaws.com/prod";
const RPC_URL = process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io";
const PACKAGE_ID = process.env.GOVERNANCE_PACKAGE_ID || "0x01ceae826f1ce6a13407eaa290fd0f99ca02230f1253f312246a57f9edf94ff0";

// Test constants (these should be updated for each test run)
const TEST_PROPOSAL_ID = process.env.TEST_PROPOSAL_ID || "";
const TEST_PROPOSAL_ID_ALT = process.env.TEST_PROPOSAL_ID_ALT || ""; // Different proposal for E2E-03

describe("Governance API Security Tests", () => {
  let client: SuiClient;
  let testKeypair: Ed25519Keypair;
  let testAddress: string;

  beforeAll(() => {
    client = new SuiClient({ url: RPC_URL });
    testKeypair = Ed25519Keypair.generate();
    testAddress = testKeypair.toSuiAddress();
  });

  /**
   * E2E-01: mint_certificate only (no vote)
   *
   * Attack scenario: Attacker tries to get sponsor to pay for mint_certificate
   * without actually voting (to farm certificates without spending gas)
   *
   * Expected: HTTP 400 - Transaction must include vote command
   */
  describe("E2E-01: mint_certificate only attack", () => {
    it("should reject transaction with only mint_certificate", async () => {
      // Skip if no test proposal configured
      if (!TEST_PROPOSAL_ID) {
        console.log("Skipping: TEST_PROPOSAL_ID not configured");
        return;
      }

      // 1. Get certificate from API
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: testAddress,
          proposalId: TEST_PROPOSAL_ID,
        }),
      });

      if (!certResponse.ok) {
        console.log("Certificate request failed (expected in test env)");
        return;
      }

      const cert = await certResponse.json();

      // 2. Build transaction with ONLY mint_certificate (no vote)
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(process.env.VOTING_POWER_ORACLE_ID || ""),
          tx.object(process.env.CERTIFICATE_REGISTRY_ID || ""),
          tx.object(TEST_PROPOSAL_ID),
          tx.pure.u64(cert.votingPower),
          tx.pure.u64(cert.expiresAt),
          tx.pure.vector("u8", Buffer.from(cert.signature, "hex")),
          tx.object("0x6"), // Clock
        ],
      });

      tx.setSender(testAddress);
      const txBytes = await tx.build({ client });

      // 3. Request sponsor signature
      const sponsorResponse = await fetch(`${API_URL}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txBytes: Buffer.from(txBytes).toString("base64"),
          userSignature: "", // Would be filled by actual user
        }),
      });

      // 4. Verify rejection
      expect(sponsorResponse.status).toBe(400);
      const error = await sponsorResponse.json();
      expect(error.error).toContain("Invalid transaction");
    });
  });

  /**
   * E2E-02: Wrong command order (vote → mint)
   *
   * Attack scenario: Attacker reorders commands to potentially
   * exploit race conditions or bypass checks
   *
   * Expected: HTTP 400 - Commands must be in order: mint_certificate → vote
   */
  describe("E2E-02: Wrong command order attack", () => {
    it("should reject transaction with vote before mint", async () => {
      if (!TEST_PROPOSAL_ID) {
        console.log("Skipping: TEST_PROPOSAL_ID not configured");
        return;
      }

      // 1. Get certificate
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: testAddress,
          proposalId: TEST_PROPOSAL_ID,
        }),
      });

      if (!certResponse.ok) {
        console.log("Certificate request failed");
        return;
      }

      const cert = await certResponse.json();

      // 2. Build transaction with WRONG order (vote first, then mint)
      const tx = new Transaction();

      // First: vote (WRONG - should be second)
      tx.moveCall({
        target: `${PACKAGE_ID}::proposal::vote_with_certificate`,
        arguments: [
          tx.object(TEST_PROPOSAL_ID),
          tx.pure.bool(true), // vote yes
          // certificate would come from mint, but we're testing order validation
        ],
      });

      // Second: mint_certificate (WRONG - should be first)
      tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(process.env.VOTING_POWER_ORACLE_ID || ""),
          tx.object(process.env.CERTIFICATE_REGISTRY_ID || ""),
          tx.object(TEST_PROPOSAL_ID),
          tx.pure.u64(cert.votingPower),
          tx.pure.u64(cert.expiresAt),
          tx.pure.vector("u8", Buffer.from(cert.signature, "hex")),
          tx.object("0x6"),
        ],
      });

      tx.setSender(testAddress);
      const txBytes = await tx.build({ client });

      // 3. Request sponsor
      const sponsorResponse = await fetch(`${API_URL}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txBytes: Buffer.from(txBytes).toString("base64"),
          userSignature: "",
        }),
      });

      // 4. Verify rejection
      expect(sponsorResponse.status).toBe(400);
      const error = await sponsorResponse.json();
      expect(error.error).toContain("order");
    });
  });

  /**
   * E2E-03: Certificate-Proposal mismatch
   *
   * Attack scenario: Attacker obtains certificate for Proposal A
   * but tries to vote on Proposal B
   *
   * Expected: MoveAbort with EProposalMismatch error
   *
   * Note: This test requires two active proposals
   */
  describe("E2E-03: Certificate-Proposal mismatch attack", () => {
    it("should reject vote with mismatched certificate", async () => {
      if (!TEST_PROPOSAL_ID || !TEST_PROPOSAL_ID_ALT) {
        console.log("Skipping: TEST_PROPOSAL_ID or TEST_PROPOSAL_ID_ALT not configured");
        return;
      }

      // 1. Get certificate for Proposal A
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: testAddress,
          proposalId: TEST_PROPOSAL_ID, // Certificate for Proposal A
        }),
      });

      if (!certResponse.ok) {
        console.log("Certificate request failed");
        return;
      }

      const cert = await certResponse.json();

      // 2. Build transaction: mint for A, vote for B (ATTACK)
      const tx = new Transaction();

      // Mint certificate for Proposal A
      const [certificate] = tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(process.env.VOTING_POWER_ORACLE_ID || ""),
          tx.object(process.env.CERTIFICATE_REGISTRY_ID || ""),
          tx.object(TEST_PROPOSAL_ID), // Proposal A
          tx.pure.u64(cert.votingPower),
          tx.pure.u64(cert.expiresAt),
          tx.pure.vector("u8", Buffer.from(cert.signature, "hex")),
          tx.object("0x6"),
        ],
      });

      // Try to vote on Proposal B with certificate from A (ATTACK)
      tx.moveCall({
        target: `${PACKAGE_ID}::proposal::vote_with_certificate`,
        arguments: [
          tx.object(TEST_PROPOSAL_ID_ALT), // Proposal B (MISMATCH!)
          tx.pure.bool(true),
          certificate, // Certificate bound to Proposal A
          tx.object("0x6"),
        ],
      });

      tx.setSender(testAddress);
      const txBytes = await tx.build({ client });

      // 3. Sign with user key
      const userSignature = await testKeypair.signTransaction(txBytes);

      // 4. Request sponsor
      const sponsorResponse = await fetch(`${API_URL}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txBytes: Buffer.from(txBytes).toString("base64"),
          userSignature: userSignature.signature,
        }),
      });

      // Note: The sponsor might accept this (can't validate proposal match statically)
      // The actual failure would happen on-chain with MoveAbort
      if (sponsorResponse.ok) {
        const result = await sponsorResponse.json();
        console.log("Sponsor accepted, checking on-chain result:", result.digest);

        // If we got this far, verify the transaction failed on-chain
        const txResult = await client.waitForTransaction({
          digest: result.digest,
          options: { showEffects: true },
        });

        // Expect MoveAbort with EProposalMismatch
        expect(txResult.effects?.status.status).toBe("failure");
        const errorMessage = JSON.stringify(txResult.effects?.status);
        expect(errorMessage).toMatch(/MoveAbort|EProposalMismatch|proposal/i);
      }
    });
  });
});

/**
 * Manual Test Commands:
 *
 * # Set environment variables
 * export GOVERNANCE_API_URL="https://__GOVERNANCE_API_ID__.execute-api.ap-northeast-2.amazonaws.com/prod"
 * export TEST_PROPOSAL_ID="<active_proposal_id>"
 * export TEST_PROPOSAL_ID_ALT="<another_active_proposal_id>"
 * export VOTING_POWER_ORACLE_ID="0x656632e390118ddf2c41fc59f14ddbbdfdd2115b8a08e4db48e8232846f43199"
 * export CERTIFICATE_REGISTRY_ID="0x5edbaf20f817ee3a9a94528babff2d2218364d4ec9a60af486a35228ad8a421f"
 *
 * # Run tests
 * npx jest test/security-e2e.test.ts --runInBand
 */
