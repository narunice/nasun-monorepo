const { ethers } = require("hardhat");
const assert = require("assert");

async function deployFixture() {
  const [owner, signer, user1, user2, withdrawTarget] = await ethers.getSigners();
  const baseURI = "ipfs://QmTest";
  const mintPrice = ethers.parseEther("0.05");
  const defaultMaxSupply = 100;
  const royaltyBps = 500;

  const Factory = await ethers.getContractFactory("NasunGenesisPass");
  const contract = await Factory.deploy(
    baseURI, "ipfs://QmContractMeta", signer.address,
    mintPrice, defaultMaxSupply, owner.address, royaltyBps
  );
  await contract.waitForDeployment();
  await contract.setWalletLimit(1, 2);
  await contract.setWalletLimit(2, 3);
  await contract.setWalletLimit(3, 3);
  await contract.setWalletLimit(4, 5);
  return { contract, owner, signer, user1, user2, withdrawTarget, mintPrice, baseURI };
}

// New signature: (minter, stage, maxQuantity, deadline) - no tokenId
async function createSig(signerWallet, contractAddr, chainId, minter, stage, maxQuantity, deadline) {
  return signerWallet.signTypedData(
    { name: "NasunGenesisPass", version: "1", chainId, verifyingContract: contractAddr },
    { Mint: [
      { name: "minter", type: "address" },
      { name: "stage", type: "uint8" },
      { name: "maxQuantity", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]},
    { minter, stage, maxQuantity, deadline }
  );
}

async function getChainId() { return (await ethers.provider.getNetwork()).chainId; }
async function getDeadline(s = 600) { return BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(s); }

describe("NasunGenesisPass", function () {
  describe("Deployment", function () {
    it("should set initial state correctly", async function () {
      const { contract, owner, signer, mintPrice } = await deployFixture();
      assert.strictEqual(await contract.currentStage(), 0n);
      assert.strictEqual(await contract.mintPrice(), mintPrice);
      assert.strictEqual(await contract.signer(), signer.address);
      assert.strictEqual(await contract.owner(), owner.address);
      for (let i = 1; i <= 7; i++) assert.strictEqual(await contract.maxSupply(i), 100n);
    });

    it("should set URI correctly", async function () {
      const { contract } = await deployFixture();
      assert.strictEqual(await contract.uri(1), "ipfs://QmTest/1.json");
      assert.strictEqual(await contract.uri(7), "ipfs://QmTest/7.json");
    });

    it("should support ERC-1155 and ERC-2981 interfaces", async function () {
      const { contract } = await deployFixture();
      assert.strictEqual(await contract.supportsInterface("0xd9b67a26"), true);
      assert.strictEqual(await contract.supportsInterface("0x2a55205a"), true);
      assert.strictEqual(await contract.supportsInterface("0x01ffc9a7"), true);
    });

    it("should revert with zero signer address", async function () {
      const [owner] = await ethers.getSigners();
      const F = await ethers.getContractFactory("NasunGenesisPass");
      try { await F.deploy("a", "b", ethers.ZeroAddress, 0, 100, owner.address, 500); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ZeroAddress") || e.message.includes("revert")); }
    });
  });

  describe("Minting - FREE_MINT", function () {
    it("should allow free mint with valid signature", async function () {
      const { contract, signer, user1 } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(1);
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 2, deadline);
      await contract.connect(user1).mint(1, 1, 2, deadline, sig, { value: 0 });
      assert.strictEqual(await contract.balanceOf(user1.address, 1), 1n);
    });

    it("should revert if payment sent during free mint", async function () {
      const { contract, signer, user1, mintPrice } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(1);
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 1, deadline);
      try { await contract.connect(user1).mint(1, 1, 1, deadline, sig, { value: mintPrice }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidPayment") || e.message.includes("revert")); }
    });
  });

  describe("Minting - GTD_ALLOWLIST", function () {
    it("should allow paid mint with valid signature", async function () {
      const { contract, signer, user1, mintPrice } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(2);
      const sig = await createSig(signer, addr, chainId, user1.address, 2, 3, deadline);
      await contract.connect(user1).mint(3, 2, 3, deadline, sig, { value: mintPrice * 2n });
      assert.strictEqual(await contract.balanceOf(user1.address, 3), 2n);
    });

    it("should revert with incorrect payment", async function () {
      const { contract, signer, user1, mintPrice } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(2);
      const sig = await createSig(signer, addr, chainId, user1.address, 2, 1, deadline);
      try { await contract.connect(user1).mint(1, 1, 1, deadline, sig, { value: mintPrice / 2n }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidPayment") || e.message.includes("revert")); }
    });
  });

  describe("Minting - PUBLIC", function () {
    it("should allow public mint without signature", async function () {
      const { contract, user1, mintPrice } = await deployFixture();
      await contract.setStage(4);
      await contract.connect(user1).mint(5, 1, 0, 0, "0x", { value: mintPrice });
      assert.strictEqual(await contract.balanceOf(user1.address, 5), 1n);
    });
  });

  describe("Signature validation", function () {
    it("should reject invalid signer", async function () {
      const { contract, user1, user2 } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(1);
      const sig = await createSig(user2, addr, chainId, user1.address, 1, 1, deadline);
      try { await contract.connect(user1).mint(1, 1, 1, deadline, sig, { value: 0 }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidSignature") || e.message.includes("revert")); }
    });

    it("should reject expired signature", async function () {
      const { contract, signer, user1 } = await deployFixture();
      const [chainId, addr] = [await getChainId(), await contract.getAddress()];
      await contract.setStage(1);
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 1, 1n);
      try { await contract.connect(user1).mint(1, 1, 1, 1n, sig, { value: 0 }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("SignatureExpired") || e.message.includes("revert")); }
    });

    it("should reject cross-stage signature replay", async function () {
      const { contract, signer, user1, mintPrice } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 1, deadline);
      await contract.setStage(2);
      try { await contract.connect(user1).mint(1, 1, 1, deadline, sig, { value: mintPrice }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidSignature") || e.message.includes("revert")); }
    });

    it("should reject signature meant for different minter", async function () {
      const { contract, signer, user1, user2 } = await deployFixture();
      const [chainId, deadline, addr] = [await getChainId(), await getDeadline(), await contract.getAddress()];
      await contract.setStage(1);
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 1, deadline);
      try { await contract.connect(user2).mint(1, 1, 1, deadline, sig, { value: 0 }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidSignature") || e.message.includes("revert")); }
    });
  });

  describe("Limits", function () {
    it("should enforce wallet limit per stage", async function () {
      const { contract, signer, user1 } = await deployFixture();
      const [chainId, addr] = [await getChainId(), await contract.getAddress()];
      await contract.setStage(1); // limit = 2
      let d = await getDeadline();
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 2, d);
      await contract.connect(user1).mint(1, 2, 2, d, sig, { value: 0 });
      d = await getDeadline();
      const sig2 = await createSig(signer, addr, chainId, user1.address, 1, 3, d);
      try { await contract.connect(user1).mint(1, 1, 3, d, sig2, { value: 0 }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("WalletLimitExceeded") || e.message.includes("revert")); }
    });

    it("should enforce max supply per token", async function () {
      const { contract, signer, user1, user2 } = await deployFixture();
      const [chainId, addr] = [await getChainId(), await contract.getAddress()];
      await contract.setMaxSupply(1, 1);
      await contract.setStage(1);
      const d = await getDeadline();
      const sig1 = await createSig(signer, addr, chainId, user1.address, 1, 1, d);
      await contract.connect(user1).mint(1, 1, 1, d, sig1, { value: 0 });
      const sig2 = await createSig(signer, addr, chainId, user2.address, 1, 1, d);
      try { await contract.connect(user2).mint(1, 1, 1, d, sig2, { value: 0 }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("SoldOut") || e.message.includes("revert")); }
    });

    it("should reject invalid token IDs", async function () {
      const { contract, user1, mintPrice } = await deployFixture();
      await contract.setStage(4);
      try { await contract.connect(user1).mint(0, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidTokenId") || e.message.includes("revert")); }
      try { await contract.connect(user1).mint(8, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("InvalidTokenId") || e.message.includes("revert")); }
    });
  });

  describe("Admin functions", function () {
    it("should allow owner to set stage", async function () {
      const { contract } = await deployFixture();
      await contract.setStage(4);
      assert.strictEqual(await contract.currentStage(), 4n);
    });

    it("should reject non-owner stage changes", async function () {
      const { contract, user1 } = await deployFixture();
      try { await contract.connect(user1).setStage(4); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("OwnableUnauthorizedAccount") || e.message.includes("revert")); }
    });

    it("should allow owner to change signer", async function () {
      const { contract, user1 } = await deployFixture();
      await contract.setSigner(user1.address);
      assert.strictEqual(await contract.signer(), user1.address);
    });

    it("should reject zero address signer", async function () {
      const { contract } = await deployFixture();
      try { await contract.setSigner(ethers.ZeroAddress); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ZeroAddress") || e.message.includes("revert")); }
    });

    it("should allow owner to change mint price", async function () {
      const { contract } = await deployFixture();
      const p = ethers.parseEther("0.1");
      await contract.setMintPrice(p);
      assert.strictEqual(await contract.mintPrice(), p);
    });

    it("should prevent setting maxSupply below totalMinted", async function () {
      const { contract, signer, user1 } = await deployFixture();
      const [chainId, addr] = [await getChainId(), await contract.getAddress()];
      await contract.setStage(1);
      const d = await getDeadline();
      const sig = await createSig(signer, addr, chainId, user1.address, 1, 2, d);
      await contract.connect(user1).mint(1, 2, 2, d, sig, { value: 0 });
      try { await contract.setMaxSupply(1, 1); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("SupplyBelowMinted") || e.message.includes("revert")); }
    });

    it("should allow URI update", async function () {
      const { contract } = await deployFixture();
      await contract.setURI("ipfs://QmNewCID");
      assert.strictEqual(await contract.uri(1), "ipfs://QmNewCID/1.json");
    });
  });

  describe("Withdrawal", function () {
    it("should allow owner to withdraw to specified address", async function () {
      const { contract, signer, user1, withdrawTarget, mintPrice } = await deployFixture();
      const [chainId, addr] = [await getChainId(), await contract.getAddress()];
      await contract.setStage(2);
      const d = await getDeadline();
      const sig = await createSig(signer, addr, chainId, user1.address, 2, 1, d);
      await contract.connect(user1).mint(1, 1, 1, d, sig, { value: mintPrice });
      const before = await ethers.provider.getBalance(withdrawTarget.address);
      await contract.withdrawTo(withdrawTarget.address);
      const after = await ethers.provider.getBalance(withdrawTarget.address);
      assert.strictEqual(after - before, mintPrice);
    });

    it("should reject withdrawal to zero address", async function () {
      const { contract } = await deployFixture();
      try { await contract.withdrawTo(ethers.ZeroAddress); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("ZeroAddress") || e.message.includes("revert")); }
    });
  });

  describe("Stage PAUSED (replaces Pausable)", function () {
    it("should prevent minting when stage is PAUSED", async function () {
      const { contract, user1, mintPrice } = await deployFixture();
      await contract.setStage(4);
      await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice });
      await contract.setStage(0); // PAUSED
      try { await contract.connect(user1).mint(1, 1, 0, 0, "0x", { value: mintPrice }); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("StagePaused") || e.message.includes("revert")); }
    });

    it("should allow admin functions while paused", async function () {
      const { contract } = await deployFixture();
      // Stage is PAUSED by default
      await contract.setMintPrice(ethers.parseEther("0.1"));
      await contract.setMaxSupply(1, 50);
      await contract.setWalletLimit(4, 10);
      await contract.setURI("ipfs://new");
    });
  });

  describe("Ownable2Step", function () {
    it("should require two-step ownership transfer", async function () {
      const { contract, owner, user1 } = await deployFixture();
      await contract.transferOwnership(user1.address);
      assert.strictEqual(await contract.owner(), owner.address);
      await contract.connect(user1).acceptOwnership();
      assert.strictEqual(await contract.owner(), user1.address);
    });

    it("should block renounceOwnership", async function () {
      const { contract, owner } = await deployFixture();
      try { await contract.renounceOwnership(); assert.fail(); }
      catch (e) { assert.ok(e.message.includes("Renounce disabled") || e.message.includes("revert")); }
      assert.strictEqual(await contract.owner(), owner.address);
    });
  });

  describe("Royalty", function () {
    it("should return correct royalty info", async function () {
      const { contract, owner } = await deployFixture();
      const [receiver, amount] = await contract.royaltyInfo(1, ethers.parseEther("1"));
      assert.strictEqual(receiver, owner.address);
      assert.strictEqual(amount, ethers.parseEther("0.05"));
    });
  });
});
