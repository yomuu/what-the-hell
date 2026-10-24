package com.example.motioncam

import java.nio.ByteBuffer

/**
 * Shrinks a luminance plane by averaging each [step]×[step] block, giving a
 * [cols]×[rows] grid. Averaging instead of picking one pixel per block keeps
 * sensor noise (worst in the dark) from looking like motion.
 *
 * Reads whole rows in bulk; [buffer]'s own position is left untouched.
 */
class LumaSampler(private val step: Int) {

    private var line = ByteArray(0)

    fun sample(buffer: ByteBuffer, rowStride: Int, pixelStride: Int, cols: Int, rows: Int): IntArray {
        val source = buffer.duplicate()
        val width = cols * step
        // The last row of a plane may stop right after its last pixel rather than a full stride.
        val lineLength = (width - 1) * pixelStride + 1
        if (line.size < lineLength) line = ByteArray(lineLength)

        val sums = IntArray(cols * rows)
        for (y in 0 until rows * step) {
            source.position(y * rowStride)
            source.get(line, 0, lineLength)
            val base = (y / step) * cols
            for (x in 0 until width) {
                sums[base + x / step] += line[x * pixelStride].toInt() and 0xFF
            }
        }
        val area = step * step
        for (i in sums.indices) sums[i] /= area
        return sums
    }
}
