package com.ahmed.photogallery.engine

class EditHistory(private val maxSize: Int = 50) {

    private val undoStack = ArrayDeque<EditOperation>()
    private val redoStack = ArrayDeque<EditOperation>()

    val canUndo: Boolean get() = undoStack.isNotEmpty()
    val canRedo: Boolean get() = redoStack.isNotEmpty()

    fun push(op: EditOperation) {
        undoStack.addLast(op)
        redoStack.clear()
        while (undoStack.size > maxSize) undoStack.removeFirst()
    }

    fun undo(state: EditState): EditState {
        if (!canUndo) return state
        val op = undoStack.removeLast()
        redoStack.addLast(op)
        return op.revert(state)
    }

    fun redo(state: EditState): EditState {
        if (!canRedo) return state
        val op = redoStack.removeLast()
        undoStack.addLast(op)
        return op.apply(state)
    }

    fun clear() {
        undoStack.clear()
        redoStack.clear()
    }
}
