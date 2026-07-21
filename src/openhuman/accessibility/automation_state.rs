//! Session-local denial flag for macOS Apple Events automation.
//!
//! Captures the reactive signal that osascript returns
//! `errAEEventNotPermitted (-1743)` when the calling app lacks an
//! Automation grant for the target. After observation, gated osascript
//! call sites short-circuit until the flag is cleared.
//!
//! Why a reactive flag instead of an in-process probe:
//! `AEDeterminePermissionToAutomateTarget(askUserIfNeeded=false)` would
//! be the principled silent-probe API but it SIGBUSes inside
//! AE.framework's TCC client whenever called from any binary that links
//! `openhuman_core` (PAC mismatch between arm64 Rust binaries and
//! arm64e Apple frameworks, mediated by `objc2-app-kit` transitive
//! deps). Verified across seven workarounds during #985 plan validation.
//! The osascript stderr `(-1743)` substring is a stable Apple-defined
//! error code that's already produced by the existing fallback path —
//! capturing it costs nothing extra and avoids the FFI entirely.
//!
//! `mark_system_events_denied()` / `clear()` have no production caller today:
//! their only caller was the system-wide autocomplete overlay's background
//! refresh loop (macOS AX capture of the frontmost app via osascript), which
//! was removed — see `src/openhuman/autocomplete/core/engine.rs`. The flag
//! and its `focus.rs` / `paste.rs` short-circuit checks are left in place as
//! shared, domain-agnostic infrastructure for any future osascript-driven
//! accessibility caller that wants the same -1743 short-circuit.

use std::sync::atomic::{AtomicBool, Ordering};

static SYSTEM_EVENTS_DENIED: AtomicBool = AtomicBool::new(false);

/// Mark that osascript has returned -1743 for `tell application "System
/// Events"` in this process. No production call site today (see module
/// docs); available for a future osascript-driven caller to wire up.
pub fn mark_system_events_denied() {
    SYSTEM_EVENTS_DENIED.store(true, Ordering::Relaxed);
}

/// True iff a -1743 has been observed in this process since the last
/// `clear()`. Gated osascript call sites in `focus.rs` / `paste.rs`
/// check this and short-circuit before spawning osascript.
pub fn system_events_denied() -> bool {
    SYSTEM_EVENTS_DENIED.load(Ordering::Relaxed)
}

/// Reset the denial flag. No production call site today (see module docs);
/// available for a future caller to re-probe after explicit user
/// re-engagement instead of inheriting a stale denial from a prior session.
pub fn clear() {
    SYSTEM_EVENTS_DENIED.store(false, Ordering::Relaxed);
}

#[cfg(test)]
pub(crate) fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static M: std::sync::Mutex<()> = std::sync::Mutex::new(());
    M.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_not_denied() {
        let _g = test_lock();
        clear();
        assert!(!system_events_denied());
    }

    #[test]
    fn mark_then_observe() {
        let _g = test_lock();
        clear();
        assert!(!system_events_denied());
        mark_system_events_denied();
        assert!(system_events_denied());
        clear();
        assert!(!system_events_denied());
    }

    #[test]
    fn idempotent_mark_and_clear() {
        let _g = test_lock();
        clear();
        mark_system_events_denied();
        mark_system_events_denied();
        assert!(system_events_denied());
        clear();
        clear();
        assert!(!system_events_denied());
    }

    #[test]
    fn concurrent_mark_and_read() {
        let _g = test_lock();
        clear();
        let producers: Vec<_> = (0..8)
            .map(|_| std::thread::spawn(mark_system_events_denied))
            .collect();
        let readers: Vec<_> = (0..8)
            .map(|_| std::thread::spawn(|| system_events_denied()))
            .collect();
        for h in producers {
            h.join().unwrap();
        }
        for h in readers {
            // Read may race the marks — only the post-join state is
            // load-bearing for correctness.
            let _ = h.join().unwrap();
        }
        assert!(system_events_denied());
        clear();
    }
}
