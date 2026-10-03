use serde::Serialize;

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

#[tauri::command]
fn widget_support() -> WidgetSupport {
    widget_support_for(std::env::var("XDG_SESSION_TYPE").ok().as_deref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![widget_support])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

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
