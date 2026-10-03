# Contributing to TemirTrace

Thanks for your interest in contributing. TemirTrace is an early demo for equipment passports and verifiable maintenance records. Contributions should keep the prototype's behavior, limitations, and security boundaries clear.

## Before you start

- For a large change, open an issue first and describe the problem you want to solve.
- Keep pull requests focused and explain what changed and why.
- Use fictional organization, personal, and equipment data. Never commit real customer data, wallet recovery phrases, private keys, access tokens, database URLs, or `.env` files.
- Do not describe demo organization review as official verification, or a hash as proof that a real-world service event happened.
- Do not submit mainnet transactions as part of a contribution. The current project uses Solana Devnet.

## Local development

Requirements: Node.js 20+ and npm.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:8001`. Local data is stored in the ignored `data/store.json` file when no MySQL configuration is present.

Before opening a pull request, run `npm run build` and describe the manual steps you used to verify the change. The repository currently has no automated test suite.

## Pull requests

Include:

- A short summary of the change and its motivation.
- Relevant screenshots for user-interface changes.
- Build output and manual verification steps.
- Any known limitations or deployment configuration changes.

By submitting a contribution, you agree that it may be distributed under the project's MIT License.
