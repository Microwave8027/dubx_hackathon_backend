use std::collections::HashMap;

use axum::{
    Form,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Redirect, Response},
};
use chrono::{NaiveDateTime, TimeZone};
use chrono_tz::Tz;
use serde::Deserialize;
use serde_json::json;

use crate::{
    AppState,
    backend::{BackendError, NewEvent, Schedule, session_cookie},
    views::{self, Flash, IndexModel},
};

pub async fn htmx_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        include_str!("../static/htmx.min.js"),
    )
}

pub async fn index(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Html<String> {
    let cookie = session_cookie(&headers);
    // The backend redirects here with ?auth_error=... when a sign-in is refused.
    let notice = params.get("auth_error").map(|code| match code.as_str() {
        "missing_calendar_scope" => "Sign-in was refused: the Google Calendar permission wasn't granted. Sign in again and tick the Calendar checkbox on Google's consent screen."
            .to_string(),
        other => format!("Sign-in failed ({other})."),
    });

    let health = state.backend.health().await;
    let user = match &cookie {
        Some(c) => state.backend.me(c).await,
        None => Err(BackendError::Unauthorized(
            "No session cookie. Sign in with Google.".into(),
        )),
    };
    // Only hit the calendar once we know the session is valid.
    let calendar = match (&user, &cookie) {
        (Ok(_), Some(c)) => Some(state.backend.schedule(c).await),
        _ => None,
    };

    Html(views::index_page(IndexModel {
        backend_url: state.backend_url.clone(),
        public_url: state.public_url.clone(),
        health,
        user,
        calendar,
        notice,
    }))
}

/// Re-fetches the schedule and renders the `#calendar` fragment with an optional banner.
async fn panel(
    state: &AppState,
    cookie: Option<&str>,
    status: StatusCode,
    flash: Option<Flash>,
) -> Response {
    let schedule: Result<Schedule, BackendError> = match cookie {
        Some(c) => state.backend.schedule(c).await,
        None => Err(BackendError::Unauthorized(
            "Not signed in. Reload the page and sign in.".into(),
        )),
    };
    (
        status,
        Html(views::render(views::calendar_panel(&schedule, flash))),
    )
        .into_response()
}

fn failure(err: &BackendError, what: &str) -> (StatusCode, Flash) {
    (err.http_status(), Flash::Err(format!("{what}: {err}")))
}

pub async fn calendar(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let cookie = session_cookie(&headers);
    panel(&state, cookie.as_deref(), StatusCode::OK, None).await
}

#[derive(Deserialize)]
pub struct EventForm {
    name: String,
    #[serde(default)]
    description: String,
    start: String,
    stop: String,
    #[serde(default)]
    color: String,
    #[serde(default, rename = "timeZone")]
    time_zone: String,
}

/// Interprets a `datetime-local` value (no zone) in the user's zone and returns it as UTC RFC 3339.
fn local_to_utc(value: &str, tz: Tz) -> Result<String, String> {
    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S"))
        .map_err(|_| format!("\"{value}\" is not a valid date and time"))?;
    let local = tz
        .from_local_datetime(&naive)
        .earliest()
        .ok_or_else(|| format!("\"{value}\" does not exist in {tz} (daylight saving gap)"))?;
    Ok(local
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

pub async fn create_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<EventForm>,
) -> Response {
    let Some(cookie) = session_cookie(&headers) else {
        return panel(&state, None, StatusCode::UNAUTHORIZED, None).await;
    };

    let tz: Tz = form.time_zone.parse().unwrap_or(Tz::UTC);
    let (start, stop) = match (local_to_utc(&form.start, tz), local_to_utc(&form.stop, tz)) {
        (Ok(a), Ok(b)) => (a, b),
        (Err(e), _) | (_, Err(e)) => {
            return panel(
                &state,
                Some(&cookie),
                StatusCode::BAD_REQUEST,
                Some(Flash::Err(e)),
            )
            .await;
        }
    };

    let event = NewEvent {
        name: form.name,
        description: form.description,
        start,
        stop,
        color: if form.color.is_empty() {
            "#4285F4".into()
        } else {
            form.color
        },
        time_zone: tz.name().to_string(),
    };

    let (status, flash) = match state.backend.create_event(&cookie, &event).await {
        Ok(()) => (
            StatusCode::OK,
            Flash::Ok(format!("Added \"{}\" to Google Calendar.", event.name)),
        ),
        Err(e) => failure(&e, "Could not add event"),
    };
    panel(&state, Some(&cookie), status, Some(flash)).await
}

#[derive(Deserialize)]
pub struct GenerateForm {
    prompt: String,
    #[serde(default, rename = "timeZone")]
    time_zone: String,
}

pub async fn generate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<GenerateForm>,
) -> Response {
    let Some(cookie) = session_cookie(&headers) else {
        return panel(&state, None, StatusCode::UNAUTHORIZED, None).await;
    };
    let tz: Tz = form.time_zone.parse().unwrap_or(Tz::UTC);
    let request = json!({ "prompt": form.prompt, "timeZone": tz.name() });

    let (status, flash) = match state.backend.generate(&cookie, request).await {
        Ok(n) => (
            StatusCode::OK,
            Flash::Ok(format!("Gemini created {n} event(s) in Google Calendar.")),
        ),
        Err(e) => failure(&e, "Could not generate schedule"),
    };
    panel(&state, Some(&cookie), status, Some(flash)).await
}

pub async fn clear(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(cookie) = session_cookie(&headers) else {
        return panel(&state, None, StatusCode::UNAUTHORIZED, None).await;
    };
    let (status, flash) = match state.backend.clear(&cookie).await {
        Ok(()) => (
            StatusCode::OK,
            Flash::Ok("Removed all events created by this app.".into()),
        ),
        Err(e) => failure(&e, "Could not clear events"),
    };
    panel(&state, Some(&cookie), status, Some(flash)).await
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut response = Redirect::to("/").into_response();
    if let Some(cookie) = session_cookie(&headers) {
        match state.backend.logout(&cookie).await {
            // Pass the backend's "clear cookie" headers on to the browser.
            Ok(set_cookies) => {
                for value in set_cookies {
                    response.headers_mut().append(header::SET_COOKIE, value);
                }
            }
            Err(e) => tracing::warn!("backend logout failed: {e}"),
        }
    }
    response
}
