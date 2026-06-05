-keep class com.ahmed.photogallery.** { *; }

# Parcelable CREATOR must not be stripped
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Glide
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
    **[] $VALUES;
    public *;
}
-keep class com.bumptech.glide.load.data.ParcelFileDescriptorRewinder$InternalRewinder {
    *** rewind();
}
-dontwarn com.bumptech.glide.**

# PhotoView
-keep class com.github.chrisbanes.photoview.** { *; }
-dontwarn com.github.chrisbanes.photoview.**

# Kotlin
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
-dontwarn kotlin.**
