param([string]$ToolsDirectory=(Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools'))
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$configuration=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $ToolsDirectory | Out-Null
foreach($name in @('llvmMingw','webView2')){
  $entry=$configuration.$name
  $archive=Join-Path $ToolsDirectory ($entry.directory+'.zip')
  if(!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){
    $partial=$archive+'.download'
    Invoke-WebRequest -Uri $entry.url -OutFile $partial -UseBasicParsing
    if((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw ('依赖下载校验失败：'+$name)}
    Move-Item -LiteralPath $partial -Destination $archive -Force
  }
  $destination=Join-Path $ToolsDirectory $entry.directory
  if(!(Test-Path -LiteralPath $destination)){Expand-Archive -LiteralPath $archive -DestinationPath $destination}
}
$compiler=Join-Path $ToolsDirectory $configuration.llvmMingw.compilerBin
$sdk=Join-Path $ToolsDirectory $configuration.webView2.directory
if(!(Test-Path -LiteralPath (Join-Path $compiler 'clang++.exe')) -or !(Test-Path -LiteralPath (Join-Path $sdk 'build/native/include/WebView2.h'))){throw '依赖解压目录不完整，请检查 ToolsDirectory'}
Write-Output ('TOOLCHAIN_BIN='+$compiler)
Write-Output ('WEBVIEW2_SDK='+$sdk)
Write-Output 'DEPENDENCIES_VERIFIED'
