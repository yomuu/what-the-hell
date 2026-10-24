package com.example.motioncam

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import kotlin.math.abs

/**
 * Frame-differencing motion detector.
 *
 * Samples the luminance (Y) plane on a coarse grid, compares it with the previous
 * frame and reports the fraction of grid points that changed noticeably. Each
 * frame is normalised by its mean brightness so auto-exposure drift and lights
 * slowly changing don't count as motion.
 */
class MotionDetector(
    private val onFrame: (score: Float, motion: Boolean) -> Unit,
) : ImageAnalysis.Analyzer {

    /** Fraction of grid points (0..1) that must change for a frame to count as motion. */
    @Volatile
    var threshold: Float = 0.02f

    private var previous: IntArray? = null
    private var previousMean = 0
    private var framesSeen = 0

    override fun analyze(image: ImageProxy) {
        try {
            val current = sampleLuma(image)
            val mean = current.average().toInt()
            val prev = previous
            val prevMean = previousMean
            previous = current
            previousMean = mean
            framesSeen++

            // The camera's exposure settles over the first frames; ignore them.
            if (prev == null || prev.size != current.size || framesSeen <= WARMUP_FRAMES) return

            var changed = 0
            for (i in current.indices) {
                if (abs((current[i] - mean) - (prev[i] - prevMean)) > PIXEL_DELTA) changed++
            }
            val score = changed.toFloat() / current.size
            onFrame(score, score >= threshold)
        } finally {
            image.close()
        }
    }

    private fun sampleLuma(image: ImageProxy): IntArray {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        val cols = image.width / STEP
        val rows = image.height / STEP
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
        const val WARMUP_FRAMES = 15
    }
}
