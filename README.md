# lend-pulse — Bonzo Lending Risk Monitor (Scaffold-HBAR)

A Scaffold-HBAR template for building auditable lending-risk monitors on Hedera.

It reads a wallet's live lending position directly from [Bonzo Finance](https://bonzo.finance)'s deployed contracts on Hedera testnet — an Aave V2-based lending protocol — and lets a developer anchor a point-in-time "risk snapshot" of that position to Hedera Consensus Service (HCS). Each anchored snapshot becomes part of a permanent, independently verifiable history, readable back from Hedera's public Mirror Node — no database required.

**What this demonstrates:**
- A real, load-bearing integration with an external Hedera ecosystem protocol (Bonzo) — not a decorative SDK call
- Native use of HCS as a verifiable observation log, composed alongside the Bonzo read rather than used in isolation
- A reusable pattern any developer building risk-monitoring or auditing tools on Hedera can start from

## A note on Bonzo's current state

Bonzo Finance suffered an oracle exploit in July 2026, and its lending pools have been paused since. Most wallets you check will show an empty position (zero collateral, zero debt) — this is expected, not a bug. The read path is demonstrated against Bonzo's real, deployed testnet contracts regardless of pool status; the integration reads whatever state the protocol is actually in.

## What's in this template

- Next.js App Router with wallet connect (inherited from Scaffold-HBAR)
- `/monitor` page: paste any Hedera EVM wallet address (or use your connected wallet) to read its Bonzo position — collateral, debt, available borrows, liquidation threshold, LTV, and health factor, read via `getUserAccountData`
- `Record Snapshot` button: sends the currently displayed values to a server-side API route, which anchors them to HCS
- `/api/snapshot` (Next.js API route): the only place that touches Hedera operator credentials — signs and submits the HCS message server-side, so keys never reach the browser
- Snapshot history: reads past snapshots back from Hedera's public Mirror Node, with consensus timestamps
- Hardhat package present for future on-chain work, but currently unused — this template's integration is entirely read-only against Bonzo's already-deployed contracts, so no contracts of our own are deployed

## Work from this repository

This project uses Yarn workspaces.

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20.18.3
- [Git](https://git-scm.com/) with `user.name` and `user.email` configured
- [Yarn](https://yarnpkg.com/), via Corepack:
  ```bash
  corepack enable && corepack prepare yarn@stable --activate
  ```

### Setup

```bash
yarn install
```

Copy the environment example and fill in your own values:

```bash
cp packages/nextjs/.env.example packages/nextjs/.env.local
```

Add to `packages/nextjs/.env.local`:

```
HEDERA_OPERATOR_ID=0.0.your_account_id
HEDERA_OPERATOR_KEY=your_private_key
HEDERA_TOPIC_ID=0.0.your_topic_id
```

- Get a free testnet account and HBAR from the [Hedera Portal faucet](https://portal.hedera.com/faucet).
- Create your own HCS topic (one-time) by running:
  ```bash
  node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createTopic.mjs
  ```
  This prints a Topic ID — put it in `HEDERA_TOPIC_ID` above.

### Run

```bash
yarn next:dev
```

Open [http://localhost:3000/monitor](http://localhost:3000/monitor).

## Verified example

A real snapshot recorded during development, independently verifiable on HashScan: [transaction 0.0.10746293@1790667946.780200966](https://hashscan.io/testnet/transaction/0.0.10746293@1790667946.780200966) — topic `0.0.10759541`, message type `SUBMIT MESSAGE`.

**Important:** the HCS record proves this application observed these specific values at this specific consensus timestamp. It does not independently verify that Bonzo's underlying numbers are correct — HCS anchors an observation, not a guarantee about the source data.

## Security

`/api/snapshot` holds your Hedera operator credentials server-side and will sign and pay for a real transaction on any request it receives. This is fine for local development. If you deploy this publicly, add authentication to this route first — as shipped, anyone who can reach it can spend HBAR from your operator account.

## Project layout

- **packages/nextjs** — Next.js app; `app/monitor/page.tsx` is the main feature, `app/api/snapshot/route.ts` is the HCS write path, `contracts/externalContracts.ts` registers Bonzo's deployed contracts
- **packages/hardhat** — present from the Scaffold-HBAR base, currently unused (no contracts of our own)

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [Bonzo Finance docs](https://docs.bonzo.finance)
- [Hedera Portal faucet](https://portal.hedera.com/faucet)
- [HashScan](https://hashscan.io/)