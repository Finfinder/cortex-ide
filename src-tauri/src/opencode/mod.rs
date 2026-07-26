//! OpenCode integration module.
//!
//! Handles binary detection, process spawning, lifecycle management,
//! and health checking for the OpenCode agent backend.

pub mod detect;
pub mod spawn;
pub mod health;

pub use detect::{detect_opencode_binary, DetectError};
pub use spawn::{SpawnManager, SpawnConfig, SpawnError, ManagedProcess};
pub use health::{HealthChecker, HealthStatus};
