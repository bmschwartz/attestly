/**
 * Deploy Attestly UUPS proxy to the configured network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network baseSepolia
 *   npx hardhat run scripts/deploy.ts --network base
 */
import { network } from "hardhat";
import { encodeFunctionData, type Hex } from "viem";

async function main() {
  const { viem, networkName } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  if (!deployer) {
    throw new Error("No deployer account configured. Set ADMIN_PRIVATE_KEY.");
  }

  console.log(`\nDeploying Attestly to ${networkName}...`);
  console.log(`Deployer: ${deployer.account.address}`);

  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log(`Balance: ${Number(balance) / 1e18} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has zero balance. Fund the wallet first.");
  }

  // Step 1: Deploy implementation contract
  console.log("\n1. Deploying implementation contract...");
  const implementation = await viem.deployContract("Attestly");
  console.log(`   Implementation: ${implementation.address}`);

  // Wait a moment for the chain to settle
  await new Promise((r) => setTimeout(r, 3000));

  // Step 2: Encode initialize(owner) calldata
  const initData = encodeFunctionData({
    abi: implementation.abi,
    functionName: "initialize",
    args: [deployer.account.address],
  });

  // Step 3: Deploy proxy using raw sendTransaction to bypass simulation issues
  console.log("2. Deploying ERC1967 proxy...");

  // Get the proxy artifact bytecode
  const proxyArtifact = await import(
    "../artifacts/contracts/AttestlyProxy.sol/AttestlyProxy.json",
    { with: { type: "json" } }
  );
  const proxyBytecode = proxyArtifact.default.bytecode as Hex;

  // ABI-encode constructor args: (address implementation, bytes memory _data)
  const { encodeAbiParameters } = await import("viem");
  const constructorArgs = encodeAbiParameters(
    [
      { name: "implementation", type: "address" },
      { name: "_data", type: "bytes" },
    ],
    [implementation.address, initData],
  );

  const deployData = (proxyBytecode + constructorArgs.slice(2)) as Hex;

  // Send raw tx with explicit gas to skip eth_call simulation
  const txHash = await deployer.sendTransaction({
    data: deployData,
    gas: 500_000n,
  });
  console.log(`   Tx: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  if (receipt.status === "reverted") {
    console.error("   Proxy deployment REVERTED on-chain!");
    console.error(`   Check: https://sepolia.basescan.org/tx/${txHash}`);
    process.exit(1);
  }

  const proxyAddress = receipt.contractAddress;
  if (!proxyAddress) {
    throw new Error("No contract address in receipt");
  }
  console.log(`   Proxy: ${proxyAddress}`);

  // Step 4: Verify the proxy is initialized
  const attestly = await viem.getContractAt("Attestly", proxyAddress);
  const owner = await attestly.read.owner();
  console.log(`   Owner: ${owner}`);

  console.log("\n========================================");
  console.log("Deployment complete!");
  console.log("========================================");
  console.log(`\nProxy address (use this): ${proxyAddress}`);
  console.log(`Implementation address:   ${implementation.address}`);
  console.log(`\nSet these environment variables:`);
  console.log(`  ATTESTLY_CONTRACT_ADDRESS=${proxyAddress}`);
  console.log(`  NEXT_PUBLIC_ATTESTLY_CONTRACT_ADDRESS=${proxyAddress}`);

  if (networkName === "baseSepolia") {
    console.log(
      `\nVerify on Basescan: https://sepolia.basescan.org/address/${proxyAddress}`,
    );
    console.log(`  NEXT_PUBLIC_CHAIN_ID=84532`);
  } else if (networkName === "base") {
    console.log(
      `\nVerify on Basescan: https://basescan.org/address/${proxyAddress}`,
    );
    console.log(`  NEXT_PUBLIC_CHAIN_ID=8453`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
