//! Listens to the backend's Server-Sent Events stream (`GET /blocks/stream`) and turns block
//! prompts into native notifications plus a `block-prompt` event for the UI.

use std::collections::HashSet;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::Value;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager, UserAttentionType};
use tauri_plugin_notification::NotificationExt;

use crate::api;
use crate::state::{show_main_window, AppState};

// The backend sends a heartbeat every 10s; silence for longer than this means a dead connection.
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);
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
    Unauthorized(String),
    Failed,
}

async fn run(app: AppHandle) {
    // Prompts already shown, so reconnects (which replay blocks inside their lead time) don't repeat them.
    let mut seen = HashSet::new();
    let mut backoff = Duration::from_secs(1);
    loop {
        match connect(&app, &mut seen, &mut backoff).await {
            End::Unauthorized(reason) => {
                api::signed_out(&app, &reason);
                return;
            }
            End::Failed => set_live(&app, false),
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn connect(app: &AppHandle, seen: &mut HashSet<String>, backoff: &mut Duration) -> End {
    let state = app.state::<AppState>();
    let Some(token) = state.token() else {
        return End::Unauthorized("You're signed out.".into());
    };
    let res = match state
        .http
        .get(format!("{}/blocks/stream", state.backend_url()))
        .bearer_auth(token)
        .header("Accept", "text/event-stream")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            if e.is_connect() {
                let _ = app.emit("backend-unreachable", ());
            }
            return End::Failed;
        }
    };
    if res.status().as_u16() == 401 {
        let reason = api::parse::<Value>(res).await.err().map(|e| e.message).unwrap_or_default();
        return End::Unauthorized(reason);
    }
    if !res.status().is_success() {
        return End::Failed;
    }

    *backoff = Duration::from_secs(1);
    set_live(app, true);

    let mut body = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    loop {
        let chunk = match tokio::time::timeout(IDLE_TIMEOUT, body.next()).await {
            Ok(Some(Ok(c))) => c,
            _ => return End::Failed, // timeout, error, or server closed the stream
        };
        buf.extend(chunk.iter().filter(|&&b| b != b'\r'));
        while let Some(pos) = buf.windows(2).position(|w| w == b"\n\n") {
            let frame: Vec<u8> = buf.drain(..pos + 2).collect();
            let frame = String::from_utf8_lossy(&frame);
            let mut event = "message";
            let mut data = Vec::new();
            for line in frame.lines() {
                if let Some(v) = line.strip_prefix("event:") {
                    event = v.trim();
                } else if let Some(v) = line.strip_prefix("data:") {
                    data.push(v.strip_prefix(' ').unwrap_or(v));
                }
            }
            if !data.is_empty() {
                handle_event(app, event, &data.join("\n"), seen);
            }
        }
    }
}

fn handle_event(app: &AppHandle, event: &str, data: &str, seen: &mut HashSet<String>) {
    if event != "block_upcoming" && event != "block_started" {
        return;
    }
    let Ok(prompt) = serde_json::from_str::<Value>(data) else { return };
    let block = &prompt["block"];
    let key = format!(
        "{event}:{}:{}",
        block["id"].as_str().unwrap_or_default(),
        block["start"].as_str().unwrap_or_default()
    );
    if !seen.insert(key) {
        return;
    }

    let _ = app.emit("block-prompt", &prompt);

    let name = block["name"].as_str().unwrap_or("Your next block");
    let title = if event == "block_started" {
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
    if event == "block_started" || needs_windows {
        show_main_window(app);
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
}
