package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test

class AvailabilityPresentationTest {
    @Test fun savedOnAndVerifiedServerExplainMissingAccessibilityAndNotifications() {
        val missingAccess = AvailabilityPresentation.describe(true, true, false, true, false, false, "Remote availability: off")
        assertTrue(missingAccess.contains("Accessibility is not connected"))
        assertFalse(missingAccess.contains("Ready"))
        val missingNotice = AvailabilityPresentation.describe(true, true, true, false, false, false, "Remote availability: off")
        assertTrue(missingNotice.contains("Notifications are disabled"))
    }
    @Test fun readyOffAndStoppedFailureAreDistinctAndPreserveTheReason() {
        assertEquals("On · Ready for ChatGPT", AvailabilityPresentation.describe(true, true, true, true, true, true, "ready"))
        assertEquals("Off · Phone control disabled", AvailabilityPresentation.describe(false, true, true, true, false, false, "Remote availability: failed"))
        val failure = AvailabilityPresentation.describe(true, true, true, true, false, false, "Remote availability: stopped — Pairing token rejected.")
        assertTrue(failure.contains("Pairing token rejected"))
        assertTrue(failure.contains("retry"))
    }
}
