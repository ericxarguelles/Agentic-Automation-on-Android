package com.androidphonecontrol

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.app.KeyguardManager
import android.graphics.Rect
import android.graphics.Path
import android.accessibilityservice.GestureDescription
import org.json.JSONArray
import org.json.JSONObject
import android.os.SystemClock
import android.os.Bundle
import java.util.UUID

/** Observations and snapshot-bound actions during owner-enabled sessions. */
class PhoneAccessibilityService : AccessibilityService() {
    class SnapshotFailure(val code: String, message: String) : IllegalStateException(message)
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Dynamic feeds emit content events continuously. Validate the chosen target at action time.
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) invalidateSnapshot("WINDOW_STATE_CHANGED")
    }
    override fun onInterrupt() = Unit

    override fun onDestroy() {
        ReadSession.stop()
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        private var instance: PhoneAccessibilityService? = null
        private data class Target(val path: List<Int>, val node: AccessibilityNodeInfo, val identity: String)
        private data class Screen(val json: JSONObject, val targets: Map<Int, Target>, val complete: Boolean)
        private data class Snapshot(val id: String, val created: Long, val window: Int, val screen: Screen)
        private data class ValidatedScreen(val service: AccessibilityService, val snapshot: Snapshot, val root: AccessibilityNodeInfo)
        private var snapshot: Snapshot? = null
        val isConnected: Boolean get() = instance != null

        private var invalidationReason = "SNAPSHOT_MISSING"
        private fun failSnapshot(code: String, message: String): Nothing = throw SnapshotFailure(code, message)
        fun invalidateSnapshot(reason: String = "SNAPSHOT_INVALIDATED") { snapshot = null; invalidationReason = reason }

        fun disable() {
            ReadSession.stop()
            instance?.disableSelf()
            instance = null
        }

        private fun identity(node: AccessibilityNodeInfo): String {
            val bounds = Rect().also { node.getBoundsInScreen(it) }
            return JSONArray(listOf(node.packageName?.toString(), node.className?.toString(), node.viewIdResourceName,
                node.text?.toString(), node.contentDescription?.toString(), node.hintText?.toString(),
                bounds.toShortString(), node.isEnabled, node.isClickable, node.isEditable,
                node.isCheckable, node.isChecked, node.isSelected)).toString()
        }

        private fun checkAppAccess(service: AccessibilityService, packageName: String?, mutation: Boolean = false) {
            check(packageName != service.packageName) { "The companion setup screen is excluded to protect connection credentials." }
            // Resolve the installed label locally; no blocked app content is collected.
            val appLabel = packageName?.let {
                try { service.packageManager.getApplicationLabel(service.packageManager.getApplicationInfo(it, 0)).toString() }
                catch (_: android.content.pm.PackageManager.NameNotFoundException) { null }
            }
            ReadSession.policy.checkAccess(packageName, mutation, appLabel)
        }

        private fun collect(root: AccessibilityNodeInfo): Screen {
            val elements = JSONArray()
            val targets = mutableMapOf<Int, Target>()
            var visited = 0
            var complete = true
            fun visit(node: AccessibilityNodeInfo, path: List<Int>) {
                if (++visited > 500 || path.size > 30) { complete = false; return }
                if (node.isPassword) return
                val bounds = Rect()
                node.getBoundsInScreen(bounds)
                val id = elements.length()
                elements.put(JSONObject().put("id", id).put("path", path.joinToString("/"))
                    .put("text", node.text?.toString()?.take(500) ?: "")
                    .put("description", node.contentDescription?.toString()?.take(500) ?: "")
                    .put("hint", node.hintText?.toString()?.take(500) ?: "")
                    .put("viewId", node.viewIdResourceName ?: "")
                    .put("class", node.className?.toString() ?: "")
                    .put("visible", node.isVisibleToUser).put("enabled", node.isEnabled)
                    .put("clickable", node.isClickable).put("checkable", node.isCheckable).put("checked", node.isChecked)
                    .put("editable", node.isEditable).put("supportsSetText", canSetText(node)).put("supportsImeEnter", canSubmit(node))
                    .put("scrollable", node.isScrollable).put("scrollDirections", JSONArray().apply {
                        for (direction in listOf("up", "down")) {
                            if (scrollAction(node, direction) != null) put(direction)
                        }
                    })
                    .put("selected", node.isSelected).put("bounds", bounds.toShortString()))
                if (node.isVisibleToUser && node.isEnabled && (node.isClickable || node.isScrollable || canSetText(node) || canSubmit(node))) {
                    targets[id] = Target(path, node, identity(node))
                }
                for (index in 0 until node.childCount) {
                    if (visited >= 500) { complete = false; break }
                    node.getChild(index)?.let { visit(it, path + index) }
                }
            }
            visit(root, emptyList())
            val windowBounds = Rect().also { root.getBoundsInScreen(it) }
            return Screen(JSONObject().put("package", root.packageName?.toString()).put("windowBounds", windowBounds.toShortString())
                .put("elements", elements), targets, complete)
        }

        fun readScreen(): JSONObject {
            invalidateSnapshot()
            val service = instance ?: error("Enable the accessibility service first.")
            check(!service.getSystemService(KeyguardManager::class.java).isKeyguardLocked) { "Device is locked." }
            val root = service.rootInActiveWindow ?: error("No accessible window.")
            check(root.packageName?.toString() != service.packageName) { "Open another app, such as Settings, before reading. Our setup screen is excluded to protect the pairing token." }
            checkAppAccess(service, root.packageName?.toString())
            val screen = collect(root)
            val id = UUID.randomUUID().toString()
            snapshot = Snapshot(id, SystemClock.elapsedRealtime(), root.windowId, screen)
            // Keep the unmodified tree locally for comparison; metadata goes on a copy.
            val visible = JSONArray()
            val all = screen.json.getJSONArray("elements")
            for (index in 0 until all.length()) {
                val element = all.getJSONObject(index)
                if (element.getBoolean("visible")) {
                    val exported = JSONObject(element.toString())
                    if (!ReadSession.policy.actionsEnabled) {
                        exported.put("clickable", false).put("editable", false).put("supportsSetText", false)
                            .put("supportsImeEnter", false).put("scrollable", false).put("scrollDirections", JSONArray())
                    }
                    visible.put(exported)
                }
            }
            return JSONObject().put("package", root.packageName?.toString()).put("elements", visible).put("snapshot", id)
                .put("windowBounds", screen.json.getString("windowBounds"))
                .put("expiresInSeconds", 30).put("clicksAvailable", screen.complete && ReadSession.policy.actionsEnabled)
                .put("actionsAvailable", screen.complete && ReadSession.policy.actionsEnabled)
        }

        private fun takeSnapshot(snapshotId: String): ValidatedScreen {
            val saved = snapshot ?: failSnapshot(invalidationReason, "Snapshot unavailable: $invalidationReason. Read again.")
            invalidateSnapshot("SNAPSHOT_CONSUMED") // Every attempt consumes the snapshot, including rejected attempts.
            if (saved.id != snapshotId) failSnapshot("SNAPSHOT_REPLACED", "Snapshot ID was replaced. Read again.")
            if (SystemClock.elapsedRealtime() - saved.created >= 30000) failSnapshot("SNAPSHOT_EXPIRED", "Snapshot is older than 30 seconds. Read again.")
            if (!saved.screen.complete) failSnapshot("SCREEN_TRUNCATED", "Screen tree was truncated; actions are unavailable.")
            val service = instance ?: error("Companion service is off.")
            check(!service.getSystemService(KeyguardManager::class.java).isKeyguardLocked) { "Device is locked." }
            val root = service.rootInActiveWindow ?: error("No accessible window.")
            checkAppAccess(service, root.packageName?.toString(), mutation = true)
            if (root.windowId != saved.window || root.packageName?.toString() != saved.screen.json.optString("package")) {
                failSnapshot("APP_WINDOW_CHANGED", "App window changed. Read again.")
            }
            return ValidatedScreen(service, saved, root)
        }

        private fun resolveTarget(saved: Snapshot, root: AccessibilityNodeInfo, elementId: Int): AccessibilityNodeInfo {
            val target = saved.screen.targets[elementId] ?: error("Choose a visible, enabled element with the requested action.")
            var node = root
            for (index in target.path) node = node.getChild(index) ?: failSnapshot("TARGET_DISAPPEARED", "Target disappeared. Read again.")
            if (!(node == target.node && node.refresh() && node.isVisibleToUser && node.isEnabled && !node.isPassword &&
                node.packageName == root.packageName && identity(node) == target.identity)) {
                failSnapshot("TARGET_CHANGED", "Selected target identity, state or bounds changed. Read again.")
            }
            return node
        }

        fun tapElement(snapshotId: String, elementId: Int): JSONObject {
            val screen = takeSnapshot(snapshotId)
            val node = resolveTarget(screen.snapshot, screen.root, elementId)
            check(node.isClickable) { "Target is not clickable. Run read again." }
            check(node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { "Android rejected the click. Run read again." }
            return JSONObject().put("action", "tap_element").put("element", elementId)
                .put("accepted", true).put("message", "Click accepted. Read again to check the resulting screen.")
        }

        fun launchApp(packageName: String): JSONObject {
            invalidateSnapshot()
            val service = instance ?: error("Companion service is off.")
            checkAppAccess(service, packageName, mutation = true)
            check(!service.getSystemService(KeyguardManager::class.java).isKeyguardLocked) { "Device is locked." }
            val intent = service.packageManager.getLaunchIntentForPackage(packageName) ?: error("Allowed app is not installed or has no launcher activity.")
            check(intent.component?.packageName == packageName) { "Unexpected launch target." }
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            service.startActivity(intent)
            return JSONObject().put("action", "launch_app").put("package", packageName).put("accepted", true)
                .put("message", "App launch requested. Read the screen to verify Android opened the intended app.")
        }

        private fun scrollAction(node: AccessibilityNodeInfo, direction: String): Int? {
            if (!node.isScrollable) return null
            val actions = node.actionList.map { it.id }
            val directional = if (direction == "up") AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_UP.id
                else AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_DOWN.id
            val fallback = if (direction == "up") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            return when {
                directional in actions -> directional
                fallback in actions -> fallback
                else -> null
            }
        }

        fun scrollElement(snapshotId: String, elementId: Int, direction: String): JSONObject {
            val screen = takeSnapshot(snapshotId)
            require(direction == "up" || direction == "down") { "Direction must be up or down." }
            val node = resolveTarget(screen.snapshot, screen.root, elementId)
            val action = scrollAction(node, direction) ?: error("Target cannot scroll $direction. Run read again.")
            check(node.performAction(action)) { "Android rejected the scroll. The list may be at its boundary. Run read again." }
            return JSONObject().put("action", "scroll_element").put("element", elementId)
                .put("direction", direction).put("accepted", true)
                .put("message", "Scroll accepted. Read again to inspect the result.")
        }

        fun navigateBack(snapshotId: String): JSONObject {
            val service = takeSnapshot(snapshotId).service
            check(service.systemActions.any { it.id == GLOBAL_ACTION_BACK }) { "Back is not available on this screen. Run read again." }
            check(service.performGlobalAction(GLOBAL_ACTION_BACK)) { "Android rejected Back. Run read again." }
            return JSONObject().put("action", "back").put("accepted", true)
                .put("message", "Back accepted. Read again to inspect the result.")
        }

        fun swipeElement(snapshotId: String, elementId: Int, direction: String): JSONObject {
            require(direction in listOf("up", "down", "left", "right")) { "Unsupported swipe direction." }
            val screen = takeSnapshot(snapshotId)
            val node = resolveTarget(screen.snapshot, screen.root, elementId)
            val bounds = Rect().also { node.getBoundsInScreen(it) }
            val window = Rect().also { screen.root.getBoundsInScreen(it) }
            check(bounds.intersect(window) && bounds.width() >= 48 && bounds.height() >= 48) { "Target is too small or outside the app window." }
            val cx = bounds.exactCenterX()
            val cy = bounds.exactCenterY()
            val dx = bounds.width() * 0.3f
            val dy = bounds.height() * 0.3f
            val path = Path().apply {
                when (direction) {
                    "up" -> { moveTo(cx, cy + dy); lineTo(cx, cy - dy) }
                    "down" -> { moveTo(cx, cy - dy); lineTo(cx, cy + dy) }
                    "left" -> { moveTo(cx + dx, cy); lineTo(cx - dx, cy) }
                    else -> { moveTo(cx - dx, cy); lineTo(cx + dx, cy) }
                }
            }
            val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 350)).build()
            check(screen.service.dispatchGesture(gesture, null, null)) { "Android rejected gesture dispatch." }
            return JSONObject().put("action", "swipe_element").put("element", elementId).put("direction", direction)
                .put("accepted", true).put("message", "Swipe dispatched, completion is not confirmed. Read again to verify; do not automatically retry.")
        }

        private fun canSetText(node: AccessibilityNodeInfo): Boolean =
            node.isEditable && !node.isPassword && node.actionList.any { it.id == AccessibilityNodeInfo.ACTION_SET_TEXT }

        private fun canSubmit(node: AccessibilityNodeInfo): Boolean =
            node.isEditable && !node.isPassword && node.isFocused &&
                node.actionList.any { it.id == AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id }

        fun submitEditor(snapshotId: String, elementId: Int): JSONObject {
            val screen = takeSnapshot(snapshotId)
            val node = resolveTarget(screen.snapshot, screen.root, elementId)
            check(canSubmit(node)) { "Focused field does not advertise a keyboard submit action. Read again; no fallback Enter was sent." }
            check(node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) { "Android rejected keyboard submit. Read to verify; do not automatically retry." }
            return JSONObject().put("action", "ime_enter").put("element", elementId).put("accepted", true)
                .put("message", "Current keyboard action dispatched (Search, Done, Go, Send, or app-defined). Read again to verify.")
        }

        fun setElementText(snapshotId: String, elementId: Int, text: String): JSONObject {
            val screen = takeSnapshot(snapshotId)
            require(text.length <= 1000 && '\u0000' !in text) { "Text must be at most 1000 UTF-16 code units and contain no NUL characters." }
            val node = resolveTarget(screen.snapshot, screen.root, elementId)
            check(canSetText(node)) { "Target is not an editable non-password field supporting text entry. Run read again." }
            val arguments = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            check(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) { "Android rejected text entry. Run read again." }
            return JSONObject().put("action", "set_text").put("element", elementId)
                .put("accepted", true).put("textLength", text.length)
                .put("message", "Text replacement accepted. No Enter or submit action was sent. Read again to verify.")
        }

        fun tapTestButton(): JSONObject {
            invalidateSnapshot()
            ReadSession.policy.checkDemo()
            val service = instance ?: error("Enable the accessibility service first.")
            check(!service.getSystemService(KeyguardManager::class.java).isKeyguardLocked) { "Device is locked." }
            val root = service.rootInActiveWindow ?: error("No accessible window.")
            check(root.packageName?.toString() == service.packageName) { "Open the single-tap test screen in Android Phone Control." }
            val target = root.findAccessibilityNodeInfosByViewId("${service.packageName}:id/tap_test_target")
                .firstOrNull { it.isVisibleToUser && it.isEnabled && it.isClickable }
                ?: error("Test button not visible. Open the single-tap test screen first.")
            check(target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { "Android rejected the test click." }
            return JSONObject().put("action", "tap_test").put("accepted", true)
                .put("message", "Test click accepted. Check the counter on the emulator.")
        }
    }
}
