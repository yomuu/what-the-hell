package com.example.motioncam

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

/**
 * Draws the [MotionZones] grid over the camera preview. Ignored cells are
 * shaded; while [editing], tapping or dragging across cells switches them.
 *
 * The preview uses FIT_CENTER with a 4:3 camera image shown in portrait, so the
 * picture fills a centred 3:4 rectangle; the grid is laid over that rectangle.
 */
class ZoneOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var ignored: BooleanArray = BooleanArray(MotionZones.CELLS)
        set(value) {
            field = value.copyOf()
            invalidate()
        }

    /** Where motion was last seen, in 0..1 picture coordinates; drawn as a red box. */
    var motionBox: RectF? = null
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    var editing = false
        set(value) {
            field = value
            invalidate()
        }

    /** Called with the new ignored cells after each change made by touch. */
    var onChanged: ((BooleanArray) -> Unit)? = null

    private val ignoredPaint = Paint().apply { color = Color.argb(140, 0, 0, 0) }
    private val crossPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(160, 255, 255, 255)
        strokeWidth = 2f * resources.displayMetrics.density
    }
    private val gridPaint = Paint().apply {
        color = Color.argb(200, 255, 255, 255)
        strokeWidth = resources.displayMetrics.density
    }
    private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.RED
        style = Paint.Style.STROKE
        strokeWidth = 3f * resources.displayMetrics.density
    }
    private val picture = RectF()
    private val boxRect = RectF()
    private var paintValue = true
    private var lastCell = -1

    override fun onDraw(canvas: Canvas) {
        updatePictureRect()
        val cellW = picture.width() / MotionZones.COLUMNS
        val cellH = picture.height() / MotionZones.ROWS
        for (i in 0 until MotionZones.CELLS) {
            if (!ignored[i]) continue
            val left = picture.left + (i % MotionZones.COLUMNS) * cellW
            val top = picture.top + (i / MotionZones.COLUMNS) * cellH
            canvas.drawRect(left, top, left + cellW, top + cellH, ignoredPaint)
            if (editing) {
                canvas.drawLine(left, top, left + cellW, top + cellH, crossPaint)
                canvas.drawLine(left + cellW, top, left, top + cellH, crossPaint)
            }
        }
        motionBox?.let { box ->
            boxRect.set(
                picture.left + box.left * picture.width(),
                picture.top + box.top * picture.height(),
                picture.left + box.right * picture.width(),
                picture.top + box.bottom * picture.height(),
            )
            canvas.drawRect(boxRect, boxPaint)
        }
        if (!editing) return
        for (c in 0..MotionZones.COLUMNS) {
            val x = picture.left + c * cellW
            canvas.drawLine(x, picture.top, x, picture.bottom, gridPaint)
        }
        for (r in 0..MotionZones.ROWS) {
            val y = picture.top + r * cellH
            canvas.drawLine(picture.left, y, picture.right, y, gridPaint)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!editing) return false
        val cell = cellAt(event.x, event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (cell < 0) return false
                // A drag sets every cell it crosses to the opposite of the first one.
                paintValue = !ignored[cell]
                lastCell = -1
                apply(cell)
            }
            MotionEvent.ACTION_MOVE -> if (cell >= 0) apply(cell)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                lastCell = -1
                onChanged?.invoke(ignored.copyOf())
            }
        }
        return true
    }

    private fun apply(cell: Int) {
        if (cell == lastCell) return
        lastCell = cell
        if (ignored[cell] != paintValue) {
            ignored[cell] = paintValue
            invalidate()
        }
    }

    private fun cellAt(x: Float, y: Float): Int {
        updatePictureRect()
        if (!picture.contains(x, y)) return -1
        val col = ((x - picture.left) / picture.width() * MotionZones.COLUMNS).toInt()
            .coerceIn(0, MotionZones.COLUMNS - 1)
        val row = ((y - picture.top) / picture.height() * MotionZones.ROWS).toInt()
            .coerceIn(0, MotionZones.ROWS - 1)
        return row * MotionZones.COLUMNS + col
    }

    private fun updatePictureRect() {
        val w = width.toFloat()
        val h = height.toFloat()
        val aspect = 3f / 4f
        if (w / h > aspect) {
            val pw = h * aspect
            picture.set((w - pw) / 2, 0f, (w + pw) / 2, h)
        } else {
            val ph = w / aspect
            picture.set(0f, (h - ph) / 2, w, (h + ph) / 2)
        }
    }
}
