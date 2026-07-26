//! Auto-detection of the OpenCode binary.
//!
//! Detection order:
//! 1. Custom path from settings (if provided and valid)
//! 2. Standard npm global locations (platform-specific)
//! 3. `which`/`where` fallback (PATH lookup)
//! 4. Clear error if not found

use std::path::{Path, PathBuf};
use thiserror::Error;

/// Errors that can occur during binary detection.
#[derive(Debug, Error)]
pub enum DetectError {
    /// Binary not found in any location.
    #[error("OpenCode binary not found. Searched: custom path, npm global locations, PATH. Install with: npm install -g opencode-ai")]
    NotFound,
    /// Custom path was provided but does not point to a valid file.
    #[error("Custom OpenCode path does not exist or is not a file: {0}")]
    CustomPathInvalid(String),
    /// Binary was found but is not executable (permission issue).
    #[error("OpenCode binary found but not executable: {0}")]
    NotExecutable(String),
    /// Underlying I/O error during detection.
    #[error("I/O error during OpenCode detection: {0}")]
    Io(#[from] std::io::Error),
}

/// Result of a successful detection - the resolved path to the binary.
pub type DetectResult = Result<PathBuf, DetectError>;

/// Detect the OpenCode binary.
///
/// # Arguments
/// * `custom_path` - Optional explicit path from user settings. If provided,
///   this takes priority over all other detection methods.
///
/// # Detection order
/// 1. Custom path (validated to exist and be a file)
/// 2. npm global install locations (platform-specific)
/// 3. `which` crate (PATH lookup)
///
/// # Errors
/// Returns `DetectError::NotFound` if the binary cannot be located anywhere.
/// Returns `DetectError::CustomPathInvalid` if a custom path was provided
/// but does not point to a valid file.
pub fn detect_opencode_binary(custom_path: Option<String>) -> DetectResult {
    // 1. Custom path from settings
    if let Some(ref path_str) = custom_path {
        let path = PathBuf::from(path_str);
        if path.is_file() {
            return Ok(path);
        }
        return Err(DetectError::CustomPathInvalid(path_str.clone()));
    }

    // 2. npm global locations (platform-specific)
    if let Some(path) = detect_npm_global() {
        return Ok(path);
    }

    // 3. which/where fallback (PATH lookup)
    if let Ok(path) = which::which("opencode") {
        return Ok(path);
    }

    // Also try opencode.cmd on Windows explicitly
    #[cfg(windows)]
    if let Ok(path) = which::which("opencode.cmd") {
        return Ok(path);
    }

    Err(DetectError::NotFound)
}

/// Check npm global install locations for the OpenCode binary.
///
/// On Windows, checks:
/// - `%APPDATA%\npm\opencode.cmd`
/// - `%NVM_HOME%\opencode.cmd` (nvm-windows)
/// - `%ProgramFiles%\nodejs\opencode.cmd`
/// - `C:\nvm4w\nodejs\opencode.cmd` (nvm4w default)
///
/// On macOS/Linux, checks:
/// - `/usr/local/bin/opencode`
/// - `/opt/homebrew/bin/opencode`
/// - `~/.npm-global/bin/opencode`
/// - `~/.local/bin/opencode`
fn detect_npm_global() -> Option<PathBuf> {
    let candidates = npm_global_candidates();

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// Build a list of candidate paths for npm global installs, platform-specific.
fn npm_global_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(windows)]
    {
        // %APPDATA%\npm\opencode.cmd
        if let Some(appdata) = dirs::data_dir() {
            // dirs::data_dir() on Windows = %APPDATA%
            candidates.push(appdata.join("npm").join("opencode.cmd"));
        }

        // %NVM_HOME% (nvm-windows)
        if let Ok(nvm_home) = std::env::var("NVM_HOME") {
            candidates.push(PathBuf::from(&nvm_home).join("opencode.cmd"));
        }

        // %ProgramFiles%\nodejs\opencode.cmd
        if let Ok(pf) = std::env::var("ProgramFiles") {
            candidates.push(PathBuf::from(&pf).join("nodejs").join("opencode.cmd"));
        }

        // nvm4w default location
        candidates.push(PathBuf::from(r"C:\nvm4w\nodejs\opencode.cmd"));

        // Also try without .cmd extension (in case of a direct binary)
        if let Some(appdata) = dirs::data_dir() {
            candidates.push(appdata.join("npm").join("opencode"));
        }
    }

    #[cfg(not(windows))]
    {
        // /usr/local/bin/opencode
        candidates.push(PathBuf::from("/usr/local/bin/opencode"));

        // /opt/homebrew/bin/opencode (Apple Silicon)
        candidates.push(PathBuf::from("/opt/homebrew/bin/opencode"));

        // ~/.npm-global/bin/opencode
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".npm-global").join("bin").join("opencode"));
            candidates.push(home.join(".local").join("bin").join("opencode"));
        }
    }

    candidates
}

/// Validate that a detected binary path is executable.
///
/// On Windows, `.cmd` and `.bat` files are considered executable.
/// On Unix, the file must have the executable bit set.
pub fn validate_executable(path: &Path) -> Result<(), DetectError> {
    if !path.is_file() {
        return Err(DetectError::CustomPathInvalid(
            path.to_string_lossy().to_string(),
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(path)?;
        let permissions = metadata.permissions();
        if permissions.mode() & 0o111 == 0 {
            return Err(DetectError::NotExecutable(
                path.to_string_lossy().to_string(),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_with_invalid_custom_path() {
        let result = detect_opencode_binary(Some("/nonexistent/path/to/opencode".to_string()));
        assert!(matches!(result, Err(DetectError::CustomPathInvalid(_))));
    }

    #[test]
    fn test_detect_returns_path_or_not_found() {
        // This test depends on whether opencode is installed.
        // It should either return Ok(path) or Err(NotFound).
        let result = detect_opencode_binary(None);
        match result {
            Ok(path) => assert!(path.to_string_lossy().contains("opencode")),
            Err(DetectError::NotFound) => {} // acceptable if not installed
            Err(e) => panic!("Unexpected error: {e}"),
        }
    }

    #[test]
    fn test_npm_global_candidates_not_empty() {
        let candidates = npm_global_candidates();
        assert!(!candidates.is_empty());
    }
}
