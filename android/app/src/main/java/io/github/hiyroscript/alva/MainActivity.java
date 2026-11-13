package io.github.hiyroscript.alva;

import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Alva's Android app (docs/development/native-apps.md): Capacitor's
// WebView showing the itch.io release, landscape (AndroidManifest.xml),
// over the whole screen. The status and navigation bars stay hidden while
// the game has the screen (a swipe from an edge shows them a moment), and
// the game draws into a camera cutout's side too (its page covers it:
// viewport-fit=cover). Android's Back is the game's own Back (Escape: a
// menu's Back, a match's pause), so it never closes the app mid-match.
public class MainActivity extends BridgeActivity {

    // Escape pressed and let go where the game listens for keys.
    private static final String BACK_AS_ESCAPE =
        "(function () {" +
        "  var target = document.activeElement || document.body;" +
        "  ['keydown', 'keyup'].forEach(function (type) {" +
        "    target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));" +
        "  });" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) getBridge().getWebView().evaluateJavascript(BACK_AS_ESCAPE, null);
            }
        });
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
