package com.ahmed.photogallery

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.ahmed.photogallery.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private val galleryFragment by lazy { GalleryFragment() }
    private val albumsFragment by lazy { AlbumsFragment() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        if (savedInstanceState == null) {
            showFragment(galleryFragment)
        }

        b.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.navPhotos -> { showFragment(galleryFragment); true }
                R.id.navAlbums -> { showFragment(albumsFragment); true }
                else -> false
            }
        }
    }

    private fun showFragment(fragment: Fragment) {
        val tag = fragment::class.java.simpleName
        val fm = supportFragmentManager
        val existing = fm.findFragmentByTag(tag)
        fm.beginTransaction().apply {
            fm.fragments.forEach { hide(it) }
            if (existing == null) {
                add(R.id.fragmentContainer, fragment, tag)
            } else {
                show(existing)
            }
        }.commit()
    }
}
