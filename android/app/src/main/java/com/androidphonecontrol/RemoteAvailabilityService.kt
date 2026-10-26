package com.androidphonecontrol

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.SystemClock
import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject

/** Owner-started foreground availability. No boot receiver, sticky restart, or automatic permissions. */
class RemoteAvailabilityService : Service() {
    private class HttpFailure(val code: Int, val registering: Boolean) : Exception()
    companion object {
        @Volatile var running = false
            private set
        @Volatile var status = "Remote availability: off"
            private set
        @Volatile var actionsAllowed = false
            private set
        @Volatile var supportedAppsAllowed = false
            private set
        @Volatile private var lastHeartbeat = 0L
        val ready: Boolean get() = running && lastHeartbeat > 0L && SystemClock.elapsedRealtime() - lastHeartbeat < 5000L
        private var instance: RemoteAvailabilityService? = null
        fun disable() { instance?.let { AgentPreferences.setAvailability(it, false); it.shutdown() } }
    }
    @Volatile private var epoch = 0
    private val main = Handler(Looper.getMainLooper())
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running) return START_NOT_STICKY
        if (!AgentPreferences.availabilityEnabled(this)) { stopSelf(); return START_NOT_STICKY }
        try {
            check(PhoneAccessibilityService.isConnected) { "Enable accessibility first." }
            check(!ReadSession.policy.active) { "Stop the current session first." }
            val endpoint = intent?.getStringExtra("endpoint") ?: error("Missing connection")
            val token = intent.getStringExtra("token") ?: error("Missing pairing")
            val actions = intent.getBooleanExtra("actions", false)
            val supportedApps = intent.getBooleanExtra("supportedApps", false)
            val uri = URI(endpoint)
            require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("10.0.2.2", "127.0.0.1", "localhost"))) { "Use HTTPS or a local test address." }
            require(uri.userInfo == null && uri.rawQuery == null && uri.fragment == null) { "Invalid server address." }
            require(token.length >= 24 && token.all { it.isLetterOrDigit() }) { "Enter the pairing token." }
            val notice = SessionNotice.notification(this, actions, waiting = true, allowSupportedApps = supportedApps)
            if (Build.VERSION.SDK_INT >= 34) startForeground(SessionNotice.ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            else startForeground(SessionNotice.ID, notice)
            actionsAllowed = actions
            supportedAppsAllowed = supportedApps
            running = true; instance = this
            lastHeartbeat = 0L
            status = "Remote availability: connecting (${if (supportedApps) "All apps except Notes" else "Settings only"}; ${if (actions) "actions allowed" else "read-only"})"
            val current = ++epoch
            Thread { poll(endpoint, token, actions, supportedApps, current) }.start()
        } catch (error: Exception) {
            running = false; actionsAllowed = false; supportedAppsAllowed = false
            lastHeartbeat = 0L
            if (instance === this) instance = null
            val known = setOf("Enable accessibility first.", "Stop the current session first.", "Use HTTPS or a local test address.", "Invalid server address.", "Enter the pairing token.", "Enable phone-control notifications before starting a session.")
            val reason = when {
                error.message in known -> error.message
                error is SecurityException -> "Android denied foreground-service startup. Install the latest APK and check app permissions."
                else -> "Service startup failed (${error.javaClass.simpleName}). Check the server address, accessibility and notifications."
            }
            status = "Remote availability: failed — $reason"
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun poll(endpoint: String, token: String, actions: Boolean, supportedApps: Boolean, current: Int) {
        var availability: String? = null
        var stoppedReason: String? = null
        fun request(path: String, method: String = "GET"): JSONObject {
            val connection = URI("$endpoint$path").toURL().openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 3000; connection.readTimeout = 3000
                connection.instanceFollowRedirects = false
                connection.requestMethod = method
                connection.setRequestProperty("Authorization", "Bearer $token")
                val code = connection.responseCode
                if (code != 200) throw HttpFailure(code, path == "/v1/availability")
                return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            } finally { connection.disconnect() }
        }
        try {
            // startForeground posts asynchronously. Do not immediately treat its notification as missing.
            val notificationDeadline = SystemClock.elapsedRealtime() + 3000L
            while (running && epoch == current) {
                try { SessionNotice.checkVisible(); break } catch (_: Exception) {
                    if (SystemClock.elapsedRealtime() >= notificationDeadline) {
                        stoppedReason = "Notification did not appear. Enable the app's Phone control sessions notification channel."
                        return
                    }
                    Thread.sleep(50)
                }
            }
            while (running && epoch == current) {
                if (!PhoneAccessibilityService.isConnected) { stoppedReason = "Accessibility service disconnected. Enable it again."; break }
                try { SessionNotice.checkVisible() } catch (_: Exception) { stoppedReason = "Notification disabled or dismissed. Enable notifications and retry."; break }
                try {
                    if (availability == null) availability = request("/v1/availability", "POST").getString("availability")
                    if (!running || epoch != current) break
                    val command = request("/v1/availability/$availability/next")
                    if (!running || epoch != current) break
                    lastHeartbeat = SystemClock.elapsedRealtime()
                    status = "Remote availability: ready (${if (supportedApps) "All apps except Notes" else "Settings only"}; ${if (actions) "actions allowed" else "read-only"})"
                    if (command.optString("action") == "start_session") {
                        val session = command.getString("session")
                        val seconds = command.getLong("seconds")
                        require(seconds in 1L..300L)
                        main.post {
                            if (running && epoch == current) {
                                // New server-issued ID means the previous server lease ended.
                                if (ReadSession.policy.active) ReadSession.stop()
                                try { ReadSession.start(this, endpoint, token, actions, session, seconds * 1000L, supportedApps, command.optString("task_text")) }
                                catch (_: Exception) { status = "Task start rejected. Unlock the phone and check local permissions." }
                            }
                        }
                    }
                    Thread.sleep(1000)
                } catch (error: Exception) {
                    if (!running || epoch != current) break
                    lastHeartbeat = 0L
                    // No action is retried. Revoke local task access before attempting to reconnect availability.
                    ReadSession.stop()
                    availability?.let { try { request("/v1/availability/$it", "DELETE") } catch (_: Exception) { } }
                    availability = null
                    val reason = when {
                        error is HttpFailure && error.code == 401 -> "Pairing token rejected. Test connection with the current pairing token."
                        error is HttpFailure && error.code == 403 -> "Private server denied access. Check Tailscale permissions."
                        error is HttpFailure && error.code == 409 -> "Server busy. Stop another device/manual session; retrying."
                        error is HttpFailure && error.code == 404 && error.registering -> "Server lacks availability support. Restart the updated managed stack."
                        error is HttpFailure -> "Server HTTP ${error.code}; reconnecting."
                        error is javax.net.ssl.SSLException -> "TLS connection failed. Check the private HTTPS address."
                        else -> "Private connection unavailable. Check Tailscale and Windows Serve on 8443; reconnecting."
                    }
                    if (error is HttpFailure && (error.code in listOf(401, 403) || (error.code == 404 && error.registering))) {
                        stoppedReason = reason; break
                    }
                    status = "Remote availability: $reason"
                    Thread.sleep(3000)
                }
            }
        } finally {
            availability?.let { try { request("/v1/availability/$it", "DELETE") } catch (_: Exception) { } }
            main.post { if (epoch == current) shutdown(stoppedReason) }
        }
    }

    private fun shutdown(reason: String? = null) {
        running = false; epoch++
        lastHeartbeat = 0L
        actionsAllowed = false
        supportedAppsAllowed = false
        if (instance === this) instance = null
        ReadSession.stop()
        status = if (reason == null) "Remote availability: off" else "Remote availability: stopped — $reason"
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }

    override fun onDestroy() {
        if (instance === this) { running = false; actionsAllowed = false; supportedAppsAllowed = false; instance = null; epoch++; ReadSession.stop(); status = "Remote availability: off" }
        super.onDestroy()
    }
}
