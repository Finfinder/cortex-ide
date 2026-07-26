//! Spawn and lifecycle management for the OpenCode process.
//!
//! Per-app spawn (NOT bundled sidecar). Manages:
//! - Process start with configurable port/hostname/cors
//! - Graceful stop (SIGTERM -> SIGKILL after 5s timeout)
//! - Exponential backoff state for restart attempts
//!
//! NOTE: Health checking is handled separately by the `health` module.
//! Automatic crash restart is not yet implemented — callers should use
//! `is_alive()` + `restart_count()` to implement their own monitoring.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use serde::Serialize;
use thiserror::Error;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Errors that can occur during spawn/lifecycle management.
#[derive(Debug, Error)]
pub enum SpawnError {
    /// Failed to spawn the process.
    #[error("Failed to spawn OpenCode process: {0}")]
    SpawnFailed(String),
    /// Process exited unexpectedly.
    #[error("OpenCode process exited unexpectedly with code: {0:?}")]
    ProcessExited(Option<i32>),
    /// Health check failed after max retries.
    #[error("OpenCode health check failed after {max_retries} retries on port {port}")]
    HealthCheckFailed { port: u16, max_retries: u32 },
    /// Binary detection failed.
    #[error("OpenCode binary detection failed: {0}")]
    Detect(#[from] crate::opencode::DetectError),
    /// I/O error.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Configuration for spawning an OpenCode instance.
#[derive(Debug, Clone, Serialize)]
pub struct SpawnConfig {
    /// Working directory for the OpenCode process.
    pub cwd: PathBuf,
    /// Port to listen on (0 = auto-assigned by OpenCode).
    pub port: u16,
    /// Hostname to bind to.
    pub hostname: String,
    /// Additional CORS origins to allow.
    pub cors: Vec<String>,
    /// Custom binary path (overrides auto-detection).
    pub custom_binary_path: Option<String>,
    /// Enable mDNS service discovery.
    pub mdns: bool,
}

impl Default for SpawnConfig {
    fn default() -> Self {
        Self {
            cwd: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            port: 4096,
            hostname: "127.0.0.1".to_string(),
            cors: vec![],
            custom_binary_path: None,
            mdns: false,
        }
    }
}

/// A managed OpenCode process with lifecycle tracking.
pub struct ManagedProcess {
    child: Option<Child>,
    pid: Option<u32>,
    config: SpawnConfig,
    binary_path: PathBuf,
}

impl ManagedProcess {
    /// Get the PID of the running process, if alive.
    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    /// Get the port the process is configured to use.
    pub fn port(&self) -> u16 {
        self.config.port
    }

    /// Get the binary path being used.
    pub fn binary_path(&self) -> &PathBuf {
        &self.binary_path
    }

    /// Check if the child process is still running.
    pub fn is_alive(&mut self) -> bool {
        if let Some(child) = &mut self.child {
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) | Err(_) => false,
            }
        } else {
            false
        }
    }

    /// Gracefully stop the process.
    ///
    /// On Unix: sends SIGTERM, waits 5s, then SIGKILL.
    /// On Windows: uses kill() (no graceful signal available).
    pub async fn stop(&mut self) -> Result<(), SpawnError> {
        if let Some(mut child) = self.child.take() {
            #[cfg(unix)]
            {
                use tokio::signal::unix::{signal, SignalKind};
                if let Ok(mut term) = signal(SignalKind::terminate()) {
                    // Try graceful shutdown first
                    if let Some(pid) = self.pid {
                        unsafe {
            // Send SIGTERM to the child process group
            libc::kill(-(pid as i32), libc::SIGTERM);
                        }
                    }
                    // Wait up to 5 seconds for graceful exit
                    let timeout = tokio::time::timeout(
                        Duration::from_secs(5),
                        child.wait(),
                    );
                    match timeout.await {
                        Ok(Ok(_)) => return Ok(()),
                        _ => {
                            // Force kill
                            let _ = child.kill().await;
                            let _ = child.wait().await;
                        }
                    }
                } else {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }

            #[cfg(not(unix))]
            {
                // Windows: no graceful signals, kill directly
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        }
        self.pid = None;
        Ok(())
    }
}

/// Manages spawning, monitoring, and restarting OpenCode processes.
pub struct SpawnManager {
    /// The currently managed process, if any.
    process: Arc<Mutex<Option<ManagedProcess>>>,
    /// Restart backoff state.
    backoff: Arc<Mutex<BackoffState>>,
}

#[derive(Debug, Clone)]
struct BackoffState {
    restart_count: u32,
    last_restart: Option<std::time::Instant>,
}

impl BackoffState {
    fn new() -> Self {
        Self {
            restart_count: 0,
            last_restart: None,
        }
    }

    /// Calculate the backoff delay using exponential backoff with cap.
    /// Base: 1s, Factor: 2, Max: 60s
    fn delay(&self) -> Duration {
        let base = Duration::from_secs(1);
        let max = Duration::from_secs(60);
        if self.restart_count == 0 {
            return base;
        }
        let multiplier = 2u64.saturating_pow(self.restart_count.min(6));
        let delay_ms = 1000u64.saturating_mul(multiplier);
        Duration::from_millis(delay_ms).min(max)
    }

    fn record_restart(&mut self) {
        self.restart_count += 1;
        self.last_restart = Some(std::time::Instant::now());
    }

    fn reset(&mut self) {
        self.restart_count = 0;
        self.last_restart = None;
    }
}

impl SpawnManager {
    /// Create a new SpawnManager.
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            backoff: Arc::new(Mutex::new(BackoffState::new())),
        }
    }

    /// Spawn a new OpenCode process with the given configuration.
    ///
    /// This will:
    /// 1. Detect the OpenCode binary (custom path or auto-detect)
    /// 2. Spawn the process with `serve` command
    /// 3. Return the managed process handle
    pub async fn spawn(&self, config: SpawnConfig) -> Result<SpawnHandle, SpawnError> {
        // Stop any existing process first (ignore errors - old process may already be dead)
        let _ = self.stop().await;

        // Detect binary
        let binary_path =
            crate::opencode::detect_opencode_binary(config.custom_binary_path.clone())?;
        crate::opencode::detect::validate_executable(&binary_path)?;

        // Build the command
        let mut cmd = Command::new(&binary_path);
        cmd.arg("serve")
            .arg("--port")
            .arg(config.port.to_string())
            .arg("--hostname")
            .arg(&config.hostname);

        if !config.cors.is_empty() {
            cmd.arg("--cors");
            for origin in &config.cors {
                cmd.arg(origin);
            }
        }

        if config.mdns {
            cmd.arg("--mdns");
        }

        cmd.current_dir(&config.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|e| SpawnError::SpawnFailed(e.to_string()))?;

        let pid = child.id();
        let managed = ManagedProcess {
            child: Some(child),
            pid,
            config: config.clone(),
            binary_path: binary_path.clone(),
        };

        let port = managed.port();
        *self.process.lock().await = Some(managed);

        Ok(SpawnHandle {
            pid,
            port,
            binary_path,
            config,
        })
    }

    /// Stop the currently running process, if any.
    pub async fn stop(&self) -> Result<(), SpawnError> {
        let mut guard = self.process.lock().await;
        if let Some(mut proc) = guard.take() {
            proc.stop().await?;
        }
        self.backoff.lock().await.reset();
        Ok(())
    }

    /// Get the PID of the running process.
    pub async fn pid(&self) -> Option<u32> {
        self.process
            .lock()
            .await
            .as_ref()
            .and_then(|p| p.pid())
    }

    /// Check if the process is alive.
    pub async fn is_alive(&self) -> bool {
        let mut guard = self.process.lock().await;
        if let Some(proc) = guard.as_mut() {
            proc.is_alive()
        } else {
            false
        }
    }

    /// Get the current backoff delay for restart.
    pub async fn restart_delay(&self) -> Duration {
        self.backoff.lock().await.delay()
    }

    /// Record a restart attempt and get the delay to wait.
    pub async fn record_restart(&self) -> Duration {
        let mut backoff = self.backoff.lock().await;
        backoff.record_restart();
        backoff.delay()
    }

    /// Reset the backoff counter (called after successful health check).
    pub async fn reset_backoff(&self) {
        self.backoff.lock().await.reset();
    }

    /// Get the restart count.
    pub async fn restart_count(&self) -> u32 {
        self.backoff.lock().await.restart_count
    }
}

impl Default for SpawnManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Handle returned after a successful spawn, containing process info.
#[derive(Debug, Clone, Serialize)]
pub struct SpawnHandle {
    pub pid: Option<u32>,
    pub port: u16,
    pub binary_path: PathBuf,
    pub config: SpawnConfig,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backoff_delay_sequence() {
        let mut state = BackoffState::new();
        // restart_count starts at 0, first delay uses base (1s)
        assert_eq!(state.delay(), Duration::from_secs(1));

        state.record_restart(); // count = 1
        assert_eq!(state.delay(), Duration::from_secs(2));

        state.record_restart(); // count = 2
        assert_eq!(state.delay(), Duration::from_secs(4));

        state.record_restart(); // count = 3
        assert_eq!(state.delay(), Duration::from_secs(8));

        state.record_restart(); // count = 4
        assert_eq!(state.delay(), Duration::from_secs(16));

        state.record_restart(); // count = 5
        assert_eq!(state.delay(), Duration::from_secs(32));

        state.record_restart(); // count = 6
        assert_eq!(state.delay(), Duration::from_secs(60)); // capped

        state.reset();
        assert_eq!(state.delay(), Duration::from_secs(1));
    }

    #[test]
    fn test_spawn_config_default() {
        let config = SpawnConfig::default();
        assert_eq!(config.port, 4096);
        assert_eq!(config.hostname, "127.0.0.1");
        assert!(!config.mdns);
        assert!(config.cors.is_empty());
    }

    #[tokio::test]
    async fn test_spawn_manager_new_has_no_process() {
        let manager = SpawnManager::new();
        assert!(manager.pid().await.is_none());
        assert!(!manager.is_alive().await);
        assert_eq!(manager.restart_count().await, 0);
    }
}
