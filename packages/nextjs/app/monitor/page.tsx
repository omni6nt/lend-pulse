"use client";

import { useState } from "react";
import { formatUnits, isAddress, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

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

  const target = isAddress(input) ? input : connectedAddress;

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

  // Bonzo's getUserAccountData returns:
  // [totalCollateral, totalDebt, availableBorrows,
  //  liquidationThreshold, ltv, healthFactor]
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: target,
          totalCollateral,
          totalDebt,
          availableBorrows,
          liquidationThreshold,
          ltv,
          healthFactor: healthFactorDisplay,
          riskStatus,
        }),
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
      const res = await fetch(
        "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10759541/messages?limit=25&order=desc",
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

      <div className="w-full max-w-md">
        <h2 className="mb-3 text-2xl font-bold">Markets</h2>

        {reservesLoading && <p>Loading reserves...</p>}

        {reservesError && <p className="text-red-500">Error: {reservesError.message}</p>}

        {reserves && (
          <ul className="space-y-2">
            {reserves.map(reserve => (
              <li key={reserve.tokenAddress} className="flex justify-between border-b py-2">
                <span className="font-mono">{reserve.symbol}</span>

                <span className="text-xs text-gray-500">{reserve.tokenAddress}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Snapshot History</h2>

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
                href={`https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10759541/messages/${entry.sequenceNumber}`}
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
