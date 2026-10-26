# App access in Android Agent 0.7.0

Owner-enabled Agentic control permits installed apps beyond the previous six-app
list. Notes, Google Authenticator (`com.google.android.apps.authenticator2`), and
Microsoft Authenticator (`com.azure.authenticator`) are excluded. The companion's
setup screen remains excluded to protect pairing credentials.

Android enforces the exclusion before launching an app, collecting its screen,
or acting on a snapshot. Known Notes package IDs and installed labels such as
Notes/Samsung Notes are blocked. The server independently rejects known blocked
packages through both launch tools. A Notes app with a different package and
different label would need adding to the policy. These are app-level exclusions;
they do not filter notes or authentication content inside other allowed apps.

Launcher visibility uses Android's MAIN/LAUNCHER intent query; it does not request
unrestricted installed-package visibility. Existing session expiry, phone lock,
local action permission and snapshot checks remain enforced. Settings-only test
sessions remain Settings-only. Android can still deny a background app launch.

Install `outputs/AndroidAgent-0.7.0.apk` as an update, reopen Android Agent, check
accessibility if Android disabled it during the update, and reconnect to the
server. Refresh the MCP connection's tools and start a new chat to load the
expanded package-name schema. The old installed app retains its narrower policy
until updated.
