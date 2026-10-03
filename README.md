# TemirTrace

TemirTrace is an early equipment-passport demo for organizations, equipment owners, and service workshops. It stores organization and service-history records in a backend database and can publish a record ID plus SHA-256 fingerprint to Solana Devnet using the Memo program.

## Run locally

Requirements: Node.js 20+ and npm.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:8001`. Without database settings the local server saves demo data to `data/store.json`. The local mode does not require an access code. Use fictional data only.

## Deploy on Wasmer

Connect this GitHub repository to a Wasmer app and select the `main` branch. Use the Node base preset with:

- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm start`
- Enable Database: on (MySQL)

Set `NODE_ENV` to `production`. The server requires the managed database but no access code. Wasmer supplies `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD` when its managed database is enabled. TemirTrace creates its state table automatically and starts with an empty workspace; it does not import the local `data/store.json` file.

The demo has no login or access code. All visitors can read and change the single shared workspace, including organization profiles, equipment passports, service records, and demo review decisions. Use only fictional data. There are no individual accounts, organization isolation, or protected moderator roles; this setup is for a public demonstration, not production use.

## Deploy on Vercel

Vercel serves the Vite build from `dist` and runs the API through a Node.js Function in `api/[...path].js`. The `vercel.json` file contains the build, output, and public-passport route settings. Vercel does not run the local `npm start` command as a persistent server.

The production API still needs a reachable MySQL database. One setup option is the Railway integration for Vercel: provision a Railway MySQL service, enable its public TCP proxy, and connect the Railway project to Vercel so `MYSQL_PUBLIC_URL` is available to the deployment. Railway documents that external MySQL access requires Public Access/TCP Proxy and that network egress may be billed. Alternatively, set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD` in Vercel from another MySQL provider.

In Vercel Environment Variables, set `NODE_ENV=production` and the MySQL connection variables. `APP_ACCESS_CODE` is no longer used and can be removed from Vercel. Redeploy after changing environment variables. Do not use local JSON storage in a serverless production deployment.

## Demo walkthrough

1. Open the public demo URL.
2. Use **Load sample demo** or create an organization profile.
3. Submit the organization for review and use **Simulate reviewer approval**. This demonstrates a workflow; it is not a real company verification.
4. Create an equipment passport and service record.
5. If using a Phantom wallet funded with Devnet SOL, publish the record fingerprint. Review the memo in Phantom before signing.
6. Copy and open the public passport link. It shows the intentionally public equipment history and Devnet proof status.

## What the proof means

The backend stores the full record in MySQL (Wasmer) or JSON (local mode). The browser computes its SHA-256 fingerprint. A wallet signs a Solana Devnet Memo containing `TEMIRTRACE|v1|<event-id>|<sha256>`. The backend fetches the transaction from Solana and checks that memo against the stored record.

Only the record ID and hash are sent in the memo. A blockchain hash is not encryption and does not prove that a repair happened or that submitted details are true. BIN validation checks the 12-digit format only. There is no government-registry lookup, custom smart contract, or real reviewer identity check. Devnet SOL has no real monetary value and Devnet may reset.

Never enter a wallet recovery phrase or private key into TemirTrace. The app should only request a transaction signature through the wallet extension.
