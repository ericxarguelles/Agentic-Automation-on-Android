# Automatic task sessions

The first launch or screen read establishes a session automatically when no
session exists and owner-enabled remote availability has a fresh heartbeat.
The command is queued only after the phone acknowledges session startup. Routine
tasks do not need separate `phone_status` or `phone_start_session` calls.

Use `phone_action_and_observe` with `action=launch` for launch plus verification.
Screen-bound actions still require a fresh snapshot and never start a session
using stale IDs. Explicit start/status tools remain available for diagnostics.
Stop, expiry, cancellation, disabled availability, locked-device restrictions,
blocked apps, and local action permissions retain their existing behavior.
An unacknowledged startup times out without dispatching the action; commands
are never automatically retried. Concurrent calls during startup are rejected.

This is a server update. No new Android APK is required for automatic sessions.
Refresh the connected plugin's tools/instructions and start a new chat so the
assistant stops following the older status/start-first instructions. Broader app
access still requires the separately supplied Android Agent 0.7.0 update.

Validation: all 60 server tests pass, including automatic launch/read startup,
acknowledgement ordering, concurrent-start rejection, cancellation, timeout,
missing/stale availability, blocked packages, and stale snapshot protection.
