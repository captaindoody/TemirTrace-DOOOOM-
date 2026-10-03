# TemirTrace — Equipment Passports

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-9945FF)](https://explorer.solana.com/?cluster=devnet)
[![Colosseum](https://img.shields.io/badge/Colosseum-Crypto%20World's%20Fair%202026-141414)](https://colosseum.com/worldsfair)
[![License: MIT](https://img.shields.io/badge/License-MIT-14F195)](LICENSE)

> Equipment passports with maintenance records that can be checked against a public Solana Devnet transaction.

[Live Application](https://temir-trace-doooom.vercel.app/) · [GitHub Repository](https://github.com/captaindoody/TemirTrace-DOOOOM-) · [Colosseum Crypto World's Fair](https://colosseum.com/worldsfair)

---

## Submission to Crypto World's Fair 2026

| Name | Role | Location / Contact |
| --- | --- | --- |
| `@captaindoody` | Founder & Product Builder | Kazakhstan · [GitHub](https://github.com/captaindoody) |

## Problem and Solution

Equipment details and service history can be held in separate documents and databases. When equipment changes hands or visits a new workshop, its history may be difficult to review. TemirTrace explores a portable digital passport for equipment and its maintenance records.

### 1. Scattered Service History

- **Problem hypothesis:** Owners and workshops may not have one convenient view of an asset's past maintenance.
- **TemirTrace:** Keeps equipment details and service records together in a digital passport.

### 2. Records Are Hard to Compare

- **Problem hypothesis:** A viewer may need a way to check that a shared record matches the version previously anchored.
- **TemirTrace:** Calculates a SHA-256 fingerprint and can publish the record reference and fingerprint in a Solana Devnet Memo transaction.

### 3. On-Chain Proof Has Limits

- **Important limitation:** A matching fingerprint can show that data matches an anchored fingerprint. It does not prove the repair happened or verify that the submitted information is true.
- Full organization, equipment, and service data remain off-chain in the application database.

These problem statements are product hypotheses. Customer demand has not yet been validated.

## Why Solana

- **Public verification** — a reviewer can inspect the Devnet transaction independently of TemirTrace's database.
- **Wallet approval** — the user reviews and signs the transaction from a connected wallet.
- **Small on-chain reference** — the prototype publishes a record ID and fingerprint through the existing Memo program.
- **No custom contract required for this demo** — TemirTrace uses Solana Devnet and the Memo program; it does not deploy its own Solana program.

## Summary of Features

- Organization profile with format-only BIN validation.
- Manual organization review queue for the demo.
- Equipment passports and maintenance records.
- SHA-256 fingerprint calculation for selected service-record fields.
- Phantom-compatible wallet connection through the Solana wallet interface.
- Solana Devnet Memo submission and backend verification of the transaction signature and memo.
- Public passport page with the record and available proof status.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React · Vite · JavaScript |
| Solana client | `@solana/kit` · wallet plugin · `@solana-program/memo` |
| Backend | Node.js API functions |
| Hosted database | MySQL · `mysql2` |
| Local demo storage | JSON file |
| Hosting | Vercel |
| Network | Solana Devnet |

## Architecture

```text
┌──────────────────────┐       ┌────────────────────────┐
│ User / public viewer │──────▶│ TemirTrace web app     │
└──────────────────────┘       │ React + Vite           │
                               └───────────┬────────────┘
                                           │ API requests
                                           ▼
                               ┌────────────────────────┐
                               │ Node.js API            │──────▶ MySQL
                               │ save / load / verify   │         Full records
                               └───────────┬────────────┘
                                           │ Read transaction
┌──────────────────────┐                   ▼
│ Wallet (e.g. Phantom)│──── signed ──▶ Solana Devnet
└──────────────────────┘   Memo tx       Record ID + hash
```

See [docs/architecture.md](docs/architecture.md) for the record flow and what is stored on-chain versus off-chain.

## Quick Start

**Requirements:** Node.js 20+ and npm.

```sh
# Clone the repository
git clone https://github.com/captaindoody/TemirTrace-DOOOOM-.git
cd TemirTrace-DOOOOM-

# Install dependencies and build the frontend
npm ci
npm run build

# Start the local demo
npm start
```

Open [http://127.0.0.1:8001](http://127.0.0.1:8001). With no database settings, local demo data is stored in `data/store.json`. To try the blockchain flow, open the site in a browser with Phantom and use Solana Devnet.

## Roadmap

- [x] Organization profile and demo review workflow
- [x] Equipment passports and maintenance records
- [x] Hash a record and submit a Devnet Memo transaction
- [x] Verify the transaction against Solana Devnet
- [ ] Add user accounts, organization-level data isolation, and reviewer permissions
- [ ] Test the problem and workflow with equipment owners and service workshops
- [ ] Evaluate an authoritative organization-verification source
- [ ] Reassess production security and network requirements before any mainnet launch

Full proposed roadmap: [docs/roadmap.md](docs/roadmap.md).

## Resources

- [Live application](https://temir-trace-doooom.vercel.app/)
- [GitHub repository](https://github.com/captaindoody/TemirTrace-DOOOOM-)
- [Solana Devnet Explorer](https://explorer.solana.com/?cluster=devnet)
- [Colosseum Crypto World's Fair](https://colosseum.com/worldsfair)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)

Add the published pitch video, demo video, and Colosseum project-submission link here once their final URLs are available.

## Demo and Limitations

The hosted prototype uses a single shared workspace with no user accounts or role-based access. Anyone who can open it may read or change demo data. Use fictional organization, personal, and equipment data only.

- BIN validation checks the number format only; there is no registry lookup.
- Organization review is a manual demo workflow, not an independent or legal verification.
- Full records are stored off-chain. The memo is public and is not encryption.
- A hash does not prove that a service event happened or that the submitted data is true.
- The project has no custom Solana smart contract and no documented customer traction yet.
- Devnet SOL has no real monetary value; Devnet data may be reset.

## Repository Context

The Git history in this repository begins on October 2, 2026; it does not necessarily capture earlier prototype activity. AI coding tools assisted with implementation based on the founder's product goals and instructions. Any work completed before the hackathon period should be disclosed separately in the Colosseum submission.

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## License

TemirTrace is released under the [MIT License](LICENSE).
