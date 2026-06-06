package com.ahmed.photogallery.utils

import android.content.Context

object FavoritesStore {
    private const val PREFS = "pg_favorites"
    private const val KEY   = "fav_ids"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isFavorite(ctx: Context, id: Long) = getIds(ctx).contains(id)

    /** Toggles favorite state. Returns true if the photo is now favorited. */
    fun toggle(ctx: Context, id: Long): Boolean {
        val ids = getIds(ctx).toMutableSet()
        val added = if (ids.contains(id)) { ids.remove(id); false } else { ids.add(id); true }
        prefs(ctx).edit().putStringSet(KEY, ids.map { it.toString() }.toSet()).apply()
        return added
    }

    fun getIds(ctx: Context): Set<Long> =
        prefs(ctx).getStringSet(KEY, emptySet())
            ?.mapNotNull { it.toLongOrNull() }?.toSet() ?: emptySet()

    fun getCount(ctx: Context) = getIds(ctx).size
}
