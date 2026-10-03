"use client";

import { useEffect, useState } from "react";
import { type Address, formatUnits, isAddress, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

type Reserve = { symbol: string; tokenAddress: string };

// Falls back to the maintainer's public demo topic so a fresh clone shows real sample
// history immediately. Set NEXT_PUBLIC_HEDERA_TOPIC_ID to see your own.
const TOPIC_ID = process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID || "0.0.10759541";

const shortAddress = (value: string) => (value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value);

function riskBadgeClass(status?: string) {
  switch (status) {
    case "At Risk":
      return "badge-error";
    case "Caution":
      return "badge-warning";
    case "Healthy":
      return "badge-success";
    case "No Debt":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}

const ReserveRow = ({ reserve, target }: { reserve: Reserve; target: string | undefined }) => {
  const { data: config } = useScaffoldReadContract({
    contractName: "BonzoDataProvider",
    functionName: "getReserveConfigurationData",
    args: [reserve.tokenAddress],
  });

  const { data: userData } = useScaffoldReadContract({
    contractName: "BonzoDataProvider",
    functionName: "getUserReserveData",
    args: [reserve.tokenAddress, target],
  });

  if (!config) {
    return (
      <tr>
        <td className="font-mono font-semibold">{reserve.symbol}</td>
        <td colSpan={6} className="text-xs opacity-60">
          Loading...
        </td>
      </tr>
    );
  }

  const [, ltv, liquidationThreshold, , , , , , isActive, isFrozen] = config;
  const supplied = userData ? formatUnits(userData[0], 18) : "-";
  const variableDebt = userData ? formatUnits(userData[2], 18) : "-";
  const isCollateral = userData ? userData[8] : false;

  const statusLabel = !isActive ? "Inactive" : isFrozen ? "Frozen" : "Active";
  const statusBadge = !isActive ? "badge-error" : isFrozen ? "badge-warning" : "badge-success";

  return (
    <tr className="hover">
      <td className="font-mono font-semibold">{reserve.symbol}</td>
      <td className="text-right font-mono tabular-nums">{Number(ltv) / 100}%</td>
      <td className="text-right font-mono tabular-nums">{Number(liquidationThreshold) / 100}%</td>
      <td className="text-right font-mono tabular-nums">{supplied}</td>
      <td className="text-right font-mono tabular-nums">{variableDebt}</td>
      <td className="text-center">{target ? (isCollateral ? "Yes" : "No") : "-"}</td>
      <td>
        <span className={`badge badge-sm ${statusBadge}`}>{statusLabel}</span>
      </td>
    </tr>
  );
};

const StatTile = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-lg border border-base-300 bg-base-100 p-4">
    <div className="text-xs font-medium uppercase tracking-wider opacity-60">{label}</div>
    <div className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums">{value ?? "-"}</div>
  </div>
);

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

  const target = isAddress(input) ? (input as Address) : connectedAddress;

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
      const res = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/topics/${TOPIC_ID}/messages?limit=25&order=desc`,
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

  useEffect(() => {
    if (!recordResult) return;
    const timer = setTimeout(() => setRecordResult(null), 15000);
    return () => clearTimeout(timer);
  }, [recordResult]);

  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-4 pb-8 pt-6 lg:px-6 xl:px-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Bonzo Position Monitor</h1>
          <span className="badge badge-outline badge-sm">Hedera Testnet</span>
        </div>
        <p className="mt-1 text-sm opacity-70">
          Lending risk observability on Hedera testnet, anchored to Hedera Consensus Service.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="card border border-base-300 bg-base-200 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest opacity-70">Monitored account</h2>
                {riskStatus && <span className={`badge ${riskBadgeClass(riskStatus)}`}>{riskStatus}</span>}
              </div>
              <input
                className="input input-bordered w-full font-mono text-sm"
                placeholder="Paste a Hedera EVM wallet address (defaults to your connected wallet)"
                value={input}
                onChange={event => setInput(event.target.value.trim())}
              />
              {input && !isAddress(input) && <p className="text-sm text-error">Not a valid EVM address.</p>}
              <p className="break-all font-mono text-xs opacity-70">{target ?? "No wallet connected"}</p>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-200 shadow-sm">
            <div className="card-body gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest opacity-70">Account summary</h2>

              {!target && <p className="text-sm opacity-70">No wallet address provided.</p>}
              {accountLoading && <p className="text-sm opacity-70">Loading position...</p>}
              {accountError && <p className="text-sm text-error">Error: {accountError.message}</p>}

              {account && (
                <>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <StatTile label="Collateral" value={totalCollateral} />
                    <StatTile label="Debt" value={totalDebt} />
                    <StatTile label="Available to borrow" value={availableBorrows} />
                    <StatTile label="Health factor" value={healthFactorDisplay} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm opacity-70">
                      <span>Liquidation threshold: {liquidationThreshold}</span>
                      <span>Max LTV: {ltv}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs opacity-60 md:inline">
                        Anchors this position to Hedera Consensus Service
                      </span>
                      <button className="btn btn-primary" disabled={recording} onClick={handleRecordSnapshot}>
                        {recording ? "Recording..." : "Record Snapshot"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {recordResult && (
                <div className="alert alert-success text-sm">
                  <div>
                    <p className="font-semibold">Recorded - sequence #{recordResult.sequenceNumber}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {recordResult.hashscanUrl && (
                        <a className="link" href={recordResult.hashscanUrl} target="_blank" rel="noreferrer">
                          View on HashScan
                        </a>
                      )}
                      {recordResult.mirrorNodeUrl && (
                        <a className="link" href={recordResult.mirrorNodeUrl} target="_blank" rel="noreferrer">
                          View raw message on Mirror Node
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setRecordResult(null)}
                    aria-label="Dismiss message"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {recordError && (
                <div className="alert alert-warning text-sm">
                  <span>{recordError}</span>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setRecordError(null)}
                    aria-label="Dismiss error"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card border border-base-300 bg-base-200 shadow-sm">
            <div className="card-body gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest opacity-70">Bonzo markets</h2>
                <p className="mt-1 text-xs opacity-60">
                  Per-reserve configuration and this wallet&apos;s position, read directly from Bonzo&apos;s testnet
                  contracts.
                </p>
              </div>

              {reservesLoading && <p className="text-sm opacity-70">Loading reserves...</p>}
              {reservesError && <p className="text-sm text-error">Error: {reservesError.message}</p>}

              {reserves && (
                <div className="overflow-x-auto">
                  <table className="table table-zebra">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider">
                        <th>Asset</th>
                        <th className="text-right">LTV</th>
                        <th className="text-right">Liq. threshold</th>
                        <th className="text-right">Supplied</th>
                        <th className="text-right">Variable debt</th>
                        <th className="text-center">Collateral</th>
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
          </div>
        </div>

        <div className="card border border-base-300 bg-base-200 shadow-sm lg:h-[calc(100vh-9rem)] lg:min-h-[480px]">
          <div className="card-body min-h-0 flex-1 gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest opacity-70">Snapshot history</h2>
                <p className="mt-1 text-xs opacity-60">
                  Read live from the public Mirror Node
                  {!process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID ? " (sample topic)" : ""}.
                </p>
              </div>
              <button className="btn btn-sm" onClick={loadHistory} disabled={historyLoading}>
                {historyLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {history.length === 0 && <p className="text-sm opacity-60">No snapshots loaded yet.</p>}

            <ul className="flex max-h-[32rem] min-h-0 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none lg:flex-1">
              {history.map(entry => {
                const risk = entry.message.riskStatus ? String(entry.message.riskStatus) : undefined;
                return (
                  <li key={entry.sequenceNumber} className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold">#{entry.sequenceNumber}</p>
                        <p className="opacity-60">
                          {new Date(Number(entry.consensusTimestamp.split(".")[0]) * 1000).toLocaleString()}
                        </p>
                      </div>
                      <span className={`badge badge-sm ${riskBadgeClass(risk)}`}>{risk ?? "N/A"}</span>
                    </div>
                    <p className="mt-2 font-mono opacity-70">
                      collateral {String(entry.message.totalCollateral)} / debt {String(entry.message.totalDebt)}
                    </p>
                    <p className="font-mono opacity-70">{shortAddress(String(entry.message.account))}</p>
                    <a
                      className="link mt-1 inline-block"
                      href={`https://testnet.mirrornode.hedera.com/api/v1/topics/${TOPIC_ID}/messages/${entry.sequenceNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View raw message
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Monitor;
