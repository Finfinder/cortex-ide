//! OpenCode integration module.
//!
//! Handles binary detection, process spawning, lifecycle management,
//! and health checking for the OpenCode agent backend.

pub mod detect;
pub mod spawn;
pub mod health;

// Re-exports needed by spawn.rs internal code
pub use detect::{detect_opencode_binary, DetectError};
