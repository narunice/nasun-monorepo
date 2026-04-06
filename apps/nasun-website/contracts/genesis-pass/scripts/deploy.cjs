const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", network.name);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ── Configuration ──
  const BASE_URI = process.env.BASE_URI || "ipfs://PLACEHOLDER_CID";
  const CONTRACT_URI = process.env.CONTRACT_URI || "ipfs://PLACEHOLDER_CONTRACT_CID";
  const SIGNER_ADDRESS = process.env.SIGNER_ADDRESS || deployer.address;
  const DEFAULT_MAX_SUPPLY = parseInt(process.env.DEFAULT_MAX_SUPPLY || "20000", 10);
  const ROYALTY_RECEIVER = process.env.ROYALTY_RECEIVER || deployer.address;
  const ROYALTY_BPS = parseInt(process.env.ROYALTY_BPS || "500", 10);

  // Per-stage prices (wei)
  const STAGE_PRICES = {
    2: ethers.parseEther(process.env.GTD_PRICE_ETH || "0.003"),     // GTD ~$8
    3: ethers.parseEther(process.env.FCFS_PRICE_ETH || "0.004"),    // FCFS ~$10
    4: ethers.parseEther(process.env.PUBLIC_PRICE_ETH || "0.006"),  // PUBLIC ~$15
  };

  // Wallet limits per stage (1 per wallet for all stages)
  const WALLET_LIMITS = {
    1: parseInt(process.env.FREE_MINT_LIMIT || "1", 10),
    2: parseInt(process.env.GTD_LIMIT || "1", 10),
    3: parseInt(process.env.FCFS_LIMIT || "1", 10),
    4: parseInt(process.env.PUBLIC_LIMIT || "1", 10),
  };

  console.log("\n── Deploy Parameters ──");
  console.log("Base URI:", BASE_URI);
  console.log("Contract URI:", CONTRACT_URI);
  console.log("Signer:", SIGNER_ADDRESS);
  console.log("Max Supply per type:", DEFAULT_MAX_SUPPLY);
  console.log("Royalty Receiver:", ROYALTY_RECEIVER);
  console.log("Royalty BPS:", ROYALTY_BPS);
  console.log("Stage Prices:", Object.entries(STAGE_PRICES).map(([s, p]) => `  ${s}: ${ethers.formatEther(p)} ETH`).join("\n"));

  // ── Deploy ──
  const Factory = await ethers.getContractFactory("NasunGenesisPass");
  const contract = await Factory.deploy(
    BASE_URI,
    CONTRACT_URI,
    SIGNER_ADDRESS,
    DEFAULT_MAX_SUPPLY,
    ROYALTY_RECEIVER,
    ROYALTY_BPS
  );
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("\nNasunGenesisPass deployed to:", contractAddress);

  // ── Set stage prices ──
  console.log("\n── Setting stage prices ──");
  for (const [stage, price] of Object.entries(STAGE_PRICES)) {
    const tx = await contract.setStagePrice(parseInt(stage), price);
    await tx.wait();
    console.log(`Stage ${stage} price: ${ethers.formatEther(price)} ETH`);
  }

  // ── Set wallet limits ──
  console.log("\n── Setting wallet limits ──");
  for (const [stage, limit] of Object.entries(WALLET_LIMITS)) {
    const tx = await contract.setWalletLimit(parseInt(stage), limit);
    await tx.wait();
    console.log(`Stage ${stage} wallet limit: ${limit}`);
  }

  // ── Save deployment info ──
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    address: contractAddress,
    chainId,
    deployer: deployer.address,
    signer: SIGNER_ADDRESS,
    stagePrices: Object.fromEntries(
      Object.entries(STAGE_PRICES).map(([s, p]) => [s, p.toString()])
    ),
    maxSupply: DEFAULT_MAX_SUPPLY,
    walletLimits: WALLET_LIMITS,
    deployedAt: new Date().toISOString(),
    network: network.name,
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${chainId}.json`),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\nDeployment info saved to deployments/${chainId}.json`);

  // ── Verify on Etherscan ──
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    const deployTx = contract.deploymentTransaction();
    if (deployTx) await deployTx.wait(5);

    console.log("Verifying on Etherscan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [
          BASE_URI,
          CONTRACT_URI,
          SIGNER_ADDRESS,
          DEFAULT_MAX_SUPPLY,
          ROYALTY_RECEIVER,
          ROYALTY_BPS,
        ],
      });
      console.log("Verified on Etherscan!");
    } catch (e) {
      console.log("Verification failed:", e.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
