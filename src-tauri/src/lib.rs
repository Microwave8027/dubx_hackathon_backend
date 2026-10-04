use serde::Serialize;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[derive(Serialize)]
struct WidgetSupport {
    supported: bool,
    reason: Option<String>,
}

/// The desktop widget needs an always-on-top window, which Wayland does not support
/// (tao: "set_always_on_top: Linux(Wayland) unsupported"). The tray stays the fallback there.
fn widget_support_for(session_type: Option<&str>) -> WidgetSupport {
    let wayland = cfg!(target_os = "linux")
        && session_type.is_some_and(|s| s.eq_ignore_ascii_case("wayland"));
    if wayland {
        WidgetSupport {
            supported: false,
            reason: Some(
                "Wayland does not allow always-on-top windows, so the widget is off. The tray icon still shows status."
                    .into(),
            ),
        }
    } else {
        WidgetSupport {
            supported: true,
            reason: None,
        }
    }
}

/// Opens an https URL in the system browser. Only https is accepted, so the UI cannot be tricked
/// into launching a local file or another app through a crafted link.
fn open_external_checked(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_control() || c == ' ') {
        return Err("only https links can be opened".into());
    }
    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![url])
    } else if cfg!(target_os = "windows") {
        ("rundll32", vec!["url.dll,FileProtocolHandler", url])
    } else {
        ("xdg-open", vec![url])
    };
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_external_checked(&url)
}

#[tauri::command]
fn widget_support() -> WidgetSupport {
    widget_support_for(std::env::var("XDG_SESSION_TYPE").ok().as_deref())
}

/// The widget shows while the main window is hidden or minimized. Tauri reports neither as an
/// event, and a hidden or minimized webview does not run JS timers, so a plain Rust thread checks
/// once a second and tells the widget when it changes. (The main webview also reports focus and
/// resize changes immediately; this is the backstop.)
fn watch_main_window(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<bool> = None;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(main) = app.get_webview_window("main") else {
                continue;
            };
            let visible = main.is_visible().unwrap_or(true) && !main.is_minimized().unwrap_or(false);
            if last != Some(visible) {
                last = Some(visible);
                let _ = app.emit_to("widget", "widget:main-visibility", serde_json::json!({ "visible": visible }));
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![widget_support, open_external])
        .setup(|app| {
            watch_main_window(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_links_can_be_opened() {
        for bad in ["http://a.example", "file:///etc/passwd", "javascript:alert(1)", "https://a b", "", "https://a\n"] {
            assert!(open_external_checked(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn x11_and_unset_sessions_are_supported() {
        assert!(widget_support_for(Some("x11")).supported);
        assert!(widget_support_for(None).supported);
    }

    #[test]
    fn wayland_is_unsupported_on_linux_only() {
        let support = widget_support_for(Some("wayland"));
        assert_eq!(support.supported, !cfg!(target_os = "linux"));
        if cfg!(target_os = "linux") {
            assert!(support.reason.is_some());
        }
    }
}
