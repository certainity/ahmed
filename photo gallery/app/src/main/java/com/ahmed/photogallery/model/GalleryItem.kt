package com.ahmed.photogallery.model

import com.ahmed.photogallery.model.Photo

sealed class GalleryItem {
    data class DateHeader(val label: String) : GalleryItem()
    data class PhotoItem(val photo: Photo) : GalleryItem()
}
