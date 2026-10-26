package com.androidphonecontrol

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.content.Context
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/** In-memory, owner-started test sessions with snapshot-bound actions. */
object ReadSession {
    val policy = SessionPolicy { SystemClock.elapsedRealtime() }
    private class SessionEndedException : Exception("Session ended by server.")
    @Volatile private var generation = 0
    @Volatile var status = "Task session: off"
        private set
    @Volatile var phase = TaskPhase.IDLE
        private set
    private val main = Handler(Looper.getMainLooper())

    fun stop() {
        TaskJournal.finish("Stopped")
        if (policy.active) phase = TaskPhase.STOPPED
        generation++
        policy.stop()
        SessionNotice.endSession()
        PhoneAccessibilityService.invalidateSnapshot()
        status = "Task session: off"
    }

    fun start(context: Context, endpoint: String, token: String, allowActions: Boolean, remoteSession: String? = null, durationMs: Long = 300000L, allowSupportedApps: Boolean = false, taskText: String = "") {
        check(remoteSession != null || !RemoteAvailabilityService.running) { "Disable remote availability before starting a manual session." }
        check(!policy.active) { "Stop the current session before starting another." }
        check(PhoneAccessibilityService.isConnected) { "Enable the companion service first." }
        val uri = URI(endpoint)
        require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("10.0.2.2", "127.0.0.1", "localhost"))) { "Use HTTPS or a local test address." }
        require(uri.userInfo == null && uri.rawQuery == null && uri.fragment == null) { "Invalid server address." }
        require(token.length >= 24 && token.all { it.isLetterOrDigit() }) { "Enter the pairing token." }
        if (remoteSession != null) check(!context.getSystemService(android.app.KeyguardManager::class.java).isKeyguardLocked) { "Unlock the phone before starting a task." }
        SessionNotice.show(context, allowActions, allowSupportedApps)
        policy.begin(allowActions, durationMs, allowSupportedApps)
        PhoneAccessibilityService.invalidateSnapshot()
        val current = ++generation
        TaskJournal.begin(context, taskText)
        phase = TaskPhase.CONNECTING
        status = "Task session: connecting"
        Thread {
            var session: String? = null
            fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
                val connection = URI("$endpoint$path").toURL().openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 3000
                    connection.readTimeout = 3000
                    connection.instanceFollowRedirects = false
                    connection.requestMethod = method
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    if (body != null) {
                        connection.doOutput = true
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                    }
                    if (connection.responseCode == 404 && path.startsWith("/v1/session/")) throw SessionEndedException()
                    check(connection.responseCode == 200) { "Server returned HTTP ${connection.responseCode}" }
                    return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                } finally { connection.disconnect() }
            }
            try {
                val deadline = SystemClock.elapsedRealtime() + durationMs
                if (remoteSession == null) session = request("/v1/session", "POST").getString("session")
                else {
                    session = remoteSession
                    check(generation == current && RemoteAvailabilityService.running) { "Availability stopped." }
                    request("/v1/session/$session/ready", "POST")
                }
                if (generation == current) {
                    phase = TaskPhase.RUNNING
                    status = "Task session: active (up to 5 minutes). ${if (allowSupportedApps) "All apps except Notes" else "Settings only"}. " + if (allowActions) "Actions enabled." else "Read-only."
                }
                while (generation == current && SystemClock.elapsedRealtime() < deadline && PhoneAccessibilityService.isConnected) {
                    SessionNotice.checkVisible()
                    val command = request("/v1/session/$session/next")
                    if (generation != current) break
                    TaskJournal.updatePrompt(command.optString("task_text"))
                    TaskJournal.checkpoint()
                    val action = command.optString("action")
                    if (action in listOf("read", "ime_enter", "tap_test", "tap_element", "scroll_element", "swipe_element", "back", "set_text", "launch_app")) {
                        val commandStarted = SystemClock.elapsedRealtime()
                        val task = FutureTask {
                            check(generation == current && SystemClock.elapsedRealtime() < deadline) { "Session ended." }
                            SessionNotice.checkVisible()
                            when (action) {
                                "read" -> PhoneAccessibilityService.readScreen()
                                "ime_enter" -> PhoneAccessibilityService.submitEditor(command.getString("snapshot"), command.getInt("element"))
                                "launch_app" -> PhoneAccessibilityService.launchApp(command.getString("package"))
                                "tap_element" -> PhoneAccessibilityService.tapElement(command.getString("snapshot"), command.getInt("element"))
                                "scroll_element" -> PhoneAccessibilityService.scrollElement(command.getString("snapshot"), command.getInt("element"), command.getString("direction"))
                                "swipe_element" -> PhoneAccessibilityService.swipeElement(command.getString("snapshot"), command.getInt("element"), command.getString("direction"))
                                "back" -> PhoneAccessibilityService.navigateBack(command.getString("snapshot"))
                                "set_text" -> PhoneAccessibilityService.setElementText(command.getString("snapshot"), command.getInt("element"), command.getString("text"))
                                else -> PhoneAccessibilityService.tapTestButton()
                            }
                        }
                        main.post(task)
                        val result = try { task.get(3, TimeUnit.SECONDS) }
                            catch (error: Exception) {
                                task.cancel(false)
                                val cause = error.cause ?: error
                                JSONObject().put("error", cause.message).put("error_code",
                                    if (cause is PhoneAccessibilityService.SnapshotFailure) cause.code else "DEVICE_REJECTED")
                            }
                        result.put("timings", JSONObject().put("device_execution_ms", SystemClock.elapsedRealtime() - commandStarted))
                        if (generation == current && SystemClock.elapsedRealtime() < deadline) {
                            request("/v1/session/$session/result", "POST", JSONObject().put("id", command.getString("id")).put("result", result))
                        }
                    } else {
                        // Completed commands fetch their successor immediately. Only idle
                        // responses back off, avoiding a busy loop while awaiting work.
                        Thread.sleep(100)
                    }
                }
                if (generation == current) { phase = TaskPhase.ENDED; status = "Task session: ended"; TaskJournal.finish("Session ended") }
            } catch (_: SessionEndedException) {
                if (generation == current) { phase = TaskPhase.ENDED; status = "Task session: ended by server"; TaskJournal.finish("Session ended") }
            } catch (error: Exception) {
                if (generation == current) { phase = TaskPhase.FAILED; status = "Task session failed: ${error.message}"; TaskJournal.finish("Interrupted") }
            } finally {
                if (generation == current) {
                    policy.stop()
                    SessionNotice.endSession()
                    PhoneAccessibilityService.invalidateSnapshot()
                }
                if (session != null) try { request("/v1/session/$session", "DELETE") } catch (_: Exception) { }
            }
        }.start()
    }
}
