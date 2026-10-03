//! Leptos components, rendered to HTML strings on the server (no hydration, no WASM).
//! Interactivity comes from htmx swapping server-rendered fragments.

use chrono::DateTime;
use leptos::prelude::*;
use leptos::tachys::view::RenderHtml;

use crate::backend::{BackendError, CalendarEvent, Schedule, User};

const CSS: &str = include_str!("../static/style.css");

/// htmx sends the browser's IANA time zone with every form so the server can
/// interpret `datetime-local` inputs correctly.
const TZ_VALS: &str = "js:{timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone}";

/// Swap error responses too, so backend failures show up in the page instead of being dropped.
const HTMX_CONFIG: &str = r#"{"responseHandling":[{"code":".*","swap":true}]}"#;

const LOCALIZE_JS: &str = r#"
function localize(root){
  root.querySelectorAll('time[datetime]').forEach(function(t){
    var d=new Date(t.getAttribute('datetime'));
    if(!isNaN(d)) t.textContent=d.toLocaleString([], {dateStyle:'medium', timeStyle:'short'});
  });
}
localize(document);
document.body.addEventListener('htmx:afterSwap', function(e){ localize(e.target); });
"#;

pub fn render(view: impl RenderHtml) -> String {
    view.to_html()
}

pub enum Flash {
    Ok(String),
    Err(String),
}

pub struct IndexModel {
    pub backend_url: String,
    pub public_url: String,
    pub health: Result<(), BackendError>,
    pub user: Result<User, BackendError>,
    /// `None` when not signed in (the calendar call is skipped).
    pub calendar: Option<Result<Schedule, BackendError>>,
    /// Message to show above the checks (e.g. a failed sign-in reported by the backend).
    pub notice: Option<String>,
}

fn fmt_utc(ts: &str) -> String {
    DateTime::parse_from_rfc3339(ts)
        .map(|d| d.format("%b %-d, %Y %H:%M UTC").to_string())
        .unwrap_or_else(|_| ts.to_string())
}

pub fn index_page(m: IndexModel) -> String {
    let body = match &m.user {
        Ok(user) => signed_in(user, m.calendar.as_ref()).into_any(),
        Err(_) => signed_out(&m.public_url).into_any(),
    };
    let checks = checks(&m);
    let backend_url = m.backend_url.clone();
    let notice = m
        .notice
        .clone()
        .map(|n| view! { <p class="flash fail">{n}</p> });

    let doc = view! {
        <html lang="en">
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <meta name="htmx-config" content=HTMX_CONFIG/>
                <title>"OAuth check"</title>
                <style inner_html=CSS></style>
                <script src="/static/htmx.min.js"></script>
            </head>
            <body>
                <header>
                    <h1>"OAuth check"</h1>
                    <p class="muted">
                        "Axum + Leptos (SSR) + htmx, talking to " <code>{backend_url}</code>
                    </p>
                </header>
                <main>{notice} {checks} {body}</main>
                <script inner_html=LOCALIZE_JS></script>
            </body>
        </html>
    };
    format!("<!DOCTYPE html>{}", render(doc))
}

struct Check {
    label: &'static str,
    state: &'static str, // "ok" | "fail" | "skip"
    detail: String,
}

fn checks(m: &IndexModel) -> impl IntoView + use<> {
    let backend = match &m.health {
        Ok(()) => Check { label: "Express backend reachable", state: "ok", detail: m.backend_url.clone() },
        Err(e) => Check { label: "Express backend reachable", state: "fail", detail: e.to_string() },
    };
    let login = match &m.user {
        Ok(u) => Check { label: "Google OAuth session", state: "ok", detail: format!("Signed in as {}", u.email) },
        Err(e) if m.health.is_ok() => Check { label: "Google OAuth session", state: "fail", detail: e.to_string() },
        Err(_) => Check { label: "Google OAuth session", state: "skip", detail: "Backend unreachable".into() },
    };
    let calendar = match &m.calendar {
        Some(Ok(s)) => Check {
            label: "Google Calendar via OAuth token",
            state: "ok",
            detail: format!("Fetched {} event(s)", s.events.len()),
        },
        Some(Err(e)) => Check { label: "Google Calendar via OAuth token", state: "fail", detail: e.to_string() },
        None => Check { label: "Google Calendar via OAuth token", state: "skip", detail: "Sign in first".into() },
    };

    let rows = [backend, login, calendar]
        .into_iter()
        .map(|c| {
            let class = format!("check {}", c.state);
            let mark = match c.state {
                "ok" => "✓",
                "fail" => "✗",
                _ => "–",
            };
            view! {
                <li class=class>
                    <span class="mark">{mark}</span>
                    <span class="label">{c.label}</span>
                    <span class="detail">{c.detail}</span>
                </li>
            }
        })
        .collect_view();

    view! {
        <section class="card">
            <h2>"Status"</h2>
            <ul class="checks">{rows}</ul>
        </section>
    }
}

fn signed_out(public_url: &str) -> impl IntoView + use<> {
    let href = format!("{public_url}/auth/google");
    view! {
        <section class="card">
            <h2>"Sign in"</h2>
            <p>
                "Sign in through the backend's Google OAuth flow. After consent you're sent back here with a session cookie."
            </p>
            <a class="button" href=href>"Sign in with Google"</a>
            <p class="muted">
                "Open this page as " <code>"localhost"</code> " (not 127.0.0.1) so the session cookie set by the backend is also sent to this server."
            </p>
        </section>
    }
}

fn signed_in(user: &User, calendar: Option<&Result<Schedule, BackendError>>) -> impl IntoView + use<> {
    let name = if user.name.is_empty() { user.email.clone() } else { user.name.clone() };
    let email = user.email.clone();
    let picture = user.picture.clone();
    let panel = match calendar {
        Some(result) => calendar_panel(result, None).into_any(),
        None => ().into_any(),
    };

    view! {
        <section class="card user">
            {(!picture.is_empty())
                .then(|| view! { <img class="avatar" src=picture referrerpolicy="no-referrer" alt=""/> })}
            <div>
                <strong>{name}</strong>
                <div class="muted">{email}</div>
            </div>
            <form method="post" action="/logout">
                <button class="secondary" type="submit">"Log out"</button>
            </form>
        </section>

        <section class="card">
            <h2>"Calendar"</h2>
            <p class="muted">
                "Your primary Google Calendar, read live by the backend with this user's OAuth token: the last 7 days and next 30 days, whoever created the events."
            </p>
            <div id="calendar">{panel}</div>
        </section>

        <section class="card">
            <h2>"Add an event"</h2>
            <p class="muted">"Stored through the backend (POST /schedule/events) into Google Calendar."</p>
            <form
                hx-post="/events"
                hx-target="#calendar"
                hx-swap="innerHTML"
                hx-vals=TZ_VALS
                hx-disabled-elt="find button"
            >
                <label>"Name" <input name="name" required maxlength="200"/></label>
                <label>"Description" <input name="description" maxlength="2000"/></label>
                <div class="row">
                    <label>"Start" <input type="datetime-local" name="start" required/></label>
                    <label>"End" <input type="datetime-local" name="stop" required/></label>
                    <label>"Color" <input type="color" name="color" value="#4285f4"/></label>
                </div>
                <button type="submit">"Add to Google Calendar"</button>
            </form>
        </section>

        <section class="card">
            <h2>"Generate with Gemini"</h2>
            <p class="muted">
                "POST /schedule/generate: Gemini builds a schedule from your request, and the backend creates it in Google Calendar, replacing the previously generated one."
            </p>
            <form
                hx-post="/generate"
                hx-target="#calendar"
                hx-swap="innerHTML"
                hx-vals=TZ_VALS
                hx-disabled-elt="find button"
                hx-indicator="#generating"
            >
                <label>
                    "What do you want scheduled?"
                    <textarea
                        name="prompt"
                        rows="3"
                        required
                        maxlength="2000"
                        placeholder="Gym 3x this week, 2 hours of study each weekday evening, nothing before 8am"
                    ></textarea>
                </label>
                <button type="submit">"Generate"</button>
                <span id="generating" class="htmx-indicator muted">" Asking Gemini… this can take a few seconds."</span>
            </form>
        </section>
    }
}

/// The contents of `#calendar`. Also returned on its own as the htmx fragment.
pub fn calendar_panel(result: &Result<Schedule, BackendError>, flash: Option<Flash>) -> impl IntoView + use<> {
    let flash = flash.map(|f| match f {
        Flash::Ok(m) => view! { <p class="flash ok">{m}</p> }.into_any(),
        Flash::Err(m) => view! { <p class="flash fail">{m}</p> }.into_any(),
    });

    let content = match result {
        Ok(s) => {
            let status = format!("GET /schedule → 200 OK · {} event(s)", s.events.len());
            let list = if s.events.is_empty() {
                view! { <p class="muted">"No events in this window. Add one below."</p> }.into_any()
            } else {
                let rows = s.events.iter().map(event_row).collect_view();
                view! { <ul class="events">{rows}</ul> }.into_any()
            };
            let raw = s.raw_json.clone();
            view! {
                <p class="muted status-line">{status}</p>
                {list}
                <details open>
                    <summary>"Raw JSON from the backend"</summary>
                    <pre>{raw}</pre>
                </details>
            }
            .into_any()
        }
        Err(e) => {
            let msg = e.to_string();
            view! {
                <p class="flash fail">{msg}</p>
                <p class="muted">
                    "If the Google token expired or was revoked, sign in again."
                </p>
            }
            .into_any()
        }
    };

    view! {
        {flash}
        {content}
        <div class="actions">
            <button class="secondary" hx-get="/calendar" hx-target="#calendar" hx-swap="innerHTML">
                "Refresh"
            </button>
            <button
                class="secondary danger"
                hx-post="/clear"
                hx-target="#calendar"
                hx-swap="innerHTML"
                hx-confirm="Delete every event this app created in your Google Calendar?"
            >
                "Clear app events"
            </button>
        </div>
    }
}

fn event_row(e: &CalendarEvent) -> impl IntoView + use<> {
    let swatch = format!("background:{}", e.safe_color());
    let name = e.name.clone();
    let description = e.description.clone();
    let (start, stop) = (e.start.clone(), e.stop.clone());
    let (start_txt, stop_txt) = (fmt_utc(&e.start), fmt_utc(&e.stop));

    view! {
        <li class="event">
            <span class="swatch" style=swatch></span>
            <div>
                <strong>{name}</strong>
                <div class="muted">
                    <time datetime=start>{start_txt}</time>
                    " → "
                    <time datetime=stop>{stop_txt}</time>
                </div>
                {(!description.is_empty()).then(|| view! { <p>{description}</p> })}
            </div>
        </li>
    }
}
