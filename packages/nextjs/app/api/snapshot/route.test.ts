import { POST } from "./route";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();

vi.mock("viem", async importOriginal => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: mockReadContract }),
  };
});

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

const VALID_ADDRESS = "0x37d9C81994134C13bAE559560A614947b038C5d9";

// [totalCollateral, totalDebt, availableBorrows, liquidationThreshold, ltv, healthFactor]
const NO_DEBT_ACCOUNT_DATA = [0n, 0n, 0n, 0n, 0n, 2n ** 256n - 1n] as const;
const AT_RISK_ACCOUNT_DATA = [
  1000000000000000000n,
  900000000000000000n,
  0n,
  8000n,
  7500n,
  500000000000000000n,
] as const;

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
    mockReadContract.mockReset();
    mockReadContract.mockResolvedValue(NO_DEBT_ACCOUNT_DATA);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("rejects a request with no account address", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/account/i);
  });

  it("rejects a request with an invalid account address", async () => {
    const res = await POST(makeRequest({ account: "not-an-address" }));
    expect(res.status).toBe(400);
  });

  it("fails cleanly when Hedera environment variables are missing", async () => {
    delete process.env.HEDERA_OPERATOR_ID;
    const res = await POST(makeRequest({ account: VALID_ADDRESS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/Hedera settings/i);
  });

  it("returns a 502 if reading Bonzo's contract fails", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("mock RPC failure"));
    const res = await POST(makeRequest({ account: VALID_ADDRESS }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/Bonzo/);
  });

  it("derives the snapshot from the server-side Bonzo read, not client input, and anchors it to HCS", async () => {
    const res = await POST(makeRequest({ account: VALID_ADDRESS, totalCollateral: "999999", riskStatus: "Healthy" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topicId).toBe("0.0.99999");
    expect(data.sequenceNumber).toBe("1");
    expect(data.snapshot.account).toBe(VALID_ADDRESS);
    expect(data.snapshot.totalCollateral).toBe("0");
    expect(data.snapshot.riskStatus).toBe("No Debt");
    expect(data.snapshot.schema).toBe("lend-pulse.snapshot.v1");
  });

  it("classifies an at-risk position correctly from real Bonzo-shaped data", async () => {
    mockReadContract.mockResolvedValueOnce(AT_RISK_ACCOUNT_DATA);
    const res = await POST(makeRequest({ account: VALID_ADDRESS }));
    const data = await res.json();
    expect(data.snapshot.riskStatus).toBe("At Risk");
    expect(data.snapshot.totalDebt).toBe("0.9");
  });

  it("returns a 500 with the error message if the HCS submission itself fails", async () => {
    const sdk = (await import("@hiero-ledger/sdk")) as unknown as { __execute: ReturnType<typeof vi.fn> };
    sdk.__execute.mockRejectedValueOnce(new Error("mock HCS network failure"));
    const res = await POST(makeRequest({ account: VALID_ADDRESS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("mock HCS network failure");
  });
});
