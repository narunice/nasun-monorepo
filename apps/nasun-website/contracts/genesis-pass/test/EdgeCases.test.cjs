const { ethers } = require("hardhat");
const assert = require("assert");

async function deployFixture() {
  const [owner, signer, user1, user2, user3] = await ethers.getSigners();
  const mintPrice = ethers.parseEther("0.05");
  const Factory = await ethers.getContractFactory("NasunGenesisPass");
  const contract = await Factory.deploy(
    "ipfs://QmTest", "ipfs://QmCol", signer.address, mintPrice, 100, owner.address, 500
  );
  await contract.waitForDeployment();
  await contract.setWalletLimit(1, 2);
  await contract.setWalletLimit(2, 3);
  await contract.setWalletLimit(3, 3);
  await contract.setWalletLimit(4, 5);
  return { contract, owner, signer, user1, user2, user3, mintPrice };
}

async function createSig(sw, addr, cid, minter, stage, maxQty, deadline) {
  return sw.signTypedData(
    { name: "NasunGenesisPass", version: "1", chainId: cid, verifyingContract: addr },
    { Mint: [
      { name: "minter", type: "address" }, { name: "stage", type: "uint8" },
      { name: "maxQuantity", type: "uint256" }, { name: "deadline", type: "uint256" },
    ]},
    { minter, stage, maxQuantity: maxQty, deadline }
  );
}
async function getDeadline() { return BigInt((await ethers.provider.getBlock("latest")).timestamp) + 600n; }
async function getChainId() { return (await ethers.provider.getNetwork()).chainId; }

describe("Edge Cases", function () {
  it("should revert on quantity=0", async function () {
    const { contract, signer, user1 } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(1);
    const sig = await createSig(signer, a, cid, user1.address, 1, 1, d);
    try { await contract.connect(user1).mint(1, 0, 1, d, sig, { value: 0 }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("ZeroQuantity") || e.message.includes("revert")); }
  });

  it("should invalidate old signer's signatures after rotation", async function () {
    const { contract, signer, user1, user2 } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(1);
    const sig = await createSig(signer, a, cid, user1.address, 1, 1, d);
    await contract.setSigner(user2.address);
    try { await contract.connect(user1).mint(1, 1, 1, d, sig, { value: 0 }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("InvalidSignature") || e.message.includes("revert")); }
    const newSig = await createSig(user2, a, cid, user1.address, 1, 1, d);
    await contract.connect(user1).mint(1, 1, 1, d, newSig, { value: 0 });
    assert.strictEqual(await contract.totalMinted(1), 1n);
  });

  it("should allow minting in new stage even if maxed in previous stage", async function () {
    const { contract, signer, user1, mintPrice } = await deployFixture();
    const [cid, a] = [await getChainId(), await contract.getAddress()];
    await contract.setStage(1);
    let d = await getDeadline();
    let sig = await createSig(signer, a, cid, user1.address, 1, 2, d);
    await contract.connect(user1).mint(1, 2, 2, d, sig, { value: 0 });
    await contract.setStage(4);
    await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice });
    assert.strictEqual(await contract.totalMinted(1), 3n);
  });

  it("should block all minting when wallet limit is 0", async function () {
    const { contract, user1, mintPrice } = await deployFixture();
    await contract.setWalletLimit(4, 0);
    await contract.setStage(4);
    try { await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("WalletLimitExceeded") || e.message.includes("revert")); }
  });

  it("should track supply independently per token type", async function () {
    const { contract, user1, mintPrice } = await deployFixture();
    await contract.setStage(4);
    await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice });
    await contract.connect(user1).mint(3, 2, 0, 0, "0x", { value: mintPrice * 2n });
    await contract.connect(user1).mint(7, 1, 0, 0, "0x", { value: mintPrice });
    assert.strictEqual(await contract.totalMinted(1), 1n);
    assert.strictEqual(await contract.totalMinted(3), 2n);
    assert.strictEqual(await contract.totalMinted(7), 1n);
  });

  it("should enforce wallet limit across token types within same stage", async function () {
    const { contract, user1, mintPrice } = await deployFixture();
    await contract.setStage(4); // limit = 5
    await contract.connect(user1).mint(1, 3, 0, 0, "0x", { value: mintPrice * 3n });
    await contract.connect(user1).mint(2, 2, 0, 0, "0x", { value: mintPrice * 2n });
    try { await contract.connect(user1).mint(3, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("WalletLimitExceeded") || e.message.includes("revert")); }
  });

  it("should accumulate and fully withdraw ETH", async function () {
    const { contract, owner, user1, user2, mintPrice } = await deployFixture();
    await contract.setStage(4);
    await contract.connect(user1).mint(1, 2, 0, 0, "0x", { value: mintPrice * 2n });
    await contract.connect(user2).mint(2, 1, 0, 0, "0x", { value: mintPrice });
    assert.strictEqual(await ethers.provider.getBalance(await contract.getAddress()), mintPrice * 3n);
    await contract.withdrawTo(owner.address);
    assert.strictEqual(await ethers.provider.getBalance(await contract.getAddress()), 0n);
  });

  it("should revert when stage is PAUSED", async function () {
    const { contract, user1, mintPrice } = await deployFixture();
    try { await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("StagePaused") || e.message.includes("revert")); }
  });

  it("should reject signature with mismatched maxQuantity (over-mint)", async function () {
    const { contract, signer, user1 } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(1);
    // Signed for maxQuantity=1, try to pass maxQuantity=2
    const sig = await createSig(signer, a, cid, user1.address, 1, 1, d);
    // Passing maxQuantity=2 won't match the signature
    try { await contract.connect(user1).mint(1, 1, 2, d, sig, { value: 0 }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("InvalidSignature") || e.message.includes("revert")); }
  });

  it("should allow partial minting with maxQuantity signature", async function () {
    const { contract, signer, user1 } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(1);
    // maxQuantity=2, mint 1 at a time
    const sig = await createSig(signer, a, cid, user1.address, 1, 2, d);
    await contract.connect(user1).mint(1, 1, 2, d, sig, { value: 0 });
    assert.strictEqual(await contract.totalMinted(1), 1n);
    // Mint another 1 with same sig (different tokenId!)
    await contract.connect(user1).mint(3, 1, 2, d, sig, { value: 0 });
    assert.strictEqual(await contract.totalMinted(3), 1n);
    // Third should fail (maxQuantity exhausted)
    try { await contract.connect(user1).mint(5, 1, 2, d, sig, { value: 0 }); assert.fail(); }
    catch (e) { assert.ok(e.message.includes("WalletLimitExceeded") || e.message.includes("revert")); }
  });

  it("should allow choosing different token types with same signature", async function () {
    const { contract, signer, user1 } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(1);
    const sig = await createSig(signer, a, cid, user1.address, 1, 2, d);
    await contract.connect(user1).mint(7, 1, 2, d, sig, { value: 0 });
    await contract.connect(user1).mint(2, 1, 2, d, sig, { value: 0 });
    assert.strictEqual(await contract.balanceOf(user1.address, 7), 1n);
    assert.strictEqual(await contract.balanceOf(user1.address, 2), 1n);
  });

  it("should reject all admin functions from non-owner", async function () {
    const { contract, user1 } = await deployFixture();
    const fns = [
      () => contract.connect(user1).setSigner(user1.address),
      () => contract.connect(user1).setMintPrice(0),
      () => contract.connect(user1).setMaxSupply(1, 50),
      () => contract.connect(user1).setWalletLimit(4, 10),
      () => contract.connect(user1).setURI("x"),
      () => contract.connect(user1).withdrawTo(user1.address),
      () => contract.connect(user1).setStage(4),
    ];
    for (const fn of fns) {
      try { await fn(); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("OwnableUnauthorizedAccount") || e.message.includes("revert")); }
    }
  });

  it("should allow token transfer after minting", async function () {
    const { contract, user1, user2, mintPrice } = await deployFixture();
    await contract.setStage(4);
    await contract.connect(user1).mint(1, 2, 0, 0, "0x", { value: mintPrice * 2n });
    await contract.connect(user1).safeTransferFrom(user1.address, user2.address, 1, 1, "0x");
    assert.strictEqual(await contract.balanceOf(user1.address, 1), 1n);
    assert.strictEqual(await contract.balanceOf(user2.address, 1), 1n);
  });

  it("should work correctly in FCFS_ALLOWLIST stage", async function () {
    const { contract, signer, user1, mintPrice } = await deployFixture();
    const [cid, d, a] = [await getChainId(), await getDeadline(), await contract.getAddress()];
    await contract.setStage(3);
    const sig = await createSig(signer, a, cid, user1.address, 3, 1, d);
    await contract.connect(user1).mint(5, 1, 1, d, sig, { value: mintPrice });
    assert.strictEqual(await contract.totalMinted(5), 1n);
  });
});
