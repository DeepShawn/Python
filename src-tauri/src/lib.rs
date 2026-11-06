//! Python Nexus 原生外壳（Tauri 2）。
//!
//! 桌面端：启动随应用打包的嵌入式 CPython（`resources/python`），运行 `py/nexus_host.py`，
//! 把 JSON 行协议在子进程 stdin/stdout 与前端之间转发：
//!   前端 `invoke("py_send", {line})` → 子进程 stdin
//!   子进程 stdout 的每一行 → 事件 `py-line`；进程退出 → 事件 `py-exit`
//! 终止死循环时前端调用 `py_kill` 后重新 `py_start`。
//!
//! 移动端（Android）：没有 Python 子进程，`runtime_info` 返回 native=false，前端自动使用 WebView 中的 Pyodide。

use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct PyProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
struct AppState {
    py: Mutex<PyProcess>,
}

#[derive(Serialize)]
struct RuntimeInfo {
    native: bool,
    platform: &'static str,
    python: Option<String>,
}

#[derive(Serialize)]
struct FolderProject {
    dir: String,
    files: BTreeMap<String, String>,
}

const TEXT_EXT: &[&str] = &["py", "txt", "md", "json", "csv", "toml", "cfg", "ini", "html", "xml", "yaml", "yml"];
const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_FILES: usize = 500;

/// 查找 Python 解释器：环境变量 NEXUS_PYTHON → 随应用打包的嵌入式 CPython → 系统 Python。
fn find_python(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("NEXUS_PYTHON") {
        return Some(PathBuf::from(p));
    }
    if let Ok(res) = app.path().resource_dir() {
        let embedded = if cfg!(windows) {
            res.join("resources").join("python").join("python.exe")
        } else {
            res.join("resources").join("python").join("bin").join("python3")
        };
        if embedded.exists() {
            return Some(embedded);
        }
    }
    let candidates: &[&str] = if cfg!(windows) { &["python.exe", "py.exe"] } else { &["python3", "python"] };
    for name in candidates {
        if Command::new(name).arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false) {
            return Some(PathBuf::from(name));
        }
    }
    None
}

/// 查找执行宿主脚本：打包后位于资源目录 py/，开发时位于 ../web/py/。
fn find_host_script(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("py").join("nexus_host.py"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("web").join("py").join("nexus_host.py"));
    candidates.into_iter().find(|p| p.exists())
}

#[tauri::command]
fn runtime_info(app: AppHandle) -> RuntimeInfo {
    let mobile = cfg!(any(target_os = "android", target_os = "ios"));
    let python = if mobile { None } else { find_python(&app).map(|p| p.display().to_string()) };
    RuntimeInfo {
        native: !mobile && python.is_some() && find_host_script(&app).is_some(),
        platform: std::env::consts::OS,
        python,
    }
}

#[tauri::command]
fn py_start(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut py = state.py.lock().map_err(|e| e.to_string())?;
    if let Some(child) = py.child.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(()); // 已在运行
        }
    }
    let python = find_python(&app).ok_or("未找到 Python 解释器（嵌入式 CPython 未打包，且系统中没有 python）")?;
    let host = find_host_script(&app).ok_or("未找到执行宿主 nexus_host.py")?;
    let workspace = app.path().app_data_dir().map_err(|e| e.to_string())?.join("workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&python);
    cmd.arg("-u").arg(&host).arg("--workspace").arg(&workspace)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("无法启动 Python：{e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取 Python 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 Python 错误输出")?;
    py.stdin = child.stdin.take();
    py.child = Some(child);

    let out_app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = out_app.emit("py-line", line);
        }
        let _ = out_app.emit("py-exit", ());
    });
    // 用户程序直接写入文件描述符的内容（C 扩展、子进程等）作为 stderr 流转发
    let err_app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let msg = serde_json::json!({ "type": "stream", "stream": "stderr", "text": format!("{line}\n") });
            let _ = err_app.emit("py-line", msg.to_string());
        }
    });
    Ok(())
}

#[tauri::command]
fn py_send(line: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut py = state.py.lock().map_err(|e| e.to_string())?;
    let stdin = py.stdin.as_mut().ok_or("Python 进程未启动")?;
    stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
fn py_kill(state: State<'_, AppState>) -> Result<(), String> {
    let mut py = state.py.lock().map_err(|e| e.to_string())?;
    py.stdin = None;
    if let Some(mut child) = py.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn is_text_file(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| TEXT_EXT.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false)
}

fn collect_files(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "__pycache__" || name == "venv" || name == "node_modules" {
            continue;
        }
        if out.len() >= MAX_FILES {
            break;
        }
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if is_text_file(&path) && entry.metadata()?.len() <= MAX_FILE_BYTES {
            if let Ok(text) = std::fs::read_to_string(&path) {
                let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                out.insert(rel, text);
            }
        }
    }
    Ok(())
}

/// 校验相对路径，防止写到项目目录之外。
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() || rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("非法文件名：{rel}"));
    }
    Ok(root.join(rel_path))
}

#[tauri::command]
async fn open_project_folder(app: AppHandle) -> Result<Option<FolderProject>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app.dialog().file().set_title("打开 Python 项目文件夹").blocking_pick_folder() else {
        return Ok(None);
    };
    let dir = picked.into_path().map_err(|e| e.to_string())?;
    let mut files = BTreeMap::new();
    collect_files(&dir, &dir, &mut files).map_err(|e| e.to_string())?;
    if files.is_empty() {
        files.insert("main.py".into(), String::new());
    }
    Ok(Some(FolderProject { dir: dir.display().to_string(), files }))
}

#[tauri::command]
async fn save_project_folder(app: AppHandle, dir: Option<String>, files: BTreeMap<String, String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = match dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => match app.dialog().file().set_title("选择保存项目的文件夹").blocking_pick_folder() {
            Some(p) => p.into_path().map_err(|e| e.to_string())?,
            None => return Ok(None),
        },
    };
    for (rel, content) in &files {
        let path = safe_join(&root, rel)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
    }
    Ok(Some(root.display().to_string()))
}

#[derive(serde::Deserialize)]
struct Filter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
async fn pick_files(app: AppHandle, filters: Vec<Filter>) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file();
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    let picked = builder.blocking_pick_files().unwrap_or_default();
    Ok(picked.into_iter().filter_map(|p| p.into_path().ok()).map(|p| p.display().to_string()).collect())
}

#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_info, py_start, py_send, py_kill,
            open_project_folder, save_project_folder, pick_files, reveal_path
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if let Ok(mut py) = state.py.lock() {
                        if let Some(mut child) = py.child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Python Nexus 启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_escape() {
        let root = Path::new("/tmp/project");
        assert!(safe_join(root, "main.py").is_ok());
        assert!(safe_join(root, "pkg/mod.py").is_ok());
        assert!(safe_join(root, "../evil.py").is_err());
        assert!(safe_join(root, "/etc/passwd").is_err());
    }

    #[test]
    fn text_file_detection() {
        assert!(is_text_file(Path::new("a.py")));
        assert!(is_text_file(Path::new("B.CSV")));
        assert!(!is_text_file(Path::new("a.png")));
    }
}
