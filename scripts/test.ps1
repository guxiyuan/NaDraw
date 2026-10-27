param([string]$InstallerPath,[string]$ReportPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$version=[IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION')).Trim()
if(!$InstallerPath){$InstallerPath=Join-Path $projectRoot ('dist\community\NaDraw-Setup-'+$version+'-community.exe')}
if(!$ReportPath){$ReportPath=Join-Path $projectRoot 'dist\community\verification.json'}
$installer=[IO.Path]::GetFullPath($InstallerPath)
$testRoot = Join-Path $projectRoot ('build\test-' + [guid]::NewGuid().ToString('N'))
$installed = Join-Path $testRoot 'NaDraw'
$setup = Start-Process -FilePath $installer -ArgumentList @('--silent','--test-install','--dir',('"' + $installed + '"')) -WindowStyle Hidden -PassThru
if (!$setup.WaitForExit(30000)) { throw '安装测试超时' }
if ($setup.ExitCode -ne 0) { throw '安装测试失败' }
foreach($license in @('LICENSE','NOTICE','LICENSE.zh-CN.md','THIRD_PARTY_NOTICES.md','WebView2-LICENSE.txt','LLVM-MinGW-LICENSE.txt')){if(!(Test-Path -LiteralPath (Join-Path $installed ('licenses\'+$license)))){throw ('安装包缺少许可文件：'+$license)}}
if((Test-Path -LiteralPath (Join-Path $installed 'web\assets\orbital-atlas.png')) -or (Test-Path -LiteralPath (Join-Path $installed 'web\assets\arrow-atlas.png'))){throw '安装包仍包含参考图集'}
$program = Start-Process -FilePath (Join-Path $installed 'NaDraw.exe') -ArgumentList '--smoke-test' -WindowStyle Hidden -PassThru
if (!$program.WaitForExit(30000)) { throw '原生功能测试超时' }
$sourceReport = Join-Path $testRoot 'qa-native\report.json'
if (!(Test-Path -LiteralPath $sourceReport)) { throw '没有生成测试报告' }
$report = Get-Content -LiteralPath $sourceReport -Raw | ConvertFrom-Json
if (!$report.success) { throw ('功能测试失败：' + ($report | ConvertTo-Json -Depth 8)) }
$nad = Get-Content -LiteralPath (Join-Path $testRoot 'qa-native\原生测试.nad') -Raw | ConvertFrom-Json
if ($nad.decorations[0].value -ne '中文 σ δ Δ') { throw '中文工程往返校验失败' }
$jpg = [IO.File]::ReadAllBytes((Join-Path $testRoot 'qa-native\原生测试.jpg'))
if ($jpg[0] -ne 255 -or $jpg[1] -ne 216) { throw 'JPG 文件校验失败' }
$svg = Get-Content -LiteralPath (Join-Path $testRoot 'qa-native\原生测试.svg') -Raw
if (!$svg.Contains('<svg') -or !$svg.Contains('σ δ')) { throw 'SVG 文件校验失败' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
Copy-Item -LiteralPath $sourceReport -Destination $ReportPath -Force
$uninstall = Start-Process -FilePath (Join-Path $installed 'Uninstall.exe') -ArgumentList @('--silent','--uninstall','--test-install') -WindowStyle Hidden -PassThru
if (!$uninstall.WaitForExit(30000) -or $uninstall.ExitCode -ne 0) { throw '卸载测试失败' }
for ($check = 0; $check -lt 20 -and (Test-Path -LiteralPath $installed); $check++) { Start-Sleep -Milliseconds 100 }
if (Test-Path -LiteralPath $installed) { throw '卸载后仍有程序文件残留' }
Write-Output ('INSTALLER_SHA256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash)
Write-Output 'NATIVE_INSTALL_AND_FUNCTION_TESTS_PASSED'
