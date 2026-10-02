# TemirTrace — equipment passport demo

English-language local full-stack demo for equipment passports, service history, organization review, and verifiable Solana Devnet memos.

## Run tomorrow's demo

Requirements: Node.js 20+ and npm.

1. Open a terminal in this folder.
2. Run `npm install` once.
3. Run `npm run demo` (builds the frontend and starts the backend).
4. Open `http://127.0.0.1:8001` in Chrome. Keep the terminal open.
5. For the blockchain step, install Phantom only from [phantom.com/download](https://phantom.com/download), open this same local URL in that browser, and connect the wallet that owns your Devnet SOL. Check that Phantom says **Devnet** before approving a transaction.

No wallet? Click **Load sample demo** to show the application flow. The sample workspace is fictional and does not create an on-chain transaction. It will replace the current workspace in the local demo database, so use it only before entering data you want to keep.

## Demo script

1. Show the overview and backend status.
2. Load the fictional sample workspace, or create an organization profile.
3. In the review screen, submit the organization and choose **Simulate reviewer approval**. Explain that this only demonstrates a workflow; it does not verify a real company.
4. Add equipment and a service record. The record is stored by the backend and fingerprinted with SHA-256.
5. If you have the funded Devnet wallet, choose **Publish hash to Devnet**. Review the memo in the confirmation dialog, then review and sign it in Phantom. The backend fetches the transaction from Devnet and checks that its memo exactly matches the record ID and hash.
6. Copy the public passport link and open it in another tab on the same computer. It reads the passport from the local backend.

## Does blockchain need a backend?

No. The browser creates the memo transaction, and the wallet signs it. TemirTrace's backend is included for a different reason: it persists shared demo records in `data/store.json`, serves public passport pages, and independently verifies a submitted transaction through Solana's `getTransaction` RPC method. The backend binds to `127.0.0.1` only.

The current on-chain proof uses Solana's Memo program; there is no custom smart contract. The memo format is `TEMIRTRACE|v1|<event-id>|<sha256>`. Organization name, BIN, service provider, and comments are kept in the local database and are not included in the memo.

## Demo limits

- Devnet only. Devnet SOL has no real monetary value and the cluster can reset.
- No user accounts, authentication, hosted database, TLS, backups, or access controls. The local backend is for a supervised demo on one computer, not public deployment.
- Organization approval is simulated. BIN is checked for 12-digit format only; no Kazakhstan government registry or representative identity is checked.
- A verified hash proves that the matching memo was recorded; it does not prove that maintenance occurred or that the submitted facts are true.
- Public passport links reveal the shown equipment and service history to anyone who can access the local server. Use fictional demo data only.
- The extension wallet must hold the private key for the exact funded Devnet address. A public key alone cannot sign. Never paste a recovery phrase or private key into the app or chat.

## Build and start separately

```powershell
npm install
npm run build
npm start
```

Local data is written to `data/store.json`. To use another port, set `PORT` before `npm start` (for example `$env:PORT=8010`).
