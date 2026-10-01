import { NextResponse } from "next/server";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { isAddress } from "viem";

export const runtime = "nodejs";

const FIELDS = [
  "totalCollateral",
  "totalDebt",
  "availableBorrows",
  "liquidationThreshold",
  "ltv",
  "healthFactor",
  "riskStatus",
] as const;

export async function POST(request: Request) {
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
  for (const field of FIELDS) {
    if (typeof body[field] !== "string") {
      return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
    }
  }

  const snapshot = {
    schema: "lend-pulse.snapshot.v1",
    source: "bonzo",
    network: "hedera-testnet",
    account: body.account,
    recordedAt: new Date().toISOString(),
    totalCollateral: body.totalCollateral,
    totalDebt: body.totalDebt,
    availableBorrows: body.availableBorrows,
    liquidationThreshold: body.liquidationThreshold,
    ltv: body.ltv,
    healthFactor: body.healthFactor,
    riskStatus: body.riskStatus,
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.close();
  }
}
