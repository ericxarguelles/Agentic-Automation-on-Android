# Publication privacy review — 2026-10-25

## Scope and outcome

Reviewed the source/documentation publication candidates, setup scripts and
credential handling. This is a scoped privacy and source-publication review,
not a penetration test, security certification, Git-history review or guarantee
that the software has no vulnerabilities.

- Replaced a personal Tailscale hostname and Windows account paths in guides
  with generic examples.
- Replaced a real contact-name test fixture with a fictional name.
- Preserved an unused personally identifying banner outside the publication
  tree in ignored local storage.
- Kept reviewed synthetic emulator screenshots only in the source export.
- Strengthened ignore rules for local assistant state, credentials, recordings,
  diagnostic dumps, APKs, and private evaluation data.
- Added an allowlisted source exporter. It excludes runtime state, dependencies,
  build directories, local SDK paths, APKs and unreviewed media.
- Compared export candidates against the current installation's actual pairing
  token, internal MCP token, owner key, state key and server origin/hostname,
  without logging those values. No exact matches remained in exported source.
- The package-registry audit of server production dependencies reported no
  known advisories across 92 dependencies at review time. This does not scan
  Android dependencies or identify unknown/application-logic vulnerabilities.

The local working directory still intentionally contains private ignored
runtime state. Do not upload the entire directory or assume ignore rules apply
to an ordinary ZIP attachment. Use the reviewed source export.

## Repeatable private credential check and source export

From the project root under the Windows account that owns the encrypted setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-publication.ps1
```

It privately decrypts local configuration only for exact-match comparison and
passes values to the scanner in its child environment, not command-line
arguments. Do not run under a shared transcript or process-debugging session.
The exported folder is under `outputs/publication-...` and contains a relative
file manifest with SHA-256 hashes. Existing destinations are never overwritten.

Without local settings, the audit can perform generic source checks but cannot
compare credentials it does not know. Generic secret patterns are detection
heuristics, not a universal secret detector. File hashes are an inventory, not
an independent authenticity signature.

Only this freshly generated source directory should become the initial Git
repository. Confirm its file list before the first commit. If a secret was ever
published in a previous repository, removing the latest file is insufficient:
rotate it and address Git history and any released archives separately.

## Remaining security/release work

- An independent review of the public OAuth gateway, authorization scope and
  cross-client session behavior is still advisable before general deployment.
- Credential rotation/revocation recovery needs a dedicated, tested workflow.
- Release APKs need a signing/distribution policy; this export contains no APKs.
- Recordings/screenshots and arbitrary new files require a fresh privacy review.
- Model-visible screen contents can contain hostile instructions. App exclusions
  do not filter allowed browser content. Keep owner authorization and local stop.
- Local processes under the owner's account can inspect process environments
  and access account-scoped credentials. Encryption is not protection against a
  compromised Windows account or unlocked, compromised phone.

The managed launcher generates per-installation random credentials and keeps
them private by default. The old local development launcher intentionally
prints temporary credentials and screen observations; do not use it as a
production setup path or publish captured development terminals.

See [Windows setup and credential retrieval](windows-startup.md) for the normal
user installation instructions.
