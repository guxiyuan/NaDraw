param(
 [string]$ToolchainBin=(Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\llvm-mingw-20261020\llvm-mingw-20261020-ucrt-x86_64\bin'),
 [string]$InstallerPath,[string]$HelperPath,[string]$ManifestPath,[string]$ServerRoot,[string]$ReportPath,
 [string]$SigningKeyPath=(Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\signing\NaDraw-update-private.xml')
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$testRoot=Join-Path $projectRoot ('build\update-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
if(!$InstallerPath){$InstallerPath=Join-Path $projectRoot 'dist\NaDraw-Setup-1.0.25.exe'}
if(!$ServerRoot){$ServerRoot=Join-Path $projectRoot 'server-deploy\wwwroot'}
if(!$ManifestPath){$ManifestPath=Join-Path $ServerRoot 'nadraw\latest.json'}
if(!$HelperPath){$HelperPath=Join-Path $projectRoot 'build\official\app\NaDrawUpdater.exe'}
if(!$ReportPath){$ReportPath=Join-Path $projectRoot 'dist\update-verification.json'}
$installer=[IO.Path]::GetFullPath($InstallerPath);$manifest=[IO.Path]::GetFullPath($ManifestPath);$helper=[IO.Path]::GetFullPath($HelperPath)
$oldInstaller=Join-Path $projectRoot 'dist\NaDraw-Setup-1.0.2.exe'
if(!(Test-Path -LiteralPath $oldInstaller)){ $oldInstaller=Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\verified-build-1.0.2-http-20261027\NaDraw-Setup-1.0.2.exe' }
if(!(Test-Path -LiteralPath $oldInstaller)){throw '需要已验证的 1.0.2 安装包进行真实升级测试'}
$rsa=[Security.Cryptography.RSA]::Create()
$rsa.FromXmlString([IO.File]::ReadAllText($SigningKeyPath))
$envelope=[IO.File]::ReadAllText($manifest) | ConvertFrom-Json
$original=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($envelope.payload))
foreach($fixture in @('http','wrong-arch','wrong-app','oversize')){
 $payload=$original|ConvertFrom-Json
 switch($fixture){'http'{$payload.url='http://example.com/package.exe'} 'wrong-arch'{$payload.arch='linux-x64'} 'wrong-app'{$payload.app='AnotherApp'} 'oversize'{$payload.size='999999999'}}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress))
 $signature=$rsa.SignData($bytes,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $signed=@{payload=[Convert]::ToBase64String($bytes);signature=[Convert]::ToBase64String($signature)}|ConvertTo-Json -Compress
 [IO.File]::WriteAllText((Join-Path $testRoot ($fixture+'.json')),$signed,[Text.UTF8Encoding]::new($false))
}
$rsa.Dispose()
$corrupt=[IO.File]::ReadAllBytes($installer);$corrupt[1000]=$corrupt[1000] -bxor 1
[IO.File]::WriteAllBytes((Join-Path $testRoot 'corrupt.exe'),$corrupt)
$tester=Join-Path $testRoot 'update-tests.exe'
& (Join-Path $ToolchainBin 'clang++.exe') -std=c++20 -O2 -s -static -municode 'tests/update-tests.cpp' -o $tester -lole32 -lshell32 -luuid -lwinhttp -lbcrypt -lversion
if($LASTEXITCODE -ne 0){throw '更新测试程序编译失败'}
& $tester $manifest $installer $testRoot
if($LASTEXITCODE -ne 0){throw '更新安全测试失败'}
$networkTester=Join-Path $testRoot 'http-download-tests.exe'
& (Join-Path $ToolchainBin 'clang++.exe') -std=c++20 -O2 -s -static -municode 'tests/http-download-tests.cpp' -o $networkTester -lole32 -lshell32 -luuid -lwinhttp -lbcrypt -lversion
if($LASTEXITCODE -ne 0){throw 'HTTP 下载测试程序编译失败'}
$python=(Get-Command python.exe -ErrorAction Stop).Source
$portFile=Join-Path $testRoot 'http-port.txt'
$server=Start-Process -FilePath $python -ArgumentList @(('"'+(Join-Path $projectRoot 'tests\http-update-server.py')+'"'),('"'+$ServerRoot+'"'),('"'+$portFile+'"')) -WindowStyle Hidden -PassThru
try{
 for($attempt=0;$attempt -lt 50 -and !(Test-Path -LiteralPath $portFile);$attempt++){if($server.HasExited){throw '本地 HTTP 测试服务启动失败'};Start-Sleep -Milliseconds 100}
 if(!(Test-Path -LiteralPath $portFile)){throw '本地 HTTP 测试服务启动超时'}
 $port=[IO.File]::ReadAllText($portFile).Trim()
 & $networkTester ('http://127.0.0.1:'+$port)
 if($LASTEXITCODE -ne 0){throw 'HTTP 下载测试失败'}
}finally{if(!$server.HasExited){$server.Kill();$server.WaitForExit()}}
function Run-Program([string]$Path,[string[]]$Parameters,[int]$Expected=0){
 $process=Start-Process -FilePath $Path -ArgumentList $Parameters -WindowStyle Hidden -PassThru
 if(!$process.WaitForExit(60000)){throw ('测试运行超时：'+$Path)}
 if($process.ExitCode -ne $Expected){throw ('预期退出码 '+$Expected+'，实际 '+$process.ExitCode+'：'+$Path)}
}
function Snapshot([string]$Root){
 $result=@{};Get-ChildItem -LiteralPath $Root -Recurse -File | ForEach-Object {$result[$_.FullName.Substring($Root.Length)]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash};return $result
}
function Assert-Unchanged($Before,[string]$Root){
 $after=Snapshot $Root
 if($Before.Count -ne $after.Count){throw '更新失败后文件数量发生变化'}
 foreach($key in $Before.Keys){if($Before[$key] -ne $after[$key]){throw ('更新失败后原文件改变：'+$key)}}
}
$installed=Join-Path $testRoot 'NaDraw'
Run-Program $oldInstaller @('--silent','--test-install','--dir',('"'+$installed+'"'))
[IO.File]::WriteAllText((Join-Path $installed '用户工程.nad'),'USER_PROJECT_MUST_REMAIN')
$before=Snapshot $installed
$lock=[IO.File]::Open((Join-Path $installed 'NaDraw.exe'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try{Run-Program $installer @('--silent','--update','--test-install','--dir',('"'+$installed+'"')) 1}finally{$lock.Dispose()}
Assert-Unchanged $before $installed
Write-Output 'LOCKED_INSTALLATION_PRESERVED'
Run-Program $installer @('--silent','--update','--test-install','--test-fail-after','3','--dir',('"'+$installed+'"')) 1
Assert-Unchanged $before $installed
Write-Output 'PARTIAL_REPLACEMENT_ROLLED_BACK'
Run-Program $helper @('--manifest',('"'+$manifest+'"'),'--package',('"'+$installer+'"'),'--current','1.0.25') 1
Run-Program $helper @('--manifest',('"'+$manifest+'"'),'--package',('"'+$installer+'"'),'--current','1.0.26') 1
Write-Output 'SAME_VERSION_AND_DOWNGRADE_REJECTED'
$testManifest=Join-Path $testRoot 'pending.json';$testPackage=Join-Path $testRoot 'package.exe'
Copy-Item -LiteralPath $manifest -Destination $testManifest
Copy-Item -LiteralPath $installer -Destination $testPackage
Run-Program $helper @('--apply','--test','--manifest',('"'+$testManifest+'"'),'--package',('"'+$testPackage+'"'),'--install-dir',('"'+$installed+'"'))
if((Get-Item -LiteralPath (Join-Path $installed 'NaDraw.exe')).VersionInfo.ProductVersion -ne '1.0.25'){throw '安装后的版本不正确'}
if([IO.File]::ReadAllText((Join-Path $installed '用户工程.nad')) -ne 'USER_PROJECT_MUST_REMAIN'){throw '用户工程文件被更改'}
foreach($obsolete in @('web\assets\orbital-atlas.png','web\assets\arrow-atlas.png')){if(Test-Path -LiteralPath (Join-Path $installed $obsolete)){throw '旧版参考图集未从升级安装中移除'}}
$completion=[IO.File]::ReadAllText((Join-Path $testRoot 'update-complete.json'))|ConvertFrom-Json
if($completion.version -ne '1.0.25' -or $completion.from -ne '1.0.2'){throw '更新完成提醒数据不正确'}
if((Test-Path -LiteralPath $testManifest) -or (Test-Path -LiteralPath $testPackage)){throw '已应用的更新缓存未清理'}
Run-Program (Join-Path $installed 'NaDraw.exe') @('--smoke-test')
$report=[IO.File]::ReadAllText((Join-Path $testRoot 'qa-native\report.json'))|ConvertFrom-Json
if(!$report.success){throw '升级后的绘图或文件功能异常'}
$result=[ordered]@{version='1.0.25';transport='http';httpDownload=$true;securityValidation=$true;lockedFilePreserved=$true;rollback=$true;downgradeRejected=$true;upgradeFrom='1.0.2';upgradeTo='1.0.25';userProjectPreserved=$true;completionMarker=$true;upgradedAppChecks=$report.success;testDirectory=$testRoot}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath))) | Out-Null
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output 'REAL_1_0_2_TO_1_0_25_UPGRADE_PASSED'
