# TemirTrace Architecture

TemirTrace is a demo application composed of a browser frontend, a Node.js API, a shared database, and an optional Solana Devnet transaction flow.

## Components

| Component | Responsibility |
| --- | --- |
| React + Vite frontend | Organization profile, equipment passport, maintenance history, wallet connection, public passport view |
| Node.js API | Load and save workspace state, apply demo review decisions, verify Devnet transaction memos |
| MySQL | Stores the hosted demo workspace |
| Local JSON file | Stores the local development workspace when MySQL is not configured |
| Phantom or another compatible wallet | Connects the user and signs the Devnet Memo transaction |
| Solana Devnet Memo program | Records a public memo containing the service-record ID and SHA-256 fingerprint |

## Service-record flow

1. The browser creates a service record and calculates a SHA-256 fingerprint from its selected fields.
2. The browser sends the full record to the TemirTrace API, which saves the shared workspace in MySQL on the hosted deployment.
3. When the user chooses to publish the fingerprint, the browser constructs `TEMIRTRACE|v1|<record-id>|<sha256-fingerprint>`.
4. The connected wallet presents the Devnet transaction for the user to review and sign.
5. The backend requests the transaction from Solana Devnet and checks that the memo matches the saved record.
6. The public passport can show the saved record and its Devnet proof status.

## Data boundaries

- Organization, asset, and service details stay in TemirTrace's database.
- The Solana memo contains a record reference and fingerprint, not the full record.
- The memo and transaction signature are public. A hash is not encryption.
- The application can check whether record fields match an anchored hash; it cannot establish that a real-world repair occurred.
- Organization approval is a manual demo decision, not a government or third-party registry result.

## Current deployment model

The Vite frontend is built into `dist`. Vercel serves the frontend and routes `/api/*` requests to Node.js functions in the `api/` directory. A reachable MySQL service is required for persistent hosted data. The local Node server can use `data/store.json` for development.

The hosted demo currently has one shared workspace and no authentication or role-based authorization. Use fictional data only.
