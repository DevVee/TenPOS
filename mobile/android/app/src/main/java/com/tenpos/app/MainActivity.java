package com.tenpos.app;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarsPolicy();
    }

    /**
     * Re-apply system bar policy whenever the window regains focus.
     * Ensures bars stay hidden after dialogs (Bluetooth, print, alerts).
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemBarsPolicy();
    }

    /**
     * Re-apply on orientation change so landscape immediately hides the
     * status bar without waiting for the next focus event.
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarsPolicy();
    }

    /**
     * System bar policy:
     *  - ALL orientations : hide the navigation bar (gesture/button bar at bottom)
     *  - LANDSCAPE only   : also hide the status bar (battery/clock strip at top)
     *
     * BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE: bars briefly peek on edge-swipe
     * then auto-hide — standard "immersive sticky" used by full-screen apps.
     */
    private void applySystemBarsPolicy() {
        // Edge-to-edge: let the WebView draw behind system bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
            getWindow(), getWindow().getDecorView()
        );

        boolean isLandscape = getResources().getConfiguration().orientation
                              == Configuration.ORIENTATION_LANDSCAPE;

        if (isLandscape) {
            // Landscape: full immersive — hide both status bar AND nav bar
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            // Portrait: hide only the navigation bar; keep status bar visible
            controller.hide(WindowInsetsCompat.Type.navigationBars());
        }

        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }
}
