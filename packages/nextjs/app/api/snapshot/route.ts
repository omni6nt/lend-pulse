import { NextResponse } from "next/server";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { createPublicClient, formatUnits, http, isAddress, maxUint256 } from "viem";

export const runtime = "nodejs";

const BONZO_LENDING_POOL_ADDRESS = "0xf67DBe9bD1B331cA379c44b5562EAa1CE831EbC2";
const BONZO_LENDING_POOL_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserAccountData",
    outputs: [
      { internalType: "uint256", name: "totalCollateralETH", type: "uint256" },
      { internalType: "uint256", name: "totalDebtETH", type: "uint256" },
      { internalType: "uint256", name: "availableBorrowsETH", type: "uint256" },
      { internalType: "uint256", name: "currentLiquidationThreshold", type: "uint256" },
      { internalType: "uint256", name: "ltv", type: "uint256" },
      { internalType: "uint256", name: "healthFactor", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const HEDERA_TESTNET_CHAIN = {
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api"] },
  },
} as const;

function riskStatusFor(healthFactor: bigint): string {
  if (healthFactor === maxUint256) return "No Debt";
  const value = Number(formatUnits(healthFactor, 18));
  if (value < 1) return "At Risk";
  if (value < 1.2) return "Caution";
  return "Healthy";
}

export async function POST(request: Request) {
  if (process.env.ENABLE_SNAPSHOT_WRITES !== "true") {
    return NextResponse.json(
      { error: "Snapshot writes are disabled. Set ENABLE_SNAPSHOT_WRITES=true in .env.local to enable them." },
      { status: 403 },
    );
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!operatorId || !operatorKey || !topicId) {
    return NextResponse.json({ error: "Server is missing Hedera settings in .env.local" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.account !== "string" || !isAddress(body.account)) {
    return NextResponse.json({ error: "A valid account address is required" }, { status: 400 });
  }
  const account = body.account;

  let accountData: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  try {
    const publicClient = createPublicClient({ chain: HEDERA_TESTNET_CHAIN, transport: http() });
    accountData = (await publicClient.readContract({
      address: BONZO_LENDING_POOL_ADDRESS,
      abi: BONZO_LENDING_POOL_ABI,
      functionName: "getUserAccountData",
      args: [account],
    })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to read Bonzo position: ${message}` }, { status: 502 });
  }

  const [totalCollateral, totalDebt, availableBorrows, liquidationThreshold, ltv, healthFactor] = accountData;

  const snapshot = {
    schema: "lend-pulse.snapshot.v1",
    source: "bonzo",
    network: "hedera-testnet",
    account,
    recordedAt: new Date().toISOString(),
    totalCollateral: formatUnits(totalCollateral, 18),
    totalDebt: formatUnits(totalDebt, 18),
    availableBorrows: formatUnits(availableBorrows, 18),
    liquidationThreshold: `${Number(liquidationThreshold) / 100}%`,
    ltv: `${Number(ltv) / 100}%`,
    healthFactor: healthFactor === maxUint256 ? "No debt" : formatUnits(healthFactor, 18),
    riskStatus: riskStatusFor(healthFactor),
  };

  const client = Client.forTestnet();
  try {
    client.setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey.replace(/^0x/, "")));
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(snapshot))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const transactionId = tx.transactionId.toString();
    return NextResponse.json({
      topicId,
      sequenceNumber: receipt.topicSequenceNumber?.toString(),
      transactionId,
      hashscanUrl: `https://hashscan.io/testnet/transaction/${transactionId}`,
      mirrorNodeUrl: `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages/${receipt.topicSequenceNumber?.toString()}`,
      snapshot,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.close();
  }
}
