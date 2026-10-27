param(
  [string]$ToolchainBin = (Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\llvm-mingw-20261020\llvm-mingw-20261020-ucrt-x86_64\bin'),
  [string]$WebViewSdk = (Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\webview2-1.0.4314.35'),
  [switch]$OfficialRelease,
  [switch]$SkipPublish,
  [string]$SigningKeyPath = (Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\signing\NaDraw-update-private.xml'),
  [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$version = [IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION')).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+(m\d+)?(-[TY]\d+)?$') { throw 'VERSION 格式无效' }
$channel = if ($OfficialRelease) { 'official' } else { 'community' }
$compiler = Join-Path $ToolchainBin 'clang++.exe'
$windres = Join-Path $ToolchainBin 'windres.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw "找不到 C++ 工具链：$compiler" }
if (!(Test-Path -LiteralPath (Join-Path $WebViewSdk 'build\native\include\WebView2.h'))) { throw '找不到 WebView2 SDK' }
if ($OfficialRelease) { & (Join-Path $PSScriptRoot 'prepare-signing.ps1') -KeyPath $SigningKeyPath }
elseif (!(Test-Path -LiteralPath 'src\native\common\update-public-key.h')) { throw '源码缺少公开的更新验签公钥' }
$buildRoot = Join-Path $projectRoot ('build\' + $channel)
$appRoot = Join-Path $buildRoot 'app'
$objects = Join-Path $buildRoot 'objects'
if (!$OutputDirectory) { $OutputDirectory = if ($OfficialRelease) { Join-Path $projectRoot 'dist' } else { Join-Path $projectRoot 'dist\community' } }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
# Clean only this build's generated payload; removed source assets must not survive a rebuild.
if (Test-Path -LiteralPath $appRoot) {
  $resolved = (Resolve-Path -LiteralPath $appRoot).Path
  $allowed = [IO.Path]::GetFullPath((Join-Path $projectRoot 'build')) + [IO.Path]::DirectorySeparatorChar
  if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '生成目录不安全，拒绝清理' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $appRoot 'web'),$objects,$OutputDirectory | Out-Null
Get-ChildItem -LiteralPath 'src\web' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appRoot 'web') -Recurse -Force }
Copy-Item -LiteralPath 'src\licenses' -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath 'LICENSE','NOTICE','LICENSE.zh-CN.md','THIRD_PARTY_NOTICES.md' -Destination (Join-Path $appRoot 'licenses') -Force
Copy-Item -LiteralPath (Join-Path $WebViewSdk 'build\native\x64\WebView2Loader.dll') -Destination (Join-Path $appRoot 'WebView2Loader.dll') -Force
[IO.File]::WriteAllText((Join-Path $appRoot 'BUILD-INFO.json'),(@{version=$version;edition=$channel;officialUpdates=[bool]$OfficialRelease}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$flags = @('-std=c++20','-O2','-s','-static','-municode','-mwindows',('-DNADRAW_OFFICIAL_BUILD='+[int][bool]$OfficialRelease))
Push-Location -LiteralPath 'src\native\app'
try { & $windres --codepage=65001 'app.rc' -O coff -o (Join-Path $objects 'app.res'); if ($LASTEXITCODE -ne 0) { throw '程序资源编译失败' } } finally { Pop-Location }
& $compiler @flags -fms-extensions -I (Join-Path $WebViewSdk 'build\native\include') 'src/native/app/main.cpp' (Join-Path $objects 'app.res') -o (Join-Path $appRoot 'NaDraw.exe') -lole32 -lshell32 -luuid -luser32 -lgdi32 -lwinhttp -lbcrypt -lversion
if ($LASTEXITCODE -ne 0) { throw '主程序编译失败' }
& $compiler @flags 'src/native/updater/main.cpp' (Join-Path $objects 'app.res') -o (Join-Path $appRoot 'NaDrawUpdater.exe') -lole32 -lshell32 -luuid -luser32 -lwinhttp -lbcrypt -lversion
if ($LASTEXITCODE -ne 0) { throw '自动更新程序编译失败' }
& $compiler -std=c++20 -O2 -s -static -municode 'src/native/installer/pack.cpp' -o (Join-Path $buildRoot 'pack.exe') -lcabinet
if ($LASTEXITCODE -ne 0) { throw '资源压缩工具编译失败' }
$payload = Join-Path $buildRoot 'payload.bin'
& (Join-Path $buildRoot 'pack.exe') $appRoot $payload
if ($LASTEXITCODE -ne 0) { throw '资源压缩失败' }
$setupResource = [IO.File]::ReadAllText((Join-Path $projectRoot 'src\native\installer\setup.rc')).Replace('../../../build/payload.bin',$payload.Replace('\','/'))
$resourcePath = Join-Path $objects 'setup-generated.rc'
[IO.File]::WriteAllText($resourcePath,$setupResource,[Text.UTF8Encoding]::new($false))
Push-Location -LiteralPath 'src\native\installer'
try { & $windres --codepage=65001 $resourcePath -O coff -o (Join-Path $objects 'setup.res'); if ($LASTEXITCODE -ne 0) { throw '安装向导资源编译失败' } } finally { Pop-Location }
$name = if ($OfficialRelease) { 'NaDraw-Setup-'+$version+'.exe' } else { 'NaDraw-Setup-'+$version+'-community.exe' }
$installer = Join-Path $OutputDirectory $name
& $compiler @flags 'src/native/installer/setup.cpp' (Join-Path $objects 'setup.res') -o $installer -lole32 -lshell32 -luuid -luser32 -lgdi32 -lcomctl32 -ladvapi32 -lurlmon -lcabinet
if ($LASTEXITCODE -ne 0) { throw '安装向导编译失败' }
if ((Get-Item -LiteralPath $installer).VersionInfo.ProductVersion -ne $version) { throw '源码资源版本与 VERSION 不一致，请更新 .rc、.manifest 和版本常量' }
if ($OfficialRelease -and !$SkipPublish) {
  & (Join-Path $PSScriptRoot 'publish-update.ps1') -InstallerPath $installer -SigningKeyPath $SigningKeyPath
  & (Join-Path $PSScriptRoot 'package-server.ps1')
}
$checksum=(Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'SHA256.txt'),($checksum+'  '+$name+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
Get-Item -LiteralPath (Join-Path $appRoot 'NaDraw.exe'),$installer | Select-Object Name,Length
Write-Output ('BUILD_EDITION='+$channel)
Write-Output 'BUILD_SUCCESS'
