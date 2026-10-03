# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a Scaffold-HBAR dApp: Next.js App Router, wallet connect, and Hedera testnet config. Built with the Hardhat package (Foundry was not selected at scaffold time and is not present).

Use the package manager this project was created with (`packageManager` in the root `package.json`, or the lockfile). This project uses `yarn`.

## What this project actually does

`lend-pulse` reads a wallet's live lending position from **Bonzo Finance** — an already-deployed, third-party Aave V2-based lending protocol on Hedera testnet — and lets a user anchor a point-in-time "risk snapshot" of that position to Hedera Consensus Service (HCS). This is a **read-only integration**: we do not deploy, own, or modify any contracts. All contract calls target Bonzo's existing deployed addresses.

There is no custom Solidity in this project. `packages/hardhat` exists from the base scaffold but is currently unused — no contracts, no deploy scripts. If you add contracts here in the future, follow the standard Scaffold-HBAR Hardhat layout (`contracts/`, `deploy/`, `test/`, `hardhat.config.ts`), and remember that any newly deployed contract's ABI/address gets written to `packages/nextjs/contracts/deployedContracts.ts` automatically — don't hand-edit that file.

## Layout

- `packages/nextjs/app/monitor/page.tsx` — the main feature. Reads Bonzo's `getUserAccountData` and `getAllReservesTokens`, displays the result, and calls `/api/snapshot` when the user clicks "Record Snapshot". Also reads snapshot history directly from Hedera's public Mirror Node REST API (no server involved for reads).
- `packages/nextjs/app/api/snapshot/route.ts` — the only place Hedera operator credentials (`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`) are used. Signs and submits an HCS `TopicMessageSubmitTransaction` server-side, using the versioned `lend-pulse.snapshot.v1` schema. Never move this signing logic to client-side code. Covered by `route.test.ts` with a mocked Hedera SDK, don't let tests touch the live network.
- `packages/nextjs/contracts/externalContracts.ts` — registers Bonzo's `AaveProtocolDataProvider` and `LendingPool` contracts (already deployed on Hedera testnet, chain ID `296`) with the ABI functions this project actually calls. This is the pattern to follow for registering any other third-party contract — do not put external contracts in `deployedContracts.ts`, that file is for contracts this project deploys itself.
- `packages/nextjs/scripts/createTopic.mjs` — one-time script to create a new HCS topic. Run manually, not part of the app's runtime.

## Commands

```bash
# Frontend dev server
yarn next:dev

# Type check
yarn next:check-types

# Quality / build
yarn lint
yarn format
yarn next:build
yarn hardhat:compile
yarn workspace @sh/nextjs test

# Create an HCS topic (one-time setup, needs .env.local populated first)
node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createTopic.mjs
```

## Environment

`packages/nextjs/.env.local` (not committed) needs:

HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=...
HEDERA_TOPIC_ID=0.0.xxxxx
NEXT_PUBLIC_HEDERA_TOPIC_ID=0.0.xxxxx
ENABLE_SNAPSHOT_WRITES=true

`ENABLE_SNAPSHOT_WRITES` is opt-in and off by default. Never prefix `HEDERA_OPERATOR_ID` or `HEDERA_OPERATOR_KEY` with `NEXT_PUBLIC_`, because that would expose the key to the browser.

## Frontend contract interaction

Hooks live in `packages/nextjs/hooks/scaffold-hbar`. Use the names that exist in the codebase:

- `useScaffoldReadContract` — not `useScaffoldContractRead`
- `useScaffoldWriteContract` — not `useScaffoldContractWrite`

Also: `useScaffoldWatchContractEvent`, `useScaffoldEventHistory`, `useDeployedContractInfo`, `useScaffoldContract`, `useTransactor`.

```typescript
const { data: account } = useScaffoldReadContract({
  contractName: "BonzoLendingPool",
  functionName: "getUserAccountData",
  args: [walletAddress],
});
```

This project only reads (`useScaffoldReadContract`) — it never writes to Bonzo's contracts. The only "write" in this app is the HCS submission, which happens server-side in `/api/snapshot`, not through a wagmi write hook.

### UI

Use `@scaffold-hbar-ui/components` for web3 UI where applicable: `Address`, `AddressInput`, `Balance`, `EtherInput`, `IntegerInput`.

Use DaisyUI classes, not raw Tailwind when a DaisyUI component exists:

```tsx
<button className="btn btn-primary">Record Snapshot</button>
```

### Networks

- Hardhat: `packages/hardhat/hardhat.config.ts` (`hederaTestnet` 296)
- Next.js: `packages/nextjs/scaffold.config.ts` (target networks, polling, RPC overrides, WalletConnect)

## Style

| Style | Use |
| --- | --- |
| `UpperCamelCase` | types, components |
| `lowerCamelCase` | variables, functions |
| `CONSTANT_CASE` | constants |

Next.js imports use the `~~` alias:

```tsx
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
```

App Router pages live under `packages/nextjs/app/`. Add `"use client"` when the page uses hooks.

Prefer `type` over `interface`. No `T` prefix on types. Let TypeScript infer when it can. Comments should add information.
