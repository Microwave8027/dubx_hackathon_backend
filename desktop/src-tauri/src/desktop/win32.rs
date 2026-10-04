//! Native Windows window handling.

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Storage::Packaging::Appx::GetApplicationUserModelId;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetWindowPlacement, GetWindowThreadProcessId, IsWindow, PostMessageW,
    SetForegroundWindow, SetWindowPlacement, SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SW_SHOWMAXIMIZED, SW_SHOWMINIMIZED, SW_SHOWNORMAL, WINDOWPLACEMENT, WM_CLOSE,
};

use super::{LaunchSpec, OpenWindow};

// Shell surfaces that look like windows but must never be saved or closed
// (WM_CLOSE to the desktop or taskbar opens the "Shut down Windows" dialog).
const SHELL_CLASSES: &[&str] = &[
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "Progman",
    "WorkerW",
    "Windows.UI.Core.CoreWindow",
    "XamlExplorerHostIslandWindow",
    "TopLevelWindowForOverflowXamlIsland",
    "NotifyIconOverflowWindow",
];

/// xcap reports the HWND truncated to 32 bits; handles are 32-bit significant and sign-extended.
fn hwnd(id: u32) -> HWND {
    HWND(id as i32 as isize as *mut core::ffi::c_void)
}

fn class_name(h: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetClassNameW(h, &mut buf) };
    String::from_utf16_lossy(&buf[..len.max(0) as usize])
}

fn owner_pid(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    pid
}

fn placement(h: HWND) -> Option<WINDOWPLACEMENT> {
    let mut wp = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    unsafe { GetWindowPlacement(h, &mut wp) }.ok().map(|_| wp)
}

/// The AppUserModelID of a packaged (Microsoft Store / MSIX) process. Packaged apps can't be
/// started from their exe path; they're launched via `shell:AppsFolder\<AUMID>` instead.
pub fn app_user_model_id(pid: u32) -> Option<String> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 256]; // APPLICATION_USER_MODEL_ID_MAX_LENGTH is 130
        let mut len = buf.len() as u32;
        let rc = GetApplicationUserModelId(process, &mut len, Some(PWSTR(buf.as_mut_ptr())));
        let _ = CloseHandle(process);
        // `len` includes the terminating NUL.
        (rc == ERROR_SUCCESS && len > 1).then(|| String::from_utf16_lossy(&buf[..len as usize - 1]))
    }
}

pub fn is_app_window(id: u32) -> bool {
    !SHELL_CLASSES.contains(&class_name(hwnd(id)).as_str())
}

/// Replaces the on-screen bounds with the restore rectangle, which is meaningful even for
/// minimized (-32000,-32000) and maximized windows and round-trips through SetWindowPlacement.
pub fn use_restore_rect(w: &mut OpenWindow) {
    if let Some(wp) = placement(hwnd(w.id)) {
        let r = wp.rcNormalPosition;
        if r.right > r.left && r.bottom > r.top {
            w.x = r.left;
            w.y = r.top;
            w.width = (r.right - r.left) as u32;
            w.height = (r.bottom - r.top) as u32;
        }
    }
}

/// Posts WM_CLOSE after checking the handle still belongs to the same process.
pub fn close_window(id: u32, pid: u32) -> bool {
    is_same_window(id, pid) && unsafe { PostMessageW(Some(hwnd(id)), WM_CLOSE, WPARAM(0), LPARAM(0)) }.is_ok()
}

/// Whether the handle still names a window of `pid` that we may touch.
fn is_same_window(id: u32, pid: u32) -> bool {
    let h = hwnd(id);
    let exists = unsafe { IsWindow(Some(h)).as_bool() };
    exists && owner_pid(h) == pid && is_app_window(id)
}

/// Restores an already-open window to a saved placement (position, size, min/max state).
pub fn arrange_window(id: u32, pid: u32, spec: &LaunchSpec) -> bool {
    if !is_same_window(id, pid) {
        return false;
    }
    place_window(id, spec);
    true
}

/// Raises the windows in order (first ends up on top) and focuses the first one. Only the
/// foreground app may move focus, so the rest are raised in z-order without being activated.
pub fn bring_to_front(ids: &[u32]) {
    for &id in ids.iter().skip(1).rev() {
        let _ = unsafe { SetWindowPos(hwnd(id), Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) };
    }
    if let Some(&first) = ids.first() {
        let _ = unsafe { SetForegroundWindow(hwnd(first)) };
    }
}

pub fn place_window(id: u32, spec: &LaunchSpec) {
    let h = hwnd(id);
    let Some(mut wp) = placement(h) else { return };
    // Without a saved size, only the min/max state is restored.
    if spec.width > 0 && spec.height > 0 {
        wp.rcNormalPosition = RECT {
            left: spec.x,
            top: spec.y,
            right: spec.x + spec.width as i32,
            bottom: spec.y + spec.height as i32,
        };
    }
    let show = if spec.is_maximized {
        SW_SHOWMAXIMIZED
    } else if spec.is_minimized {
        SW_SHOWMINIMIZED
    } else {
        SW_SHOWNORMAL
    };
    wp.showCmd = show.0 as u32;
    let _ = unsafe { SetWindowPlacement(h, &wp) };
}
