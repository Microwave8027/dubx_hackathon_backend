//! Whether the Dubx backend (normally the Docker Compose stack) is up and current.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager};
use url::Url;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Oldest backend API this app works with (reported by the backend's `/health`).
const REQUIRED_API: u64 = 3;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendState {
    Ready,
    /// Local backend, and Docker Desktop isn't running.
    DockerStopped,
    /// Nothing answers at the backend URL (Docker is running, or the backend isn't local).
    Unreachable,
    /// The backend answers but predates the desktop API (an old Docker image).
    Outdated,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub state: BackendState,
    pub backend_url: String,
    /// Whether the backend URL points at this machine (so Docker Desktop is expected to host it).
    pub local: bool,
}

pub async fn status(app: &AppHandle) -> BackendStatus {
    let state = app.state::<AppState>();
    let backend_url = state.backend_url();
    let local = Url::parse(&backend_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| matches!(h, "localhost" | "127.0.0.1" | "[::1]")))
        .unwrap_or(false);

    let health = state
        .http
        .get(format!("{backend_url}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await;
    let state = match health {
        Ok(res) if res.status().is_success() => {
            let body: Value = res.json().await.unwrap_or_default();
            if body["api"].as_u64().unwrap_or(0) >= REQUIRED_API {
                BackendState::Ready
            } else {
                BackendState::Outdated
            }
        }
        _ if local && !docker_running().await => BackendState::DockerStopped,
        _ => BackendState::Unreachable,
    };
    BackendStatus { state, backend_url, local }
}

async fn docker_running() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        sys.processes().values().any(|p| {
            let name = p.name().to_string_lossy().to_ascii_lowercase();
            name.starts_with("docker desktop") || name.starts_with("com.docker.backend") || name == "dockerd"
        })
    })
    .await
    .unwrap_or(false)
}

/// Starts Docker Desktop. Its containers come back on their own (`restart: unless-stopped`).
pub fn open_docker_desktop() -> AppResult<()> {
    #[cfg(windows)]
    {
        // Machine-wide install, then the per-user install.
        let env = |k: &str| std::env::var(k).unwrap_or_default();
        let candidates = [
            format!(r"{}\Docker\Docker\Docker Desktop.exe", env("ProgramFiles")),
            format!(r"{}\Programs\DockerDesktop\Docker Desktop.exe", env("LOCALAPPDATA")),
        ];
        let exe = candidates
            .iter()
            .map(std::path::Path::new)
            .find(|p| p.is_file())
            .ok_or_else(|| AppError::new("Docker Desktop isn't installed in the usual place. Start it from the Start menu."))?;
        std::process::Command::new(exe)
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::new(format!("Couldn't start Docker Desktop: {e}")))
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Docker"])
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::new(format!("Couldn't start Docker Desktop: {e}")))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Err(AppError::new("Start Docker (e.g. `systemctl start docker`), then the dubx containers."))
    }
}
