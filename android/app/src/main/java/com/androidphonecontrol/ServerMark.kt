package com.androidphonecontrol

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

class ServerMark(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val scale = width / 40f
        canvas.save(); canvas.scale(scale, height / 40f)
        paint.color = AgentColors.accent; paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.8f
        for (top in listOf(5f, 17f, 29f)) {
            canvas.drawRoundRect(RectF(4f, top, 36f, top + 8f), 2f, 2f, paint)
            canvas.drawLine(10f, top + 4f, 23f, top + 4f, paint)
            paint.style = Paint.Style.FILL; canvas.drawCircle(30f, top + 4f, 1.3f, paint); paint.style = Paint.Style.STROKE
        }
        canvas.restore()
    }
}
