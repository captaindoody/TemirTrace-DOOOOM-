# TemirTrace Roadmap

This roadmap separates implemented demo capabilities from ideas that still need product, security, or customer validation. It is not a delivery commitment.

## Implemented in the current demo

- [x] Organization profile form with BIN format validation
- [x] Manual organization review queue and demo decisions
- [x] Equipment passports and maintenance records
- [x] SHA-256 fingerprints for service records
- [x] Wallet-signed Solana Devnet Memo transaction
- [x] Backend check of the submitted Devnet transaction and memo
- [x] Public passport route

## Possible next work

- [ ] Interview equipment owners and service workshops; record evidence about current workflows and demand
- [ ] Add authentication, organization-level data isolation, and reviewer permissions before storing real data
- [ ] Identify and validate an authoritative source for organization verification
- [ ] Decide whether a dedicated on-chain program provides a real product benefit beyond the Memo-based proof
- [ ] Review privacy, security, backups, and operational needs before any production or mainnet use

## Explicit non-goals for the current prototype

- Claiming a registry-confirmed organization identity
- Treating a wallet signature or record hash as proof that a repair occurred
- Storing full organization or service records on-chain
- Handling real SOL or production customer data
