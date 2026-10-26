package com.androidphonecontrol

object VoiceTaskPrompt {
    fun build(task: String): String {
        val value = task.trim()
        require(value.isNotEmpty() && value.length <= 2000) { "Enter a task of at most 2,000 characters." }
        require('\u0000' !in value) { "Task contains an unsupported character." }
        return "Use Android Agent for this phone task:\n\n$value\n\n" +
            "Check phone_status first. If availability is ready and no session is active, start a session. " +
            "Use current screen labels and target IDs, verify each action, and always stop the session when finished or blocked. " +
            "Do not take over an existing session."
    }
}
