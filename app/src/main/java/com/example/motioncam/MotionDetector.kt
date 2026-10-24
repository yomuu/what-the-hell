package com.example.motioncam

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import kotlin.math.abs

/**
 * Frame-differencing motion detector.
 *
 * Samples the luminance (Y) plane on a coarse grid, compares it with the previous
 * frame and reports the fraction of watched grid points that changed noticeably.
 * Each frame is normalised by its mean brightness so auto-exposure drift and
 * lights slowly changing don't count as motion.
 */
class MotionDetector(
    private val onFrame: (score: Float, motion: Boolean, brightness: Int) -> Unit,
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

    private var previous: IntArray? = null
    private var previousMean = 0
    private var framesSeen = 0
    private var watchedMask: BooleanArray? = null
    private var maskKey: Any? = null

    override fun analyze(image: ImageProxy) {
        try {
            frameSink?.invoke(image)

            val cols = image.width / STEP
            val rows = image.height / STEP
            val current = sampleLuma(image, cols, rows)
            val mean = current.average().toInt()
            val prev = previous
            val prevMean = previousMean
            previous = current
            previousMean = mean
            framesSeen++

            // The camera's exposure settles over the first frames; ignore them.
            if (prev == null || prev.size != current.size || framesSeen <= WARMUP_FRAMES) return

            val watched = watchedMask(cols, rows, image.imageInfo.rotationDegrees)
            val delta = if (nightMode) {
                (PIXEL_DELTA * mean / NIGHT_REFERENCE_BRIGHTNESS).coerceIn(MIN_PIXEL_DELTA, PIXEL_DELTA)
            } else {
                PIXEL_DELTA
            }

            var changed = 0
            var total = 0
            for (i in current.indices) {
                if (!watched[i]) continue
                total++
                if (abs((current[i] - mean) - (prev[i] - prevMean)) > delta) changed++
            }
            val score = if (total == 0) 0f else changed.toFloat() / total
            onFrame(score, total > 0 && score >= threshold, mean)
        } finally {
            image.close()
        }
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
        /** Luminance change (0..255) for a grid point to count as changed. */
        const val PIXEL_DELTA = 25
        const val MIN_PIXEL_DELTA = 8
        /** Scenes at least this bright use the full [PIXEL_DELTA]. */
        const val NIGHT_REFERENCE_BRIGHTNESS = 100
        const val WARMUP_FRAMES = 15
    }
}
