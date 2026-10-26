package com.androidphonecontrol

import org.junit.Assert.*
import org.junit.Test
import javax.crypto.KeyGenerator

class PairingCipherTest {
    private fun newKey() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private fun rejects(block: () -> Unit) {
        var rejected = false
        try { block() } catch (_: Exception) { rejected = true }
        assertTrue("Invalid ciphertext must be rejected", rejected)
    }

    @Test fun encryptedPairingRoundTripAndFreshNonces() {
        val key = newKey()
        val value = "private-server-and-pairing-token".toByteArray()
        val first = PairingCipher.seal(key, value)
        val second = PairingCipher.seal(key, value)
        assertArrayEquals(value, PairingCipher.open(key, first))
        assertFalse(first.contentEquals(second))
        assertFalse(first.toString(Charsets.UTF_8).contains("pairing-token"))
    }

    @Test fun tamperingWrongKeyAndInvalidVersionsFail() {
        val key = newKey()
        val encrypted = PairingCipher.seal(key, "token".toByteArray())
        rejects { PairingCipher.open(newKey(), encrypted) }
        rejects { PairingCipher.open(key, encrypted.copyOf().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }) }
        rejects { PairingCipher.open(key, encrypted.copyOf().apply { this[0] = 2 }) }
        rejects { PairingCipher.open(key, byteArrayOf(1, 2)) }
    }
}
