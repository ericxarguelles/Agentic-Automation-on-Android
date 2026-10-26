package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test

class TaskPresentationTest {
    @Test fun activeTaskAnimatesAndIdleReadinessReflectsActualConnection() {
        assertTrue(TaskPresentation.from(TaskPhase.RUNNING, true, true).animated)
        assertTrue(TaskPresentation.from(TaskPhase.CONNECTING, false, true).animated)
        assertEquals("Finish connecting", TaskPresentation.from(TaskPhase.IDLE, false, true).title)
        assertEquals("Ready when you are", TaskPresentation.from(TaskPhase.IDLE, true, true).title)
        assertEquals("Agent is paused", TaskPresentation.from(TaskPhase.IDLE, false, false).title)
    }
    @Test fun endedSessionDoesNotClaimTaskSuccessAndFailuresAreDistinct() {
        val ended = TaskPresentation.from(TaskPhase.ENDED, true, true)
        assertFalse(ended.animated)
        assertEquals("Session complete", ended.title)
        assertTrue(ended.detail.contains("Check ChatGPT"))
        assertEquals("Task stopped", TaskPresentation.from(TaskPhase.STOPPED, true, true).title)
        assertEquals("Session interrupted", TaskPresentation.from(TaskPhase.FAILED, true, true).title)
    }
}
