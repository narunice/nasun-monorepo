/**
 * Edge case tests for features added in this session:
 * - Transfer lock interactions with all mint stages
 * - Per-stage pricing edge cases
 * - Mid-stage price change scenarios
 * - Admin operations sequencing
 * - Combined feature interactions
 */

const { ethers } = require("hardhat");
const assert = require("assert");

const MP = ethers.parseEther("0.05");
const GTD_PRICE = ethers.parseEther("0.003");
const FCFS_PRICE = ethers.parseEther("0.004");
const PUBLIC_PRICE = ethers.parseEther("0.006");

async function deployFixture() {
  const [owner, sw, u1, u2, u3, u4, u5] = await ethers.getSigners();
  const F = await ethers.getContractFactory("NasunGenesisPass");
  const c = await F.deploy("ipfs://QmTest", "ipfs://QmCol", sw.address, 20000, owner.address, 500);
  await c.waitForDeployment();
  await c.setStagePrice(2, GTD_PRICE);
  await c.setStagePrice(3, FCFS_PRICE);
  await c.setStagePrice(4, PUBLIC_PRICE);
  await c.setWalletLimit(1, 1); await c.setWalletLimit(2, 1);
  await c.setWalletLimit(3, 1); await c.setWalletLimit(4, 1);
  return { c, owner, sw, u1, u2, u3, u4, u5 };
}

async function sig(sw, addr, cid, minter, stage, maxQty, deadline) {
  return sw.signTypedData(
    { name: "NasunGenesisPass", version: "1", chainId: cid, verifyingContract: addr },
    { Mint: [{ name: "minter", type: "address" }, { name: "stage", type: "uint8" },
      { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }] },
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

// ══════════════════════════════════════════════════════════
// TRANSFER LOCK + MINT STAGE INTERACTIONS
// ══════════════════════════════════════════════════════════

describe("Transfer Lock + Mint Stage Interactions", function () {

  it("should block transfer in FREE_MINT stage", async function () {
    const { c, sw, u1, u2 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];
    await c.setStage(1);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });
    await expectRevert(
      () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
      "TransfersLocked"
    );
  });

  it("should block transfer in GTD stage", async function () {
    const { c, sw, u1, u2 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];
    await c.setStage(2);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 2, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: GTD_PRICE });
    await expectRevert(
      () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
      "TransfersLocked"
    );
  });

  it("should block transfer in PUBLIC stage", async function () {
    const { c, u1, u2 } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    await expectRevert(
      () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
      "TransfersLocked"
    );
  });

  it("should allow transfer after unlock regardless of current stage", async function () {
    const { c, u1, u2 } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    await c.unlockTransfers();
    // Stage is still PUBLIC but transfers work
    await c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x");
    assert.strictEqual(await c.balanceOf(u2.address, 1), 1n);
  });

  it("should allow minting AND transfer simultaneously after unlock", async function () {
    const { c, u1, u2, u3 } = await deployFixture();
    await c.setWalletLimit(4, 2);
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    await c.unlockTransfers();
    // u1 transfers to u2
    await c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x");
    // u3 mints while transfers are unlocked
    await c.connect(u3).mint(2, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    assert.strictEqual(await c.balanceOf(u2.address, 1), 1n);
    assert.strictEqual(await c.balanceOf(u3.address, 2), 1n);
  });

  it("should block approved operator transfer while locked", async function () {
    const { c, u1, u2, u3 } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    // u1 approves u2 as operator
    await c.connect(u1).setApprovalForAll(u2.address, true);
    // u2 tries to transfer u1's token
    await expectRevert(
      () => c.connect(u2).safeTransferFrom(u1.address, u3.address, 1, 1, "0x"),
      "TransfersLocked"
    );
    // After unlock, operator transfer works
    await c.unlockTransfers();
    await c.connect(u2).safeTransferFrom(u1.address, u3.address, 1, 1, "0x");
    assert.strictEqual(await c.balanceOf(u3.address, 1), 1n);
  });
});

// ══════════════════════════════════════════════════════════
// MID-STAGE PRICE CHANGE
// ══════════════════════════════════════════════════════════

describe("Mid-Stage Price Change", function () {

  it("should enforce new price immediately after setStagePrice", async function () {
    const { c, u1, u2 } = await deployFixture();
    await c.setWalletLimit(4, 2);
    await c.setStage(4);
    // Mint at original price
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    // Change price
    const newPrice = ethers.parseEther("0.01");
    await c.setStagePrice(4, newPrice);
    // Old price should fail
    await expectRevert(
      () => c.connect(u1).mint(2, 1, 0, 0, "0x", { value: PUBLIC_PRICE }),
      "InvalidPayment"
    );
    // New price should work
    await c.connect(u1).mint(2, 1, 0, 0, "0x", { value: newPrice });
    assert.strictEqual(await c.balanceOf(u1.address, 2), 1n);
  });

  it("should allow multiple price changes in same stage", async function () {
    const { c, u1, u2, u3 } = await deployFixture();
    await c.setWalletLimit(4, 3);
    await c.setStage(4);

    // Price 1
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });

    // Price 2
    const price2 = ethers.parseEther("0.008");
    await c.setStagePrice(4, price2);
    await c.connect(u2).mint(1, 1, 0, 0, "0x", { value: price2 });

    // Price 3
    const price3 = ethers.parseEther("0.002");
    await c.setStagePrice(4, price3);
    await c.connect(u3).mint(1, 1, 0, 0, "0x", { value: price3 });

    assert.strictEqual(await c.totalMinted(1), 3n);
    // Contract should have all three payments
    const bal = await ethers.provider.getBalance(await c.getAddress());
    assert.strictEqual(bal, PUBLIC_PRICE + price2 + price3);
  });

  it("should not affect other stages when changing one stage price", async function () {
    const { c } = await deployFixture();
    const newPublicPrice = ethers.parseEther("0.1");
    await c.setStagePrice(4, newPublicPrice);
    // GTD and FCFS prices unchanged
    assert.strictEqual(await c.mintPricePerStage(2), GTD_PRICE);
    assert.strictEqual(await c.mintPricePerStage(3), FCFS_PRICE);
    assert.strictEqual(await c.mintPricePerStage(4), newPublicPrice);
  });

  it("should reject price change to 0 during active stage", async function () {
    const { c } = await deployFixture();
    await c.setStage(4);
    await expectRevert(
      () => c.setStagePrice(4, 0),
      "StageNotPriced"
    );
  });

  it("should update currentMintPrice() after price change", async function () {
    const { c } = await deployFixture();
    await c.setStage(4);
    assert.strictEqual(await c.currentMintPrice(), PUBLIC_PRICE);
    const newPrice = ethers.parseEther("0.01");
    await c.setStagePrice(4, newPrice);
    assert.strictEqual(await c.currentMintPrice(), newPrice);
  });

  it("should allow price change for inactive future stage", async function () {
    const { c } = await deployFixture();
    await c.setStage(1); // FREE_MINT active
    // Change GTD price before it's active
    const newGtdPrice = ethers.parseEther("0.005");
    await c.setStagePrice(2, newGtdPrice);
    assert.strictEqual(await c.mintPricePerStage(2), newGtdPrice);
  });
});

// ══════════════════════════════════════════════════════════
// PER-STAGE PRICING + PAYMENT EDGE CASES
// ══════════════════════════════════════════════════════════

describe("Per-Stage Pricing Payment Edge Cases", function () {

  it("should accept exact payment at each stage", async function () {
    const { c, sw, u1, u2, u3, u4 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // FREE_MINT: exact 0
    await c.setStage(1);
    let d = await dl();
    let s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

    // GTD: exact price
    await c.setStage(2);
    d = await dl();
    s = await sig(sw, a, ci, u2.address, 2, 1, d);
    await c.connect(u2).mint(2, 1, 1, d, s, { value: GTD_PRICE });

    // FCFS: exact price
    await c.setStage(3);
    d = await dl();
    s = await sig(sw, a, ci, u3.address, 3, 1, d);
    await c.connect(u3).mint(3, 1, 1, d, s, { value: FCFS_PRICE });

    // PUBLIC: exact price
    await c.setStage(4);
    await c.connect(u4).mint(4, 1, 0, 0, "0x", { value: PUBLIC_PRICE });

    // Verify all minted
    assert.strictEqual(await c.balanceOf(u1.address, 1), 1n);
    assert.strictEqual(await c.balanceOf(u2.address, 2), 1n);
    assert.strictEqual(await c.balanceOf(u3.address, 3), 1n);
    assert.strictEqual(await c.balanceOf(u4.address, 4), 1n);

    // Revenue = GTD + FCFS + PUBLIC (FREE is 0)
    const bal = await ethers.provider.getBalance(a);
    assert.strictEqual(bal, GTD_PRICE + FCFS_PRICE + PUBLIC_PRICE);
  });

  it("should reject 1 wei underpayment at each paid stage", async function () {
    const { c, sw, u1, u2, u3 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // GTD underpay
    await c.setStage(2);
    let d = await dl();
    let s = await sig(sw, a, ci, u1.address, 2, 1, d);
    await expectRevert(
      () => c.connect(u1).mint(1, 1, 1, d, s, { value: GTD_PRICE - 1n }),
      "InvalidPayment"
    );

    // FCFS underpay
    await c.setStage(3);
    d = await dl();
    s = await sig(sw, a, ci, u2.address, 3, 1, d);
    await expectRevert(
      () => c.connect(u2).mint(1, 1, 1, d, s, { value: FCFS_PRICE - 1n }),
      "InvalidPayment"
    );

    // PUBLIC underpay
    await c.setStage(4);
    await expectRevert(
      () => c.connect(u3).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE - 1n }),
      "InvalidPayment"
    );
  });

  it("should reject FREE_MINT with any ETH sent", async function () {
    const { c, sw, u1 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];
    await c.setStage(1);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await expectRevert(
      () => c.connect(u1).mint(1, 1, 1, d, s, { value: 1n }),
      "InvalidPayment"
    );
  });

  it("should handle very small price (1 wei)", async function () {
    const { c, u1 } = await deployFixture();
    await c.setStagePrice(4, 1n); // 1 wei
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: 1n });
    assert.strictEqual(await c.balanceOf(u1.address, 1), 1n);
  });

  it("should handle very large price", async function () {
    const { c, u1 } = await deployFixture();
    const bigPrice = ethers.parseEther("100");
    await c.setStagePrice(4, bigPrice);
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: bigPrice });
    assert.strictEqual(await c.balanceOf(u1.address, 1), 1n);
  });
});

// ══════════════════════════════════════════════════════════
// ADMIN OPERATIONS SEQUENCING
// ══════════════════════════════════════════════════════════

describe("Admin Operations Sequencing", function () {

  it("should allow setting prices before any stage activation", async function () {
    const [owner, sw] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NasunGenesisPass");
    const c = await F.deploy("a", "b", sw.address, 20000, owner.address, 500);
    await c.waitForDeployment();
    // Set all prices before activating any stage
    await c.setStagePrice(2, GTD_PRICE);
    await c.setStagePrice(3, FCFS_PRICE);
    await c.setStagePrice(4, PUBLIC_PRICE);
    // Now stages can be activated
    await c.setWalletLimit(1, 1);
    await c.setStage(1); // FREE_MINT (no price needed)
    assert.strictEqual(await c.currentStage(), 1n);
  });

  it("should block stage activation if price not set", async function () {
    const [owner, sw] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NasunGenesisPass");
    const c = await F.deploy("a", "b", sw.address, 20000, owner.address, 500);
    await c.waitForDeployment();
    // Try to activate GTD without setting price
    await expectRevert(() => c.setStage(2), "StageNotPriced");
    // Set price, now it works
    await c.setStagePrice(2, GTD_PRICE);
    await c.setStage(2);
    assert.strictEqual(await c.currentStage(), 2n);
  });

  it("should allow withdrawal during any active stage", async function () {
    const { c, u1, u2, owner } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    // Withdraw while PUBLIC is still active
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await c.withdrawTo(owner.address);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);
    assert.strictEqual(after - before + gas, PUBLIC_PRICE);
    // More minting still works after withdrawal
    await c.connect(u2).mint(2, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    assert.strictEqual(await c.balanceOf(u2.address, 2), 1n);
  });

  it("should allow multiple withdrawals during drop", async function () {
    const { c, u1, u2, u3, owner } = await deployFixture();
    await c.setWalletLimit(4, 3);
    await c.setStage(4);

    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    await c.withdrawTo(owner.address); // First withdrawal

    await c.connect(u2).mint(2, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    await c.withdrawTo(owner.address); // Second withdrawal

    await c.connect(u3).mint(3, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    // Contract should have only the last mint's payment
    assert.strictEqual(await ethers.provider.getBalance(await c.getAddress()), PUBLIC_PRICE);
  });
});

// ══════════════════════════════════════════════════════════
// COMBINED FEATURE INTERACTIONS
// ══════════════════════════════════════════════════════════

describe("Combined Feature Interactions", function () {

  it("transfer lock + deadline + price change + unlock lifecycle", async function () {
    const { c, u1, u2, u3, owner } = await deployFixture();
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);

    // PUBLIC stage
    await c.setStage(4);
    assert.strictEqual(await c.transfersUnlocked(), false);

    // Mint at original price
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: PUBLIC_PRICE });

    // Transfer blocked
    await expectRevert(
      () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
      "TransfersLocked"
    );

    // Price change mid-stage
    const newPrice = ethers.parseEther("0.01");
    await c.setStagePrice(4, newPrice);
    await c.connect(u2).mint(2, 1, 0, 0, "0x", { value: newPrice });

    // Pause, withdraw some
    await c.setStage(0);
    await c.withdrawTo(owner.address);

    // Unlock transfers
    await c.unlockTransfers();
    assert.strictEqual(await c.transfersUnlocked(), true);

    // Now transfers work
    await c.connect(u1).safeTransferFrom(u1.address, u3.address, 1, 1, "0x");
    assert.strictEqual(await c.balanceOf(u3.address, 1), 1n);
  });

  it("should handle full drop simulation with all features", async function () {
    const { c, sw, u1, u2, u3, u4, u5, owner } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    // Setup deadline
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 7200);

    // ── FREE_MINT ──
    await c.setStage(1);
    let d = await dl();
    let s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

    // ── GTD (price change before activation) ──
    const newGtdPrice = ethers.parseEther("0.005");
    await c.setStagePrice(2, newGtdPrice);
    await c.setStage(2);
    d = await dl();
    s = await sig(sw, a, ci, u2.address, 2, 1, d);
    await c.connect(u2).mint(2, 1, 1, d, s, { value: newGtdPrice });

    // ── Mid-drop withdrawal ──
    const revenue1 = await ethers.provider.getBalance(a);
    assert.strictEqual(revenue1, newGtdPrice);
    await c.withdrawTo(owner.address);

    // ── FCFS ──
    await c.setStage(3);
    d = await dl();
    s = await sig(sw, a, ci, u3.address, 3, 1, d);
    await c.connect(u3).mint(3, 1, 1, d, s, { value: FCFS_PRICE });

    // ── PUBLIC (with mid-stage price adjustment) ──
    await c.setStage(4);
    await c.connect(u4).mint(4, 1, 0, 0, "0x", { value: PUBLIC_PRICE });
    // Adjust price
    const adjustedPublicPrice = ethers.parseEther("0.008");
    await c.setStagePrice(4, adjustedPublicPrice);
    await c.connect(u5).mint(5, 1, 0, 0, "0x", { value: adjustedPublicPrice });

    // ── All transfers locked throughout ──
    await expectRevert(
      () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
      "TransfersLocked"
    );

    // ── End drop ──
    await c.setStage(0);

    // ── Final withdrawal ──
    const finalBal = await ethers.provider.getBalance(a);
    assert.strictEqual(finalBal, FCFS_PRICE + PUBLIC_PRICE + adjustedPublicPrice);
    await c.withdrawTo(owner.address);
    assert.strictEqual(await ethers.provider.getBalance(a), 0n);

    // ── Unlock transfers ──
    await c.unlockTransfers();

    // ── All users can now trade ──
    await c.connect(u4).safeTransferFrom(u4.address, u1.address, 4, 1, "0x");
    assert.strictEqual(await c.balanceOf(u1.address, 4), 1n);

    // ── Verify total minted ──
    assert.strictEqual(await c.totalMinted(1), 1n);
    assert.strictEqual(await c.totalMinted(2), 1n);
    assert.strictEqual(await c.totalMinted(3), 1n);
    assert.strictEqual(await c.totalMinted(4), 1n);
    assert.strictEqual(await c.totalMinted(5), 1n);
  });
});
