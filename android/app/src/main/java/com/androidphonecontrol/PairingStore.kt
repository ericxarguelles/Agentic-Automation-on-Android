package com.androidphonecontrol

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.json.JSONObject
import org.json.JSONArray

data class SavedPairing(val endpoint: String, val token: String)

object PairingStore {
    private const val ALIAS = "android-phone-control-pairing-v1"
    private fun preferences(context: Context) = context.getSharedPreferences("saved_pairing", Context.MODE_PRIVATE)
    private fun key(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        check(create) { "Saved connection key is unavailable. Forget it and pair again." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).setUnlockedDeviceRequired(true).build())
        }.generateKey()
    }

    fun read(context: Context): SavedPairing? = readAll(context).lastOrNull()

    fun readAll(context: Context): List<SavedPairing> {
        val value = preferences(context).getString("encrypted", null) ?: return emptyList()
        val json = JSONObject(PairingCipher.open(key(false), Base64.getDecoder().decode(value)).toString(Charsets.UTF_8))
        // Migrate the existing single-connection envelope without losing its credentials.
        val items = json.optJSONArray("connections") ?: JSONArray().put(json)
        return (0 until items.length()).map { index ->
            val item = items.getJSONObject(index)
            SavedPairing(item.getString("endpoint"), item.getString("token"))
        }.takeLast(10)
    }

    /** Called only after the owner opts in and a connection check succeeds. */
    fun save(context: Context, pairing: SavedPairing) {
        write(context, (readAll(context).filter { it.endpoint != pairing.endpoint } + pairing).takeLast(10))
    }

    fun remove(context: Context, endpoint: String) {
        val remaining = readAll(context).filter { it.endpoint != endpoint }
        if (remaining.isEmpty()) forget(context) else write(context, remaining)
    }

    private fun write(context: Context, connections: List<SavedPairing>) {
        val items = JSONArray()
        connections.forEach { items.put(JSONObject().put("endpoint", it.endpoint).put("token", it.token)) }
        val bytes = JSONObject().put("connections", items).toString().toByteArray(Charsets.UTF_8)
        val encrypted = Base64.getEncoder().encodeToString(PairingCipher.seal(key(true), bytes))
        check(preferences(context).edit().putString("encrypted", encrypted).commit()) { "Could not save connection." }
    }

    fun forget(context: Context) {
        check(preferences(context).edit().clear().commit()) { "Could not clear saved connection." }
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); if (containsAlias(ALIAS)) deleteEntry(ALIAS) }
    }
}
