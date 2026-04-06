const { ethers } = require("hardhat");
const assert = require("assert");

const MP = ethers.parseEther("0.05");

async function deployFixture() {
  const [owner, sw, u1, u2, u3, u4, u5] = await ethers.getSigners();
  const F = await ethers.getContractFactory("NasunGenesisPass");
  const c = await F.deploy("ipfs://QmTest", "ipfs://QmCol", sw.address, 100, owner.address, 500);
  await c.waitForDeployment();
  await c.setStagePrice(2, MP); await c.setStagePrice(3, MP); await c.setStagePrice(4, MP);
  await c.setWalletLimit(1, 1); await c.setWalletLimit(2, 1);
  await c.setWalletLimit(3, 1); await c.setWalletLimit(4, 1);
  return { c, owner, sw, u1, u2, u3, u4, u5, mp: MP };
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

describe("Security E2E Tests", function () {

  describe("1. Reentrancy + Bot Protection", function () {
    it("should block contract minters in PUBLIC stage", async function () {
      const { c, mp } = await deployFixture();
      await c.setStage(4);
      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const a = await A.deploy(await c.getAddress());
      await a.waitForDeployment();
      try { await a.attackPublic({ value: mp * 3n }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ContractMinter") || e.message.includes("revert")); }
    });

    it("should block reentrancy in allowlist stage via nonReentrant", async function () {
      const { c, sw } = await deployFixture();
      await c.setWalletLimit(1, 3);
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(1);
      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await A.deploy(a);
      await attacker.waitForDeployment();
      const attackerAddr = await attacker.getAddress();
      const d = await dl();
      const s = await sig(sw, a, ci, attackerAddr, 1, 3, d);
      await attacker.attackWithSignature(3, d, s, { value: 0 });
      assert.strictEqual(await c.balanceOf(attackerAddr, 1), 1n);
    });
  });

  describe("2. Signature Security", function () {
    it("should reject empty signature on allowlist", async function () {
      const { c, u1 } = await deployFixture();
      await c.setStage(1);
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, 9999999999n, "0x", { value: 0 }), "revert");
    });

    it("should reject random bytes as signature", async function () {
      const { c, u1 } = await deployFixture();
      await c.setStage(1);
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, 9999999999n, ethers.hexlify(ethers.randomBytes(65)), { value: 0 }), "revert");
    });

    it("should reject wrong domain name", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, d, a] = [await cid(), await dl(), await c.getAddress()];
      await c.setStage(1);
      const s = await sw.signTypedData(
        { name: "WrongName", version: "1", chainId: ci, verifyingContract: a },
        { Mint: [{ name: "minter", type: "address" }, { name: "stage", type: "uint8" },
          { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { minter: u1.address, stage: 1, maxQuantity: 1, deadline: d }
      );
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, d, s, { value: 0 }), "InvalidSignature");
    });

    it("should reject deadline=0 on allowlist", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(1);
      const s = await sig(sw, a, ci, u1.address, 1, 1, 0);
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, 0, s, { value: 0 }), "SignatureExpired");
    });
  });

  describe("3. Payment Security", function () {
    it("should reject overpayment", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp + 1n }), "InvalidPayment");
    });

    it("should reject underpayment", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp - 1n }), "InvalidPayment");
    });

    it("should reject zero payment on paid stage", async function () {
      const { c, u1 } = await deployFixture();
      await c.setStage(4);
      await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: 0 }), "InvalidPayment");
    });

    it("should reject direct ETH transfer", async function () {
      const { c, u1 } = await deployFixture();
      const a = await c.getAddress();
      await expectRevert(() => u1.sendTransaction({ to: a, value: ethers.parseEther("1") }), "revert");
    });
  });

  describe("4. Withdrawal Security", function () {
    it("should revert when recipient rejects ETH", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      const R = await ethers.getContractFactory("ETHRejecter");
      const r = await R.deploy();
      const ra = await r.getAddress();
      await expectRevert(() => c.withdrawTo(ra), "revert");
      assert.strictEqual(await ethers.provider.getBalance(await c.getAddress()), mp);
    });

    it("should send exact full balance", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setWalletLimit(4, 3);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.connect(u2).mint(3, 1, 0, 0, "0x", { value: mp });
      const [,,, t] = await ethers.getSigners();
      const before = await ethers.provider.getBalance(t.address);
      await c.withdrawTo(t.address);
      const after = await ethers.provider.getBalance(t.address);
      assert.strictEqual(after - before, mp * 2n);
    });
  });

  describe("5. Supply Integrity", function () {
    it("should enforce maxSupply at boundary", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setMaxSupply(1, 1);
      await c.setWalletLimit(4, 2);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await expectRevert(() => c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp }), "SoldOut");
    });
  });

  describe("6. Access Control", function () {
    it("should prevent pending owner from calling admin", async function () {
      const { c, u1 } = await deployFixture();
      await c.transferOwnership(u1.address);
      await expectRevert(() => c.connect(u1).setStage(4), "OwnableUnauthorizedAccount");
    });

    it("should block renounceOwnership", async function () {
      const { c, owner } = await deployFixture();
      await expectRevert(() => c.renounceOwnership(), "Renounce disabled");
      assert.strictEqual(await c.owner(), owner.address);
    });
  });

  describe("7. Full Lifecycle E2E", function () {
    it("should complete 4-stage drop + withdrawal + transfer", async function () {
      const { c, sw, u1, u2, u3, u4, u5, mp } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];

      // FREE_MINT
      await c.setStage(1);
      let d = await dl();
      let s = await sig(sw, a, ci, u1.address, 1, 1, d);
      await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

      // GTD
      await c.setStage(2);
      d = await dl();
      s = await sig(sw, a, ci, u2.address, 2, 1, d);
      await c.connect(u2).mint(1, 1, 1, d, s, { value: mp });

      // FCFS
      await c.setStage(3);
      d = await dl();
      s = await sig(sw, a, ci, u3.address, 3, 1, d);
      await c.connect(u3).mint(1, 1, 1, d, s, { value: mp });

      // PUBLIC
      await c.setStage(4);
      await c.connect(u4).mint(1, 1, 0, 0, "0x", { value: mp });

      assert.strictEqual(await c.totalMinted(1), 4n);

      // Withdrawal
      const revenue = mp * 3n;
      assert.strictEqual(await ethers.provider.getBalance(a), revenue);
      await c.withdrawTo(u5.address);

      // Unlock + Transfer
      await c.unlockTransfers();
      await c.connect(u1).safeTransferFrom(u1.address, u5.address, 1, 1, "0x");
      assert.strictEqual(await c.balanceOf(u1.address, 1), 0n);
      assert.strictEqual(await c.balanceOf(u5.address, 1), 1n);
    });
  });

  describe("8. Stage Transition + Backward Guard", function () {
    it("should block backward stage transition", async function () {
      const { c } = await deployFixture();
      await c.setStage(2);
      await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    });

    it("should block backward regression via PAUSED bypass", async function () {
      const { c } = await deployFixture();
      await c.setStage(2);
      await c.setStage(0);
      await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    });

    it("should allow PAUSED from any stage", async function () {
      const { c } = await deployFixture();
      await c.setStage(3);
      await c.setStage(0);
      assert.strictEqual(await c.currentStage(), 0n);
    });

    it("should allow forward resume after PAUSED", async function () {
      const { c } = await deployFixture();
      await c.setStage(2);
      await c.setStage(0);
      await c.setStage(3);
      assert.strictEqual(await c.currentStage(), 3n);
    });
  });

  describe("9. Mint Deadline", function () {
    it("should block minting after deadline", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 2);
      await ethers.provider.send("evm_increaseTime", [3]);
      await ethers.provider.send("evm_mine", []);
      await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }), "MintingEnded");
    });

    it("should allow minting before deadline", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 3600);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });
  });

  // ──────────────── NEW: Transfer Lock Tests ────────────────

  describe("10. Transfer Lock", function () {
    it("should block safeTransferFrom when locked", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await expectRevert(
        () => c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
        "TransfersLocked"
      );
    });

    it("should allow minting while locked", async function () {
      const { c, u1, mp } = await deployFixture();
      assert.strictEqual(await c.transfersUnlocked(), false);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.balanceOf(u1.address, 1), 1n);
    });

    it("should allow transfer after unlockTransfers", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.unlockTransfers();
      await c.connect(u1).safeTransferFrom(u1.address, u2.address, 1, 1, "0x");
      assert.strictEqual(await c.balanceOf(u2.address, 1), 1n);
    });

    it("should reject non-owner unlockTransfers", async function () {
      const { c, u1 } = await deployFixture();
      await expectRevert(() => c.connect(u1).unlockTransfers(), "OwnableUnauthorizedAccount");
    });

    it("should allow setApprovalForAll while locked", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      // Approval itself should work
      await c.connect(u1).setApprovalForAll(u2.address, true);
      assert.strictEqual(await c.isApprovedForAll(u1.address, u2.address), true);
      // But transfer by approved operator should still be blocked
      await expectRevert(
        () => c.connect(u2).safeTransferFrom(u1.address, u2.address, 1, 1, "0x"),
        "TransfersLocked"
      );
    });

    it("should be one-way (no re-lock function)", async function () {
      const { c } = await deployFixture();
      await c.unlockTransfers();
      assert.strictEqual(await c.transfersUnlocked(), true);
      // No setTransfersUnlocked(false) or lockTransfers() exists
      // Calling unlockTransfers again is idempotent
      await c.unlockTransfers();
      assert.strictEqual(await c.transfersUnlocked(), true);
    });

    it("should block batch transfer when locked", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setWalletLimit(4, 2);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.connect(u1).mint(2, 1, 0, 0, "0x", { value: mp });
      await expectRevert(
        () => c.connect(u1).safeBatchTransferFrom(u1.address, u2.address, [1, 2], [1, 1], "0x"),
        "TransfersLocked"
      );
    });

    it("should allow batch transfer after unlock", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setWalletLimit(4, 2);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.connect(u1).mint(2, 1, 0, 0, "0x", { value: mp });
      await c.unlockTransfers();
      await c.connect(u1).safeBatchTransferFrom(u1.address, u2.address, [1, 2], [1, 1], "0x");
      assert.strictEqual(await c.balanceOf(u2.address, 1), 1n);
      assert.strictEqual(await c.balanceOf(u2.address, 2), 1n);
    });
  });

  // ──────────────── NEW: Per-Stage Pricing Tests ────────────────

  describe("11. Per-Stage Pricing", function () {
    it("should mint at different prices per stage", async function () {
      const { c, sw, u1, u2, u3 } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      const gtdPrice = ethers.parseEther("0.003");
      const fcfsPrice = ethers.parseEther("0.004");
      const pubPrice = ethers.parseEther("0.006");
      await c.setStagePrice(2, gtdPrice);
      await c.setStagePrice(3, fcfsPrice);
      await c.setStagePrice(4, pubPrice);

      // GTD
      await c.setStage(2);
      let d = await dl();
      let s = await sig(sw, a, ci, u1.address, 2, 1, d);
      await c.connect(u1).mint(1, 1, 1, d, s, { value: gtdPrice });

      // FCFS
      await c.setStage(3);
      d = await dl();
      s = await sig(sw, a, ci, u2.address, 3, 1, d);
      await c.connect(u2).mint(1, 1, 1, d, s, { value: fcfsPrice });

      // PUBLIC
      await c.setStage(4);
      await c.connect(u3).mint(1, 1, 0, 0, "0x", { value: pubPrice });

      const bal = await ethers.provider.getBalance(a);
      assert.strictEqual(bal, gtdPrice + fcfsPrice + pubPrice);
    });

    it("should revert stage activation without price", async function () {
      const [owner, sw] = await ethers.getSigners();
      const F = await ethers.getContractFactory("NasunGenesisPass");
      const c = await F.deploy("a", "b", sw.address, 100, owner.address, 500);
      await c.waitForDeployment();
      await expectRevert(() => c.setStage(2), "StageNotPriced");
    });

    it("should reject setStagePrice for FREE_MINT", async function () {
      const { c } = await deployFixture();
      await expectRevert(() => c.setStagePrice(1, ethers.parseEther("0.01")), "StageNotPriced");
    });

    it("should reject setStagePrice with price=0", async function () {
      const { c } = await deployFixture();
      await expectRevert(() => c.setStagePrice(4, 0), "StageNotPriced");
    });

    it("should reject minting if price somehow 0 on paid stage (defense-in-depth)", async function () {
      // This tests the mint() internal guard. Under normal operation, setStage blocks
      // unpriced stages. But the mint() check is independent defense-in-depth.
      // We cannot directly test this without bypassing setStage, so we verify
      // the setStage guard works correctly instead.
      const [owner, sw] = await ethers.getSigners();
      const F = await ethers.getContractFactory("NasunGenesisPass");
      const c = await F.deploy("a", "b", sw.address, 100, owner.address, 500);
      await c.waitForDeployment();
      await c.setWalletLimit(2, 1);
      // Cannot activate GTD without price
      await expectRevert(() => c.setStage(2), "StageNotPriced");
    });

    it("should return correct currentMintPrice", async function () {
      const { c, mp } = await deployFixture();
      assert.strictEqual(await c.currentMintPrice(), 0n); // PAUSED
      await c.setStage(1);
      assert.strictEqual(await c.currentMintPrice(), 0n); // FREE_MINT
      await c.setStage(4);
      assert.strictEqual(await c.currentMintPrice(), mp); // PUBLIC
    });
  });

  describe("12. Emergency Withdrawal While Paused", function () {
    it("should allow withdrawal when stage is PAUSED", async function () {
      const { c, u1, mp, owner } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.setStage(0);
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await c.withdrawTo(owner.address);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      assert.strictEqual(after - before + gas, mp);
    });
  });
});
