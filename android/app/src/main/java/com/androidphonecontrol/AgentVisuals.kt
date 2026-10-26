package com.androidphonecontrol

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.View
import kotlin.math.cos
import kotlin.math.sin

object AgentColors {
    val background = Color.rgb(16, 20, 23)
    val surface = Color.rgb(25, 30, 35)
    val field = Color.rgb(18, 23, 27)
    val border = Color.rgb(48, 56, 63)
    val text = Color.rgb(239, 243, 247)
    val muted = Color.rgb(151, 162, 174)
    val accent = Color.rgb(143, 230, 190)
    val blue = Color.rgb(162, 180, 255)
    val danger = Color.rgb(243, 147, 151)
    fun shape(color: Int, radius: Float, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = radius
        if (stroke != null) setStroke(1, stroke)
    }
}

/** Resolution-independent icons and an animated task mark; no raster assets required. */
class AgentMark(context: Context, private val gear: Boolean = false) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    var phase = TaskPhase.IDLE
        set(value) { if (field != value) { field = value; invalidate() } }
    var busy = false
        set(value) { if (field != value) { field = value; invalidate() } }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val side = minOf(width, height).toFloat()
        val cx = width / 2f; val cy = height / 2f
        paint.strokeCap = Paint.Cap.ROUND; paint.strokeJoin = Paint.Join.ROUND
        if (gear) {
            paint.color = AgentColors.muted; paint.style = Paint.Style.STROKE; paint.strokeWidth = side * .045f
            canvas.drawCircle(cx, cy, side * .19f, paint)
            canvas.drawCircle(cx, cy, side * .065f, paint)
            for (index in 0..7) {
                val angle = index * Math.PI / 4
                canvas.drawLine(cx + cos(angle).toFloat() * side * .20f, cy + sin(angle).toFloat() * side * .20f,
                    cx + cos(angle).toFloat() * side * .27f, cy + sin(angle).toFloat() * side * .27f, paint)
            }
            return
        }
        val color = when (phase) { TaskPhase.FAILED -> AgentColors.danger; TaskPhase.STOPPED -> AgentColors.muted; else -> AgentColors.accent }
        paint.style = Paint.Style.FILL; paint.color = Color.argb(20, Color.red(color), Color.green(color), Color.blue(color))
        canvas.drawCircle(cx, cy, side * .47f, paint)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = side * .025f
        paint.color = AgentColors.border
        canvas.drawCircle(cx, cy, side * .37f, paint)
        paint.color = color
        val ring = RectF(cx - side * .37f, cy - side * .37f, cx + side * .37f, cy + side * .37f)
        canvas.drawArc(ring, if (busy) (SystemClock.uptimeMillis() % 2200) / 2200f * 360 else -90f, if (busy) 235f else 360f, false, paint)
        paint.strokeWidth = side * .045f
        when (phase) {
            TaskPhase.ENDED -> canvas.drawPath(Path().apply { moveTo(cx - side * .13f, cy); lineTo(cx - side * .025f, cy + side * .10f); lineTo(cx + side * .15f, cy - side * .10f) }, paint)
            TaskPhase.FAILED -> {
                canvas.drawLine(cx, cy - side * .13f, cx, cy + side * .025f, paint)
                canvas.drawPoint(cx, cy + side * .13f, paint)
            }
            TaskPhase.STOPPED -> {
                canvas.drawLine(cx - side * .07f, cy - side * .12f, cx - side * .07f, cy + side * .12f, paint)
                canvas.drawLine(cx + side * .07f, cy - side * .12f, cx + side * .07f, cy + side * .12f, paint)
            }
            else -> {
                paint.style = Paint.Style.FILL
                for (x in listOf(-1, 1)) for (y in listOf(-1, 1)) {
                    canvas.drawRoundRect(cx + x * side * .09f - side * .035f, cy + y * side * .09f - side * .035f,
                        cx + x * side * .09f + side * .035f, cy + y * side * .09f + side * .035f, side * .02f, side * .02f, paint)
                }
            }
        }
        if (busy && isShown) postInvalidateOnAnimation()
    }
}
