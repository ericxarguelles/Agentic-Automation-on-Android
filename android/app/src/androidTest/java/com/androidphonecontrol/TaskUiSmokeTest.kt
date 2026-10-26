package com.androidphonecontrol

import android.app.Instrumentation
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import java.io.File

/** Runs only on the isolated development emulator. Captures actual rendered UI. */
class TaskUiSmokeTest : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    override fun onStart() {
        try {
            val context = targetContext
            TaskJournal.clear(context)
            val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivitySync(intent)
            waitForIdleSync(); SystemClock.sleep(700)
            capture("task-home.png")
            runOnMainSync { TaskJournal.begin(context, "Open Instagram and read my follower count") }
            SystemClock.sleep(1600)
            check(TaskJournal.elapsedMs() >= 1500)
            capture("task-thinking.png")
            runOnMainSync { TaskJournal.updatePrompt("Different request") }
            check(TaskJournal.current?.prompt == "Open Instagram and read my follower count")
            runOnMainSync { TaskJournal.finish("Session ended") }
            SystemClock.sleep(700)
            val history = TaskJournal.history(context)
            check(history.size == 1 && history[0].durationMs >= 1500)
            check(history[0].prompt == "Open Instagram and read my follower count")
            val stored = context.getSharedPreferences("task_history", 0).getString("encrypted", "")!!
            check(!stored.contains("Instagram"))
            capture("task-history.png")
            runOnMainSync { TaskJournal.clear(context) }
            check(TaskJournal.history(context).isEmpty())
            finish(Activity.RESULT_OK, Bundle().apply { putString("result", "Task UI, timer, encrypted history and clear checks passed") })
        } catch (error: Throwable) {
            finish(Activity.RESULT_CANCELED, Bundle().apply { putString("error", error.toString()) })
        }
    }
    private fun capture(name: String) {
        waitForIdleSync()
        val bitmap = uiAutomation.takeScreenshot() ?: error("No screenshot available")
        File(targetContext.filesDir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
