use std::env;

pub struct Config {
    pub host: String,
    pub port: u16,
    /// Where this server reaches the Express backend (server-to-server).
    pub backend_url: String,
    /// Where the *browser* reaches the Express backend (used for the "Sign in" link).
    pub backend_public_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        let backend_url = trim_slash(env_or("BACKEND_URL", "http://localhost:3000"));
        let backend_public_url = env::var("BACKEND_PUBLIC_URL")
            .map(trim_slash)
            .unwrap_or_else(|_| backend_url.clone());
        Self {
            host: env_or("UI_HOST", "127.0.0.1"),
            port: env_or("UI_PORT", "8080")
                .parse()
                .expect("UI_PORT must be a valid port number"),
            backend_url,
            backend_public_url,
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn trim_slash(s: String) -> String {
    s.trim_end_matches('/').to_string()
}
