package com.example.motioncam

import android.graphics.RectF
import android.os.SystemClock
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import kotlin.math.abs
import kotlin.math.exp

/**
 * Background-subtraction motion detector.
 *
 * Samples the luminance (Y) plane on a coarse grid and compares each frame with a
 * background: a running average of recent frames that adapts over a few seconds.
 * Comparing against the background rather than just the previous frame also
 * catches slow movement. Every frame is normalised by its mean brightness so
 * auto-exposure and lights changing don't count as motion.
 *
 * Reports the fraction of watched grid points that changed, and a box around them
 * in screen coordinates (0..1, as the user sees the picture).
 */
class MotionDetector(
    private val onFrame: (score: Float, motion: Boolean, brightness: Int, box: RectF?) -> Unit,
) : ImageAnalysis.Analyzer {

    /** Fraction of watched grid points (0..1) that must change for a frame to count as motion. */
    @Volatile
    var threshold: Float = 0.02f

    /** Cells of [MotionZones] to ignore. */
    @Volatile
    var ignoredZones: BooleanArray = BooleanArray(MotionZones.CELLS)

    /**
     * In the dark the whole picture is squeezed into a few brightness levels, so a
     * person walking past changes pixels by less. When set, the per-pixel change
     * needed scales down with the scene's brightness.
     */
    @Volatile
    var nightMode: Boolean = true

    /** Receives every frame before it is closed, e.g. for the live view. Called on the analysis thread. */
    @Volatile
    var frameSink: ((ImageProxy) -> Unit)? = null

    @Volatile
    private var resetRequested = false

    // Mean-normalised brightness of each grid point, averaged over recent frames.
    private var background: FloatArray? = null
    private var backgroundSince = 0L
    private var lastFrameAt = 0L
    private var watchedMask: BooleanArray? = null
    private var maskKey: Any? = null

    /** Start learning the background again, e.g. after the camera's exposure was changed on purpose. */
    fun resetBackground() {
        resetRequested = true
    }

    override fun analyze(image: ImageProxy) {
        try {
            frameSink?.invoke(image)

            val cols = image.width / STEP
            val rows = image.height / STEP
            val current = sampleLuma(image, cols, rows)
            val mean = current.average().toInt()
            val now = SystemClock.elapsedRealtime()

            val bg = background
            if (bg == null || bg.size != current.size || resetRequested) {
                resetRequested = false
                background = FloatArray(current.size) { (current[it] - mean).toFloat() }
                backgroundSince = now
                lastFrameAt = now
                return
            }

            // Frame-rate independent: the background follows the scene with a fixed time constant.
            val dt = (now - lastFrameAt).coerceIn(0L, 1_000L)
            lastFrameAt = now
            val alpha = 1f - exp(-dt / BACKGROUND_TIME_CONSTANT_MS)

            val watched = watchedMask(cols, rows, image.imageInfo.rotationDegrees)
            val delta = if (nightMode) {
                (PIXEL_DELTA * mean / NIGHT_REFERENCE_BRIGHTNESS).coerceIn(MIN_PIXEL_DELTA, PIXEL_DELTA)
            } else {
                PIXEL_DELTA
            }

            var changed = 0
            var total = 0
            var minCol = cols
            var minRow = rows
            var maxCol = -1
            var maxRow = -1
            for (i in current.indices) {
                val value = (current[i] - mean).toFloat()
                val diff = abs(value - bg[i])
                bg[i] += (value - bg[i]) * alpha
                if (!watched[i]) continue
                total++
                if (diff > delta) {
                    changed++
                    val col = i % cols
                    val row = i / cols
                    if (col < minCol) minCol = col
                    if (col > maxCol) maxCol = col
                    if (row < minRow) minRow = row
                    if (row > maxRow) maxRow = row
                }
            }

            // Let the background settle while the camera's exposure settles.
            if (now - backgroundSince < WARMUP_MS) return

            val score = if (total == 0) 0f else changed.toFloat() / total
            val motion = total > 0 && score >= threshold
            val box = if (motion) {
                screenBox(minCol, minRow, maxCol + 1, maxRow + 1, cols, rows, image.imageInfo.rotationDegrees)
            } else {
                null
            }
            onFrame(score, motion, mean, box)
        } finally {
            image.close()
        }
    }

    /** Converts a box of grid cells (end exclusive) to 0..1 screen coordinates. */
    private fun screenBox(c0: Int, r0: Int, c1: Int, r1: Int, cols: Int, rows: Int, rotation: Int): RectF {
        val (ax, ay) = MotionZones.toScreen(c0.toFloat() / cols, r0.toFloat() / rows, rotation)
        val (bx, by) = MotionZones.toScreen(c1.toFloat() / cols, r1.toFloat() / rows, rotation)
        return RectF(minOf(ax, bx), minOf(ay, by), maxOf(ax, bx), maxOf(ay, by))
    }

    /** Which sample points fall in zones that are not ignored; rebuilt only when inputs change. */
    private fun watchedMask(cols: Int, rows: Int, rotation: Int): BooleanArray {
        val zones = ignoredZones
        val key = listOf(cols, rows, rotation, zones)
        val cached = watchedMask
        if (cached != null && maskKey == key) return cached
        val mask = BooleanArray(cols * rows) { i ->
            val u = (i % cols + 0.5f) / cols
            val v = (i / cols + 0.5f) / rows
            !zones[MotionZones.cellAt(u, v, rotation)]
        }
        watchedMask = mask
        maskKey = key
        return mask
    }

    private fun sampleLuma(image: ImageProxy, cols: Int, rows: Int): IntArray {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        val out = IntArray(cols * rows)
        for (r in 0 until rows) {
            val rowOffset = r * STEP * rowStride
            for (c in 0 until cols) {
                out[r * cols + c] = buffer.get(rowOffset + c * STEP * pixelStride).toInt() and 0xFF
            }
        }
        return out
    }

    private companion object {
        /** Sample every STEP-th pixel in each direction (640x480 -> 80x60 grid). */
        const val STEP = 8
        /** Luminance change (0..255) from the background for a grid point to count as changed. */
        const val PIXEL_DELTA = 25
        const val MIN_PIXEL_DELTA = 8
        /** Scenes at least this bright use the full [PIXEL_DELTA]. */
        const val NIGHT_REFERENCE_BRIGHTNESS = 100
        /** Something that stops moving blends into the background after a few of these. */
        const val BACKGROUND_TIME_CONSTANT_MS = 4_000f
        const val WARMUP_MS = 2_000L
    }
}
