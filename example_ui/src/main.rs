mod backend;
mod config;
mod handlers;
mod views;

use axum::{
    Router,
    routing::{get, post},
};
use tokio::net::TcpListener;

use crate::{backend::Backend, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub backend: Backend,
    pub backend_url: String,
    pub public_url: String,
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt::init();
    let config = Config::from_env();

    let state = AppState {
        backend: Backend::new(config.backend_url.clone()),
        backend_url: config.backend_url.clone(),
        public_url: config.backend_public_url.clone(),
    };

    let app = Router::new()
        .route("/", get(handlers::index))
        .route("/calendar", get(handlers::calendar))
        .route("/events", post(handlers::create_event))
        .route("/generate", post(handlers::generate))
        .route("/clear", post(handlers::clear))
        .route("/logout", post(handlers::logout))
        .route("/static/htmx.min.js", get(handlers::htmx_js))
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("could not bind {addr}: {e}"));
    tracing::info!(
        "UI on http://localhost:{} -> backend {}",
        config.port,
        config.backend_url
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server error");
}
