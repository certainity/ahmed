package com.personal.kidscinemanative;

import android.content.Context;
import android.util.AttributeSet;
import android.widget.FrameLayout;

/** A frame that is always 16:9, sized from its measured width. */
public class ThumbFrameLayout extends FrameLayout {
    public ThumbFrameLayout(Context context) {
        super(context);
    }

    public ThumbFrameLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int height = Math.round(width * 9f / 16f);
        super.onMeasure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }
}
