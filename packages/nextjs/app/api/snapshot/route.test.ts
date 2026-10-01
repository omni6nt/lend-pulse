import { POST } from "./route";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hiero-ledger/sdk", () => {
  const getReceipt = vi.fn().mockResolvedValue({
    topicSequenceNumber: { toString: () => "1" },
  });
  const execute = vi.fn().mockResolvedValue({
    transactionId: { toString: () => "0.0.999@123.456" },
    getReceipt,
  });

  class TopicMessageSubmitTransaction {
    setTopicId() {
      return this;
    }
    setMessage() {
      return this;
    }
    execute = execute;
  }

  class PrivateKey {
    static fromStringECDSA() {
      return {};
    }
  }

  class Client {
    static forTestnet() {
      return { setOperator: vi.fn(), close: vi.fn() };
    }
  }

  return { Client, PrivateKey, TopicMessageSubmitTransaction, __execute: execute };
});

// A wallet address that passes viem's isAddress() check.
const VALID_ADDRESS = "0x37d9C81994134C13bAE559560A614947b038C5d9";

const validBody = {
  account: VALID_ADDRESS,
  totalCollateral: "0",
  totalDebt: "0",
  availableBorrows: "0",
  liquidationThreshold: "0",
  ltv: "0",
  healthFactor: "No debt",
  riskStatus: "No Debt",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/snapshot", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/snapshot", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.HEDERA_OPERATOR_ID = "0.0.12345";
    process.env.HEDERA_OPERATOR_KEY = "fake-key";
    process.env.HEDERA_TOPIC_ID = "0.0.99999";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("rejects a request with no account address", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...validBody, account: undefined }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/account/i);
  });

  it("rejects a request with an invalid account address", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...validBody, account: "not-an-address" }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing a required risk field", async () => {
    const { POST } = await import("./route");
    const incomplete = { ...validBody };
    delete (incomplete as Partial<typeof validBody>).totalDebt;
    const res = await POST(makeRequest(incomplete));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/totalDebt/);
  });

  it("fails cleanly when Hedera environment variables are missing", async () => {
    delete process.env.HEDERA_OPERATOR_ID;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/Hedera settings/i);
  });

  it("accepts a valid payload and returns the HCS submission result", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topicId).toBe("0.0.99999");
    expect(data.sequenceNumber).toBe("1");
    expect(data.transactionId).toBe("0.0.999@123.456");
  });

  it("returns a 500 with the error message if the HCS submission itself fails", async () => {
    const sdk = (await import("@hiero-ledger/sdk")) as unknown as { __execute: ReturnType<typeof vi.fn> };
    sdk.__execute.mockRejectedValueOnce(new Error("mock HCS network failure"));

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("mock HCS network failure");
  });
});
