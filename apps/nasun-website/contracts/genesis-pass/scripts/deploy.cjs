const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", network.name);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ── Configuration ──
  // These should be set via environment variables or modified before deployment
  const BASE_URI = process.env.BASE_URI || "ipfs://PLACEHOLDER_CID";
  const CONTRACT_URI = process.env.CONTRACT_URI || "ipfs://PLACEHOLDER_CONTRACT_CID";
  const SIGNER_ADDRESS = process.env.SIGNER_ADDRESS || deployer.address;
  const MINT_PRICE = ethers.parseEther(process.env.MINT_PRICE_ETH || "0.05");
  const DEFAULT_MAX_SUPPLY = parseInt(process.env.DEFAULT_MAX_SUPPLY || "20000", 10);
  const ROYALTY_RECEIVER = process.env.ROYALTY_RECEIVER || deployer.address;
  const ROYALTY_BPS = parseInt(process.env.ROYALTY_BPS || "500", 10); // 5%

  console.log("\n── Deploy Parameters ──");
  console.log("Base URI:", BASE_URI);
  console.log("Contract URI:", CONTRACT_URI);
  console.log("Signer:", SIGNER_ADDRESS);
  console.log("Mint Price:", ethers.formatEther(MINT_PRICE), "ETH");
  console.log("Max Supply per type:", DEFAULT_MAX_SUPPLY);
  console.log("Royalty Receiver:", ROYALTY_RECEIVER);
  console.log("Royalty BPS:", ROYALTY_BPS);

  // ── Deploy ──
  const Factory = await ethers.getContractFactory("NasunGenesisPass");
  const contract = await Factory.deploy(
    BASE_URI,
    CONTRACT_URI,
    SIGNER_ADDRESS,
    MINT_PRICE,
    DEFAULT_MAX_SUPPLY,
    ROYALTY_RECEIVER,
    ROYALTY_BPS
  );
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\nNasunGenesisPass deployed to:", contractAddress);

  // ── Set wallet limits ──
  const WALLET_LIMITS = {
    1: parseInt(process.env.FREE_MINT_LIMIT || "1", 10),     // FREE_MINT
    2: parseInt(process.env.GTD_LIMIT || "2", 10),            // GTD_ALLOWLIST
    3: parseInt(process.env.FCFS_LIMIT || "2", 10),           // FCFS_ALLOWLIST
    4: parseInt(process.env.PUBLIC_LIMIT || "3", 10),         // PUBLIC
  };

  for (const [stage, limit] of Object.entries(WALLET_LIMITS)) {
    const tx = await contract.setWalletLimit(parseInt(stage), limit);
    await tx.wait();
    console.log(`Wallet limit for stage ${stage}: ${limit}`);
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
    mintPrice: MINT_PRICE.toString(),
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

  // ── Invariant Check: walletLimit vs Lambda maxQuantity ──
  const LAMBDA_MAX_QUANTITIES = {
    1: 1,  // FREE_MINT
    2: 2,  // GTD_ALLOWLIST
    3: 1,  // FCFS_ALLOWLIST
  };
  console.log("\n── Deployment Invariant Check ──");
  const stageNames = { 1: "FREE_MINT", 2: "GTD", 3: "FCFS" };
  let invariantOk = true;
  for (const [stage, lambdaMax] of Object.entries(LAMBDA_MAX_QUANTITIES)) {
    const walletLimit = WALLET_LIMITS[stage] || 0;
    const ok = walletLimit >= lambdaMax;
    const status = ok ? "OK" : "FAIL";
    console.log(`  ${stageNames[stage]}:  walletLimit=${walletLimit}, Lambda maxQuantity=${lambdaMax} ${status}`);
    if (!ok) invariantOk = false;
  }
  if (!invariantOk) {
    console.error("\nERROR: walletLimitPerStage < Lambda maxQuantity for one or more stages!");
    console.error("Users will be blocked by on-chain walletLimit before exhausting their signature allocation.");
    process.exit(1);
  }
  console.log("  All invariants passed.\n");

  // ── Verify on Etherscan (skip on localhost/hardhat) ──
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    // Wait for 5 block confirmations
    const deployTx = contract.deploymentTransaction();
    if (deployTx) {
      await deployTx.wait(5);
    }

    console.log("Verifying on Etherscan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [
          BASE_URI,
          CONTRACT_URI,
          SIGNER_ADDRESS,
          MINT_PRICE,
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
