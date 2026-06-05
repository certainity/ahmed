package com.ahmed.photogallery.model

import android.net.Uri

data class Album(
    val name: String,
    val coverUri: Uri,
    val count: Int,
    val bucketId: Long
)
