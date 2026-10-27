param(
  [string]$BaseUrl='http://atlas1020.vxni.ink/nadraw',
  [string]$ReleaseVersion,
  [string]$InstallerPath,
  [string]$OutputRoot,
  [string]$SigningKeyPath=(Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\signing\NaDraw-update-private.xml')
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(!$ReleaseVersion){$ReleaseVersion=([IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION'))).Trim()}
if($ReleaseVersion -notmatch '^\d+\.\d+\.\d+(m\d+)?(-[TY]\d+)?$'){throw '版本号格式不正确'}
$releaseUri=$null
if(![Uri]::TryCreate($BaseUrl,[UriKind]::Absolute,[ref]$releaseUri) -or $releaseUri.Scheme -notin @('http','https') -or $releaseUri.UserInfo -or $releaseUri.Query -or $releaseUri.Fragment){throw '发布地址格式不正确'}
if($releaseUri.Scheme -eq 'http' -and ($releaseUri.Host -ne 'atlas1020.vxni.ink' -or $releaseUri.Port -ne 80 -or $releaseUri.AbsolutePath.TrimEnd('/') -ne '/nadraw')){throw 'HTTP 发布地址必须使用已配置的更新服务器目录'}
if(!$InstallerPath){$InstallerPath=Join-Path $projectRoot ('dist\NaDraw-Setup-'+$ReleaseVersion+'.exe')}
if(!$OutputRoot){$OutputRoot=Join-Path $projectRoot 'server-deploy\wwwroot\nadraw'}
$keyPath=$SigningKeyPath
if(!(Test-Path -LiteralPath $keyPath)){throw '发布签名私钥不存在'}
& (Join-Path $PSScriptRoot 'prepare-signing.ps1') -KeyPath $keyPath
$rsa=[Security.Cryptography.RSA]::Create();$rsa.FromXmlString([IO.File]::ReadAllText($keyPath))
$file=Get-Item -LiteralPath $InstallerPath
if($file.VersionInfo.ProductVersion -ne $ReleaseVersion){throw '安装包内部版本与发布版本不一致，请先重新构建'}
$name='NaDraw-Setup-'+$ReleaseVersion+'.exe'
$notes=[IO.File]::ReadAllText((Join-Path $projectRoot 'release-notes.txt')).Trim()
$payload=[ordered]@{app='NaDraw';arch='win-x64';version=$ReleaseVersion;released=(Get-Date -Format 'yyyy-MM-dd');url=$BaseUrl.TrimEnd('/')+'/releases/'+$name;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant();size=[string]$file.Length;notes=$notes} | ConvertTo-Json -Compress
$bytes=[Text.Encoding]::UTF8.GetBytes($payload)
$signature=$rsa.SignData($bytes,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$envelope=[ordered]@{payload=[Convert]::ToBase64String($bytes);signature=[Convert]::ToBase64String($signature)} | ConvertTo-Json -Compress
$rsa.Dispose()
New-Item -ItemType Directory -Force -Path (Join-Path $OutputRoot 'releases') | Out-Null
Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $OutputRoot ('releases\'+$name)) -Force
[IO.File]::WriteAllText((Join-Path $OutputRoot 'latest.json'),$envelope,[Text.UTF8Encoding]::new($false))
Write-Output ('SIGNED_UPDATE_READY='+$OutputRoot)
