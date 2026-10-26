package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test

class AvailabilityStartupGateTest {
    @Test fun delayedAccessibilityConnectionStartsOnceWithoutAnotherActivityResume() {
        val gate = AvailabilityStartupGate()
        assertFalse(gate.shouldStart(true, true, false, true, true, false, "server"))
        assertTrue(gate.shouldStart(true, true, true, true, true, false, "server"))
        assertFalse(gate.shouldStart(true, true, true, true, true, false, "server"))
    }
    @Test fun disabledPermissionsAndBackgroundNeverStartButPermissionRecoveryDoes() {
        val gate = AvailabilityStartupGate()
        assertFalse(gate.shouldStart(false, true, true, true, true, false, "server"))
        assertFalse(gate.shouldStart(true, false, true, true, true, false, "server"))
        assertFalse(gate.shouldStart(true, true, true, false, true, false, "server"))
        assertFalse(gate.shouldStart(true, true, true, true, false, false, "server"))
        assertFalse(gate.shouldStart(true, true, true, true, true, true, "server"))
        assertTrue(gate.shouldStart(true, true, true, true, true, false, "server"))
    }
    @Test fun failedStartupDoesNotLoopAndExplicitRetryOrNewConnectionCanStart() {
        val gate = AvailabilityStartupGate()
        assertTrue(gate.shouldStart(true, true, true, true, true, false, "server"))
        repeat(10) { assertFalse(gate.shouldStart(true, true, true, true, true, false, "server")) }
        gate.reset()
        assertTrue(gate.shouldStart(true, true, true, true, true, false, "server"))
        assertTrue(gate.shouldStart(true, true, true, true, true, false, "another-server"))
    }
}
