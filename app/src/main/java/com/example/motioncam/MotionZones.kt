package com.example.motioncam

/**
 * The grid of cells that can be switched off for motion detection. Cells are
 * laid out as the user sees the picture: the app is locked to portrait, so
 * the grid is taller than it is wide.
 */
object MotionZones {
    const val COLUMNS = 6
    const val ROWS = 8
    const val CELLS = COLUMNS * ROWS

    /**
     * Where a camera-image point ([u], [v] in 0..1, as the sensor delivers it)
     * appears on screen, after rotating the image by [rotationDegrees] clockwise.
     * Returns (x, y) in 0..1.
     */
    fun toScreen(u: Float, v: Float, rotationDegrees: Int): Pair<Float, Float> = when (rotationDegrees) {
        90 -> (1f - v) to u
        180 -> (1f - u) to (1f - v)
        270 -> v to (1f - u)
        else -> u to v
    }

    /** Index of the cell that contains a camera-image point; see [toScreen]. */
    fun cellAt(u: Float, v: Float, rotationDegrees: Int): Int {
        val (x, y) = toScreen(u, v, rotationDegrees)
        val col = (x * COLUMNS).toInt().coerceIn(0, COLUMNS - 1)
        val row = (y * ROWS).toInt().coerceIn(0, ROWS - 1)
        return row * COLUMNS + col
    }
}
