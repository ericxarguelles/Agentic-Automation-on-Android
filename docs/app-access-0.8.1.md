# App access update — Android Agent 0.8.1

Owner-enabled Agentic control now allows installed apps except Notes. Google and
Microsoft Authenticator are no longer in the app block list. The companion's own
credential/setup screen remains protected. This supersedes the older 0.7.0/0.8.0
app-exclusion descriptions.

Install `outputs/AndroidAgent-0.8.1.apk` over the existing app, reopen it and
reconnect. Refresh the assistant's MCP tools/instructions and use a new chat.
The server and phone enforce this policy independently; an old installed APK
continues enforcing its former block list until updated. Android permissions,
locked-device checks, password-field filtering, stop controls and session limits
are unchanged. App accessibility can still limit available controls.

This is an app-level policy, not a filter on note content in allowed browsers.
Known Notes package IDs and Notes/Samsung Notes labels are blocked. A differently
named Notes app may require its package/label added to the block list.
