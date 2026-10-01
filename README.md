# lend-pulse — Bonzo Lending Risk Monitor (Scaffold-HBAR)

A Scaffold-HBAR template for building auditable lending-risk monitors on Hedera.

It reads a wallet's live lending position directly from [Bonzo Finance](https://bonzo.finance)'s deployed contracts on Hedera testnet, an Aave V2-based lending protocol, and lets a developer anchor a point-in-time "risk snapshot" of that position to Hedera Consensus Service (HCS). Each anchored snapshot becomes part of a permanent, independently verifiable history, readable back from Hedera's public Mirror Node. No database required.

**What this demonstrates:**
- A real, load-bearing integration with an external Hedera ecosystem protocol (Bonzo), not a decorative SDK call
- Native use of HCS as a versioned, structured observation log, with every snapshot carrying a consensus timestamp and a direct Mirror Node verification link
- A reusable pattern any developer building risk-monitoring or auditing tools on Hedera can start from

## Judge quick path

1. Clone the repo and run `yarn install`
2. Copy `packages/nextjs/.env.example` to `packages/nextjs/.env.local` and fill in your own testnet credentials (see Setup below)
3. Run `node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createTopic.mjs` to create your own HCS topic, and put the printed Topic ID into `.env.local`
4. Run `yarn next:dev`
5. Open `http://localhost:3000/monitor`
6. Paste any Hedera EVM wallet address, or use your connected wallet
7. Read the account summary: collateral, debt, LTV, health factor, and a risk status label
8. Click **Record Snapshot**
9. Follow the returned HashScan or Mirror Node link to independently verify the transaction
10. Scroll to Snapshot History to see every past snapshot, each with its own Mirror Node link

## Architecture

```
            Wallet address
                  |
                  v
          Bonzo LendingPool
          (Hedera testnet, already deployed)
                  |
          account + reserve data
                  |
                  v
          Risk Snapshot
          collateral, debt, LTV,
          liquidation threshold,
          health factor, risk status
                  |
          Record Snapshot (user action)
                  |
                  v
          Next.js API route
          (operator keys stay server-side)
                  |
                  v
          Hedera Consensus Service
          versioned schema, one topic
                  |
                  v
          Hedera Mirror Node
          public, independently readable
                  |
                  v
          Snapshot History (in-app)
```

## A note on Bonzo's current state

Bonzo Finance suffered an oracle exploit in July 2026, and its lending pools have been paused since. Most wallets you check will show an empty position, zero collateral, zero debt. This is expected, not a bug. The read path is demonstrated against Bonzo's real, deployed testnet contracts regardless of pool status. The integration reads whatever state the protocol is actually in.

## Risk status labels

The account summary shows a risk status (No Debt, Healthy, Caution, At Risk) derived from Bonzo's own `healthFactor` value:

| Health factor | Label |
| --- | --- |
| No debt (`maxUint256`) | No Debt |
| < 1 | At Risk |
| 1 to < 1.2 | Caution |
| >= 1.2 | Healthy |

**This classification is lend-pulse's own, not Bonzo's.** Bonzo returns the raw health factor; the labels and thresholds are an interpretation layer this template adds for readability, not an official protocol standard.

## What's in this template

- Next.js App Router with wallet connect (inherited from Scaffold-HBAR)
- `/monitor` page: paste any Hedera EVM wallet address, or use your connected wallet, to read its Bonzo position, collateral, debt, available borrows, liquidation threshold, LTV, health factor, and risk status, read via `getUserAccountData`
- `Record Snapshot` button: sends the currently displayed values to a server-side API route, which anchors them to HCS using a versioned schema (`lend-pulse.snapshot.v1`)
- `/api/snapshot` (Next.js API route): the only place that touches Hedera operator credentials. Signs and submits the HCS message server-side, so keys never reach the browser
- Automated tests (`yarn workspace @sh/nextjs test`): cover input validation, missing configuration, successful submission, and HCS failure handling for `/api/snapshot`, using a mocked Hedera SDK so tests run fast and don't touch the live network
- Snapshot history: reads past snapshots back from Hedera's public Mirror Node, with consensus timestamps and a per-entry raw message link
- Hardhat package present for future on-chain work, but currently unused. This template's integration is entirely read-only against Bonzo's already-deployed contracts, so no contracts of our own are deployed

## Work from this repository

This project uses Yarn workspaces.

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.18.3
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
  This prints a Topic ID, put it in `HEDERA_TOPIC_ID` above.

### Run

```bash
yarn next:dev
```

Open [http://localhost:3000/monitor](http://localhost:3000/monitor).

### Test

```bash
yarn workspace @sh/nextjs test
```

## Screenshots

Account summary, risk status, and a recorded snapshot with verification links:

![Monitor summary](docs/monitor-summary.png)

Snapshot history, read live from the public Mirror Node:

![Snapshot history](docs/monitor-history.png)

## Verified example

A real snapshot recorded during development, independently verifiable on HashScan: [transaction 0.0.10746293@1790667946.780200966](https://hashscan.io/testnet/transaction/0.0.10746293@1790667946.780200966), topic `0.0.10759541`, message type `SUBMIT MESSAGE`.

**What this proves:** the HCS record shows this application submitted this specific snapshot to this specific topic, and that Hedera reached consensus on it at a specific timestamp.

**What this does not prove:** that Bonzo's underlying numbers are correct. HCS anchors an observation lend-pulse made; it does not independently verify the source data.

## Security

`/api/snapshot` holds your Hedera operator credentials server-side and will sign and pay for a real transaction on any request it receives. This is fine for local development. If you deploy this publicly, add authentication to this route first. As shipped, anyone who can reach it can spend HBAR from your operator account.

## Project layout

- **packages/nextjs** - Next.js app; `app/monitor/page.tsx` is the main feature, `app/api/snapshot/route.ts` is the HCS write path, `app/api/snapshot/route.test.ts` is its test suite, `contracts/externalContracts.ts` registers Bonzo's deployed contracts
- **packages/hardhat** - present from the Scaffold-HBAR base, currently unused (no contracts of our own)

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [Bonzo Finance docs](https://docs.bonzo.finance)
- [Hedera Portal faucet](https://portal.hedera.com/faucet)
- [HashScan](https://hashscan.io/)