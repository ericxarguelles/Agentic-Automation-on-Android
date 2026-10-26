# Security and privacy

Android Agent can read personal screen content and activate controls during
owner-enabled sessions. App exclusions and password-field filtering do not make
every allowed screen harmless. Browser content is not filtered by the app block
list. Use a phone and accounts you own or are authorized to test.

Never publish `.env` files, pairing/MCP tokens, owner keys, OAuth tokens,
`settings.dpapi`, `oauth-state.bin`, private messages, or unreviewed recordings.
Keep the device route private. The public HTTPS route must reach the authenticated
OAuth gateway, not the unauthenticated bridge or local MCP listener directly.
Do not disable Android lock-screen restrictions or locally granted controls to
make a demonstration succeed.

The implementation is single-owner/single-device development infrastructure,
not an independently audited multi-user service. Windows processes running as
the owner may access owner-encrypted configuration. Model/assistant providers
may receive screen observations through the connected tools.

For suspected vulnerabilities, do not post exploit details or credentials in
public issues. A private reporting contact must be established by the maintainer
before public release. Until then, coordinate privately with the repository owner.

## Before publishing

See [the scoped publication audit](docs/publication-audit.md). Generate a separate
source-only export with `scripts/audit-publication.ps1`; do not upload the full
working directory. A clean scan is not a guarantee of absence of vulnerabilities.

Review the actual Git file list and history, not only `.gitignore`. The local
`work/` folder contains private runtime state and must remain excluded. Inspect
documentation for personal hostnames and identifying screenshots. Use synthetic
accounts for public demos. Choose release signing and dependency-notice policies.
