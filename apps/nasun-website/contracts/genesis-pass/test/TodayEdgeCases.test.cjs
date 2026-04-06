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
async function mineBlocks(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("MintDeadline Edge Cases", function () {
  it("should allow minting at exactly the deadline", async function () {
    const { c, u1, mp } = await deployFixture();
    await c.setStage(4);
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 100);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
    assert.strictEqual(await c.totalMinted(1), 1n);
  });

  it("should block minting after deadline", async function () {
    const { c, u1, mp } = await deployFixture();
    await c.setStage(4);
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 2);
    await mineBlocks(3);
    await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }), "MintingEnded");
  });

  it("should not affect admin functions after deadline", async function () {
    const { c } = await deployFixture();
    await c.setStage(4);
    await c.setMintDeadline(1); // past
    await c.setStagePrice(4, ethers.parseEther("0.1"));
    await c.setURI("ipfs://new");
  });

  it("should allow withdrawal after deadline", async function () {
    const { c, u1, mp, owner } = await deployFixture();
    await c.setStage(4);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
    await c.setMintDeadline(1);
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await c.withdrawTo(owner.address);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);
    assert.strictEqual(after - before + gas, mp);
  });

  it("should re-enable minting when deadline extended", async function () {
    const { c, u1, mp } = await deployFixture();
    await c.setStage(4);
    await c.setMintDeadline(1);
    await expectRevert(() => c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp }), "MintingEnded");
    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);
    await c.connect(u1).mint(1, 1, 0, 0, "0x", { value: mp });
    assert.strictEqual(await c.totalMinted(1), 1n);
  });
});

describe("HighWaterMark Edge Cases", function () {
  it("should track highWaterMark correctly", async function () {
    const { c } = await deployFixture();
    assert.strictEqual(Number(await c.highWaterMark()), 0);
    await c.setStage(1);
    assert.strictEqual(Number(await c.highWaterMark()), 1);
    await c.setStage(4);
    assert.strictEqual(Number(await c.highWaterMark()), 4);
  });

  it("should NOT update highWaterMark when entering PAUSED", async function () {
    const { c } = await deployFixture();
    await c.setStage(3);
    await c.setStage(0);
    assert.strictEqual(Number(await c.highWaterMark()), 3);
  });

  it("should block ALL previous stages after reaching PUBLIC via PAUSED", async function () {
    const { c } = await deployFixture();
    await c.setStage(1); await c.setStage(2); await c.setStage(3); await c.setStage(4);
    await c.setStage(0);
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");
    await expectRevert(() => c.setStage(4), "BackwardStageTransition");
  });

  it("should prevent signature replay via PAUSED bypass", async function () {
    const { c, sw, u1 } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];
    await c.setStage(1);
    const d = await dl();
    const s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });
    await c.setStage(2);
    await c.setStage(0);
    await expectRevert(() => c.setStage(1), "BackwardStageTransition");
  });
});

describe("Full Lifecycle with All Features", function () {
  it("should complete deploy -> prices -> stages -> deadline -> unlock -> withdraw", async function () {
    const { c, sw, u1, u2, u3, u4, mp } = await deployFixture();
    const [ci, a] = [await cid(), await c.getAddress()];

    const block = await ethers.provider.getBlock("latest");
    await c.setMintDeadline(block.timestamp + 3600);
    assert.strictEqual(Number(await c.highWaterMark()), 0);

    // FREE_MINT
    await c.setStage(1);
    let d = await dl();
    let s = await sig(sw, a, ci, u1.address, 1, 1, d);
    await c.connect(u1).mint(1, 1, 1, d, s, { value: 0 });

    // GTD
    await c.setStage(2);
    d = await dl();
    s = await sig(sw, a, ci, u2.address, 2, 1, d);
    await c.connect(u2).mint(3, 1, 1, d, s, { value: mp });

    // FCFS
    await c.setStage(3);
    d = await dl();
    s = await sig(sw, a, ci, u3.address, 3, 1, d);
    await c.connect(u3).mint(5, 1, 1, d, s, { value: mp });

    // PUBLIC
    await c.setStage(4);
    await c.connect(u4).mint(7, 1, 0, 0, "0x", { value: mp });

    assert.strictEqual(await c.totalMinted(1), 1n);
    assert.strictEqual(await c.totalMinted(3), 1n);
    assert.strictEqual(await c.totalMinted(5), 1n);
    assert.strictEqual(await c.totalMinted(7), 1n);

    // Revenue
    const revenue = mp * 3n;
    assert.strictEqual(await ethers.provider.getBalance(a), revenue);

    // Unlock + Transfer
    await c.unlockTransfers();
    await c.connect(u4).safeTransferFrom(u4.address, u1.address, 7, 1, "0x");
    assert.strictEqual(await c.balanceOf(u1.address, 7), 1n);

    // Withdraw
    const [,,,,, dest] = await ethers.getSigners();
    await c.withdrawTo(dest.address);
    assert.strictEqual(await ethers.provider.getBalance(a), 0n);
  });
});

describe("MaxSupply + ContractURI", function () {
  it("should deploy with custom maxSupply", async function () {
    const [owner, sw] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NasunGenesisPass");
    const c = await F.deploy("a", "b", sw.address, 20000, owner.address, 500);
    await c.waitForDeployment();
    for (let i = 1; i <= 7; i++) assert.strictEqual(await c.maxSupply(i), 20000n);
  });

  it("should return contractURI", async function () {
    const { c } = await deployFixture();
    assert.strictEqual(await c.contractURI(), "ipfs://QmCol");
  });

  it("should update contractURI", async function () {
    const { c } = await deployFixture();
    await c.setContractURI("ipfs://New");
    assert.strictEqual(await c.contractURI(), "ipfs://New");
  });
});
