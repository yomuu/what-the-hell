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
     * Index of the cell that contains a camera-image point ([u], [v] in 0..1, as
     * the sensor delivers it), after rotating the image by [rotationDegrees]
     * clockwise to how it appears on screen.
     */
    fun cellAt(u: Float, v: Float, rotationDegrees: Int): Int {
        val x: Float
        val y: Float
        when (rotationDegrees) {
            90 -> { x = 1f - v; y = u }
            180 -> { x = 1f - u; y = 1f - v }
            270 -> { x = v; y = 1f - u }
            else -> { x = u; y = v }
        }
        val col = (x * COLUMNS).toInt().coerceIn(0, COLUMNS - 1)
        val row = (y * ROWS).toInt().coerceIn(0, ROWS - 1)
        return row * COLUMNS + col
    }
}
