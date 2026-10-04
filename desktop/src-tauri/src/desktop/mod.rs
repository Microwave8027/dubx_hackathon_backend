//! Open-window snapshots (xcap), closing windows, and launching apps.
//! Windows gets native Win32 handling (graceful WM_CLOSE, restore geometry, window placement);
//! other platforms fall back to signals and leave placement to the window manager.

#[cfg(windows)]
mod win32;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// A top-level window that is open right now.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWindow {
    /// Native window id (the HWND on Windows). Only valid while the window exists.
    pub id: u32,
    pub pid: u32,
    pub app_name: String,
    pub title: String,
    /// Executable path; empty when the OS won't tell us (e.g. elevated processes).
    pub exe_path: String,
    /// Windows AppUserModelID for packaged (Store/MSIX) apps, which must be launched through it.
    pub aumid: String,
    /// On Windows: the restore ("normal") rectangle, so minimized/maximized windows keep a usable size.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub is_focused: bool,
    pub monitor: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloseTarget {
    pub id: u32,
    pub pid: u32,
}

#[derive(Debug, Serialize)]
pub struct CloseReport {
    pub closed: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSpec {
    #[serde(default)]
    pub exe_path: String,
    #[serde(default)]
    pub aumid: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub is_minimized: bool,
    #[serde(default)]
    pub is_maximized: bool,
}

/// An open window to put back where a saved window was.
#[derive(Debug, Clone, Deserialize)]
pub struct ArrangeTarget {
    pub id: u32,
    pub pid: u32,
    #[serde(flatten)]
    pub placement: LaunchSpec,
}

#[derive(Debug, Serialize)]
pub struct ArrangeReport {
    pub arranged: usize,
    pub skipped: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub exe_path: String,
    pub ok: bool,
    pub error: Option<String>,
}

/// Every visible, titled top-level window except our own and the OS shell's.
pub fn snapshot() -> Result<Vec<OpenWindow>, String> {
    let own_pid = std::process::id();
    let mut out = Vec::new();
    for w in xcap::Window::all().map_err(|e| format!("Couldn't list windows: {e}"))? {
        let (Ok(id), Ok(pid)) = (w.id(), w.pid()) else { continue };
        if pid == own_pid {
            continue;
        }
        let title = w.title().unwrap_or_default();
        if title.trim().is_empty() {
            continue;
        }
        #[cfg(windows)]
        if !win32::is_app_window(id) {
            continue;
        }
        let mut window = OpenWindow {
            id,
            pid,
            app_name: w.app_name().unwrap_or_default(),
            title,
            exe_path: String::new(),
            aumid: String::new(),
            x: w.x().unwrap_or(0),
            y: w.y().unwrap_or(0),
            width: w.width().unwrap_or(0),
            height: w.height().unwrap_or(0),
            is_minimized: w.is_minimized().unwrap_or(false),
            is_maximized: w.is_maximized().unwrap_or(false),
            is_focused: w.is_focused().unwrap_or(false),
            monitor: w.current_monitor().and_then(|m| m.name()).unwrap_or_default(),
        };
        #[cfg(windows)]
        win32::use_restore_rect(&mut window);
        out.push(window);
    }
    fill_exe_paths(&mut out);
    #[cfg(windows)]
    {
        let mut cache: HashMap<u32, String> = HashMap::new();
        for w in out.iter_mut() {
            w.aumid = cache
                .entry(w.pid)
                .or_insert_with(|| win32::app_user_model_id(w.pid).unwrap_or_default())
                .clone();
        }
    }
    Ok(out)
}

fn fill_exe_paths(windows: &mut [OpenWindow]) {
    let pids: Vec<Pid> = windows
        .iter()
        .map(|w| Pid::from_u32(w.pid))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    let mut cache: HashMap<u32, String> = HashMap::new();
    for w in windows.iter_mut() {
        let exe = cache
            .entry(w.pid)
            .or_insert_with(|| {
                sys.process(Pid::from_u32(w.pid))
                    .and_then(|p| p.exe())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default()
            })
            .clone();
        if w.app_name.trim().is_empty() {
            w.app_name = Path::new(&exe)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Unknown app".into());
        }
        w.exe_path = exe;
    }
}

/// Asks the windows to close. On Windows this is a graceful WM_CLOSE, so apps can still
/// prompt to save; elsewhere the owning processes get SIGTERM.
pub fn close(targets: &[CloseTarget]) -> CloseReport {
    let own_pid = std::process::id();
    let mut closed = 0;
    let mut skipped = 0;

    #[cfg(windows)]
    for t in targets {
        if t.pid != own_pid && win32::close_window(t.id, t.pid) {
            closed += 1;
        } else {
            skipped += 1;
        }
    }

    #[cfg(not(windows))]
    {
        let pids: HashSet<u32> = targets.iter().map(|t| t.pid).filter(|&p| p != own_pid).collect();
        skipped += targets.len() - targets.iter().filter(|t| pids.contains(&t.pid)).count();
        let mut sys = System::new();
        let list: Vec<Pid> = pids.iter().map(|&p| Pid::from_u32(p)).collect();
        sys.refresh_processes_specifics(ProcessesToUpdate::Some(&list), true, ProcessRefreshKind::nothing());
        for pid in pids {
            let ok = sys
                .process(Pid::from_u32(pid))
                .and_then(|p| p.kill_with(sysinfo::Signal::Term))
                .unwrap_or(false);
            let n = targets.iter().filter(|t| t.pid == pid).count();
            if ok { closed += n } else { skipped += n }
        }
    }

    CloseReport { closed, skipped }
}

/// Moves already-open windows to their saved placement and raises them (first on top, focused).
/// Window placement is native to Windows; elsewhere this is a no-op the UI reports as skipped.
pub fn arrange(targets: &[ArrangeTarget]) -> ArrangeReport {
    #[cfg(windows)]
    {
        let mut arranged = Vec::new();
        for t in targets {
            if win32::arrange_window(t.id, t.pid, &t.placement) {
                arranged.push(t);
            }
        }
        let front: Vec<u32> = arranged.iter().filter(|t| !t.placement.is_minimized).map(|t| t.id).collect();
        win32::bring_to_front(&front);
        ArrangeReport { arranged: arranged.len(), skipped: targets.len() - arranged.len() }
    }
    #[cfg(not(windows))]
    {
        ArrangeReport { arranged: 0, skipped: targets.len() }
    }
}

/// Starts each app, then (on Windows) moves its new window to the saved position in the background.
pub fn launch(apps: Vec<LaunchSpec>) -> Vec<LaunchResult> {
    let existing: HashSet<u32> = snapshot().unwrap_or_default().iter().map(|w| w.id).collect();
    let mut results = Vec::new();
    let mut started = Vec::new();

    for spec in apps {
        let result = spawn(&spec);
        if result.is_ok() {
            started.push(spec.clone());
        }
        results.push(LaunchResult {
            exe_path: spec.exe_path.clone(),
            ok: result.is_ok(),
            error: result.err(),
        });
    }

    let to_place: Vec<LaunchSpec> = started.into_iter().filter(|s| s.width > 0 && s.height > 0).collect();
    if !to_place.is_empty() {
        std::thread::spawn(move || place_new_windows(existing, to_place));
    }
    results
}

fn spawn(spec: &LaunchSpec) -> Result<(), String> {
    #[cfg(windows)]
    if !spec.aumid.is_empty() {
        // Packaged apps start through the shell; their window still reports the real exe path.
        let valid = spec.aumid.chars().all(|c| c.is_ascii_alphanumeric() || "._-!".contains(c));
        if !valid {
            return Err(format!("Invalid app id {}", spec.aumid));
        }
        return Command::new("explorer.exe")
            .arg(format!("shell:AppsFolder\\{}", spec.aumid))
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Couldn't start {}: {e}", spec.aumid));
    }
    let exe = Path::new(&spec.exe_path);
    if !exe.is_file() {
        return Err(format!("{} wasn't found", spec.exe_path));
    }
    let mut cmd = Command::new(exe);
    cmd.args(&spec.args);
    if let Some(dir) = exe.parent() {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Couldn't start {}: {e}", spec.exe_path))
}

/// Waits for windows of the launched executables to appear and applies their saved geometry.
fn place_new_windows(existing: HashSet<u32>, mut pending: Vec<LaunchSpec>) {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut used = existing;
    while !pending.is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(500));
        let Ok(windows) = snapshot() else { continue };
        pending.retain(|spec| {
            let found = windows.iter().find(|w| {
                !used.contains(&w.id) && w.exe_path.eq_ignore_ascii_case(&spec.exe_path)
            });
            match found {
                Some(w) => {
                    used.insert(w.id);
                    #[cfg(windows)]
                    win32::place_window(w.id, spec);
                    false
                }
                None => true,
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Touches real windows, so it only runs on request: `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn snapshot_launch_place_close() {
        let windows = snapshot().expect("snapshot");
        println!("{} open windows", windows.len());
        for w in windows.iter().take(8) {
            println!("  {:>8} pid={:<6} {:<20} {:?} {}x{}@{},{} exe={} aumid={}", w.id, w.pid, w.app_name, w.title, w.width, w.height, w.x, w.y, w.exe_path, w.aumid);
        }
        assert!(windows.iter().all(|w| w.pid != std::process::id()));
        assert!(windows.iter().all(|w| win32::is_app_window(w.id)), "shell windows leaked into the snapshot");

        let exe = r"C:\Windows\System32\charmap.exe";
        let find = |before: &HashSet<u32>| {
            for _ in 0..40 {
                std::thread::sleep(Duration::from_millis(250));
                if let Some(w) = snapshot().unwrap().into_iter().find(|w| !before.contains(&w.id) && w.exe_path.eq_ignore_ascii_case(exe)) {
                    return Some(w);
                }
            }
            None
        };
        let before: HashSet<u32> = windows.iter().map(|w| w.id).collect();
        let spec = LaunchSpec { exe_path: exe.into(), aumid: String::new(), args: vec![], x: 0, y: 0, width: 0, height: 0, is_minimized: false, is_maximized: false };
        let results = launch(vec![spec.clone()]);
        assert!(results[0].ok, "{:?}", results[0].error);
        let opened = find(&before).expect("charmap window never appeared");
        println!("launched: {} {}x{}@{},{}", opened.title, opened.width, opened.height, opened.x, opened.y);

        let target = LaunchSpec { x: opened.x + 60, y: opened.y + 40, width: opened.width, height: opened.height, ..spec };
        win32::place_window(opened.id, &target);
        let moved = snapshot().unwrap().into_iter().find(|w| w.id == opened.id).expect("window vanished");
        println!("moved to {},{}", moved.x, moved.y);
        assert_eq!((moved.x, moved.y), (target.x, target.y));

        let report = close(&[CloseTarget { id: opened.id, pid: opened.pid }]);
        assert_eq!(report.closed, 1);
        std::thread::sleep(Duration::from_millis(800));
        assert!(snapshot().unwrap().iter().all(|w| w.id != opened.id), "window still open after WM_CLOSE");

        // A stale handle/pid pair must be refused.
        assert_eq!(close(&[CloseTarget { id: opened.id, pid: opened.pid }]).skipped, 1);

        // Packaged (Store) apps launch through their AppUserModelID.
        let before: HashSet<u32> = snapshot().unwrap().iter().map(|w| w.id).collect();
        let calc = LaunchSpec { exe_path: String::new(), aumid: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App".into(), ..target };
        assert!(launch(vec![calc])[0].ok);
        let mut found = None;
        for _ in 0..40 {
            std::thread::sleep(Duration::from_millis(250));
            found = snapshot().unwrap().into_iter().find(|w| !before.contains(&w.id) && w.title.contains("Calculator"));
            if found.is_some() { break; }
        }
        let calc = found.expect("Calculator never appeared");
        println!("store app: {} exe={}", calc.title, calc.exe_path);
        assert_eq!(close(&[CloseTarget { id: calc.id, pid: calc.pid }]).closed, 1);
    }
}
