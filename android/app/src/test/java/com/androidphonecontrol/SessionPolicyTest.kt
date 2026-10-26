package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test

class SessionPolicyTest {
    @Test fun agentControlSupportsNamedAppsAndRevokesAllOnStop() {
        val apps = listOf("com.instagram.android", "com.linkedin.android", "com.google.android.apps.messaging", "com.samsung.android.messaging")
        val policy = SessionPolicy { 100L }
        policy.begin(true)
        apps.forEach { app -> rejects { policy.checkAccess(app, true) } }
        policy.stop()
        policy.begin(true, allowSupportedApps = true)
        apps.forEach { policy.checkAccess(it, true) }
        policy.checkAccess("com.other.app", true)
        policy.stop()
        apps.forEach { app -> rejects { policy.checkAccess(app, true) } }
        policy.begin(true)
        apps.forEach { app -> rejects { policy.checkAccess(app, true) } }
    }
    @Test fun youtubeRequiresLocalOptInAndActionsAndIsResetOnStop() {
        val policy = SessionPolicy { 100L }
        policy.begin(true)
        rejects { policy.checkAccess("com.google.android.youtube", true) }
        policy.stop()
        policy.begin(false, allowSupportedApps = true)
        policy.checkAccess("com.google.android.youtube")
        rejects { policy.checkAccess("com.google.android.youtube", true) }
        policy.stop()
        policy.begin(true, allowSupportedApps = true)
        policy.checkAccess("com.google.android.youtube", true)
        policy.checkAccess("com.google.android.apps.nexuslauncher", true)
        policy.checkAccess("com.other.app", true)
        policy.stop()
        policy.begin(true)
        rejects { policy.checkAccess("com.google.android.youtube") }
    }
    @Test fun remoteLeaseCannotExceedFiveMinutes() {
        var time = 100L
        val policy = SessionPolicy { time }
        try { policy.begin(false, 300001L); fail("Oversized lease must fail") } catch (_: IllegalArgumentException) { }
        policy.begin(false, 2000L)
        policy.checkAccess("com.android.settings")
        time += 2000L
        rejects { policy.checkAccess("com.android.settings") }
    }
    private fun rejects(block: () -> Unit) {
        try { block(); fail("Access should be rejected") } catch (_: IllegalStateException) { }
    }

    @Test fun blockedAppsCannotBeReadOrControlledEvenWithFullControl() {
        val policy = SessionPolicy { 100L }
        policy.begin(true, allowSupportedApps = true)
        for (app in SessionPolicy.BLOCKED_APPS) {
            rejects { policy.checkAccess(app) }
            rejects { policy.checkAccess(app, true) }
        }
        for (label in listOf("Notes", "Samsung Notes", "Google Authenticator", "Microsoft Authenticator")) {
            rejects { policy.checkAccess("com.vendor.custom", appLabel = label) }
            rejects { policy.checkAccess("com.vendor.custom", true, label) }
        }
        rejects { policy.checkAccess(null) }
        rejects { policy.checkAccess("bad/package") }
        policy.checkAccess("com.android.chrome", true)
        policy.checkAccess("com.google.android.gm", true)
        policy.stop()
        rejects { policy.checkAccess("com.android.chrome", true) }
    }

    @Test fun readOnlySettingsAndExpiry() {
        var time = 100L
        val policy = SessionPolicy { time }
        rejects { policy.checkAccess("com.android.settings") }
        policy.begin(false)
        policy.checkAccess("com.android.settings")
        rejects { policy.checkAccess("com.android.settings", true) }
        rejects { policy.checkAccess("com.android.chrome") }
        rejects { policy.checkAccess(null) }
        rejects { policy.checkDemo() }
        rejects { policy.begin(true) }
        time += 299999L
        policy.checkAccess("com.android.settings")
        time++
        rejects { policy.checkAccess("com.android.settings") }
    }

    @Test fun explicitActionsNeverPermitOtherAppsAndStopRevokesAccess() {
        val policy = SessionPolicy { 100L }
        policy.begin(true)
        policy.checkAccess("com.android.settings", true)
        policy.checkDemo()
        rejects { policy.checkAccess("com.google.android.gm", true) }
        policy.stop()
        rejects { policy.checkAccess("com.android.settings", true) }
        rejects { policy.checkDemo() }
        policy.begin(false)
        rejects { policy.checkAccess("com.android.settings", true) }
    }
}
