package com.androidphonecontrol

import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.Base64
import java.util.UUID
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

data class TaskRecord(val id: String, val prompt: String, val startedAt: Long,
    val durationMs: Long = 0, val state: String = "Running")

/** Local history contains task requests, never screen content or connection keys. */
object TaskJournal {
    private const val ALIAS = "android-agent-task-history-v1"
    @Volatile var current: TaskRecord? = null
        private set
    @Volatile var revision = 0
        private set
    @Volatile var storageError = false
        private set
    private var startedElapsed = 0L
    private var checkpointElapsed = 0L
    private var app: Context? = null
    fun elapsedMs(): Long = if (current == null) 0 else (SystemClock.elapsedRealtime() - startedElapsed).coerceAtLeast(0)
    @Synchronized fun begin(context: Context, prompt: String) {
        app = context.applicationContext
        startedElapsed = SystemClock.elapsedRealtime()
        checkpointElapsed = startedElapsed
        current = TaskRecord(UUID.randomUUID().toString(), prompt.trim().take(2000), System.currentTimeMillis())
        revision++
        // Persist an unfinished entry too, so process death cannot erase a task.
        persistCurrent("Unfinished", 0)
    }
    @Synchronized fun updatePrompt(prompt: String) {
        val record = current ?: return
        if (record.prompt.isBlank() && prompt.isNotBlank()) {
            current = record.copy(prompt = prompt.trim().take(2000)); revision++
            persistCurrent("Unfinished", elapsedMs())
        }
    }
    @Synchronized fun checkpoint() {
        val now = SystemClock.elapsedRealtime()
        if (current != null && now - checkpointElapsed >= 5000) {
            checkpointElapsed = now
            persistCurrent("Unfinished", elapsedMs())
        }
    }
    @Synchronized fun finish(state: String) {
        if (current == null) return
        persistCurrent(state, elapsedMs())
        current = null; revision++
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUnlockedDeviceRequired(true).build())
        }.generateKey()
    }
    private fun read(context: Context): List<TaskRecord> {
        val encrypted = context.getSharedPreferences("task_history", Context.MODE_PRIVATE).getString("encrypted", null) ?: return emptyList()
        val items = JSONArray(PairingCipher.open(key(), Base64.getDecoder().decode(encrypted)).toString(Charsets.UTF_8))
        return (0 until items.length()).map {
            val item = items.getJSONObject(it)
            TaskRecord(item.getString("id"), item.getString("prompt"), item.getLong("startedAt"), item.getLong("durationMs"), item.getString("state"))
        }
    }
    @Synchronized fun history(context: Context): List<TaskRecord> = try {
        read(context).filter { it.id != current?.id }.reversed()
    } catch (_: Exception) { storageError = true; emptyList() }
    private fun persistCurrent(state: String, duration: Long) {
        val context = app ?: return
        val record = current ?: return
        try {
            val entries = (read(context).filter { it.id != record.id } + record.copy(durationMs = duration, state = state)).takeLast(50)
            val items = JSONArray()
            entries.forEach { items.put(JSONObject().put("id", it.id).put("prompt", it.prompt).put("startedAt", it.startedAt)
                .put("durationMs", it.durationMs).put("state", it.state)) }
            val encrypted = Base64.getEncoder().encodeToString(PairingCipher.seal(key(), items.toString().toByteArray(Charsets.UTF_8)))
            check(context.getSharedPreferences("task_history", Context.MODE_PRIVATE).edit().putString("encrypted", encrypted).commit())
            storageError = false
        } catch (_: Exception) { storageError = true }
    }
    @Synchronized fun clear(context: Context) {
        context.getSharedPreferences("task_history", Context.MODE_PRIVATE).edit().clear().apply()
        storageError = false; revision++
    }
}
