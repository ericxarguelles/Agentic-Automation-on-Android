package com.androidphonecontrol

/** Retry when a missing prerequisite becomes ready, without a foreground-service restart loop. */
class AvailabilityStartupGate {
    private var attemptedConnection: String? = null

    fun reset() { attemptedConnection = null }

    fun shouldStart(enabled: Boolean, verified: Boolean, accessibility: Boolean, notifications: Boolean,
                    visible: Boolean, running: Boolean, connection: String): Boolean {
        if (!enabled || !verified || !accessibility || !notifications) { reset(); return false }
        if (!visible || running || attemptedConnection == connection) return false
        attemptedConnection = connection
        return true
    }
}
