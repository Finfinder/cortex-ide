use std::process::Command;
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn git_diff(cwd: String, args: Option<Vec<String>>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("diff");
    if let Some(ref extra_args) = args {
        for arg in extra_args {
            cmd.arg(arg);
        }
    }
    cmd.current_dir(&cwd);
    let output = cmd.output().map_err(|e| format!("Failed to execute git diff: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_app_version, git_diff])
        .setup(|app| {
            // Emit backend ready event to frontend
            let _ = app.emit("backend://ready", ());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
