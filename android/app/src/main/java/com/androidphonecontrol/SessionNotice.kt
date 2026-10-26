package com.androidphonecontrol

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

object SessionNotice {
    private const val CHANNEL = "phone_control_sessions"
    const val ID = 7401
    private var app: Context? = null

    fun permissionsEnabled(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        return manager.areNotificationsEnabled() &&
            manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun notification(context: Context, allowActions: Boolean, waiting: Boolean = false, allowSupportedApps: Boolean = false): Notification {
        val application = context.applicationContext
        val manager = application.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Phone control sessions", NotificationManager.IMPORTANCE_DEFAULT))
        check(manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL).importance != NotificationManager.IMPORTANCE_NONE) {
            "Enable phone-control notifications before starting a session."
        }
        val stop = PendingIntent.getBroadcast(application, 0, Intent(application, StopSessionReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val open = PendingIntent.getActivity(application, 0, Intent(application, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        app = application
        val apps = if (allowSupportedApps) "All apps except Notes" else "Settings"
        return Notification.Builder(application, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(if (waiting) "Phone control available to ChatGPT" else "Phone control session — up to 5 minutes")
            .setContentText(if (waiting) "Waiting: $apps ${if (allowActions) "actions allowed" else "read-only"}. Stop disables availability." else "$apps ${if (allowActions) "actions enabled" else "read-only"}. Stop disables access.")
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(Notification.Action.Builder(null, if (waiting) "Disable availability" else "Stop access", stop).build()).build()
    }

    fun show(context: Context, allowActions: Boolean, allowSupportedApps: Boolean = false) {
        context.getSystemService(NotificationManager::class.java).notify(ID, notification(context, allowActions, allowSupportedApps = allowSupportedApps))
    }

    fun endSession() {
        val context = app ?: return
        if (RemoteAvailabilityService.running) {
            try {
                context.getSystemService(NotificationManager::class.java).notify(ID, notification(context, RemoteAvailabilityService.actionsAllowed, waiting = true, allowSupportedApps = RemoteAvailabilityService.supportedAppsAllowed))
            } catch (_: Exception) { dismiss() }
        } else dismiss()
    }

    fun checkVisible() {
        val manager = app?.getSystemService(NotificationManager::class.java)
        check(manager != null && manager.areNotificationsEnabled() &&
            manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE &&
            manager.activeNotifications.any { it.id == ID }) { "Session notification is unavailable. Start a new session in the app." }
    }

    fun dismiss() { app?.getSystemService(NotificationManager::class.java)?.cancel(ID) }
}

class StopSessionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AgentPreferences.setAvailability(context, false)
        RemoteAvailabilityService.disable()
        ReadSession.stop()
    }
}
