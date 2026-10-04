mod api;
mod auth;
mod backend;
mod desktop;
mod error;
mod state;
mod stream;

use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use url::Url;

use auth::User;
use desktop::{ArrangeReport, ArrangeTarget, CloseReport, CloseTarget, LaunchResult, LaunchSpec, OpenWindow};
use error::{AppError, AppResult};
use state::{show_main_window, AppState, Settings};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    backend_url: String,
    user: Option<User>,
}

/// Current backend URL and signed-in user (None when signed out).
#[tauri::command]
async fn get_session(app: AppHandle) -> AppResult<Session> {
    let state = app.state::<AppState>();
    let backend_url = state.backend_url();
    if state.token().is_none() {
        return Ok(Session { backend_url, user: None });
    }
    match api::request(&app, "GET", "/auth/me", None, None).await {
        Ok(v) => Ok(Session { backend_url, user: Some(serde_json::from_value(v)?) }),
        Err(AppError { status: Some(401), .. }) => Ok(Session { backend_url, user: None }),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn set_backend_url(app: AppHandle, url: String) -> AppResult<Session> {
    let parsed = Url::parse(url.trim()).map_err(|_| AppError::new("Enter a full URL, e.g. http://localhost:3000"))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(AppError::new("The backend URL must start with http:// or https://"));
    }
    let backend_url = parsed.as_str().trim_end_matches('/').to_string();
    let settings = Settings { backend_url: backend_url.clone() };
    settings.save(&app)?;

    let state = app.state::<AppState>();
    *state.settings.lock().unwrap() = settings;
    state.set_token(auth::load_token(&backend_url));
    stream::restart(&app);
    get_session(app).await
}

#[tauri::command]
async fn sign_in(app: AppHandle) -> AppResult<User> {
    auth::sign_in(&app).await
}

#[tauri::command]
fn cancel_sign_in(app: AppHandle) {
    auth::cancel_sign_in(&app);
}

#[tauri::command]
async fn sign_out(app: AppHandle) -> AppResult<()> {
    auth::sign_out(&app).await;
    Ok(())
}

/// Proxies a backend call with the stored bearer token.
#[tauri::command]
async fn api(
    app: AppHandle,
    method: String,
    path: String,
    query: Option<HashMap<String, String>>,
    body: Option<Value>,
) -> AppResult<Value> {
    let query = query.map(|q| q.into_iter().collect());
    api::request(&app, &method, &path, query, body).await
}

#[tauri::command]
async fn snapshot_windows() -> AppResult<Vec<OpenWindow>> {
    // Window enumeration can block on unresponsive apps; keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(desktop::snapshot)
        .await
        .map_err(|e| AppError::new(e.to_string()))?
        .map_err(AppError::new)
}

#[tauri::command]
async fn close_windows(targets: Vec<CloseTarget>) -> AppResult<CloseReport> {
    tauri::async_runtime::spawn_blocking(move || desktop::close(&targets))
        .await
        .map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
async fn launch_apps(apps: Vec<LaunchSpec>) -> AppResult<Vec<LaunchResult>> {
    tauri::async_runtime::spawn_blocking(move || desktop::launch(apps))
        .await
        .map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
async fn arrange_windows(targets: Vec<ArrangeTarget>) -> AppResult<ArrangeReport> {
    tauri::async_runtime::spawn_blocking(move || desktop::arrange(&targets))
        .await
        .map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
async fn backend_status(app: AppHandle) -> backend::BackendStatus {
    backend::status(&app).await
}

#[tauri::command]
fn open_docker_desktop() -> AppResult<()> {
    backend::open_docker_desktop()
}

#[tauri::command]
fn stream_status(app: AppHandle) -> bool {
    app.state::<AppState>().stream_live()
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app);
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Dubx", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync calendar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Dubx", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &sync, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Dubx")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "sync" => {
                let _ = app.emit("tray-sync", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch just focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            let settings = Settings::load(handle);
            let token = auth::load_token(&settings.backend_url);
            app.manage(AppState::new(settings, token));
            create_tray(handle)?;
            stream::restart(handle);
            Ok(())
        })
        // Closing the window keeps Dubx running in the tray so prompts still arrive.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            backend_status,
            open_docker_desktop,
            get_session,
            set_backend_url,
            sign_in,
            cancel_sign_in,
            sign_out,
            api,
            snapshot_windows,
            close_windows,
            launch_apps,
            arrange_windows,
            stream_status,
            show_main,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dubx");
}
