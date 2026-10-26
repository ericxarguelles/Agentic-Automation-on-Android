package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test

class VoiceTaskPromptTest {
    @Test fun taskIsPreservedAndHandoffDescribesExistingSessionLifecycle() {
        val task = "Open Instagram and read my follower count."
        val prompt = VoiceTaskPrompt.build("  $task  ")
        assertTrue(prompt.contains("\n\n$task\n\n"))
        assertTrue(prompt.contains("phone_status"))
        assertTrue(prompt.contains("always stop the session"))
        assertTrue(prompt.contains("Do not take over"))
    }
    @Test fun emptyOversizedAndNulTasksCannotBeShared() {
        for (task in listOf("   ", "x".repeat(2001), "task\u0000")) {
            try { VoiceTaskPrompt.build(task); fail("Invalid task should fail") } catch (_: IllegalArgumentException) { }
        }
    }
}
