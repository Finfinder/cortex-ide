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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    info!("Cortex IDE starting up");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            info!("Tauri backend setup started");

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                // Give the webview time to load and register event listeners
                // before emitting the ready event. The frontend does a dynamic
                // import of @tauri-apps/api/event which can take a moment.
                tokio::time::sleep(Duration::from_secs(1)).await;

                info!("Spawning OpenCode server on port 4096");
                let manager = Arc::new(SpawnManager::new());

                let config = SpawnConfig {
                    cwd: PathBuf::from("."),
                    port: 4096,
                    hostname: "127.0.0.1".to_string(),
                    cors: vec![],
                    custom_binary_path: None,
                    mdns: false,
                };

                match manager.spawn(config).await {
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
                                    // Emit ready ONLY after OpenCode is confirmed healthy,
                                    // so the frontend doesn't try to connect SSE before
                                    // the server is actually listening.
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

