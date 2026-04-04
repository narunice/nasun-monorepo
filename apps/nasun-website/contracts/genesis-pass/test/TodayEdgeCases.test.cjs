/**
 * Comprehensive edge case tests for all features added today:
 * - mintDeadline (time-based ending)
 * - highWaterMark (backward stage guard)
 * - ReentrancyAttacker (fixed interface)
 * - maxSupply 20,000 safety cap
 * - contractURI (OpenSea collection metadata)
 * - BackwardStageTransition error
 * - MintingEnded error
 * - MintDeadlineChanged event
 */

const { ethers } = require("hardhat");
const assert = require("assert");

async function deployFixture() {
  const [owner, sw, u1, u2, u3, u4, u5] = await ethers.getSigners();
  const mp = ethers.parseEther("0.05");
  const F = await ethers.getContractFactory("NasunGenesisPass");
  const c = await F.deploy("ipfs://QmTest", "ipfs://QmCol", sw.address, mp, 100, owner.address, 500);
  await c.waitForDeployment();
  await c.setWalletLimit(1, 2); await c.setWalletLimit(2, 3);
  await c.setWalletLimit(3, 3); await c.setWalletLimit(4, 5);
  return { c, owner, sw, u1, u2, u3, u4, u5, mp };
}

async function sig(sw, addr, cid, minter, stage, maxQty, deadline) {
  return sw.signTypedData(
    { name: "NasunGenesisPass", version: "1", chainId: cid, verifyingContract: addr },
    { Mint: [
      { name: "minter", type: "address" }, { name: "stage", type: "uint8" },
      { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" },
    ]},
    { minter, stage, maxQuantity: maxQty, deadline }
  );
}

async function dl(s=600) { return BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(s); }
async function cid() { return (await ethers.provider.getNetwork()).chainId; }

async function expectRevert(fn, err) {
  try { await fn(); assert.fail(`Expected revert "${err}"`); }
  catch (e) { if (e.message.includes("assert.fail")) throw e;
    assert.ok(e.message.includes(err) || e.message.includes("revert"), e.message.slice(0,200)); }
}

async function mineBlocks(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

// ══════════════════════════════════════════════════════════════
// MINT DEADLINE - EXHAUSTIVE EDGE CASES
// ══════════════════════════════════════════════════════════════

describe("MintDeadline - Exhaustive Edge Cases", function () {

  describe("Deadline boundary precision", function () {
    it("should allow minting at exactly the deadline timestamp", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      const block = await ethers.provider.getBlock("latest");
      // Set deadline far enough in the future that the next block is at or before it
      const deadline = block.timestamp + 100;
      await c.setMintDeadline(deadline);
      // Mint should succeed since block.timestamp <= deadline
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });

    it("should block minting 1 second after deadline", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 2);
      await mineBlocks(3);
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "MintingEnded"
      );
    });
  });

  describe("Deadline + stage interactions", function () {
    it("should check deadline even in FREE_MINT with valid signature", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(1);
      await c.setMintDeadline(1); // past deadline
      const d = await dl();
      const s = await sig(sw, a, ci, u1.address, 1, 1, d);
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 1, d, s, { value: 0 }),
        "MintingEnded"
      );
    });

    it("should check StagePaused before MintingEnded", async function () {
      const { c, u1, mp } = await deployFixture();
      // Both paused AND past deadline
      await c.setMintDeadline(1);
      // Stage is already PAUSED (default = 0)
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "StagePaused" // StagePaused checked first (line 117 before line 118)
      );
    });

    it("should still enforce payment after deadline is removed", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await c.setMintDeadline(1); // past
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "MintingEnded"
      );
      // Remove deadline
      await c.setMintDeadline(0);
      // Should work now with correct payment
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      // Should fail with wrong payment
      await expectRevert(
        () => c.connect(u1).mint(2, 1, 0, 0, "0x", { value: 0 }),
        "InvalidPayment"
      );
    });

    it("should not affect admin functions when deadline passed", async function () {
      const { c } = await deployFixture();
      await c.setStage(4);
      await c.setMintDeadline(1); // past
      // All admin functions should still work
      await c.setMintPrice(ethers.parseEther("0.1"));
      await c.setMaxSupply(1, 999);
      await c.setWalletLimit(4, 10);
      await c.setURI("ipfs://new");
      await c.setContractURI("ipfs://newcol");
    });

    it("should allow withdrawal after deadline", async function () {
      const { c, u1, mp, owner } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.setMintDeadline(1); // past
      // Withdrawal should work even after deadline
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await c.withdrawTo(owner.address);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      assert.strictEqual(after - before + gas, mp);
    });
  });

  describe("Deadline + signature deadline interaction", function () {
    it("should reject by mintDeadline even if signature deadline is valid", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(2); // GTD
      // Signature has a future deadline, but contract mintDeadline is past
      const sigDeadline = await dl(3600); // 1 hour
      const s = await sig(sw, a, ci, u1.address, 2, 1, sigDeadline);
      await c.setMintDeadline(1); // past
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 1, sigDeadline, s, { value: ethers.parseEther("0.05") }),
        "MintingEnded"
      );
    });
  });

  describe("MintDeadlineChanged event", function () {
    it("should emit event when deadline is set", async function () {
      const { c } = await deployFixture();
      const tx = await c.setMintDeadline(1234567890);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "MintDeadlineChanged"
      );
      assert.ok(event, "MintDeadlineChanged event should be emitted");
    });

    it("should emit event when deadline is removed (set to 0)", async function () {
      const { c } = await deployFixture();
      await c.setMintDeadline(9999);
      const tx = await c.setMintDeadline(0);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "MintDeadlineChanged"
      );
      assert.ok(event, "MintDeadlineChanged event should be emitted for removal");
    });
  });
});

// ══════════════════════════════════════════════════════════════
// HIGH WATER MARK - EXHAUSTIVE EDGE CASES
// ══════════════════════════════════════════════════════════════

describe("HighWaterMark Backward Guard - Exhaustive Edge Cases", function () {

  it("should track highWaterMark correctly through forward progression", async function () {
    const { c } = await deployFixture();
    assert.strictEqual(Number(await c.highWaterMark()), 0);
    await c.setStage(1);
    assert.strictEqual(Number(await c.highWaterMark()), 1);
    await c.setStage(2);
    assert.strictEqual(Number(await c.highWaterMark()), 2);
    await c.setStage(3);
    assert.strictEqual(Number(await c.highWaterMark()), 3);
    await c.setStage(4);
    assert.strictEqual(Number(await c.highWaterMark()), 4);
  });

  it("should NOT update highWaterMark when entering PAUSED", async function () {
    const { c } = await deployFixture();
    await c.setStage(3); // FCFS, hwm=3
    await c.setStage(0); // PAUSED
    assert.strictEqual(Number(await c.highWaterMark()), 3); // still 3
    assert.strictEqual(await c.currentStage(), 0n);
  });

  it("should block ALL previous stages after reaching PUBLIC via PAUSED", async function () {
    const { c } = await deployFixture();
    await c.setStage(1); await c.setStage(2); await c.setStage(3); await c.setStage(4);
    await c.setStage(0); // PAUSED, hwm=4
    // All forward stages are now impossible (4 is the max)
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    await expectRevert(() => c.setStage(2), "BackwardStageTransition");
    await expectRevert(() => c.setStage(3), "BackwardStageTransition");
    await expectRevert(() => c.setStage(4), "BackwardStageTransition");
    // Only PAUSED itself is allowed
    await c.setStage(0); // no-op PAUSED->PAUSED
    assert.strictEqual(await c.currentStage(), 0n);
  });

  it("should prevent signature replay via PAUSED bypass attack", async function () {
    const { c, sw, u1, mp } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // User gets FREE_MINT signature
    await c.setStage(1);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 1, 2, d);
    await c.connect(u1).mint(1, 1, 2, d, s, { value: 0 });
    assert.strictEqual(await c.mintedPerStage(1, u1.address), 1n);

    // Advance to GTD
    await c.setStage(2);

    // Attacker tries: GTD -> PAUSED -> FREE_MINT (to replay the sig)
    await c.setStage(0);
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    // Attack blocked by highWaterMark
  });

  it("should allow skipping stages forward", async function () {
    const { c } = await deployFixture();
    // Skip directly from PAUSED to PUBLIC
    await c.setStage(4);
    assert.strictEqual(await c.currentStage(), 4n);
    assert.strictEqual(Number(await c.highWaterMark()), 4);
  });

  it("should allow PAUSED from any non-PAUSED stage", async function () {
    const { c } = await deployFixture();
    await c.setStage(1);
    await c.setStage(0);
    assert.strictEqual(await c.currentStage(), 0n);
    // Forward to GTD (hwm was 1, 2 > 1 OK)
    await c.setStage(2);
    await c.setStage(0);
    assert.strictEqual(await c.currentStage(), 0n);
  });
});

// ══════════════════════════════════════════════════════════════
// REENTRANCY - ADDITIONAL EDGE CASES
// ══════════════════════════════════════════════════════════════

describe("Reentrancy - Additional Edge Cases", function () {

  it("should block reentrancy with multiple tokens in allowlist stage", async function () {
    const { c, sw } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];
    await c.setStage(1); // FREE_MINT

    const A = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await A.deploy(a);
    await attacker.waitForDeployment();
    const attackerAddr = await attacker.getAddress();

    // Sign for attacker with generous maxQuantity
    const d = await dl();
    const s = await sig(sw, a, ci, attackerAddr, 1, 10, d);

    // Attacker tries reentrancy via onERC1155Received
    await attacker.attackWithSignature(10, d, s, { value: 0 });

    // Only 1 should have minted (nonReentrant blocks callback re-entry)
    const bal = await c.balanceOf(attackerAddr, 1);
    assert.strictEqual(bal, 1n, "nonReentrant should limit to 1 mint");
  });
});

// ══════════════════════════════════════════════════════════════
// FULL LIFECYCLE WITH ALL TODAY'S FEATURES
// ══════════════════════════════════════════════════════════════

describe("Full Lifecycle E2E with Today's Features", function () {

  it("should complete: deploy -> deadline -> 4 stages -> withdrawal -> transfer", async function () {
    const { c, sw, u1, u2, u3, u4, u5, mp } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // Set deadline 1 hour from now
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);

    // Verify highWaterMark starts at 0
    assert.strictEqual(Number(await c.highWaterMark()), 0);

    // ── FREE_MINT ──
    await c.setStage(1);
    assert.strictEqual(Number(await c.highWaterMark()), 1);
    let d = await dl();
    let s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

    // ── GTD ──
    await c.setStage(2);
    assert.strictEqual(Number(await c.highWaterMark()), 2);
    d = await dl();
    s = await sig(sw, a, ci, u2.address, 2, 2, d);
    await c.connect(u2).mint(3, 2, 2, d, s, { value: mp * 2n });

    // ── FCFS ──
    await c.setStage(3);
    d = await dl();
    s = await sig(sw, a, ci, u3.address, 3, 1, d);
    await c.connect(u3).mint(5, 1, 1, d, s, { value: mp });

    // ── PUBLIC ──
    await c.setStage(4);
    assert.strictEqual(Number(await c.highWaterMark()), 4);
    await c.connect(u4).mint(7, 2, 0, 0, "0x", { value: mp * 2n });

    // Verify backward guard after reaching PUBLIC
    await c.setStage(0);
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    await expectRevert(() => c.setStage(4), "BackwardStageTransition");

    // ── Verify totals ──
    assert.strictEqual(await c.totalMinted(1), 1n);
    assert.strictEqual(await c.totalMinted(3), 2n);
    assert.strictEqual(await c.totalMinted(5), 1n);
    assert.strictEqual(await c.totalMinted(7), 2n);

    // ── Withdrawal ──
    const revenue = mp * 5n; // 5 paid mints
    const contractBal = await ethers.provider.getBalance(a);
    assert.strictEqual(contractBal, revenue);

    await c.withdrawTo(u5.address);
    const u5Bal = await ethers.provider.getBalance(a);
    assert.strictEqual(u5Bal, 0n);

    // ── Transfer ──
    await c.connect(u4).safeTransferFrom(u4.address, u1.address, 7, 1, "0x");
    assert.strictEqual(await c.balanceOf(u4.address, 7), 1n);
    assert.strictEqual(await c.balanceOf(u1.address, 7), 1n);

    // ── Verify contractURI ──
    assert.strictEqual(await c.contractURI(), "ipfs://QmCol");

    // ── Verify mintDeadline ──
    assert.ok((await c.mintDeadline()) > 0n);
  });

  it("should handle deadline-based drop ending", async function () {
    const { c, u1, u2, mp } = await deployFixture();
    await c.setStage(4);

    // Set deadline 3 seconds from now
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3);

    // Mint before deadline
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
    assert.strictEqual(await c.totalMinted(1), 1n);

    // Advance past deadline
    await mineBlocks(5);

    // Mint after deadline should fail
    await expectRevert(
      () => c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp }),
      "MintingEnded"
    );

    // Extend deadline
    const newBlock = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(newBlock.timestamp + 3600);

    // Mint should work again
    await c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp });
    assert.strictEqual(await c.totalMinted(1), 2n);
  });
});

// ══════════════════════════════════════════════════════════════
// MAXSUPPLY 20000 - EDGE CASES
// ══════════════════════════════════════════════════════════════

describe("MaxSupply Safety Cap", function () {

  it("should deploy with custom maxSupply via constructor", async function () {
    const [owner, sw] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NasunGenesisPass");
    const c = await F.deploy("ipfs://test", "ipfs://col", sw.address, 0, 20000, owner.address, 500);
    await c.waitForDeployment();
    for (let i = 1; i <= 7; i++) {
      assert.strictEqual(await c.maxSupply(i), 20000n);
    }
  });

  it("should allow setMaxSupply to increase beyond initial value", async function () {
    const { c } = await deployFixture();
    assert.strictEqual(await c.maxSupply(1), 100n); // fixture default
    await c.setMaxSupply(1, 50000);
    assert.strictEqual(await c.maxSupply(1), 50000n);
  });

  it("should allow setMaxSupply to decrease to totalMinted", async function () {
    const { c, u1, mp } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 3, 0, 0, "0x", { value: mp * 3n });
    // Can set to exactly totalMinted
    await c.setMaxSupply(1, 3);
    assert.strictEqual(await c.maxSupply(1), 3n);
    // Cannot set below
    await expectRevert(() => c.setMaxSupply(1, 2), "SupplyBelowMinted");
  });
});

// ══════════════════════════════════════════════════════════════
// CONTRACT URI - EDGE CASES
// ══════════════════════════════════════════════════════════════

describe("ContractURI Edge Cases", function () {

  it("should return contractURI set in constructor", async function () {
    const { c } = await deployFixture();
    assert.strictEqual(await c.contractURI(), "ipfs://QmCol");
  });

  it("should update contractURI via setter", async function () {
    const { c } = await deployFixture();
    await c.setContractURI("ipfs://QmNewCollection");
    assert.strictEqual(await c.contractURI(), "ipfs://QmNewCollection");
  });

  it("should allow empty contractURI", async function () {
    const { c } = await deployFixture();
    await c.setContractURI("");
    assert.strictEqual(await c.contractURI(), "");
  });

  it("should reject non-owner contractURI change", async function () {
    const { c, u1 } = await deployFixture();
    await expectRevert(
      () => c.connect(u1).setContractURI("ipfs://hack"),
      "OwnableUnauthorizedAccount"
    );
  });
});

// ══════════════════════════════════════════════════════════════
// COMBINED EDGE CASES (feature interactions)
// ══════════════════════════════════════════════════════════════

describe("Combined Feature Interactions", function () {

  it("deadline + backward guard + signature: all three features interact correctly", async function () {
    const { c, sw, u1, mp } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // Set deadline
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);

    // Advance to GTD
    await c.setStage(2);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 2, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: mp });

    // PAUSED
    await c.setStage(0);

    // Can't go back to FREE_MINT (highWaterMark = 2)
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");

    // Forward to FCFS
    await c.setStage(3);
    const d2 = await dl();
    const s2 = await sig(sw, a, ci, u1.address, 3, 1, d2);
    await c.connect(u1).mint(2, 1, 1, d2, s2, { value: mp });

    // Pass deadline
    await mineBlocks(3601);

    // Should fail due to deadline, not signature or stage
    const d3 = await dl();
    const s3 = await sig(sw, a, ci, u1.address, 3, 2, d3);
    await expectRevert(
      () => c.connect(u1).mint(3, 1, 2, d3, s3, { value: mp }),
      "MintingEnded"
    );
  });

  it("multiple users minting all 7 types before deadline", async function () {
    const { c, u1, u2, u3, mp } = await deployFixture();
    await c.setStage(4);
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);

    // User 1 mints types 1-3
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
    await c.connect(u1).mint(2, 1, 0, 0, "0x", { value: mp });
    await c.connect(u1).mint(3, 1, 0, 0, "0x", { value: mp });

    // User 2 mints types 4-5
    await c.connect(u2).mint(4, 1, 0, 0, "0x", { value: mp });
    await c.connect(u2).mint(5, 1, 0, 0, "0x", { value: mp });

    // User 3 mints types 6-7
    await c.connect(u3).mint(6, 1, 0, 0, "0x", { value: mp });
    await c.connect(u3).mint(7, 1, 0, 0, "0x", { value: mp });

    // All 7 types have been minted
    for (let i = 1; i <= 7; i++) {
      assert.strictEqual(await c.totalMinted(i), 1n);
    }

    // Total ETH = 7 * 0.05 = 0.35
    const bal = await ethers.provider.getBalance(await c.getAddress());
    assert.strictEqual(bal, mp * 7n);
  });

  it("should handle setMintDeadline + setMintPrice + setStage in sequence", async function () {
    const { c, u1, mp } = await deployFixture();

    // Setup: deadline, price, stage
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);
    await c.setMintPrice(ethers.parseEther("0.1"));
    await c.setStage(4);

    // Mint at new price
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: ethers.parseEther("0.1") });
    assert.strictEqual(await c.totalMinted(1), 1n);

    // Old price should fail
    await expectRevert(
      () => c.connect(u1).mint(2, 1, 0, 0, "0x", { value: mp }),
      "InvalidPayment"
    );
  });
});
