package com.androidphonecontrol

/** Enforced on the device, independently of AI instructions or server tool metadata. */
class SessionPolicy(private val elapsed: () -> Long) {
    companion object {
        val BLOCKED_APPS = setOf("com.androidphonecontrol", "com.samsung.android.app.notes",
            "com.samsung.android.snote", "com.miui.notes", "com.coloros.note", "com.oplus.note", "com.oneplus.note")
        private val PACKAGE_NAME = Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
        fun isBlockedApp(packageName: String?, label: String? = null): Boolean {
            if (packageName == null || packageName.length > 255 || !PACKAGE_NAME.matches(packageName)) return true
            val normalized = label?.trim()?.lowercase(java.util.Locale.ROOT)
            return packageName in BLOCKED_APPS || normalized in setOf("notes", "samsung notes")
        }
    }
    @Volatile private var deadline = 0L
    @Volatile private var allowActions = false
    @Volatile private var supportedApps = false
    val active: Boolean get() = deadline > elapsed()
    val actionsEnabled: Boolean get() = active && allowActions

    fun begin(actions: Boolean, durationMs: Long = 300000L, allowSupportedApps: Boolean = false) {
        check(!active) { "Stop the current session before starting another." }
        require(durationMs in 1L..300000L) { "Session duration must be at most five minutes." }
        allowActions = actions
        supportedApps = allowSupportedApps
        deadline = elapsed() + durationMs
    }

    fun stop() { deadline = 0L; allowActions = false; supportedApps = false }

    fun checkAccess(packageName: String?, mutation: Boolean = false, appLabel: String? = null) {
        check(active) { "No active local session. Enable one in the app." }
        check(!isBlockedApp(packageName, appLabel)) { "App blocked. Notes are excluded from phone control." }
        check(packageName == "com.android.settings" || supportedApps) { "App blocked. Enable Agentic control locally for access beyond Settings." }
        check(!mutation || allowActions) { "Read-only session. Enable actions locally before a new session or availability period." }
    }

    fun checkDemo() {
        check(active && allowActions) { "Enable a session with Settings actions before using the fixed demo button." }
    }
}
