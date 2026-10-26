package com.androidphonecontrol

enum class TaskPhase { IDLE, CONNECTING, RUNNING, ENDED, STOPPED, FAILED }

data class TaskPresentation(val title: String, val detail: String, val animated: Boolean = false) {
    companion object {
        fun from(phase: TaskPhase, ready: Boolean, enabled: Boolean): TaskPresentation = when (phase) {
            TaskPhase.CONNECTING -> TaskPresentation("Starting session", "Connecting ChatGPT to your phone.", true)
            TaskPhase.RUNNING -> TaskPresentation("Task in progress", "Your agent is working. Follow the task in ChatGPT.", true)
            TaskPhase.ENDED -> TaskPresentation("Session complete", "The session has ended. Check ChatGPT for the task outcome.")
            TaskPhase.STOPPED -> TaskPresentation("Task stopped", "Phone control has stopped.")
            TaskPhase.FAILED -> TaskPresentation("Session interrupted", "Check your connection and try again from ChatGPT.")
            TaskPhase.IDLE -> when {
                ready -> TaskPresentation("Ready when you are", "Ask Android Agent to do something in ChatGPT.")
                enabled -> TaskPresentation("Finish connecting", "Connect your server and complete setup in Settings.")
                else -> TaskPresentation("Agent is paused", "Turn on task availability in Settings when you’re ready.")
            }
        }
    }
}
