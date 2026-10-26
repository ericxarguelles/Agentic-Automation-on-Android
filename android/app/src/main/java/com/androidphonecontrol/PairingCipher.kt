package com.androidphonecontrol

import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Versioned authenticated encryption; AndroidKeyStore owns the production key. */
object PairingCipher {
    private val aad = "AndroidPhoneControl.saved-pairing.v1".toByteArray(Charsets.UTF_8)

    fun seal(key: SecretKey, plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(aad)
        check(cipher.iv.size == 12) { "Unexpected encryption nonce size." }
        return byteArrayOf(1) + cipher.iv + cipher.doFinal(plaintext)
    }

    fun open(key: SecretKey, encrypted: ByteArray): ByteArray {
        require(encrypted.size >= 29 && encrypted[0] == 1.toByte()) { "Invalid saved connection." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, encrypted.copyOfRange(1, 13)))
        cipher.updateAAD(aad)
        return cipher.doFinal(encrypted.copyOfRange(13, encrypted.size))
    }
}
