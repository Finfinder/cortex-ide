use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tracing::{debug, error, info};

mod opencode;

use opencode::spawn::{SpawnManager, SpawnConfig};
use opencode::health::{HealthChecker, HealthConfig, HealthStatus};

fn init_logging() {
    let log_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."))
        .join("CortexIDE")
        .join("logs");
    let _ = std::fs::create_dir_all(&log_dir);

    let appender = tracing_appender::rolling::RollingFileAppender::new(
        tracing_appender::rolling::Rotation::HOURLY,
        log_dir,
        "cortex.log",
    );

    tracing_subscriber::fmt()
        .with_writer(appender)
        .with_max_level(tracing::Level::DEBUG)
        .init();
}

struct AppState {
    spawn_manager: Arc<SpawnManager>,
}

#[tauri::command]
async fn save_opencode_config(state: tauri::State<'_, AppState>, content: String) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Failed to locate user config directory".to_string())?
        .join("opencode");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    let file_path = config_dir.join("opencode.jsonc");
    std::fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write opencode config: {}", e))?;

    let config = SpawnConfig {
        cwd: PathBuf::from("."),
        port: 4096,
        hostname: "127.0.0.1".to_string(),
        cors: vec![],
        custom_binary_path: None,
        mdns: false,
    };

    if let Err(e) = state.spawn_manager.spawn(config).await {
        error!("Failed to restart OpenCode server after config save: {}", e);
    } else {
        info!("OpenCode server restarted successfully with new config");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    info!("Cortex IDE starting up");

    let manager = Arc::new(SpawnManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            spawn_manager: manager.clone(),
        })
        .invoke_handler(tauri::generate_handler![save_opencode_config])
        .setup(move |app| {
            info!("Tauri backend setup started");

            let app_handle = app.handle().clone();
            let manager_clone = manager.clone();

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(1)).await;

                info!("Spawning OpenCode server on port 4096");

                let config = SpawnConfig {
                    cwd: PathBuf::from("."),
                    port: 4096,
                    hostname: "127.0.0.1".to_string(),
                    cors: vec![],
                    custom_binary_path: None,
                    mdns: false,
                };

                match manager_clone.spawn(config).await {
                    Ok(handle) => {
                        info!(
                            pid = ?handle.pid,
                            binary = ?handle.binary_path,
                            "OpenCode process spawned successfully"
                        );

                        let health_config = HealthConfig {
                            base_url: "http://127.0.0.1:4096".to_string(),
                            interval: Duration::from_secs(1),
                            timeout: Duration::from_secs(2),
                            max_failures: 15,
                        };
                        let mut checker = HealthChecker::new(health_config);

                        for attempt in 1..=15 {
                            debug!(attempt, "Polling OpenCode health endpoint");
                            let status = checker.check().await;
                            match status {
                                HealthStatus::Healthy => {
                                    info!("OpenCode is healthy");
                                    let _ = app_handle.emit("backend://ready", ());
                                    info!("Emitted backend://ready");
                                    return;
                                }
                                HealthStatus::Down => {
                                    debug!(attempt, "Health check returned Down");
                                }
                                HealthStatus::Unhealthy => {
                                    debug!(attempt, "Health check returned Unhealthy");
                                }
                                HealthStatus::Unknown => {
                                    debug!(attempt, "Health check returned Unknown");
                                }
                            }
                            tokio::time::sleep(Duration::from_secs(2)).await;
                        }

                        error!("OpenCode health check failed after 15 attempts");
                        let _ = app_handle.emit("backend://error", "OpenCode health check failed after 30s");
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to spawn OpenCode process");
                        let _ = app_handle.emit("backend://error", format!("Failed to spawn OpenCode: {}", e));
                    }
                }
            });

            info!("Tauri backend setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

