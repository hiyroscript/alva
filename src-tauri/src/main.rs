// Alva's desktop app: the window and the game in it are lib.rs's.

// No console window beside the game on Windows (in a release build).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    alva_lib::run();
}
