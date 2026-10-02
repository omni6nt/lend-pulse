"use client";

import { useEffect, useState } from "react";
import { type Address, formatUnits, isAddress, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

type Reserve = { symbol: string; tokenAddress: string };

const ReserveRow = ({ reserve, target }: { reserve: Reserve; target: Address | undefined }) => {
  const { data: config } = useScaffoldReadContract({
    contractName: "BonzoDataProvider",
    functionName: "getReserveConfigurationData",
    args: [reserve.tokenAddress as Address],
  });

  const { data: userData } = useScaffoldReadContract({
    contractName: "BonzoDataProvider",
    functionName: "getUserReserveData",
    args: [reserve.tokenAddress as Address, target],
  });

  if (!config) {
    return (
      <tr>
        <td className="font-mono">{reserve.symbol}</td>
        <td colSpan={5} className="text-xs text-gray-500">
          Loading...
        </td>
      </tr>
    );
  }

  const [, ltv, liquidationThreshold, , , , , , isActive, isFrozen] = config;
  const supplied = userData ? formatUnits(userData[0], 18) : "—";
  const variableDebt = userData ? formatUnits(userData[2], 18) : "—";
  const isCollateral = userData ? userData[8] : false;

  return (
    <tr className={!isActive || isFrozen ? "opacity-50" : ""}>
      <td className="font-mono">{reserve.symbol}</td>
      <td>{Number(ltv) / 100}%</td>
      <td>{Number(liquidationThreshold) / 100}%</td>
      <td>{supplied}</td>
      <td>{variableDebt}</td>
      <td>{target ? (isCollateral ? "Yes" : "No") : "—"}</td>
      <td className="text-xs">
        {!isActive && "Inactive"}
        {isActive && isFrozen && "Frozen"}
        {isActive && !isFrozen && "Active"}
      </td>
    </tr>
  );
};

const Monitor = () => {
  const { address: connectedAddress } = useAccount();

  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordResult, setRecordResult] = useState<{
    sequenceNumber?: string;
    transactionId?: string;
    hashscanUrl?: string;
    mirrorNodeUrl?: string;
  } | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [history, setHistory] = useState<
    {
      sequenceNumber: string;
      consensusTimestamp: string;
      message: Record<string, unknown>;
    }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const target: Address | undefined = isAddress(input) ? (input as Address) : connectedAddress;

  const {
    data: reserves,
    isLoading: reservesLoading,
    error: reservesError,
  } = useScaffoldReadContract({
    contractName: "BonzoDataProvider",
    functionName: "getAllReservesTokens",
  });

  const {
    data: account,
    isLoading: accountLoading,
    error: accountError,
  } = useScaffoldReadContract({
    contractName: "BonzoLendingPool",
    functionName: "getUserAccountData",
    args: [target],
  });

  const totalCollateral = account ? formatUnits(account[0], 18) : undefined;
  const totalDebt = account ? formatUnits(account[1], 18) : undefined;
  const availableBorrows = account ? formatUnits(account[2], 18) : undefined;
  const liquidationThreshold = account ? `${Number(account[3]) / 100}%` : undefined;
  const ltv = account ? `${Number(account[4]) / 100}%` : undefined;

  const healthFactorDisplay = account
    ? account[5] === maxUint256
      ? "No debt"
      : formatUnits(account[5], 18)
    : undefined;

  const riskStatus = account
    ? account[5] === maxUint256
      ? "No Debt"
      : Number(formatUnits(account[5], 18)) < 1
        ? "At Risk"
        : Number(formatUnits(account[5], 18)) < 1.2
          ? "Caution"
          : "Healthy"
    : undefined;

  const handleRecordSnapshot = async () => {
    if (!account || !target) return;

    setRecording(true);
    setRecordError(null);
    setRecordResult(null);

    try {
      const response = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: target }),
      });

      const data = await response.json();

      if (!response.ok) {
        setRecordError(data.error ?? "Failed to record snapshot");
        return;
      }

      setRecordResult(data);
      loadHistory();
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setRecording(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);

    try {
      // Falls back to the maintainer's public demo topic so a fresh clone shows real
      // sample history immediately. Set NEXT_PUBLIC_HEDERA_TOPIC_ID to see your own.
      const topicId = process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID || "0.0.10759541";
      const res = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=25&order=desc`,
      );

      const data = await res.json();

      const decoded = (data.messages ?? []).map(
        (m: { sequence_number: number; consensus_timestamp: string; message: string }) => ({
          sequenceNumber: m.sequence_number.toString(),
          consensusTimestamp: m.consensus_timestamp,
          message: JSON.parse(atob(m.message)),
        }),
      );

      setHistory(decoded);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // mount-only: loadHistory closes over env and setters, and must not retrigger
  useEffect(() => {
    void loadHistory();
  }, []);

  return (
    <div className="flex flex-col items-center gap-8 px-4 pt-10">
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-3xl font-bold">Bonzo Position Monitor</h1>

        <input
          className="input input-bordered w-full font-mono text-sm"
          placeholder="Paste a wallet address"
          value={input}
          onChange={event => setInput(event.target.value.trim())}
        />

        {input && !isAddress(input) && <p className="mt-1 text-sm text-red-500">Not a valid EVM address.</p>}

        <p className="mt-1 font-mono text-xs text-gray-500">Checking: {target ?? "no wallet connected"}</p>
      </div>

      <div className="w-full max-w-md">
        <h2 className="mb-3 text-2xl font-bold">Account Summary</h2>

        {!target && <p>No wallet address provided.</p>}
        {accountLoading && <p>Loading position...</p>}
        {accountError && <p className="text-red-500">Error: {accountError.message}</p>}

        {account && (
          <div className="space-y-2 font-mono text-sm">
            <p>Total collateral: {totalCollateral}</p>
            <p>Total debt: {totalDebt}</p>
            <p>Available to borrow: {availableBorrows}</p>
            <p>Liquidation threshold: {liquidationThreshold}</p>
            <p>Max LTV: {ltv}</p>
            <p>Health factor: {healthFactorDisplay}</p>
            <p>Risk status: {riskStatus}</p>

            <button className="btn btn-primary mt-4" disabled={recording} onClick={handleRecordSnapshot}>
              {recording ? "Recording..." : "Record Snapshot"}
            </button>
          </div>
        )}

        {recordResult && (
          <div className="mt-3 text-sm">
            <p className="text-green-600">Recorded — sequence #{recordResult.sequenceNumber}</p>
            {recordResult.hashscanUrl && (
              <a className="link block" href={recordResult.hashscanUrl} target="_blank" rel="noreferrer">
                View on HashScan
              </a>
            )}
            {recordResult.mirrorNodeUrl && (
              <a className="link block" href={recordResult.mirrorNodeUrl} target="_blank" rel="noreferrer">
                View raw message on Mirror Node
              </a>
            )}
          </div>
        )}

        {recordError && <p className="mt-3 text-sm text-red-500">Error: {recordError}</p>}
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="mb-3 text-2xl font-bold">Markets</h2>
        <p className="mb-2 text-xs text-gray-500">
          Per-reserve configuration and this wallet&apos;s position in each asset, read directly from Bonzo&apos;s
          testnet contracts.
        </p>

        {reservesLoading && <p>Loading reserves...</p>}
        {reservesError && <p className="text-red-500">Error: {reservesError.message}</p>}

        {reserves && (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>LTV</th>
                  <th>Liq. threshold</th>
                  <th>Supplied</th>
                  <th>Variable debt</th>
                  <th>Collateral</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reserves.map(reserve => (
                  <ReserveRow key={reserve.tokenAddress} reserve={reserve} target={target} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Snapshot History</h2>
            {!process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID && (
              <p className="text-xs text-gray-500">
                Showing sample history. Set your own topic to record and view yours.
              </p>
            )}
          </div>
          <button className="btn btn-sm" onClick={loadHistory} disabled={historyLoading}>
            {historyLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {history.length === 0 && <p className="text-sm text-gray-500">No snapshots loaded yet.</p>}

        <ul className="space-y-2">
          {history.map(entry => (
            <li key={entry.sequenceNumber} className="border-b py-2 text-xs font-mono">
              <p>
                #{entry.sequenceNumber} —{" "}
                {new Date(Number(entry.consensusTimestamp.split(".")[0]) * 1000).toLocaleString()}
              </p>
              <p>
                collateral: {String(entry.message.totalCollateral)} · debt: {String(entry.message.totalDebt)} · risk:{" "}
                {String(entry.message.riskStatus ?? "—")} · account: {String(entry.message.account)}
              </p>
              <a
                className="link"
                href={`https://testnet.mirrornode.hedera.com/api/v1/topics/${process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID || "0.0.10759541"}/messages/${entry.sequenceNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                View raw message
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Monitor;
