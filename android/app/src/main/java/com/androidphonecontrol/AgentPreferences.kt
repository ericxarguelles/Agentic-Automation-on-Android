package com.androidphonecontrol

import android.content.Context

/** Owner preference, separate from service/network readiness. No boot receiver. */
object AgentPreferences {
    fun availabilityEnabled(context: Context): Boolean =
        context.getSharedPreferences("agent_ui", Context.MODE_PRIVATE).getBoolean("availability", true)

    fun setAvailability(context: Context, enabled: Boolean) {
        context.getSharedPreferences("agent_ui", Context.MODE_PRIVATE).edit().putBoolean("availability", enabled).apply()
    }
}
