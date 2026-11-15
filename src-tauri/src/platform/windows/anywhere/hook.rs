//! The global mouse and keyboard hooks (WH_MOUSE_LL, WH_KEYBOARD_LL): the Windows side of LearnLayer/Anywhere/
//! ClickMonitor.swift @ ref 2026-11-04.
//!
//! They run on a thread of their own with its own message loop, never the interface's: Windows removes a low-level
//! hook that takes too long (`LowLevelHooksTimeout`), so each callback only decides "swallow or pass" from atomics
//! and hands the rest to a channel. Alt + left click is swallowed (down and its up), so no link opens and no text is
//! selected below; before Alt comes up, a key that means nothing is pressed (the "menu mask", as AutoHotkey does),
//! so the app below doesn't open its menu bar. Every other click passes straight through. Esc is taken only while
//! the stage is open. Every few seconds the hooks are put back: if Windows removed one, it says so (`Removed`).

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Mutex;
use std::time::Duration;

use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_CONTROL, VK_ESCAPE, VK_LMENU, VK_RMENU, VK_SHIFT, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetAncestor, GetMessageW, GetWindowThreadProcessId, PostThreadMessageW, SetTimer,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, HC_ACTION, HHOOK,
    KBDLLHOOKSTRUCT, LLKHF_INJECTED, LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_QUIT, WM_SYSKEYDOWN, WM_TIMER,
};

/// What the hooks saw, handed to the controller's thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookEvent {
    /// Alt + left click at this point (physical pixels, global).
    AltClick { x: i32, y: i32 },
    /// The keyboard alternative (Ctrl + Shift + Space): read the question under the pointer.
    ReadUnderPointer { x: i32, y: i32 },
    /// Esc while the stage is open.
    Escape,
    /// Windows had removed a hook (it answered too slowly once); it was put back.
    Removed,
}

/// An unassigned key: pressed while Alt is down, it tells the app below that Alt was not pressed alone, so its menu
/// bar stays shut. (AutoHotkey's #MenuMaskKey uses this one too; VK_NONAME is taken by some keyboards' drivers.)
const MENU_MASK_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);
/// How often the hooks are put back, in milliseconds.
const REINSTALL_EVERY: u32 = 5_000;

static ENABLED: AtomicBool = AtomicBool::new(false);
static INTERCEPTS_ESCAPE: AtomicBool = AtomicBool::new(false);
/// The left button's up that belongs to a swallowed down: swallowed too, or the app below sees a button held.
static SWALLOW_UP: AtomicBool = AtomicBool::new(false);
static OWN_PROCESS: AtomicU32 = AtomicU32::new(0);
/// The stage's own window: an Alt-click on it reads what is under it again (the stage hides first).
static OVERLAY: AtomicIsize = AtomicIsize::new(0);
static HOOK_THREAD: AtomicU32 = AtomicU32::new(0);
static SENDER: Mutex<Option<Sender<HookEvent>>> = Mutex::new(None);
static MOUSE_HOOK: AtomicIsize = AtomicIsize::new(0);
static KEYBOARD_HOOK: AtomicIsize = AtomicIsize::new(0);

pub fn set_enabled(enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
}

pub fn is_enabled() -> bool {
    ENABLED.load(Ordering::SeqCst)
}

/// While the stage is open, Esc is the stage's, whichever app has the keyboard.
pub fn set_intercepts_escape(intercepts: bool) {
    INTERCEPTS_ESCAPE.store(intercepts, Ordering::SeqCst);
}

pub fn set_overlay_window(handle: isize) {
    OVERLAY.store(handle, Ordering::SeqCst);
}

fn send(event: HookEvent) {
    // `try_lock`: a callback never waits. The channel's send itself does not block.
    if let Ok(guard) = SENDER.try_lock() {
        if let Some(sender) = guard.as_ref() {
            let _ = sender.send(event);
        }
    }
}

fn key_down(key: VIRTUAL_KEY) -> bool {
    // SAFETY: reads the key's state; no memory is touched.
    (unsafe { GetAsyncKeyState(i32::from(key.0)) } as u16 & 0x8000) != 0
}

/// Alt alone: not AltGr (Ctrl + Alt on Portuguese keyboards: @, €, {).
fn alt_alone() -> bool {
    (key_down(VK_LMENU) || key_down(VK_RMENU)) && !key_down(VK_CONTROL)
}

/// The click falls on a LearnLayer window that is not the stage: it is that window's click.
fn on_own_window(point: POINT) -> bool {
    // SAFETY: plain queries on whatever window is under the point; a stale handle only gives a wrong answer.
    unsafe {
        let hit = WindowFromPoint(point);
        if hit.is_invalid() {
            return false;
        }
        let root = GetAncestor(hit, GA_ROOT);
        let mut process = 0u32;
        GetWindowThreadProcessId(root, Some(&mut process as *mut u32));
        process == OWN_PROCESS.load(Ordering::Relaxed) && root.0 as isize != OVERLAY.load(Ordering::Relaxed)
    }
}

fn key_input(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Presses and lets go of the menu mask key while Alt is still down.
fn mask_menu() {
    let inputs = [
        key_input(MENU_MASK_KEY, KEYBD_EVENT_FLAGS(0)),
        key_input(MENU_MASK_KEY, KEYEVENTF_KEYUP),
    ];
    // SAFETY: two well-formed keyboard inputs; the size is the struct's own.
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for HC_ACTION, `lparam` points at the event's MSLLHOOKSTRUCT for the length of this call.
        let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
        let message = wparam.0 as u32;
        if info.flags & LLMHF_INJECTED == 0 {
            if message == WM_LBUTTONDOWN && ENABLED.load(Ordering::Relaxed) && alt_alone() && !on_own_window(info.pt) {
                SWALLOW_UP.store(true, Ordering::SeqCst);
                mask_menu();
                send(HookEvent::AltClick {
                    x: info.pt.x,
                    y: info.pt.y,
                });
                return LRESULT(1);
            }
            if message == WM_LBUTTONUP && SWALLOW_UP.swap(false, Ordering::SeqCst) {
                return LRESULT(1);
            }
        }
    }
    // SAFETY: passes the event on unchanged, as every hook must.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for HC_ACTION, `lparam` points at the event's KBDLLHOOKSTRUCT for the length of this call.
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let message = wparam.0 as u32;
        let down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
        if down && !info.flags.contains(LLKHF_INJECTED) {
            let key = VIRTUAL_KEY(info.vkCode as u16);
            if key == VK_ESCAPE && INTERCEPTS_ESCAPE.load(Ordering::Relaxed) {
                send(HookEvent::Escape);
                return LRESULT(1);
            }
            if key == VK_SPACE && ENABLED.load(Ordering::Relaxed) && key_down(VK_CONTROL) && key_down(VK_SHIFT) {
                let mut point = POINT::default();
                // SAFETY: writes the cursor position into a local.
                if unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) }.is_ok() {
                    send(HookEvent::ReadUnderPointer { x: point.x, y: point.y });
                    return LRESULT(1);
                }
            }
        }
    }
    // SAFETY: passes the event on unchanged.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn install() -> Result<(), String> {
    // SAFETY: the callbacks are `extern "system"` functions that live for the whole program.
    unsafe {
        let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0).map_err(|error| error.to_string())?;
        let keyboard =
            SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0).map_err(|error| error.to_string())?;
        MOUSE_HOOK.store(mouse.0 as isize, Ordering::SeqCst);
        KEYBOARD_HOOK.store(keyboard.0 as isize, Ordering::SeqCst);
    }
    Ok(())
}

/// Takes the hooks off; false when Windows had already taken one off itself.
fn uninstall() -> bool {
    let mut intact = true;
    for slot in [&MOUSE_HOOK, &KEYBOARD_HOOK] {
        let raw = slot.swap(0, Ordering::SeqCst);
        if raw != 0 {
            // SAFETY: a handle this thread got from SetWindowsHookExW.
            intact &= unsafe { UnhookWindowsHookEx(HHOOK(raw as *mut _)) }.is_ok();
        }
    }
    intact
}

/// Starts the hook thread (once). Its events go to `sender`.
pub fn start(sender: Sender<HookEvent>) -> Result<(), String> {
    *SENDER.lock().map_err(|_| "hook channel poisoned")? = Some(sender);
    if HOOK_THREAD.load(Ordering::SeqCst) != 0 {
        return Ok(());
    }
    // SAFETY: reads this process's id.
    OWN_PROCESS.store(unsafe { GetCurrentProcessId() }, Ordering::SeqCst);
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::Builder::new()
        .name("learnlayer-hooks".into())
        .spawn(move || {
            // SAFETY: this thread's own id, for PostThreadMessageW.
            HOOK_THREAD.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);
            let installed = install();
            let failed = installed.is_err();
            let _ = ready_tx.send(installed);
            if failed {
                HOOK_THREAD.store(0, Ordering::SeqCst);
                return;
            }
            // SAFETY: a thread timer (no window); its WM_TIMER comes to this loop.
            unsafe { SetTimer(None, 1, REINSTALL_EVERY, None) };
            let mut message = MSG::default();
            // SAFETY: the standard message loop of this thread; the hooks' callbacks run inside GetMessageW.
            unsafe {
                while GetMessageW(&mut message, None, 0, 0).as_bool() {
                    if message.message == WM_TIMER {
                        let intact = uninstall();
                        if install().is_err() {
                            send(HookEvent::Removed);
                            break;
                        }
                        if !intact {
                            send(HookEvent::Removed);
                        }
                        continue;
                    }
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
            uninstall();
            HOOK_THREAD.store(0, Ordering::SeqCst);
        })
        .map_err(|error| error.to_string())?;
    ready_rx
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "the hook thread did not start".to_string())?
}

/// Ends the hook thread, which takes its hooks off.
pub fn stop() {
    let thread = HOOK_THREAD.load(Ordering::SeqCst);
    if thread != 0 {
        // SAFETY: posts WM_QUIT to the hook thread's queue.
        let _ = unsafe { PostThreadMessageW(thread, WM_QUIT, WPARAM(0), LPARAM(0)) };
    }
}
