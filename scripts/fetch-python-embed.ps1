# 下载官方 Python embeddable package 到 src-tauri/resources/python，供 Windows 版离线使用。
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-python-embed.ps1 [-Version 3.12.7] [-Scientific]
# -Scientific 额外预装 numpy、pandas、matplotlib（安装包约增加 120 MB）。
param(
  [string]$Version = "3.12.7",
  [switch]$Scientific
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "src-tauri\resources\python"
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force $dest | Out-Null

$zip = Join-Path $env:TEMP "python-$Version-embed-amd64.zip"
Write-Host "下载 Python $Version embeddable package…"
Invoke-WebRequest "https://www.python.org/ftp/python/$Version/python-$Version-embed-amd64.zip" -OutFile $zip
Expand-Archive $zip -DestinationPath $dest -Force

# 启用 site-packages（embeddable 版默认关闭），让 pip 安装的库可以被导入
$pth = Get-ChildItem $dest -Filter "python*._pth" | Select-Object -First 1
$lines = Get-Content $pth.FullName | ForEach-Object { $_ -replace '^#\s*import site', 'import site' }
$lines += "Lib\site-packages"
Set-Content $pth.FullName $lines

$py = Join-Path $dest "python.exe"
$getpip = Join-Path $env:TEMP "get-pip.py"
Invoke-WebRequest "https://bootstrap.pypa.io/get-pip.py" -OutFile $getpip
& $py $getpip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "pip 安装失败" }

# 预装课程与功能需要的库：requests / beautifulsoup4（爬虫课程）、pyinstaller（打包为 EXE）
$packages = @("requests", "beautifulsoup4", "pyinstaller")
if ($Scientific) { $packages += @("numpy", "pandas", "matplotlib") }
& $py -m pip install --no-warn-script-location --disable-pip-version-check @packages
if ($LASTEXITCODE -ne 0) { throw "依赖安装失败" }

# 清理缓存与测试文件，减小安装包体积
Get-ChildItem $dest -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
& $py -c "import sys, requests, bs4; print('嵌入式 Python 就绪：', sys.version)"
