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

describe("Security E2E Tests", function () {

  describe("1. Reentrancy + Bot Protection", function () {
    it("should block contract minters in PUBLIC stage (ContractMinter guard)", async function () {
      const { c, mp } = await deployFixture();
      await c.setStage(4);
      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const a = await A.deploy(await c.getAddress());
      await a.waitForDeployment();
      try { await a.attackPublic({ value: mp * 3n }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ContractMinter") || e.message.includes("revert")); }
      const bal = await c.balanceOf(await a.getAddress(), 1);
      assert.strictEqual(bal, 0n);
    });

    it("should block reentrancy in allowlist stage via nonReentrant guard", async function () {
      const { c, sw, mp } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(1); // FREE_MINT - no ContractMinter check

      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await A.deploy(a);
      await attacker.waitForDeployment();
      const attackerAddr = await attacker.getAddress();

      // Sign for the attacker contract address
      const d = await dl();
      const s = await sig(sw, a, ci, attackerAddr, 1, 3, d);

      // Attacker tries to re-enter mint() via onERC1155Received callback
      // nonReentrant should block re-entrant calls
      await attacker.attackWithSignature(3, d, s, { value: 0 });

      // Only 1 token should be minted (re-entrant calls blocked)
      const bal = await c.balanceOf(attackerAddr, 1);
      assert.strictEqual(bal, 1n, "nonReentrant should limit to 1 mint despite re-entry attempts");
    });

    it("should allow contract minting in allowlist stages (no ContractMinter check)", async function () {
      const { c, sw, mp } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(2); // GTD - no ContractMinter check

      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await A.deploy(a);
      await attacker.waitForDeployment();
      const attackerAddr = await attacker.getAddress();

      const d = await dl();
      // maxQuantity=3 so wallet limit is the only other cap, not maxQuantity
      const s = await sig(sw, a, ci, attackerAddr, 2, 3, d);
      await attacker.attackWithSignature(3, d, s, { value: mp * 3n });
      // First mint succeeds, re-entrant calls blocked by nonReentrant
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
          { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }]},
        { minter: u1.address, stage: 1, maxQuantity: 1, deadline: d }
      );
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, d, s, { value: 0 }), "InvalidSignature");
    });

    it("should reject wrong domain version", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, d, a] = [await cid(), await dl(), await c.getAddress()];
      await c.setStage(1);
      const s = await sw.signTypedData(
        { name: "NasunGenesisPass", version: "2", chainId: ci, verifyingContract: a },
        { Mint: [{ name: "minter", type: "address" }, { name: "stage", type: "uint8" },
          { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }]},
        { minter: u1.address, stage: 1, maxQuantity: 1, deadline: d }
      );
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, d, s, { value: 0 }), "InvalidSignature");
    });

    it("should reject wrong verifyingContract", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, d] = [await cid(), await dl()];
      await c.setStage(1);
      const s = await sw.signTypedData(
        { name: "NasunGenesisPass", version: "1", chainId: ci, verifyingContract: u1.address },
        { Mint: [{ name: "minter", type: "address" }, { name: "stage", type: "uint8" },
          { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" }]},
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

    it("should reject truncated signature", async function () {
      const { c, u1 } = await deployFixture();
      await c.setStage(1);
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, 9999999999n, ethers.hexlify(ethers.randomBytes(32)), { value: 0 }), "revert");
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

    it("should handle mintPrice=0 on paid stages", async function () {
      const { c, u1 } = await deployFixture();
      await c.setMintPrice(0);
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: 0 });
      assert.strictEqual(await c.totalMinted(1), 1n);
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
      await c.setStage(4);
      await c.connect(u1).mint(1, 2, 0, 0, "0x", { value: mp * 2n });
      await c.connect(u2).mint(3, 1, 0, 0, "0x", { value: mp });
      const [,,, t] = await ethers.getSigners();
      const before = await ethers.provider.getBalance(t.address);
      await c.withdrawTo(t.address);
      const after = await ethers.provider.getBalance(t.address);
      assert.strictEqual(after - before, mp * 3n);
    });
  });

  describe("5. Supply Integrity", function () {
    it("should enforce maxSupply at boundary", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setMaxSupply(1, 3);
      await c.setStage(4);
      await c.connect(u1).mint(1, 3, 0, 0, "0x", { value: mp * 3n });
      await expectRevert(() => c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp }), "SoldOut");
    });

    it("should handle supply increase after sold out", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setMaxSupply(1, 2);
      await c.setStage(4);
      await c.connect(u1).mint(1, 2, 0, 0, "0x", { value: mp * 2n });
      await expectRevert(() => c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp }), "SoldOut");
      await c.setMaxSupply(1, 5);
      await c.connect(u2).mint(1, 3, 0, 0, "0x", { value: mp * 3n });
      assert.strictEqual(await c.totalMinted(1), 5n);
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
      await c.setMaxSupply(1, 10);

      // FREE_MINT
      await c.setStage(1);
      let d = await dl();
      let s = await sig(sw, a, ci, u1.address, 1, 1, d);
      await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

      // GTD
      await c.setStage(2);
      d = await dl();
      s = await sig(sw, a, ci, u2.address, 2, 2, d);
      await c.connect(u2).mint(1, 2, 2, d, s, { value: mp * 2n });

      // FCFS
      await c.setStage(3);
      d = await dl();
      s = await sig(sw, a, ci, u3.address, 3, 3, d);
      await c.connect(u3).mint(1, 3, 3, d, s, { value: mp * 3n });

      // PUBLIC
      await c.setStage(4);
      await c.connect(u4).mint(1, 2, 0, 0, "0x", { value: mp * 2n });
      await c.connect(u5).mint(1, 2, 0, 0, "0x", { value: mp * 2n });
      assert.strictEqual(await c.totalMinted(1), 10n);
      await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }), "SoldOut");

      // Withdrawal
      const revenue = mp * 9n;
      assert.strictEqual(await ethers.provider.getBalance(a), revenue);
      const [,,,,,,,dest] = await ethers.getSigners();
      const before = await ethers.provider.getBalance(dest.address);
      await c.withdrawTo(dest.address);
      assert.strictEqual(await ethers.provider.getBalance(dest.address) - before, revenue);

      // Transfer
      await c.connect(u1).safeTransferFrom(u1.address, u5.address, 1, 1, "0x");
      assert.strictEqual(await c.balanceOf(u1.address, 1), 0n);
      assert.strictEqual(await c.balanceOf(u5.address, 1), 3n);
    });
  });

  describe("8. Stage Transition + Backward Guard", function () {
    it("should prevent cross-stage signature use", async function () {
      const { c, sw, u1, mp } = await deployFixture();
      const [ci, d, a] = [await cid(), await dl(), await c.getAddress()];
      const s = await sig(sw, a, ci, u1.address, 1, 1, d);
      await c.setStage(2);
      await expectRevert(() => c.connect(u1).mint(1, 1, 1, d, s, { value: mp }), "InvalidSignature");
    });

    it("should handle forward stage transitions and PAUSED", async function () {
      const { c, u1, mp } = await deployFixture();
      // Forward progression works
      await c.setStage(1); await c.setStage(2); await c.setStage(3); await c.setStage(4);
      // PAUSED always allowed
      await c.setStage(0);
      // After reaching PUBLIC(4), cannot re-enter (highWaterMark=4)
      await expectRevert(() => c.setStage(4), "BackwardStageTransition");
      // Can only PAUSE again
      assert.strictEqual(await c.currentStage(), 0n);
    });

    it("should block backward stage transition", async function () {
      const { c } = await deployFixture();
      await c.setStage(2); // GTD
      await expectRevert(() => c.setStage(1), "BackwardStageTransition"); // back to FREE_MINT
    });

    it("should block same-stage re-entry", async function () {
      const { c } = await deployFixture();
      await c.setStage(2);
      await expectRevert(() => c.setStage(2), "BackwardStageTransition"); // same stage
    });

    it("should allow PAUSED from any stage", async function () {
      const { c } = await deployFixture();
      await c.setStage(3);
      await c.setStage(0); // PAUSED from FCFS - OK
      assert.strictEqual(await c.currentStage(), 0n);
    });

    it("should allow forward resume after PAUSED", async function () {
      const { c } = await deployFixture();
      await c.setStage(2); // GTD
      await c.setStage(0); // PAUSED
      await c.setStage(3); // FCFS (forward past highWaterMark=2)
      assert.strictEqual(await c.currentStage(), 3n);
    });

    it("should block backward regression via PAUSED bypass", async function () {
      const { c } = await deployFixture();
      await c.setStage(2); // GTD, highWaterMark=2
      await c.setStage(0); // PAUSED, highWaterMark stays 2
      // Attempt to go back to FREE_MINT(1) - should fail even though currentStage=0
      await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    });

    it("should block same-stage re-entry after PAUSED", async function () {
      const { c } = await deployFixture();
      await c.setStage(2); // GTD, highWaterMark=2
      await c.setStage(0); // PAUSED
      // Attempt to re-enter GTD(2) - should fail (2 <= highWaterMark=2)
      await expectRevert(() => c.setStage(2), "BackwardStageTransition");
    });
  });

  describe("8b. Same Signature Split Minting", function () {
    it("should allow split minting with same signature across same tokenId", async function () {
      const { c, sw, u1 } = await deployFixture();
      const [ci, a] = [await cid(), await c.getAddress()];
      await c.setStage(1); // FREE_MINT, walletLimit=2
      const d = await dl();
      const s = await sig(sw, a, ci, u1.address, 1, 2, d);

      // Mint 1, then 1 more with same signature
      await c.connect(u1).mint(1, 1, 2, d, s, { value: 0 });
      assert.strictEqual(await c.totalMinted(1), 1n);
      await c.connect(u1).mint(1, 1, 2, d, s, { value: 0 });
      assert.strictEqual(await c.totalMinted(1), 2n);

      // Third should fail (maxQuantity exhausted)
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 2, d, s, { value: 0 }),
        "WalletLimitExceeded"
      );
    });
  });

  describe("9. Bot Protection (PUBLIC)", function () {
    it("should block contract-based minters in PUBLIC stage", async function () {
      const { c, mp } = await deployFixture();
      await c.setStage(4);
      const A = await ethers.getContractFactory("ReentrancyAttacker");
      const a = await A.deploy(await c.getAddress());
      await a.waitForDeployment();
      try { await a.attackPublic({ value: mp }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ContractMinter") || e.message.includes("revert")); }
    });

    it("should allow EOA minting in PUBLIC stage", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });
  });

  describe("10. Metadata Integrity", function () {
    it("should return correct URIs for all 7 types", async function () {
      const { c } = await deployFixture();
      for (let i = 1; i <= 7; i++) assert.strictEqual(await c.uri(i), `ipfs://QmTest/${i}.json`);
    });

    it("should return contractURI", async function () {
      const { c } = await deployFixture();
      assert.strictEqual(await c.contractURI(), "ipfs://QmCol");
    });

    it("should update both URIs", async function () {
      const { c } = await deployFixture();
      await c.setURI("ipfs://New");
      await c.setContractURI("ipfs://NewCol");
      assert.strictEqual(await c.uri(1), "ipfs://New/1.json");
      assert.strictEqual(await c.contractURI(), "ipfs://NewCol");
    });
  });

  describe("11. Royalty", function () {
    it("should return 5% for all types", async function () {
      const { c, owner } = await deployFixture();
      for (let i = 1; i <= 7; i++) {
        const [r, a] = await c.royaltyInfo(i, ethers.parseEther("1"));
        assert.strictEqual(r, owner.address);
        assert.strictEqual(a, ethers.parseEther("0.05"));
      }
    });
  });

  describe("12. Price Change Mid-Stage", function () {
    it("should enforce new price immediately", async function () {
      const { c, u1, u2, mp } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      const np = ethers.parseEther("0.1");
      await c.setMintPrice(np);
      await expectRevert(() => c.connect(u2).mint(1, 1, 0, 0, "0x", { value: mp }), "InvalidPayment");
      await c.connect(u2).mint(1, 1, 0, 0, "0x", { value: np });
      assert.strictEqual(await c.totalMinted(1), 2n);
    });
  });

  describe("13. Mint Deadline", function () {
    it("should block minting after deadline", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      // Set deadline 2 seconds in the future
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 2);

      // Mine a block to advance time past deadline
      await ethers.provider.send("evm_increaseTime", [3]);
      await ethers.provider.send("evm_mine", []);

      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "MintingEnded"
      );
    });

    it("should allow minting before deadline", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 3600); // 1 hour from now
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });

    it("should have no deadline when mintDeadline = 0 (default)", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      assert.strictEqual(await c.mintDeadline(), 0n);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });

    it("should allow owner to change deadline", async function () {
      const { c } = await deployFixture();
      await c.setMintDeadline(1000000);
      assert.strictEqual(await c.mintDeadline(), 1000000n);
      await c.setMintDeadline(2000000);
      assert.strictEqual(await c.mintDeadline(), 2000000n);
      await c.setMintDeadline(0);
      assert.strictEqual(await c.mintDeadline(), 0n);
    });

    it("should block minting when both deadline passed AND stage active", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4); // PUBLIC active
      await c.setMintDeadline(1); // Past timestamp
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "MintingEnded"
      );
    });

    it("should block non-owner from setting deadline", async function () {
      const { c, u1 } = await deployFixture();
      await expectRevert(
        () => c.connect(u1).setMintDeadline(9999999),
        "OwnableUnauthorizedAccount"
      );
    });

    it("should re-enable minting when deadline extended", async function () {
      const { c, u1, mp } = await deployFixture();
      await c.setStage(4);
      await c.setMintDeadline(1); // Past deadline
      await expectRevert(
        () => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }),
        "MintingEnded"
      );
      // Extend deadline
      const block = await ethers.provider.getBlock("latest");
      await c.setMintDeadline(block.timestamp + 3600);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      assert.strictEqual(await c.totalMinted(1), 1n);
    });
  });

  describe("14. Emergency Withdrawal While Paused", function () {
    it("should allow withdrawal when stage is PAUSED", async function () {
      const { c, u1, mp, owner } = await deployFixture();
      await c.setStage(4);
      await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
      await c.setStage(0); // PAUSED
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await c.withdrawTo(owner.address);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      assert.strictEqual(after - before + gas, mp);
    });
  });
});
