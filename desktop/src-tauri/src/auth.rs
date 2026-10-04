//! Google sign-in for a native app (RFC 8252): open the system browser, receive a one-time code
//! on a 127.0.0.1 loopback port, exchange it (with a PKCE verifier) for a backend bearer token.
//! Google blocks OAuth inside embedded webviews, so the login can't happen in the app window.

use std::collections::HashMap;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use url::Url;

use crate::api;
use crate::error::{AppError, AppResult};
use crate::state::{show_main_window, AppState};
use crate::stream;

const KEYRING_SERVICE: &str = "dubx-desktop";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    token: String,
    user: User,
}

// Tokens are stored per backend URL, so switching backends doesn't leak a token to another server.
fn entry(backend_url: &str) -> keyring::Result<Entry> {
    Entry::new(KEYRING_SERVICE, backend_url)
}

pub fn load_token(backend_url: &str) -> Option<String> {
    entry(backend_url).ok()?.get_password().ok()
}

fn store_token(backend_url: &str, token: &str) -> AppResult<()> {
    entry(backend_url)?.set_password(token)?;
    Ok(())
}

pub fn forget_token(backend_url: &str) {
    if let Ok(e) = entry(backend_url) {
        let _ = e.delete_credential();
    }
}

fn random_b64url(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("OS random number generator failed");
    URL_SAFE_NO_PAD.encode(buf)
}

pub async fn sign_in(app: &AppHandle) -> AppResult<User> {
    let state = app.state::<AppState>();
    let base = state.backend_url();

    // Don't send the browser to a dead backend (e.g. Docker isn't running): show the gate instead.
    let healthy = state
        .http
        .get(format!("{base}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .is_ok_and(|r| r.status().is_success());
    if !healthy {
        let _ = app.emit("backend-unreachable", ());
        return Err(AppError::new("The Dubx backend isn't running."));
    }

    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    let verifier = random_b64url(32); // 43 chars
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let expected_state = random_b64url(24);

    let mut url = Url::parse(&format!("{base}/auth/google"))?;
    url.query_pairs_mut()
        .append_pair("port", &port.to_string())
        .append_pair("state", &expected_state)
        .append_pair("challenge", &challenge);

    // A newer sign-in attempt replaces (and thereby cancels) an older one.
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    *state.sign_in_cancel.lock().unwrap() = Some(cancel_tx);

    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| AppError::new(format!("Couldn't open the browser: {e}")))?;

    let code = tokio::select! {
        r = wait_for_callback(&listener, &expected_state) => r?,
        _ = cancel_rx => return Err(AppError::new("Sign-in cancelled.")),
        _ = tokio::time::sleep(SIGN_IN_TIMEOUT) => {
            return Err(AppError::new("Sign-in timed out. Try again."));
        }
    };
    drop(listener);

    let device = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "desktop".into());
    let res = state
        .http
        .post(format!("{base}/auth/desktop/token"))
        .json(&json!({ "code": code, "verifier": verifier, "deviceName": device }))
        .send()
        .await?;
    let TokenResponse { token, user } = api::parse(res).await?;

    store_token(&base, &token)?;
    state.set_token(Some(token));
    stream::restart(app);
    show_main_window(app);
    Ok(user)
}

pub fn cancel_sign_in(app: &AppHandle) {
    if let Some(tx) = app.state::<AppState>().sign_in_cancel.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

pub async fn sign_out(app: &AppHandle) {
    let state = app.state::<AppState>();
    let base = state.backend_url();
    if let Some(token) = state.token() {
        // Best effort: revoke server-side; the local copy is removed regardless.
        let _ = state
            .http
            .post(format!("{base}/auth/logout"))
            .bearer_auth(token)
            .timeout(Duration::from_secs(5))
            .send()
            .await;
    }
    forget_token(&base);
    state.set_token(None);
    stream::stop(app);
}

/// Serves the loopback redirect until a request with our `state` arrives; returns its code.
async fn wait_for_callback(listener: &TcpListener, expected_state: &str) -> AppResult<String> {
    loop {
        let (mut sock, _) = listener.accept().await?;
        let target = match tokio::time::timeout(Duration::from_secs(5), read_request_target(&mut sock)).await {
            Ok(Ok(t)) => t,
            _ => continue,
        };
        let Some(url) = Url::parse(&format!("http://127.0.0.1{target}"))
            .ok()
            .filter(|u| u.path() == "/callback")
        else {
            respond(&mut sock, 404, "Not found", "").await;
            continue;
        };
        let params: HashMap<String, String> = url.query_pairs().into_owned().collect();
        if params.get("state").map(String::as_str) != Some(expected_state) {
            respond(&mut sock, 400, "This sign-in link has expired", "Go back to Dubx and sign in again.").await;
            continue;
        }
        if let Some(err) = params.get("error") {
            let message = match err.as_str() {
                "access_denied" => "Google sign-in was cancelled.".to_string(),
                "missing_calendar_scope" => {
                    "Dubx needs access to your Google Calendar. Sign in again and allow calendar access.".to_string()
                }
                other => format!("Sign-in failed ({other})."),
            };
            respond(&mut sock, 400, "Sign-in failed", &message).await;
            return Err(AppError::new(message));
        }
        if let Some(code) = params.get("code") {
            respond(&mut sock, 200, "You're signed in to Dubx", "You can close this tab and return to the app.").await;
            return Ok(code.clone());
        }
        respond(&mut sock, 400, "Missing sign-in code", "Go back to Dubx and sign in again.").await;
    }
}

async fn read_request_target(sock: &mut TcpStream) -> std::io::Result<String> {
    let mut buf = vec![0u8; 8192];
    let mut n = 0;
    while n < buf.len() {
        let read = sock.read(&mut buf[n..]).await?;
        if read == 0 {
            break;
        }
        n += read;
        if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf[..n]);
    Ok(head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("")
        .to_string())
}

async fn respond(sock: &mut TcpStream, status: u16, title: &str, detail: &str) {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Bad Request",
    };
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Dubx</title></head>\
         <body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5fb;color:#1f2133\">\
         <div style=\"text-align:center\"><h1 style=\"font-size:22px\">{}</h1><p style=\"color:#5b5f7a\">{}</p></div></body></html>",
        html_escape(title),
        html_escape(detail)
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{html}",
        html.len()
    );
    let _ = sock.write_all(response.as_bytes()).await;
    let _ = sock.shutdown().await;
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
