// Alva's desktop app (docs/development/native-apps.md): one window showing
// the itch.io release (dist/itch, bundled into the app by tauri.conf.json's
// frontendDist), the very game the itch.io page plays. Everything the game
// does, it does in its own page; the app adds only what a browser would
// have given it, through the opener plugin and two window calls, each
// allowed in capabilities/default.json and nothing more: the game's own
// links opened in the player's browser, and the window in and out of
// fullscreen (F11, js/core/native-shell.js).
//
// No menu bar is set, so Windows and Linux show none; macOS keeps its
// standard application menu (Quit, Hide, the edit commands). The page's
// saved data (localStorage) lives in the webview's data folder, which
// Tauri names after the app's identifier, so it is the same at every
// launch and every update.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            enable_webrtc(app)?;
            #[cfg(not(target_os = "linux"))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Alva could not start");
}

// Online Play's matches go over a WebRTC data channel (js/online/peer.js),
// which every browser and the other platforms' webviews offer, but which
// WebKitGTK, Linux's, leaves switched off unless the app turns it on.
#[cfg(target_os = "linux")]
fn enable_webrtc(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::Manager;
    use webkit2gtk::{SettingsExt, WebViewExt};
    if let Some(window) = app.get_webview_window("main") {
        window.with_webview(|webview| {
            if let Some(settings) = WebViewExt::settings(&webview.inner()) {
                settings.set_enable_webrtc(true);
            }
        })?;
    }
    Ok(())
}
