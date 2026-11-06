# 嵌入式 Python 运行时

打包 Windows 版前运行（在 Windows 上）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-python-embed.ps1
```

脚本会把官方 Python embeddable package 解压到 `src-tauri/resources/python/`，
启用 site-packages 并离线预装 pip、requests、beautifulsoup4、pyinstaller。
该目录不入库；没有它时应用会回退到系统中的 Python，再没有则使用 Pyodide。
