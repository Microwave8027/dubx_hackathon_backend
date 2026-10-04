use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppResult;

/// Backend a fresh install talks to. Release builds set `DUBX_BACKEND_URL` at compile time
/// (e.g. the Vercel deployment); users can still change it under "Server settings".
pub const DEFAULT_BACKEND_URL: &str = match option_env!("DUBX_BACKEND_URL") {
    Some(url) => url,
    None => "http://localhost:3000",
};

/// User settings, persisted as JSON in the app's config directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub backend_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self { backend_url: DEFAULT_BACKEND_URL.into() }
    }
}

impl Settings {
    pub fn load(app: &AppHandle) -> Self {
        app.path()
            .app_config_dir()
            .ok()
            .and_then(|dir| fs::read_to_string(dir.join("settings.json")).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app: &AppHandle) -> AppResult<()> {
        let dir = app.path().app_config_dir()?;
        fs::create_dir_all(&dir)?;
        fs::write(dir.join("settings.json"), serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }
}

pub struct AppState {
    pub http: reqwest::Client,
    pub settings: Mutex<Settings>,
    /// Bearer token for the backend; mirrored in the OS credential store.
    pub token: Mutex<Option<String>>,
    pub stream_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    /// Whether the reminder stream is connected (the UI asks on load, then follows events).
    pub stream_live: AtomicBool,
    pub sign_in_cancel: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl AppState {
    pub fn new(settings: Settings, token: Option<String>) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .user_agent(concat!("dubx-desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build HTTP client");
        Self {
            http,
            settings: Mutex::new(settings),
            token: Mutex::new(token),
            stream_task: Mutex::new(None),
            stream_live: AtomicBool::new(false),
            sign_in_cancel: Mutex::new(None),
        }
    }

    pub fn backend_url(&self) -> String {
        self.settings.lock().unwrap().backend_url.clone()
    }

    pub fn token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }

    pub fn stream_live(&self) -> bool {
        self.stream_live.load(Ordering::Relaxed)
    }

    pub fn set_token(&self, token: Option<String>) {
        *self.token.lock().unwrap() = token;
    }
}

/// Brings the main window to the front (it may be hidden in the tray).
pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
