//! Polls the backend (`GET /blocks/due`) and turns block prompts into native notifications plus a
//! `block-prompt` event for the UI. Polling instead of a held-open stream keeps the backend
//! stateless, so it can run on serverless hosting.

use std::collections::HashSet;
use std::time::Duration;

use serde_json::Value;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager, UserAttentionType};
use tauri_plugin_notification::NotificationExt;

use crate::api;
use crate::state::{show_main_window, AppState};

const POLL_INTERVAL: Duration = Duration::from_secs(10);
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// (Re)starts the listener if signed in.
pub fn restart(app: &AppHandle) {
    stop(app);
    let state = app.state::<AppState>();
    if state.token().is_none() {
        return;
    }
    let handle = tauri::async_runtime::spawn(run(app.clone()));
    *state.stream_task.lock().unwrap() = Some(handle);
}

pub fn stop(app: &AppHandle) {
    if let Some(task) = app.state::<AppState>().stream_task.lock().unwrap().take() {
        task.abort();
    }
    set_live(app, false);
}

fn set_live(app: &AppHandle, live: bool) {
    app.state::<AppState>().stream_live.store(live, Ordering::Relaxed);
    let _ = app.emit("stream-status", live);
}

enum End {
    Ok,
    Unauthorized(String),
    Failed,
}

async fn run(app: AppHandle) {
    // Prompts already shown, in case an overlapping poll window returns one twice.
    let mut seen = HashSet::new();
    // Server time of the last successful poll; the next poll asks for what fell due after it.
    let mut since: Option<String> = None;
    let mut backoff = Duration::from_secs(1);
    loop {
        match poll(&app, &mut since, &mut seen).await {
            End::Unauthorized(reason) => {
                api::signed_out(&app, &reason);
                return;
            }
            End::Failed => {
                set_live(&app, false);
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
            End::Ok => {
                backoff = Duration::from_secs(1);
                tokio::time::sleep(POLL_INTERVAL).await;
            }
        }
    }
}

/// One `GET /blocks/due` call (a plain request, so it works against serverless hosting too).
async fn poll(app: &AppHandle, since: &mut Option<String>, seen: &mut HashSet<String>) -> End {
    let state = app.state::<AppState>();
    let Some(token) = state.token() else {
        return End::Unauthorized("You're signed out.".into());
    };
    let mut req = state
        .http
        .get(format!("{}/blocks/due", state.backend_url()))
        .bearer_auth(token)
        .timeout(Duration::from_secs(20));
    if let Some(s) = since.as_deref() {
        req = req.query(&[("since", s)]);
    }
    let res = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            if e.is_connect() {
                let _ = app.emit("backend-unreachable", ());
            }
            return End::Failed;
        }
    };
    match api::parse::<Value>(res).await {
        Ok(body) => {
            for prompt in body["prompts"].as_array().into_iter().flatten() {
                handle_prompt(app, prompt, seen);
            }
            if let Some(now) = body["now"].as_str() {
                *since = Some(now.to_string());
            }
            set_live(app, true);
            End::Ok
        }
        Err(e) if e.status == Some(401) => End::Unauthorized(e.message),
        Err(_) => End::Failed,
    }
}

fn handle_prompt(app: &AppHandle, prompt: &Value, seen: &mut HashSet<String>) {
    let kind = prompt["kind"].as_str().unwrap_or_default();
    if kind != "upcoming" && kind != "started" {
        return;
    }
    let block = &prompt["block"];
    let key = format!(
        "{kind}:{}:{}",
        block["id"].as_str().unwrap_or_default(),
        block["start"].as_str().unwrap_or_default()
    );
    if !seen.insert(key) {
        return;
    }

    let _ = app.emit("block-prompt", prompt);

    let name = block["name"].as_str().unwrap_or("Your next block");
    let title = if kind == "started" {
        format!("{name} is starting")
    } else {
        format!("Coming up: {name}")
    };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(prompt["message"].as_str().unwrap_or_default())
        .show();

    // Starting blocks ask to switch; blocks without windows ask which apps to save.
    let needs_windows = prompt["needsWindows"].as_bool().unwrap_or(false);
    if kind == "started" || needs_windows {
        show_main_window(app);
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
}
