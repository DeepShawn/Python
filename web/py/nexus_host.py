"""Python Nexus 原生执行宿主（Windows 嵌入式 CPython / 桌面 / Android Chaquopy）。

与浏览器 Worker 实现同一套接口，通过 JSON 行协议通信：

  前端 → 宿主（stdin，每行一个 JSON）：
      {"id": 1, "type": "run", "payload": {...}}
      {"type": "input_reply", "value": "..."}          回应 input() 请求（value 为 null 表示 EOF）
  宿主 → 前端（stdout，每行一个 JSON）：
      {"id": 1, "ok": true, "result": {...}}            请求结果
      {"type": "stream", "stream": "stdout", "text": ...} 程序输出（实时）
      {"type": "input", "prompt": "..."}                 程序调用 input()，等待用户输入
      {"type": "ready", "info": {...}}                   启动完成

用户程序对文件描述符 1 的直接写入会被重定向到 stderr，保证协议通道不被破坏。
终止死循环时由外壳（Tauri / Rust）结束并重启本进程。

    python nexus_host.py [--workspace DIR]
"""
import argparse
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import nexus_core  # noqa: E402
import nexus_flow  # noqa: E402
import nexus_judge  # noqa: E402
import nexus_net  # noqa: E402
import nexus_repl  # noqa: E402
import nexus_tracer  # noqa: E402

PROTOCOL_VERSION = 1


class _StreamWriter(io.TextIOBase):
    """把 print 输出转换为 stream 消息（按行或按 flush 发送）。"""

    def __init__(self, host, name):
        self.host = host
        self.name = name
        self._buf = ""

    def writable(self):
        return True

    def write(self, text):
        self._buf += text
        if "\n" in self._buf:
            head, _, self._buf = self._buf.rpartition("\n")
            self.host.emit({"type": "stream", "stream": self.name, "text": head + "\n"})
        return len(text)

    def flush(self):
        if self._buf:
            self.host.emit({"type": "stream", "stream": self.name, "text": self._buf})
            self._buf = ""


class Host:
    def __init__(self, workspace=None, proto_out=None, proto_in=None):
        self.workspace = os.path.abspath(workspace or tempfile.mkdtemp(prefix="nexus-"))
        self.project_dir = os.path.join(self.workspace, "project")
        os.makedirs(self.project_dir, exist_ok=True)
        self.out = proto_out or sys.stdout
        self.inp = proto_in or sys.stdin
        self.lock = threading.Lock()
        self.repl = nexus_repl.shell
        self.net_server = None
        self.net_mode = nexus_net.install()
        nexus_core.set_input_provider(self._request_input)

    # ------------------------------------------------------------------ 协议
    def emit(self, msg):
        with self.lock:
            self.out.write(json.dumps(msg, ensure_ascii=False) + "\n")
            self.out.flush()

    def _request_input(self, prompt):
        sys.stdout.flush()
        self.emit({"type": "input", "prompt": prompt})
        while True:
            line = self.inp.readline()
            if not line:
                return None
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("type") == "input_reply":
                return msg.get("value")
            # 程序等待输入期间收到的其他请求无法处理（单线程执行），直接报错
            if "id" in msg:
                self.emit({"id": msg["id"], "ok": False, "error": "程序正在等待 input()，请先输入或终止程序"})

    def serve_forever(self):
        self.emit({"type": "ready", "info": self.info()})
        for line in self.inp:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("type") == "input_reply":
                continue
            self.dispatch(msg)

    def dispatch(self, msg):
        mid = msg.get("id")
        handler = getattr(self, "h_" + str(msg.get("type")), None)
        if handler is None:
            self.emit({"id": mid, "ok": False, "error": f"未知请求类型：{msg.get('type')}"})
            return
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = _StreamWriter(self, "stdout"), _StreamWriter(self, "stderr")
        try:
            result = handler(**(msg.get("payload") or {}))
            sys.stdout.flush()
            sys.stderr.flush()
            self.emit({"id": mid, "ok": True, "result": result})
        except Exception as e:  # noqa: BLE001
            self.emit({"id": mid, "ok": False, "error": f"{type(e).__name__}: {e}"})
        finally:
            sys.stdout, sys.stderr = old_out, old_err

    # ------------------------------------------------------------------ 工具
    def info(self):
        return {"python": platform.python_version(), "version": f"CPython {platform.python_version()}",
                "source": "native", "platform": sys.platform, "protocol": PROTOCOL_VERSION,
                "executable": sys.executable, "workspace": self.workspace, "net": self.net_mode}

    def sync_project(self, files):
        if os.path.isdir(self.project_dir):
            shutil.rmtree(self.project_dir)
        os.makedirs(self.project_dir)
        for name, content in (files or {}).items():
            path = os.path.normpath(os.path.join(self.project_dir, name))
            if not path.startswith(self.project_dir + os.sep):
                raise ValueError(f"非法文件名：{name}")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
        os.chdir(self.project_dir)
        if self.project_dir not in sys.path:
            sys.path.insert(0, self.project_dir)
        for name, mod in list(sys.modules.items()):
            if (getattr(mod, "__file__", None) or "").startswith(self.project_dir):
                del sys.modules[name]

    def path_of(self, filename):
        return os.path.join(self.project_dir, filename)

    # ------------------------------------------------------------------ 与 Worker 相同的接口
    def h_boot(self):
        return self.info()

    def h_run(self, code, stdin="", files=None, filename="main.py"):
        self.sync_project(files)
        return nexus_repl.run_main(code, stdin=stdin, filename=self.path_of(filename))

    def h_trace(self, code, stdin="", files=None, filename="main.py", maxSteps=3000):  # noqa: N803
        self.sync_project(files)
        result = nexus_tracer.run_traced(code, stdin=stdin, filename=self.path_of(filename),
                                         trace_prefix=self.project_dir + os.sep, max_steps=maxSteps)
        # 统一为前端使用的「/home/pyodide/project/」前缀，便于共用文件名映射
        prefix = self.project_dir + os.sep
        for ev in result["events"]:
            if ev.get("file", "").startswith(prefix):
                ev["file"] = "/home/pyodide/project/" + ev["file"][len(prefix):].replace(os.sep, "/")
        return result

    def h_check(self, code, filename="main.py"):
        return nexus_core.check_syntax(code, filename=filename)

    def h_analyze(self, code, files=None):
        return nexus_flow.analyze(code, files)

    def h_test(self, files=None):
        self.sync_project(files)
        return nexus_core.run_unittests(self.project_dir)

    def h_judge(self, code, cases, reveal=True, requires=None, limits=None):
        return nexus_judge.judge(code, cases, reveal=reveal, requires=requires, limits=limits)

    def h_checkRandom(self, expr, params, answer):  # noqa: N802
        return nexus_judge.check_random(expr, params, answer)

    def h_replPush(self, line):  # noqa: N802
        return self.repl.push(line)

    def h_replReset(self):  # noqa: N802
        self.repl.reset()
        return True

    def h_complete(self, prefix):
        return self.repl.completions(prefix)

    def h_installWheels(self, urls=None, names=None):  # noqa: N802
        return {"installed": [], "note": "原生运行时使用 installLocal 安装离线 .whl"}

    # ------------------------------------------------------------------ 原生专属
    def h_netServe(self, port=8808):  # noqa: N802
        """启动本机 HTTP 教学网站（requests 课程），返回根地址。"""
        if self.net_server is None:
            self.net_server, url = nexus_net.serve(port)
        else:
            url = f"http://127.0.0.1:{self.net_server.server_address[1]}"
        return {"url": url}

    def h_listPackages(self):  # noqa: N802
        from importlib import metadata
        return sorted({d.metadata["Name"]: d.version for d in metadata.distributions() if d.metadata["Name"]}.items())

    def h_installLocal(self, paths):  # noqa: N802
        """离线安装本地 .whl 文件（pip --no-index），不访问网络。"""
        cmd = [sys.executable, "-m", "pip", "install", "--no-index", "--disable-pip-version-check", *paths]
        r = subprocess.run(cmd, capture_output=True, text=True)
        return {"ok": r.returncode == 0, "output": r.stdout + r.stderr}

    def h_buildExe(self, files=None, filename="main.py", name=None, onefile=True, windowed=False):  # noqa: N802
        """EXE 打包向导：调用 PyInstaller（需已离线安装），输出到 workspace/dist。"""
        try:
            import PyInstaller  # noqa: F401
        except ImportError:
            return {"ok": False, "output": "未安装 PyInstaller。请通过「离线安装库」导入 pyinstaller 的 .whl 文件后重试。"}
        self.sync_project(files)
        dist = os.path.join(self.workspace, "dist")
        cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
               "--distpath", dist, "--workpath", os.path.join(self.workspace, "build"),
               "--specpath", self.workspace, "--name", name or os.path.splitext(os.path.basename(filename))[0]]
        if onefile:
            cmd.append("--onefile")
        if windowed:
            cmd.append("--windowed")
        cmd.append(self.path_of(filename))
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_dir)
        return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr)[-6000:], "dist": dist}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Python Nexus 原生执行宿主")
    ap.add_argument("--workspace", help="工作目录（默认使用临时目录）")
    args = ap.parse_args(argv)
    # 协议通道使用原始 stdout 的副本；文件描述符 1 改指向 stderr，防止 C 扩展直接写入破坏协议
    proto_out = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    proto_in = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    Host(args.workspace, proto_out, proto_in).serve_forever()


if __name__ == "__main__":
    main()
