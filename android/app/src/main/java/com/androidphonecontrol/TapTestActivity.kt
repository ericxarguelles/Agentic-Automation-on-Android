package com.androidphonecontrol

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** A harmless target for the first server-triggered accessibility click. */
class TapTestActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        var taps = savedInstanceState?.getInt("taps") ?: 0
        val padding = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding * 3, padding, padding)
        }
        layout.addView(TextView(this).apply {
            text = "Single-tap test\n\nKeep this screen open. Type tap in your server terminal. Only the test button below can be clicked remotely.\n"
            textSize = 20f
        })
        layout.addView(Button(this).apply {
            id = R.id.tap_test_target
            text = "Test taps: $taps"
            setOnClickListener {
                taps++
                this@TapTestActivity.tapCount = taps
                text = "Test taps: $taps"
            }
        })
        layout.addView(Button(this).apply {
            text = "Stop test session"
            setOnClickListener { ReadSession.stop(); finish() }
        })
        tapCount = taps
        setContentView(layout)
    }

    private var tapCount = 0
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("taps", tapCount)
        super.onSaveInstanceState(outState)
    }
}
