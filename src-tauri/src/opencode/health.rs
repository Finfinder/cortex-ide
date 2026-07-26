//! Health checking and reconnection logic for the OpenCode SDK server.
//!
//! Provides:
//! - Periodic health pings to `/health` endpoint
//! - Status tracking (healthy, unhealthy, unknown)
//! - Reconnection triggers with backoff

#![allow(dead_code)] // Methods will be used when health monitoring is wired into the Tauri event system

use std::time::Duration;
use thiserror::Error;
use tokio::time::interval;

/// Errors that can occur during health checking.
#[derive(Debug, Error)]
pub enum HealthError {
    /// HTTP request failed.
    #[error("Health check HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    /// Server returned an unhealthy status code.
    #[error("Health check returned unhealthy status: {0}")]
    UnhealthyStatus(u16),
    /// Connection refused (server not running).
    #[error("Health check connection refused on port {port}")]
    ConnectionRefused { port: u16 },
}

/// Health status of the OpenCode server.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthStatus {
    /// Server is responding and healthy.
    Healthy,
    /// Server is responding but reports unhealthy.
    Unhealthy,
    /// Server is not reachable.
    Down,
    /// Status has not been checked yet.
    Unknown,
}

impl HealthStatus {
    /// Returns true if the server is healthy.
    pub fn is_healthy(&self) -> bool {
        matches!(self, HealthStatus::Healthy)
    }

    /// Returns true if the server is reachable (healthy or unhealthy).
    pub fn is_reachable(&self) -> bool {
        matches!(self, HealthStatus::Healthy | HealthStatus::Unhealthy)
    }
}

/// Configuration for health checking.
#[derive(Debug, Clone)]
pub struct HealthConfig {
    /// Base URL of the OpenCode server (e.g., "http://127.0.0.1:4096").
    pub base_url: String,
    /// Interval between health checks.
    pub interval: Duration,
    /// Timeout for each health check request.
    pub timeout: Duration,
    /// Maximum consecutive failures before triggering reconnect.
    pub max_failures: u32,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:4096".to_string(),
            interval: Duration::from_secs(5),
            timeout: Duration::from_secs(3),
            max_failures: 3,
        }
    }
}

/// Health checker that periodically pings the OpenCode server.
pub struct HealthChecker {
    config: HealthConfig,
    client: reqwest::Client,
    current_status: HealthStatus,
    consecutive_failures: u32,
}

impl HealthChecker {
    /// Create a new HealthChecker with the given configuration.
    pub fn new(config: HealthConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .unwrap_or_default();

        Self {
            config,
            client,
            current_status: HealthStatus::Unknown,
            consecutive_failures: 0,
        }
    }

    /// Get the current health status.
    pub fn status(&self) -> HealthStatus {
        self.current_status
    }

    /// Get the number of consecutive failures.
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    /// Check if reconnection is needed (too many consecutive failures).
    pub fn needs_reconnect(&self) -> bool {
        self.consecutive_failures >= self.config.max_failures
    }

    /// Perform a single health check.
    ///
    /// Returns the new health status.
    pub async fn check(&mut self) -> HealthStatus {
        let url = format!("{}/health", self.config.base_url);

        match self.client.get(&url).send().await {
            Ok(response) => {
                let status_code = response.status().as_u16();
                if status_code >= 200 && status_code < 300 {
                    self.current_status = HealthStatus::Healthy;
                    self.consecutive_failures = 0;
                } else {
                    self.current_status = HealthStatus::Unhealthy;
                    self.consecutive_failures += 1;
                }
            }
            Err(e) => {
                self.current_status = if e.is_connect() || e.is_timeout() {
                    HealthStatus::Down
                } else {
                    HealthStatus::Unhealthy
                };
                self.consecutive_failures += 1;
            }
        }

        self.current_status
    }

    /// Run continuous health checking with a callback on status changes.
    ///
    /// This is a long-running async task. It checks health at the configured
    /// interval and calls `on_status_change` whenever the status transitions.
    pub async fn run<F>(&mut self, mut on_status_change: F)
    where
        F: FnMut(HealthStatus, HealthStatus) + Send + 'static,
    {
        let mut ticker = interval(self.config.interval);

        loop {
            ticker.tick().await;
            let previous = self.current_status;
            let new = self.check().await;

            if previous != new {
                on_status_change(previous, new);
            }
        }
    }

    /// Reset the failure counter (e.g., after successful reconnect).
    pub fn reset(&mut self) {
        self.consecutive_failures = 0;
        self.current_status = HealthStatus::Unknown;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_status_is_healthy() {
        assert!(HealthStatus::Healthy.is_healthy());
        assert!(!HealthStatus::Unhealthy.is_healthy());
        assert!(!HealthStatus::Down.is_healthy());
        assert!(!HealthStatus::Unknown.is_healthy());
    }

    #[test]
    fn test_health_status_is_reachable() {
        assert!(HealthStatus::Healthy.is_reachable());
        assert!(HealthStatus::Unhealthy.is_reachable());
        assert!(!HealthStatus::Down.is_reachable());
        assert!(!HealthStatus::Unknown.is_reachable());
    }

    #[test]
    fn test_health_config_default() {
        let config = HealthConfig::default();
        assert_eq!(config.base_url, "http://127.0.0.1:4096");
        assert_eq!(config.interval, Duration::from_secs(5));
        assert_eq!(config.timeout, Duration::from_secs(3));
        assert_eq!(config.max_failures, 3);
    }

    #[test]
    fn test_health_checker_initial_state() {
        let checker = HealthChecker::new(HealthConfig::default());
        assert_eq!(checker.status(), HealthStatus::Unknown);
        assert_eq!(checker.consecutive_failures(), 0);
        assert!(!checker.needs_reconnect());
    }

    #[test]
    fn test_needs_reconnect_after_failures() {
        let mut checker = HealthChecker::new(HealthConfig::default());
        checker.consecutive_failures = 3;
        assert!(checker.needs_reconnect());
        checker.consecutive_failures = 2;
        assert!(!checker.needs_reconnect());
    }
}
