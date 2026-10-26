# Bounded app launch test (0.3.0)

This iteration adds owner-opted-in YouTube access and phone_launch_app. It does not add unrestricted phone access, installed-app inventory, Messages, Instagram, or general launcher navigation.

## Setup

1. Install outputs/AndroidPhoneControl-0.3.0.apk over the existing app.
2. Restart the managed Windows stack and Refresh tools on the plugin. Confirm nine tools including phone_launch_app; use a fresh chat if tool definitions remain stale.
3. Disable availability on Android. Check Allow YouTube and Allow actions in selected apps, then enable availability again. The grant is captured for that availability period; checkbox changes do not modify running availability.
4. Keep the phone unlocked. From a second ChatGPT client ask:

```text
Check phone_status and start a session if availability is ready. Call phone_launch_app with package_name com.google.android.youtube. Read the screen to verify YouTube is foreground. Do not play, post, subscribe, message, or change anything. Always stop the session and verify it ended.
```

Opening an app does not require a previous screen snapshot. It invalidates old snapshots, requires an active session and local action/app permission, and resolves only the selected app's launcher component. No arbitrary URLs/intents or shell commands are accepted. Android Settings is the other supported launch package.

Android may silently deny a background activity launch, so accepted means launch requested, not verified completion. The next read must confirm the correct package. If launch is denied, stop and report it rather than claiming success or repeatedly retrying. Actual S23+ app launch remains unverified. See https://developer.android.com/guide/components/activities/secure-bal.

## Boundaries

The Android package allowlist remains enforced for reads/actions. YouTube opt-in defaults off and is reset for new availability after app restart. Without action permission it can be read if already open but cannot be launched or interacted with. Password nodes, locked-screen checks, notification Stop, session deadlines and cleanup remain in place. Readable YouTube account/profile content may be returned during an authorized read; only ask for information you intend to share with the chat.

The proposed unrestricted app-discovery/control mode was not implemented. Broader app workflows need a separately reviewed access design.
