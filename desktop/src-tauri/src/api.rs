//! Authenticated calls to the Dubx backend. The bearer token never leaves the Rust side.

use reqwest::{Method, Response};
use serde::de::DeserializeOwned;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::stream;

/// Turns a backend response into `T`, mapping `{ "error": "..." }` bodies to AppError.
pub async fn parse<T: DeserializeOwned>(res: Response) -> AppResult<T> {
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_owned))
            .unwrap_or_else(|| format!("Backend returned {status}"));
        return Err(AppError::with_status(status.as_u16(), message));
    }
    let body = if text.trim().is_empty() { "null" } else { &text };
    Ok(serde_json::from_str(body)?)
}

/// Sends a request to the backend with the stored token. A 401 signs the app out.
pub async fn request(
    app: &AppHandle,
    method: &str,
    path: &str,
    query: Option<Vec<(String, String)>>,
    body: Option<Value>,
) -> AppResult<Value> {
    if !path.starts_with('/') || path.contains("..") {
        return Err(AppError::new("Invalid API path"));
    }
    let method = Method::from_bytes(method.to_ascii_uppercase().as_bytes())
        .map_err(|_| AppError::new("Invalid HTTP method"))?;
    let state = app.state::<AppState>();
    let Some(token) = state.token() else {
        return Err(AppError::with_status(401, "You're signed out."));
    };

    let mut req = state
        .http
        .request(method, format!("{}{}", state.backend_url(), path))
        .bearer_auth(&token);
    if let Some(q) = query {
        req = req.query(&q);
    }
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            // Docker stopped or the container went down: the UI re-checks and shows how to fix it.
            if e.is_connect() || e.is_timeout() {
                let _ = app.emit("backend-unreachable", ());
            }
            return Err(e.into());
        }
    };
    let result = parse::<Value>(res).await;
    if let Err(AppError { status: Some(401), message }) = &result {
        signed_out(app, message);
    }
    result
}

/// The backend no longer accepts our token (or Google access was revoked): forget it and tell the UI.
pub fn signed_out(app: &AppHandle, reason: &str) {
    let state = app.state::<AppState>();
    if state.token().is_none() {
        return;
    }
    auth::forget_token(&state.backend_url());
    state.set_token(None);
    stream::stop(app);
    let _ = app.emit("auth-expired", reason);
}
