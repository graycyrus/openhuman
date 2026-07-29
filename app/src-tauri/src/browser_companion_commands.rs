//! Tauri commands for the bundled Browser Companion Chrome extension.
//!
//! The extension ships unpacked (`vendor/tinyflows/extension/dist/`) via the
//! `bundle.resources` entry `"../../vendor/tinyflows/extension/dist"` in
//! `tauri.conf.json`. Chrome's "Load unpacked" flow needs a *stable*
//! filesystem path handed to the user, but the resource copy Tauri places
//! under `resource_dir()` lives inside the app bundle / Cargo build
//! artifacts — on macOS that's inside the signed `.app`, and in every case
//! it can be removed/replaced by a future install. So on first use we copy
//! the bundled files into an app-managed directory under `app_data_dir()`
//! (survives updates, outside the bundle) and hand back *that* path.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::AppRuntime;

/// Directory name under `app_data_dir()` where the extension is
/// materialized for Chrome's "Load unpacked" flow.
const MATERIALIZED_DIR_NAME: &str = "browser-extension";

/// `chrome://extensions` can't be reached through a generic URL opener —
/// Chrome resolves `chrome://` URLs itself, and most desktop URL-open
/// mechanisms (`tauri-plugin-opener`, `xdg-open`, `ShellExecute`) refuse or
/// mishandle scheme-less internal-page URLs. So we launch Chrome directly.
const CHROME_EXTENSIONS_URL: &str = "chrome://extensions";

/// Tauri command — resolve the bundled Chrome extension, materialize it
/// into a stable app-managed directory, and return that directory's
/// absolute path for the Settings UI to show under "Load unpacked".
#[tauri::command]
pub async fn browser_companion_extension_path(
    app: tauri::AppHandle<AppRuntime>,
) -> Result<String, String> {
    log::info!("[browser_companion] browser_companion_extension_path: resolving bundled extension");

    let source_dir = resolve_bundled_extension_source(&app)?;

    let app_data_dir = app.path().app_data_dir().map_err(|err| {
        let msg = format!("[browser_companion] failed to resolve app_data_dir: {err}");
        log::warn!("{msg}");
        msg
    })?;
    let materialized_dir = app_data_dir.join(MATERIALIZED_DIR_NAME);

    log::debug!(
        "[browser_companion] materializing extension from {} to {}",
        source_dir.display(),
        materialized_dir.display()
    );
    materialize_directory(&source_dir, &materialized_dir).map_err(|err| {
        let msg = format!(
            "[browser_companion] failed to materialize extension from {} to {}: {err}",
            source_dir.display(),
            materialized_dir.display()
        );
        log::warn!("{msg}");
        msg
    })?;

    log::info!(
        "[browser_companion] extension materialized at {}",
        materialized_dir.display()
    );
    Ok(materialized_dir.display().to_string())
}

/// Tauri command — reveal the materialized extension directory in the OS
/// file manager (Finder / Explorer / whatever `xdg-open` resolves to),
/// reusing the exact mechanism `workspace_paths::reveal_workspace_path`
/// uses (`tauri_plugin_opener::reveal_item_in_dir`).
#[tauri::command]
pub async fn browser_companion_reveal_extension(
    app: tauri::AppHandle<AppRuntime>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|err| {
        let msg = format!("[browser_companion] failed to resolve app_data_dir: {err}");
        log::warn!("{msg}");
        msg
    })?;
    let materialized_dir = app_data_dir.join(MATERIALIZED_DIR_NAME);

    if !materialized_dir.is_dir() {
        let msg = format!(
            "browser extension has not been set up yet (expected {}). Open the Browser \
             Companion settings panel first so it can be materialized.",
            materialized_dir.display()
        );
        log::warn!("[browser_companion] {msg}");
        return Err(msg);
    }

    log::info!(
        "[browser_companion] browser_companion_reveal_extension: revealing {}",
        materialized_dir.display()
    );
    tauri_plugin_opener::reveal_item_in_dir(&materialized_dir).map_err(|err| {
        let msg = format!(
            "[browser_companion] failed to reveal extension directory {}: {err}",
            materialized_dir.display()
        );
        log::warn!("{msg}");
        msg
    })
}

/// Tauri command — best-effort launch of Chrome pointed at
/// `chrome://extensions` so the user can flip on Developer Mode and load
/// the unpacked extension. Never panics; if no Chrome/Chromium executable
/// is found, returns an `Err` telling the user to navigate there manually.
#[tauri::command]
pub async fn browser_companion_open_chrome_extensions() -> Result<(), String> {
    log::info!(
        "[browser_companion] browser_companion_open_chrome_extensions: attempting to launch Chrome"
    );

    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("open")
            .args(["-a", "Google Chrome", CHROME_EXTENSIONS_URL])
            .spawn()
        {
            Ok(_) => {
                log::info!("[browser_companion] launched Google Chrome via `open -a`");
                Ok(())
            }
            Err(err) => {
                let msg = format!(
                    "failed to launch Google Chrome ({err}). Open {CHROME_EXTENSIONS_URL} \
                     manually in Chrome."
                );
                log::warn!("[browser_companion] {msg}");
                Err(msg)
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match std::process::Command::new("cmd")
            .args(["/c", "start", "chrome", CHROME_EXTENSIONS_URL])
            .spawn()
        {
            Ok(_) => {
                log::info!("[browser_companion] launched Chrome via `cmd /c start chrome`");
                Ok(())
            }
            Err(err) => {
                let msg = format!(
                    "failed to launch Chrome ({err}). Open {CHROME_EXTENSIONS_URL} manually \
                     in Chrome."
                );
                log::warn!("[browser_companion] {msg}");
                Err(msg)
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let browsers: &[&str] = &[
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
        ];
        for browser in browsers {
            match std::process::Command::new(browser)
                .arg(CHROME_EXTENSIONS_URL)
                .spawn()
            {
                Ok(_) => {
                    log::info!("[browser_companion] launched {browser} for chrome://extensions");
                    return Ok(());
                }
                Err(err) => {
                    log::debug!(
                        "[browser_companion] {browser} not found or failed to launch: {err}"
                    );
                }
            }
        }
        let msg = format!(
            "no Chrome/Chromium executable found (tried {}). Open {CHROME_EXTENSIONS_URL} \
             manually.",
            browsers.join(", ")
        );
        log::warn!("[browser_companion] {msg}");
        Err(msg)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let msg = format!(
            "browser_companion_open_chrome_extensions is not supported on this platform. Open \
             {CHROME_EXTENSIONS_URL} manually."
        );
        log::warn!("[browser_companion] {msg}");
        Err(msg)
    }
}

/// Resolve the bundled extension's on-disk source directory under
/// `resource_dir()`.
///
/// `tauri.conf.json` declares the resource as the plain (non-mapped) list
/// entry `"../../vendor/tinyflows/extension/dist"`. For plain list entries,
/// Tauri's bundler (`tauri_utils::resources::resource_relpath`, invoked from
/// both `tauri-build`'s dev-mode resource copy and the packaged bundler)
/// computes each resource's destination under `resource_dir()` by walking
/// the *entire* configured path and replacing every `..` path component
/// with a literal `_up_` segment — it does not collapse to the directory's
/// basename. Two `..` components in our configured path become two `_up_`
/// segments, so the extension lands at
/// `resource_dir()/_up_/_up_/vendor/tinyflows/extension/dist/`. This layout
/// is identical in `cargo tauri dev` and packaged builds, since both copy
/// into the same directory `resource_dir()` resolves to at runtime.
///
/// We still probe a couple of candidates defensively (mirroring the
/// multi-candidate style in `mascot_native_window::resolve_page_source`)
/// in case a future bundler version changes this scheme.
fn resolve_bundled_extension_source(app: &tauri::AppHandle<AppRuntime>) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|err| {
        let msg = format!("[browser_companion] failed to resolve resource_dir: {err}");
        log::warn!("{msg}");
        msg
    })?;

    let candidates = [
        resource_dir
            .join("_up_")
            .join("_up_")
            .join("vendor")
            .join("tinyflows")
            .join("extension")
            .join("dist"),
        resource_dir
            .join("vendor")
            .join("tinyflows")
            .join("extension")
            .join("dist"),
    ];

    for candidate in &candidates {
        if candidate.join("manifest.json").is_file() {
            log::debug!(
                "[browser_companion] resolved bundled extension source at {}",
                candidate.display()
            );
            return Ok(candidate.clone());
        }
    }

    let msg = format!(
        "browser extension resource not found under resource_dir={} (checked {} candidate \
         path(s) — is \"../../vendor/tinyflows/extension/dist\" still listed in \
         tauri.conf.json's bundle.resources?)",
        resource_dir.display(),
        candidates.len()
    );
    log::warn!("[browser_companion] {msg}");
    Err(msg)
}

/// Recursively copies every file from `src` into `dest`, creating `dest`
/// (and any nested subdirectories) as needed. Overwrites existing files so
/// a newer bundled extension always replaces a previously materialized
/// copy. Pure filesystem helper with no Tauri dependency, so it is unit
/// tested directly below without spinning up an `AppHandle`.
fn materialize_directory(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dest_path = dest.join(entry.file_name());
        if file_type.is_dir() {
            materialize_directory(&entry.path(), &dest_path)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &dest_path)?;
        }
        // Symlinks are neither: the extension dist is plain files, so we
        // skip anything else rather than guess at copy semantics.
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn materialize_directory_copies_flat_files() {
        let src = tempdir().unwrap();
        fs::write(src.path().join("manifest.json"), "{}").unwrap();
        fs::write(src.path().join("background.js"), "// bg").unwrap();

        let dest = tempdir().unwrap();
        let target = dest.path().join("browser-extension");

        materialize_directory(src.path(), &target).unwrap();

        assert_eq!(
            fs::read_to_string(target.join("manifest.json")).unwrap(),
            "{}"
        );
        assert_eq!(
            fs::read_to_string(target.join("background.js")).unwrap(),
            "// bg"
        );
    }

    #[test]
    fn materialize_directory_recurses_into_subdirectories() {
        let src = tempdir().unwrap();
        fs::create_dir_all(src.path().join("icons")).unwrap();
        fs::write(src.path().join("icons").join("icon.png"), b"\x89PNG").unwrap();
        fs::write(src.path().join("manifest.json"), "{}").unwrap();

        let dest = tempdir().unwrap();
        let target = dest.path().join("browser-extension");

        materialize_directory(src.path(), &target).unwrap();

        assert_eq!(
            fs::read(target.join("icons").join("icon.png")).unwrap(),
            b"\x89PNG"
        );
    }

    #[test]
    fn materialize_directory_overwrites_stale_files() {
        let src = tempdir().unwrap();
        fs::write(src.path().join("manifest.json"), "{\"version\":2}").unwrap();

        let dest = tempdir().unwrap();
        let target = dest.path().join("browser-extension");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("manifest.json"), "{\"version\":1}").unwrap();

        materialize_directory(src.path(), &target).unwrap();

        assert_eq!(
            fs::read_to_string(target.join("manifest.json")).unwrap(),
            "{\"version\":2}"
        );
    }

    #[test]
    fn materialize_directory_creates_missing_destination() {
        let src = tempdir().unwrap();
        fs::write(src.path().join("popup.js"), "// popup").unwrap();

        let dest_root = tempdir().unwrap();
        let target = dest_root.path().join("nested").join("browser-extension");
        assert!(!target.exists());

        materialize_directory(src.path(), &target).unwrap();

        assert!(target.is_dir());
        assert_eq!(
            fs::read_to_string(target.join("popup.js")).unwrap(),
            "// popup"
        );
    }
}
