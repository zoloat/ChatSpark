// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;
use tauri::Manager;
use tauri::api::process::Command;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Spawn the Node.js sidecar
            let (_rx, child) = Command::new_sidecar("twitch-server")
                .expect("failed to setup twitch-server sidecar")
                .spawn()
                .expect("failed to spawn twitch-server");

            // Store child process handle so it lives for the app lifetime
            app.manage(std::sync::Mutex::new(Some(child)));

            // Poll /api/health until the server is ready
            let app_handle = app.handle();
            std::thread::spawn(move || {
                let client = reqwest::blocking::Client::new();
                let mut attempts = 0;
                loop {
                    std::thread::sleep(Duration::from_millis(500));
                    attempts += 1;
                    if let Ok(resp) = client.get("http://localhost:8080/api/health").send() {
                        if resp.status().is_success() {
                            // Server is ready — open the main window
                            if let Some(window) = app_handle.get_window("main") {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                            break;
                        }
                    }
                    if attempts > 30 {
                        eprintln!("Server did not start in time");
                        break;
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
