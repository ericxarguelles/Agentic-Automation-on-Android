package com.androidphonecontrol

object AvailabilityPresentation {
    fun describe(enabled: Boolean, verified: Boolean, accessibility: Boolean, notifications: Boolean,
                 running: Boolean, ready: Boolean, serviceStatus: String): String = when {
        !enabled -> "Off · Phone control disabled"
        !accessibility -> "On · Accessibility is not connected. Open Settings → Accessibility and enable Android Agent."
        !notifications -> "On · Notifications are disabled. Open Settings → Notification permissions."
        ready -> "On · Ready for ChatGPT"
        running -> "On · " + serviceStatus.removePrefix("Remote availability: ")
        serviceStatus.startsWith("Remote availability: failed") || serviceStatus.startsWith("Remote availability: stopped") ->
            "On · " + serviceStatus.removePrefix("Remote availability: ") + " Tap Connect server to retry."
        !verified -> "On · Connect and verify your server first."
        else -> "On · Starting task availability…"
    }
}
