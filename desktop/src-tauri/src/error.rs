use serde::Serialize;

/// Error returned to the frontend: a readable message plus the backend's HTTP status, if any.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub message: String,
    pub status: Option<u16>,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self { message: message.into(), status: None }
    }

    pub fn with_status(status: u16, message: impl Into<String>) -> Self {
        Self { message: message.into(), status: Some(status) }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

macro_rules! from_error {
    ($($t:ty => $prefix:literal),* $(,)?) => {
        $(impl From<$t> for AppError {
            fn from(e: $t) -> Self {
                AppError::new(format!(concat!($prefix, "{}"), e))
            }
        })*
    };
}

from_error! {
    std::io::Error => "I/O error: ",
    serde_json::Error => "Invalid data: ",
    tauri::Error => "App error: ",
    keyring::Error => "Credential store error: ",
    url::ParseError => "Invalid URL: ",
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() {
            AppError::new("Can't reach the Dubx backend. Check that it's running and the URL in settings.")
        } else {
            AppError::new(format!("Request failed: {e}"))
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
