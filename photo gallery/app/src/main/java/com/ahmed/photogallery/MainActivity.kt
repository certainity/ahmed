package com.ahmed.photogallery

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.ahmed.photogallery.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragmentContainer, GalleryFragment())
                .commit()
        }
        // GalleryFragment handles its own permissions and photo loading
    }
}
