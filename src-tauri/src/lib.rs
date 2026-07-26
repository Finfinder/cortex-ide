use std::process::Command;
use std::sync::Arc;
use tauri::Emitter;

mod opencode;

use opencode::spawn::{SpawnConfig, SpawnManager, SpawnHandle};
use opencode::detect::detect_opencode_binary;
use opencode::health::{HealthChecker, HealthConfig, HealthStatus};

/// Tauri managed state for the OpenCode spawn manager.
struct OpencodeState {
    manager: Arc<SpawnManager>,
}

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

/// Detect the OpenCode binary path.
///
/// Returns the resolved path or an error message.
#[tauri::command]
fn detect_opencode(custom_path: Option<String>) -> Result<String, String> {
    detect_opencode_binary(custom_path)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Spawn an OpenCode SDK server instance.
///
/// # Arguments
/// * `state` - Tauri managed state with the spawn manager
/// * `cwd` - Working directory for the OpenCode process
/// * `port` - Port to listen on (default: 4096)
/// * `custom_binary_path` - Optional custom path to the opencode binary
///
/// Returns spawn info (pid, port, binary_path).
#[tauri::command]
async fn spawn_opencode(
    state: tauri::State<'_, OpencodeState>,
    cwd: String,
    port: Option<u16>,
    custom_binary_path: Option<String>,
) -> Result<SpawnHandle, String> {
    let config = SpawnConfig {
        cwd: std::path::PathBuf::from(&cwd),
        port: port.unwrap_or(4096),
        hostname: "127.0.0.1".to_string(),
        cors: vec![],
        custom_binary_path,
        mdns: false,
    };

    state
        .manager
        .spawn(config)
        .await
        .map_err(|e| e.to_string())
}

/// Stop the currently running OpenCode process.
#[tauri::command]
async fn stop_opencode(state: tauri::State<'_, OpencodeState>) -> Result<(), String> {
    state.manager.stop().await.map_err(|e| e.to_string())
}

/// Get the status of the OpenCode process.
///
/// Returns a JSON-serializable status object.
#[tauri::command]
async fn get_opencode_status(
    state: tauri::State<'_, OpencodeState>,
) -> Result<serde_json::Value, String> {
    let pid = state.manager.pid().await;
    let is_alive = state.manager.is_alive().await;
    let restart_count = state.manager.restart_count().await;

    Ok(serde_json::json!({
        "pid": pid,
        "is_alive": is_alive,
        "restart_count": restart_count,
    }))
}

/// Check health of the OpenCode server at the given URL.
#[tauri::command]
async fn check_opencode_health(base_url: String) -> Result<serde_json::Value, String> {
    let config = HealthConfig {
        base_url,
        ..Default::default()
    };
    let mut checker = HealthChecker::new(config);
    let status = checker.check().await;

    Ok(serde_json::json!({
        "status": match status {
            HealthStatus::Healthy => "healthy",
            HealthStatus::Unhealthy => "unhealthy",
            HealthStatus::Down => "down",
            HealthStatus::Unknown => "unknown",
        },
        "consecutive_failures": checker.consecutive_failures(),
        "needs_reconnect": checker.needs_reconnect(),
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let opencode_manager = Arc::new(SpawnManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(OpencodeState {
            manager: opencode_manager,
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            git_diff,
            detect_opencode,
            spawn_opencode,
            stop_opencode,
            get_opencode_status,
            check_opencode_health,
        ])
        .setup(|app| {
            // Emit backend ready event to frontend
            let _ = app.emit("backend://ready", ());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
