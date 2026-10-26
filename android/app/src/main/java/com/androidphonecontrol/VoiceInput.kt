package com.androidphonecontrol

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** Foreground, user-started on-device dictation only. No network recognizer or audio storage. */
class VoiceInput(private val context: Context, private val status: (String) -> Unit,
                 private val transcript: (String) -> Unit, private val changed: (Boolean) -> Unit) {
    private var recognizer: SpeechRecognizer? = null
    private var generation = 0
    var listening = false
        private set

    fun start() {
        cancel()
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            status("On-device speech recognition is unavailable. Enable an on-device speech service/language in Android Settings, or type your task. Audio will not be sent to a network recognizer.")
            return
        }
        val current = ++generation
        try {
            val speech = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            recognizer = speech; listening = true; changed(true)
            status("Starting on-device dictation…")
            speech.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { if (current == generation) status("Listening on device… Say what you want your phone to do.") }
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() { if (current == generation) status("Transcribing on device…") }
                override fun onPartialResults(partialResults: Bundle?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
                override fun onError(error: Int) {
                    if (current != generation) return
                    cancel()
                    status(when (error) {
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Enable microphone access in Android app permissions, or type your task."
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech recognized. Try again or type your task."
                        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE, SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "The on-device speech language is unavailable. Check Android speech/language settings or type your task."
                        else -> "On-device dictation could not finish. Try again or type your task. No network fallback was used."
                    })
                }
                override fun onResults(results: Bundle?) {
                    if (current != generation) return
                    val words = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                    cancel()
                    if (words.isBlank()) status("No speech recognized. Try again or type your task.")
                    else { transcript(words.take(2000)); status("Review your task, then continue in ChatGPT. Nothing has been sent yet.") }
                }
            })
            speech.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1))
        } catch (_: Exception) { cancel(); status("Could not start on-device dictation. Check microphone and on-device speech services, or type your task.") }
    }

    fun cancel() {
        generation++
        val wasListening = listening
        listening = false
        recognizer?.let { runCatching { it.cancel(); it.destroy() } }
        recognizer = null
        if (wasListening) changed(false)
    }
}
