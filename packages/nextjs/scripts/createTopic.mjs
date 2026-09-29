import { Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";

const id = process.env.HEDERA_OPERATOR_ID;
const rawKey = process.env.HEDERA_OPERATOR_KEY;
if (!id || !rawKey) {
  throw new Error("Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env.local");
}

const privateKey = PrivateKey.fromStringECDSA(rawKey.replace(/^0x/, ""));
const client = Client.forTestnet();
client.setOperator(id, privateKey);

// The submit key means only our server can write to this topic,
// so the history can't be polluted by strangers.
const tx = await new TopicCreateTransaction()
  .setTopicMemo("lend-pulse: Bonzo risk snapshots")
  .setSubmitKey(privateKey.publicKey)
  .execute(client);

const receipt = await tx.getReceipt(client);
console.log("Topic ID:", receipt.topicId.toString());
console.log("Transaction:", tx.transactionId.toString());
client.close();
