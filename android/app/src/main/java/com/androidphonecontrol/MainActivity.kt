package com.androidphonecontrol

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.widget.*
import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var host: FrameLayout
    private lateinit var home: LinearLayout
    private lateinit var settingsPage: LinearLayout
    private lateinit var address: EditText
    private lateinit var token: EditText
    private lateinit var connectionStatus: TextView
    private lateinit var connectionBadge: TextView
    private lateinit var connectButton: Button
    private lateinit var taskTitle: TextView
    private lateinit var taskDetail: TextView
    private lateinit var stopTask: Button
    private lateinit var availabilitySwitch: Switch
    private lateinit var availabilityDetail: TextView
    private lateinit var accessibilityDetail: TextView
    private lateinit var savedList: LinearLayout
    private lateinit var remember: CheckBox
    private lateinit var taskCard: LinearLayout
    private lateinit var taskProgress: ProgressBar
    private lateinit var taskElapsed: TextView
    private lateinit var historyList: LinearLayout
    private var historyRevision = -1
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var updatingSwitch = false
    private var connectionAttempt = 0
    private var connecting = false
    private var verifiedEndpoint: String? = null
    private var verifiedToken: String? = null
    private var activityVisible = false
    private var autoAttempted = false
    private val startupGate = AvailabilityStartupGate()
    private var availabilityStartError: String? = null
    private val refresh = object : Runnable {
        override fun run() { ensureAvailability(); updateStatus(); handler.postDelayed(this, 500) }
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    private fun space(parent: LinearLayout, height: Int) { parent.addView(View(this), LinearLayout.LayoutParams(1, dp(height))) }
    private fun text(value: String, size: Float = 14f, color: Int = AgentColors.text, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color)
        if (bold) setTypeface(null, Typeface.BOLD)
        setLineSpacing(dp(3).toFloat(), 1f)
    }
    private fun label(parent: LinearLayout, value: String, size: Float = 14f, color: Int = AgentColors.text, bold: Boolean = false): TextView =
        text(value, size, color, bold).also { parent.addView(it) }
    private fun card(parent: LinearLayout): LinearLayout = column().apply {
        setPadding(dp(20), dp(20), dp(20), dp(20))
        background = AgentColors.shape(AgentColors.surface, dp(22).toFloat(), AgentColors.border)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    private fun button(parent: LinearLayout, value: String, primary: Boolean = false, action: () -> Unit): Button = Button(this).apply {
        text = value; isAllCaps = false; textSize = 14f; minHeight = dp(50)
        setTextColor(if (primary) AgentColors.background else AgentColors.text)
        background = AgentColors.shape(if (primary) AgentColors.accent else AgentColors.field, dp(13).toFloat(), if (primary) null else AgentColors.border)
        setPadding(dp(16), dp(8), dp(16), dp(8))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2))
        setOnClickListener { action() }
    }
    private fun field(parent: LinearLayout, hintText: String, secret: Boolean = false): EditText = EditText(this).apply {
        hint = hintText; textSize = 14f; setTextColor(AgentColors.text); setHintTextColor(AgentColors.muted)
        setSingleLine(true); minHeight = dp(54); setPadding(dp(14), dp(12), dp(14), dp(12))
        background = AgentColors.shape(AgentColors.field, dp(12).toFloat(), AgentColors.border)
        inputType = InputType.TYPE_CLASS_TEXT or if (secret) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_URI
        isSaveEnabled = false; importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        parent.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    private fun page(title: String? = null): Pair<LinearLayout, LinearLayout> {
        val page = column()
        val header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL; setPadding(dp(24), dp(22), dp(16), dp(16))
        }
        val heading = column()
        label(heading, title ?: "Android Agent", if (title == null) 27f else 25f, bold = true)
        label(heading, if (title == null) "AI Phone Automation" else "Make it yours", 13f, AgentColors.muted)
        header.addView(heading, LinearLayout.LayoutParams(0, -2, 1f))
        val headerButton: View = if (title == null) AgentMark(this, gear = true).apply {
            contentDescription = "Open Settings"; setOnClickListener { showSettings() }
        } else text("×", 30f, AgentColors.muted).apply { gravity = Gravity.CENTER; contentDescription = "Close Settings"; setOnClickListener { showHome() } }
        headerButton.isClickable = true; headerButton.isFocusable = true
        header.addView(headerButton, LinearLayout.LayoutParams(dp(48), dp(48)))
        page.addView(header)
        val content = column().apply { setPadding(dp(24), dp(10), dp(24), dp(24)) }
        val scroll = ScrollView(this).apply { isFillViewport = true; addView(content); clipToPadding = false }
        page.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        label(page, "YOUR PHONE. YOUR AGENT.", 10f, AgentColors.muted).apply { gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(16)); letterSpacing = .16f }
        return page to content
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        host = FrameLayout(this).apply { setBackgroundColor(AgentColors.background) }
        host.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        val saved = runCatching { PairingStore.read(this) }
        val (homePage, homeContent) = page()
        home = homePage
        val connection = card(homeContent)
        val serverRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        serverRow.addView(ServerMark(this), LinearLayout.LayoutParams(dp(40), dp(40)))
        val serverLabels = column().apply { setPadding(dp(12), 0, dp(8), 0) }
        label(serverLabels, "Server", 18f, bold = true)
        connectionBadge = label(serverLabels, "Not connected", 12f, AgentColors.muted)
        connectionBadge.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        serverRow.addView(serverLabels, LinearLayout.LayoutParams(0, -2, 1f))
        connection.addView(serverRow)
        space(connection, 16)
        connectButton = button(connection, "Connect", true) { connectOrDisconnect() }
        connectionStatus = TextView(this) // Internal diagnostic state, rendered once in the server row.
        space(homeContent, 16)
        taskCard = card(homeContent)
        val taskHeading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        taskHeading.addView(text("●  Thinking", 13f, AgentColors.accent, true), LinearLayout.LayoutParams(0, -2, 1f))
        taskElapsed = text("0s", 13f, AgentColors.muted).also { taskHeading.addView(it) }
        taskCard.addView(taskHeading)
        space(taskCard, 14)
        taskTitle = label(taskCard, "Phone task", 19f, bold = true)
        space(taskCard, 14)
        taskProgress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(AgentColors.accent)
        }
        taskCard.addView(taskProgress, LinearLayout.LayoutParams(-1, dp(5)))
        space(taskCard, 10)
        taskDetail = label(taskCard, "Waiting for the agent’s next action", 12f, AgentColors.muted)
        space(taskCard, 14)
        stopTask = button(taskCard, "Stop task") { ReadSession.stop(); updateStatus() }
        taskCard.visibility = View.GONE
        space(homeContent, 8)
        val historyHeading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        historyHeading.addView(text("History", 20f, bold = true), LinearLayout.LayoutParams(0, -2, 1f))
        val clearHistory = text("Clear", 13f, AgentColors.muted).apply {
            gravity = Gravity.CENTER; minWidth = dp(48); minHeight = dp(48)
            isClickable = true; isFocusable = true; contentDescription = "Clear task history"
            setOnClickListener {
                android.app.AlertDialog.Builder(this@MainActivity).setTitle("Clear task history?")
                    .setMessage("Remove the task requests and durations saved on this phone.")
                    .setNegativeButton("Cancel", null).setPositiveButton("Clear") { _, _ ->
                        TaskJournal.clear(this@MainActivity); renderHistory()
                    }.show()
            }
        }
        historyHeading.addView(clearHistory)
        homeContent.addView(historyHeading)
        historyList = column().also { homeContent.addView(it) }

        val (settings, content) = page("Settings")
        settingsPage = settings
        val serverSettings = card(content)
        label(serverSettings, "Server connection", 17f, bold = true)
        space(serverSettings, 14)
        address = field(serverSettings, "https://your-server.ts.net:8443").apply { setText(saved.getOrNull()?.endpoint ?: "") }
        space(serverSettings, 10)
        token = field(serverSettings, "Pairing token", true).apply { setText(saved.getOrNull()?.token ?: "") }
        space(serverSettings, 12)
        button(serverSettings, "Connect") { showHome(); connectOrDisconnect() }
        space(content, 16)
        val availability = card(content)
        val toggleRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val toggleLabels = column()
        label(toggleLabels, "ChatGPT task availability", 16f, bold = true)
        label(toggleLabels, "Let your agent start tasks", 12f, AgentColors.muted)
        toggleRow.addView(toggleLabels, LinearLayout.LayoutParams(0, -2, 1f))
        availabilitySwitch = Switch(this).apply {
            contentDescription = "ChatGPT task availability"; minWidth = dp(56); minHeight = dp(48)
            isChecked = AgentPreferences.availabilityEnabled(this@MainActivity)
            thumbTintList = ColorStateList.valueOf(AgentColors.text)
            trackTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(AgentColors.accent, AgentColors.border))
            setOnCheckedChangeListener { _, enabled ->
                if (!updatingSwitch) {
                    AgentPreferences.setAvailability(this@MainActivity, enabled)
                    startupGate.reset()
                    if (!enabled) { RemoteAvailabilityService.disable(); ReadSession.stop() }
                    else if (isVerified()) startAvailability(true) else { showHome(); verifyConnection() }
                    updateStatus()
                }
            }
        }
        toggleRow.addView(availabilitySwitch)
        availability.addView(toggleRow)
        space(availability, 14)
        availabilityDetail = label(availability, "On · Setup required", 12f, AgentColors.muted)
        space(availability, 10)
        label(availability, "On enables read, tap, type, scroll and swipe in apps except Notes. Task sessions end automatically; availability stays on between tasks.", 12f, AgentColors.muted)
        space(content, 16)
        val setup = card(content)
        label(setup, "Accessibility", 17f, bold = true)
        space(setup, 8)
        accessibilityDetail = label(setup, "Setup required", 12f, AgentColors.muted)
        space(setup, 14)
        button(setup, "Open accessibility settings") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        space(setup, 10)
        button(setup, "Notification permissions") {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 74)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        space(setup, 10)
        label(setup, "Allows the agent to read screen content and perform actions. You can revoke access in Android Settings.", 12f, AgentColors.muted)
        space(content, 16)
        val savedCard = card(content)
        label(savedCard, "Saved connections", 17f, bold = true)
        space(savedCard, 6)
        label(savedCard, "Stored encrypted on this phone. Up to 10 servers.", 12f, AgentColors.muted)
        space(savedCard, 10)
        remember = CheckBox(this).apply {
            text = "Save verified connections"; textSize = 13f; setTextColor(AgentColors.text)
            buttonTintList = ColorStateList.valueOf(AgentColors.accent)
            isChecked = getPreferences(MODE_PRIVATE).getBoolean("remember", saved.getOrNull() != null)
            setOnCheckedChangeListener { _, checked -> getPreferences(MODE_PRIVATE).edit().putBoolean("remember", checked).apply() }
        }
        savedCard.addView(remember)
        savedList = column().also { savedCard.addView(it) }
        space(content, 16)
        val about = card(content)
        label(about, "Android Agent", 16f, bold = true)
        space(about, 6)
        label(about, "AI Phone Automation · 0.8.1", 12f, AgentColors.muted)
        space(about, 12)
        label(about, "Apps except Notes\n\nYour Windows server must remain running. Availability resumes when you open the app with a verified connection and required permissions. No boot startup. The phone must be unlocked for tasks.", 12f, AgentColors.muted)
        renderSavedConnections()
        showHome()
        setContentView(host)
        onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
            if (settingsPage.parent != null) showHome() else finish()
        }
        host.requestApplyInsets()
        updateStatus()
    }

    private fun showHome() { host.removeAllViews(); host.addView(home) }
    private fun showSettings() { renderSavedConnections(); host.removeAllViews(); host.addView(settingsPage) }
    override fun onResume() {
        super.onResume(); activityVisible = true; handler.post(refresh)
        startupGate.reset()
        ensureAvailability()
        if (AgentPreferences.availabilityEnabled(this) && !RemoteAvailabilityService.running && !autoAttempted &&
            address.text.isNotBlank() && token.text.isNotBlank()) {
            autoAttempted = true
            if (isVerified()) ensureAvailability() else verifyConnection(false)
        }
    }
    override fun onPause() {
        activityVisible = false; handler.removeCallbacks(refresh)
        super.onPause()
    }

    private fun isVerified() = verifiedEndpoint == address.text.toString().trim().trimEnd('/') && verifiedToken == token.text.toString().trim()
    private fun connectOrDisconnect() {
        if (RemoteAvailabilityService.running) {
            AgentPreferences.setAvailability(this, false); RemoteAvailabilityService.disable(); ReadSession.stop()
            verifiedEndpoint = null; verifiedToken = null; connectionStatus.text = "Disconnected. Turn availability on in Settings to reconnect."
            updateStatus()
        } else {
            if (address.text.isBlank() || token.text.isBlank()) { showSettings(); return }
            AgentPreferences.setAvailability(this, true)
            verifyConnection()
        }
    }
    private fun verifyConnection(requestPermission: Boolean = true) {
        if (connecting) return
        startupGate.reset()
        availabilityStartError = null
        val endpoint = address.text.toString().trim().trimEnd('/')
        val secret = token.text.toString().trim()
        val attempt = ++connectionAttempt
        connecting = true; verifiedEndpoint = null; verifiedToken = null
        connectionStatus.text = "Verifying connection…"; updateStatus()
        Thread {
            var verified = false
            val message = try {
                val uri = URI(endpoint)
                require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("10.0.2.2", "127.0.0.1", "localhost"))) { "Use HTTPS or a local emulator address." }
                require(uri.host != null && uri.userInfo == null && uri.rawQuery == null && uri.fragment == null) { "Enter a server address only." }
                require(secret.length >= 24 && secret.all { it.isLetterOrDigit() }) { "Enter your server’s pairing token." }
                val connection = URI("$endpoint/v1/hello").toURL().openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 5000; connection.readTimeout = 5000; connection.instanceFollowRedirects = false
                    connection.setRequestProperty("Authorization", "Bearer $secret")
                    when (val code = connection.responseCode) {
                        200 -> {
                            val hello = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                            require(hello.getInt("protocol") == 1 && hello.getString("name") == "Android Phone Control") { "Unexpected server response." }
                            verified = true; "Connection verified."
                        }
                        401 -> "Pairing token rejected. Check the token from your Windows server."
                        else -> "Connection failed: HTTP $code."
                    }
                } finally { connection.disconnect() }
            } catch (error: Exception) {
                when (error) {
                    is IllegalArgumentException -> error.message ?: "Check your server address and token."
                    else -> "Connection failed. Check your server, Tailscale and address."
                }
            }
            runOnUiThread {
                if (!isDestroyed && attempt == connectionAttempt) {
                    connecting = false; connectionStatus.text = message
                    if (verified && endpoint == address.text.toString().trim().trimEnd('/') && secret == token.text.toString().trim()) {
                        verifiedEndpoint = endpoint; verifiedToken = secret
                        if (remember.isChecked) {
                            try { PairingStore.save(this, SavedPairing(endpoint, secret)); renderSavedConnections() }
                            catch (_: Exception) { connectionStatus.append(" Could not save encrypted connection. Manage saved connections in Settings.") }
                        }
                        if (AgentPreferences.availabilityEnabled(this) && activityVisible) startAvailability(requestPermission)
                    }
                    updateStatus()
                }
            }
        }.start()
    }
    private fun startAvailability(requestPermission: Boolean) {
        if (!activityVisible || !AgentPreferences.availabilityEnabled(this) || RemoteAvailabilityService.running || !isVerified()) return
        if (!PhoneAccessibilityService.isConnected) { connectionStatus.text = "Server verified. Accessibility is not connected: open Settings → Accessibility and enable Android Agent."; return }
        if (!SessionNotice.permissionsEnabled(this)) {
            connectionStatus.text = "Server verified. Enable Android Agent notifications and the Phone control sessions channel in Settings."
            if (requestPermission && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 74)
            return
        }
        if (!startupGate.shouldStart(true, true, true, true, activityVisible, RemoteAvailabilityService.running, "${verifiedEndpoint}:$connectionAttempt")) return
        try {
            availabilityStartError = null
            startForegroundService(Intent(this, RemoteAvailabilityService::class.java)
                .putExtra("endpoint", verifiedEndpoint).putExtra("token", verifiedToken)
                .putExtra("actions", true).putExtra("supportedApps", true))
        } catch (_: Exception) {
            availabilityStartError = "Remote availability: failed — Android could not start the foreground service. Check app permissions and retry Connect server."
            connectionStatus.text = "Android could not start availability. Check permissions in Settings."
        }
    }
    private fun ensureAvailability() {
        // Accessibility can connect asynchronously after onResume. Recheck prerequisites while visible.
        if (!activityVisible || connecting) return
        val enabled = AgentPreferences.availabilityEnabled(this)
        if (!enabled || !isVerified() || !PhoneAccessibilityService.isConnected || !SessionNotice.permissionsEnabled(this)) {
            startupGate.reset()
            return
        }
        startAvailability(false)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 74 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && AgentPreferences.availabilityEnabled(this)) startAvailability(false)
    }
    private fun renderSavedConnections() {
        savedList.removeAllViews()
        val result = runCatching { PairingStore.readAll(this) }
        val connections = result.getOrNull().orEmpty()
        if (result.isFailure) {
            label(savedList, "Saved connections could not be opened.", 12f, AgentColors.danger)
            space(savedList, 10)
            button(savedList, "Clear unreadable saved connections") {
                try { PairingStore.forget(this); renderSavedConnections() }
                catch (_: Exception) { connectionStatus.text = "Could not clear saved connections." }
            }
        } else if (connections.isEmpty()) { space(savedList, 8); label(savedList, "No saved connections yet.", 12f, AgentColors.muted) }
        else connections.reversed().forEach { pairing ->
            space(savedList, 16)
            label(savedList, pairing.endpoint, 12f).apply { maxLines = 3 }
            space(savedList, 8)
            val row = LinearLayout(this)
            val use = Button(this).apply {
                text = "Use"; isAllCaps = false; setTextColor(AgentColors.accent); setBackgroundColor(android.graphics.Color.TRANSPARENT)
                isEnabled = !RemoteAvailabilityService.running && !connecting
                setOnClickListener {
                    verifiedEndpoint = null; verifiedToken = null; address.setText(pairing.endpoint); token.setText(pairing.token)
                    connectionStatus.text = "Saved connection selected. Tap Connect server."; autoAttempted = true; showHome(); updateStatus()
                }
            }
            val remove = Button(this).apply {
                text = "Remove"; isAllCaps = false; setTextColor(AgentColors.danger); setBackgroundColor(android.graphics.Color.TRANSPARENT)
                setOnClickListener {
                    try {
                        PairingStore.remove(this@MainActivity, pairing.endpoint)
                        if (address.text.toString().trim().trimEnd('/') == pairing.endpoint) {
                            connectionAttempt++; connecting = false; AgentPreferences.setAvailability(this@MainActivity, false)
                            RemoteAvailabilityService.disable(); ReadSession.stop(); verifiedEndpoint = null; verifiedToken = null
                            token.setText(""); address.setText(""); connectionStatus.text = "Connection removed and access stopped."
                        }
                        renderSavedConnections(); updateStatus()
                    } catch (_: Exception) { connectionStatus.text = "Could not remove saved connection." }
                }
            }
            row.addView(use, LinearLayout.LayoutParams(0, dp(48), 1f)); row.addView(remove, LinearLayout.LayoutParams(0, dp(48), 1f)); savedList.addView(row)
        }
    }
    private fun renderHistory() {
        historyRevision = TaskJournal.revision
        historyList.removeAllViews()
        val records = TaskJournal.history(this)
        if (TaskJournal.storageError) {
            label(historyList, "History could not be opened on this phone.", 13f, AgentColors.muted)
        } else if (records.isEmpty()) {
            val empty = card(historyList)
            label(empty, "No tasks yet", 16f, bold = true)
            space(empty, 6)
            label(empty, "Your requests and execution times will appear here.", 13f, AgentColors.muted)
        } else records.forEach { record ->
            val entry = card(historyList)
            label(entry, record.prompt.ifBlank { "Phone task" }, 15f, bold = true)
            space(entry, 8)
            val time = java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT).format(java.util.Date(record.startedAt))
            val duration = if (record.state == "Unfinished") {
                if (record.durationMs == 0L) "Time unavailable" else "At least ${record.durationMs / 1000}s"
            } else "${record.durationMs / 1000}s"
            label(entry, "${record.state} · $duration · $time", 12f, AgentColors.muted)
            space(historyList, 10)
        }
    }
    private fun updateStatus() {
        val enabled = AgentPreferences.availabilityEnabled(this)
        val running = RemoteAvailabilityService.running
        val ready = RemoteAvailabilityService.ready
        updatingSwitch = true; availabilitySwitch.isChecked = enabled; updatingSwitch = false
        val availabilityMessage = AvailabilityPresentation.describe(enabled, isVerified(), PhoneAccessibilityService.isConnected,
            SessionNotice.permissionsEnabled(this), running, ready, availabilityStartError ?: RemoteAvailabilityService.status)
        if (availabilityDetail.text != availabilityMessage) availabilityDetail.text = availabilityMessage
        accessibilityDetail.text = if (PhoneAccessibilityService.isConnected) "●  Accessibility is enabled" else "Setup required to read and control your phone"
        accessibilityDetail.setTextColor(if (PhoneAccessibilityService.isConnected) AgentColors.accent else AgentColors.muted)
        val checkText = when {
            connecting -> "Checking connection…"
            ready -> "Connected"
            running -> RemoteAvailabilityService.status.removePrefix("Remote availability: ")
            isVerified() && !PhoneAccessibilityService.isConnected -> "Enable accessibility in Settings"
            isVerified() && !SessionNotice.permissionsEnabled(this) -> "Enable notifications in Settings"
            isVerified() && !enabled -> "Paused"
            availabilityStartError != null -> "Connection needs attention — check permissions in Settings"
            isVerified() -> "Starting…"
            connectionStatus.text.isNotBlank() -> connectionStatus.text.toString()
            else -> "Not connected"
        }
        connectionBadge.text = checkText
        connectionBadge.setTextColor(if (ready) AgentColors.accent else AgentColors.muted)
        connectButton.text = when { connecting -> "Checking…"; running -> "Disconnect"; else -> "Connect" }
        connectButton.isEnabled = !connecting
        address.isEnabled = !running && !connecting; token.isEnabled = !running && !connecting
        val task = TaskJournal.current
        taskCard.visibility = if (task != null) View.VISIBLE else View.GONE
        if (task != null) {
            taskTitle.text = task.prompt.ifBlank { "Phone task" }
            taskElapsed.text = "${TaskJournal.elapsedMs() / 1000}s"
            taskDetail.text = if (ReadSession.phase == TaskPhase.CONNECTING) "Starting phone session…" else "Agent is working on your phone"
        }
        if (historyRevision != TaskJournal.revision) renderHistory()
    }
}
