//! Thin client for the Express backend. The browser's `connect.sid` session cookie is
//! forwarded on every call, so the backend sees the same Google-authenticated user.

use std::{error::Error as _, fmt, time::Duration};

use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use reqwest::{Client, Method, Response, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SESSION_COOKIE: &str = "connect.sid";

/// Pulls the raw `connect.sid=...` pair out of the request's Cookie header, untouched.
pub fn session_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .map(str::trim)
        .find(|pair| pair.starts_with(&format!("{SESSION_COOKIE}=")))
        .map(String::from)
}

#[derive(Debug)]
pub enum BackendError {
    /// Couldn't talk to the backend at all.
    Unreachable(String),
    /// 401: no session, or Google rejected the stored OAuth tokens.
    Unauthorized(String),
    /// Any other non-2xx answer.
    Rejected { status: u16, message: String },
    /// 2xx, but the body wasn't what we expected.
    BadResponse(String),
}

impl BackendError {
    /// Status code this UI should answer with for this failure.
    pub fn http_status(&self) -> StatusCode {
        match self {
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Rejected { status: 400, .. } => StatusCode::BAD_REQUEST,
            _ => StatusCode::BAD_GATEWAY,
        }
    }
}

impl fmt::Display for BackendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unreachable(m) => write!(f, "Backend unreachable: {m}"),
            Self::Unauthorized(m) => write!(f, "{m}"),
            Self::Rejected { status, message } => write!(f, "Backend returned {status}: {message}"),
            Self::BadResponse(m) => write!(f, "Unexpected backend response: {m}"),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub email: String,
    pub name: String,
    #[serde(default)]
    pub picture: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CalendarEvent {
    pub start: String,
    pub stop: String,
    pub color: String,
    #[serde(default)]
    pub description: String,
    pub name: String,
}

impl CalendarEvent {
    /// The color is backend/Google data, so only let a strict `#RRGGBB` reach a style attribute.
    pub fn safe_color(&self) -> &str {
        let c = self.color.as_str();
        let ok = c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
        if ok { c } else { "#9aa0a6" }
    }
}

#[derive(Debug, Clone)]
pub struct Schedule {
    pub events: Vec<CalendarEvent>,
    /// The backend's JSON, pretty-printed, exactly as the API returned it.
    pub raw_json: String,
}

#[derive(Debug, Serialize)]
pub struct NewEvent {
    pub name: String,
    pub description: String,
    pub start: String,
    pub stop: String,
    pub color: String,
    #[serde(rename = "timeZone")]
    pub time_zone: String,
}

#[derive(Clone)]
pub struct Backend {
    http: Client,
    base: String,
}

impl Backend {
    pub fn new(base: String) -> Self {
        let http = Client::builder()
            .redirect(Policy::none())
            // Schedule generation waits on Gemini, which can take a while.
            .timeout(Duration::from_secs(90))
            .build()
            .expect("failed to build HTTP client");
        Self { http, base }
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> Result<Response, BackendError> {
        let mut req = self.http.request(method, format!("{}{path}", self.base));
        if let Some(cookie) = cookie {
            req = req.header(header::COOKIE, cookie);
        }
        if let Some(body) = body {
            req = req.json(&body);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| BackendError::Unreachable(describe(&e)))?;
        if resp.status().is_success() {
            return Ok(resp);
        }

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(String::from))
            .unwrap_or_else(|| text.chars().take(300).collect());
        Err(if status == StatusCode::UNAUTHORIZED {
            BackendError::Unauthorized(message)
        } else {
            BackendError::Rejected { status: status.as_u16(), message }
        })
    }

    pub async fn health(&self) -> Result<(), BackendError> {
        self.send(Method::GET, "/health", None, None).await.map(|_| ())
    }

    pub async fn me(&self, cookie: &str) -> Result<User, BackendError> {
        let resp = self.send(Method::GET, "/auth/me", Some(cookie), None).await?;
        resp.json().await.map_err(|e| BackendError::BadResponse(e.to_string()))
    }

    pub async fn schedule(&self, cookie: &str) -> Result<Schedule, BackendError> {
        let resp = self.send(Method::GET, "/schedule", Some(cookie), None).await?;
        let value: Value = resp
            .json()
            .await
            .map_err(|e| BackendError::BadResponse(e.to_string()))?;
        let events = serde_json::from_value(value.clone())
            .map_err(|e| BackendError::BadResponse(e.to_string()))?;
        Ok(Schedule {
            events,
            raw_json: serde_json::to_string_pretty(&value).unwrap_or_default(),
        })
    }

    pub async fn create_event(&self, cookie: &str, event: &NewEvent) -> Result<(), BackendError> {
        let body = serde_json::to_value(event).expect("NewEvent serializes");
        self.send(Method::POST, "/schedule/events", Some(cookie), Some(body))
            .await
            .map(|_| ())
    }

    /// Asks Gemini (through the backend) to build a schedule; returns how many events were made.
    pub async fn generate(&self, cookie: &str, request: Value) -> Result<usize, BackendError> {
        let resp = self
            .send(Method::POST, "/schedule/generate", Some(cookie), Some(request))
            .await?;
        let events: Vec<Value> = resp
            .json()
            .await
            .map_err(|e| BackendError::BadResponse(e.to_string()))?;
        Ok(events.len())
    }

    pub async fn clear(&self, cookie: &str) -> Result<(), BackendError> {
        self.send(Method::DELETE, "/schedule", Some(cookie), None).await.map(|_| ())
    }

    /// Ends the backend session; returns its Set-Cookie headers so the browser drops the cookie.
    pub async fn logout(&self, cookie: &str) -> Result<Vec<HeaderValue>, BackendError> {
        let resp = self.send(Method::POST, "/auth/logout", Some(cookie), None).await?;
        Ok(resp.headers().get_all(header::SET_COOKIE).iter().cloned().collect())
    }
}

/// Flattens an error and its sources into one line ("error sending request: connection refused").
fn describe(e: &reqwest::Error) -> String {
    let mut parts = vec![e.to_string()];
    let mut source = e.source();
    while let Some(s) = source {
        parts.push(s.to_string());
        source = s.source();
    }
    parts.join(": ")
}
