package com.personal.kidscinemanative;

import android.content.Context;
import android.util.AttributeSet;
import android.widget.FrameLayout;

/**
 * Sizes itself 16:9 from its width when given a non-exact height
 * (portrait watch page); fills the given size when measured exactly
 * (fullscreen).
 */
public class VideoFrameLayout extends FrameLayout {
    public VideoFrameLayout(Context context) {
        super(context);
    }

    public VideoFrameLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        if (MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.EXACTLY) {
            super.onMeasure(widthMeasureSpec, heightMeasureSpec);
            return;
        }
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int height = Math.round(width * 9f / 16f);
        super.onMeasure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }
}
