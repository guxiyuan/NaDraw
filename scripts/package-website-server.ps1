param(
  [string]$ReleaseVersion,
  [string]$WebsitePath,
  [string]$InstallerPath,
  [string]$ManifestPath,
  [string]$OutputPath
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(!$ReleaseVersion){$ReleaseVersion=[IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION')).Trim()}
if($ReleaseVersion -notmatch '^\d+\.\d+\.\d+(m\d+)?(-[TY]\d+)?$'){throw '版本号格式无效'}
if(!$WebsitePath){$WebsitePath=Join-Path $projectRoot '宣传页\index.html'}
if(!$InstallerPath){$InstallerPath=Join-Path $projectRoot ('dist\NaDraw-Setup-'+$ReleaseVersion+'.exe')}
if(!$ManifestPath){$ManifestPath=Join-Path $projectRoot 'server-deploy\wwwroot\nadraw\latest.json'}
if(!$OutputPath){$OutputPath=Join-Path $projectRoot ('dist\NaDraw-Website-and-Updates-'+$ReleaseVersion+'.zip')}
$WebsitePath=[IO.Path]::GetFullPath($WebsitePath)
$InstallerPath=[IO.Path]::GetFullPath($InstallerPath)
$ManifestPath=[IO.Path]::GetFullPath($ManifestPath)
$OutputPath=[IO.Path]::GetFullPath($OutputPath)

# Verify the existing public signature; packaging never reads the release private key.
$envelope=[IO.File]::ReadAllText($ManifestPath)|ConvertFrom-Json
$payloadBytes=[Convert]::FromBase64String($envelope.payload)
$signature=[Convert]::FromBase64String($envelope.signature)
$header=[IO.File]::ReadAllText((Join-Path $projectRoot 'src\native\common\update-public-key.h'))
[byte[]]$blob=@([regex]::Matches($header,'0x([0-9a-fA-F]{2})')|ForEach-Object{[Convert]::ToByte($_.Groups[1].Value,16)})
if($blob.Length -lt 25 -or [BitConverter]::ToUInt32($blob,0) -ne 0x31415352){throw '公开的更新验签密钥格式无效'}
$exponentSize=[BitConverter]::ToUInt32($blob,8)
$modulusSize=[BitConverter]::ToUInt32($blob,12)
if($exponentSize -eq 0 -or $modulusSize -ne 384 -or $blob.Length -ne 24+$exponentSize+$modulusSize){throw '更新公钥长度不正确'}
$parameters=New-Object Security.Cryptography.RSAParameters
$parameters.Exponent=[byte[]]$blob[24..(23+$exponentSize)]
$parameters.Modulus=[byte[]]$blob[(24+$exponentSize)..($blob.Length-1)]
$rsa=[Security.Cryptography.RSA]::Create()
try{
  $rsa.ImportParameters($parameters)
  if(!$rsa.VerifyData($payloadBytes,$signature,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)){throw '更新清单的官方签名无效'}
}finally{$rsa.Dispose()}
$release=[Text.Encoding]::UTF8.GetString($payloadBytes)|ConvertFrom-Json
$installer=Get-Item -LiteralPath $InstallerPath
$installerHash=(Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedUrl='http://atlas1020.vxni.ink/nadraw/releases/NaDraw-Setup-'+$ReleaseVersion+'.exe'
if($release.app -ne 'NaDraw' -or $release.arch -ne 'win-x64' -or $release.version -ne $ReleaseVersion -or $release.url -ne $expectedUrl){throw '更新清单的产品、版本、平台或下载地址不匹配'}
if($release.sha256 -cne $installerHash -or [string]$installer.Length -ne $release.size -or $installer.VersionInfo.ProductVersion -ne $ReleaseVersion){throw '安装包与已签名清单不匹配'}

$html=[IO.File]::ReadAllText($WebsitePath)
if(!$html.Contains('NaDraw-Setup-'+$ReleaseVersion+'.exe')){throw '宣传页提供的版本与自动更新包不同'}
$downloadMatches=[regex]::Matches($html,'data-download\s+href="([^"]+)"')
$downloadUrls=@($downloadMatches|ForEach-Object{$_.Groups[1].Value}|Select-Object -Unique)
if($downloadMatches.Count -ne 3 -or $downloadUrls.Count -ne 1 -or $downloadUrls[0] -ne $expectedUrl){throw '网页下载按钮没有一致使用与更新清单相同的服务器安装包地址'}
if($html -match 'pan\.baidu\.com|data-copy|网盘提取码'){throw '网页中仍有旧网盘下载内容'}
if(!$html.Contains('data:image/png;base64,') -or $html -match '__APP_SCREENSHOT__|<script\b[^>]*\bsrc='){throw '页面不是已完成的独立 HTML'}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath)|Out-Null
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
# Put the installer before latest.json so ordinary sequential extraction makes the package available first.
$entries=@(
  @{source=$InstallerPath;name=('nadraw/releases/NaDraw-Setup-'+$ReleaseVersion+'.exe')},
  @{source=$WebsitePath;name='index.html'},
  @{source=$ManifestPath;name='nadraw/latest.json'}
)
$stream=[IO.File]::Open($OutputPath,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{foreach($entry in $entries){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.source,$entry.name,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}}
finally{$archive.Dispose();$stream.Dispose()}

$archive=[IO.Compression.ZipFile]::OpenRead($OutputPath)
try{
  if(($archive.Entries.FullName -join '|') -ne ($entries.name -join '|')){throw '整合包目录结构异常'}
  foreach($entry in $entries){
    $input=$archive.GetEntry($entry.name).Open()
    try{$zipHash=(Get-FileHash -InputStream $input -Algorithm SHA256).Hash}
    finally{$input.Dispose()}
    if($zipHash -ne (Get-FileHash -LiteralPath $entry.source -Algorithm SHA256).Hash){throw ('压缩包内容校验失败：'+$entry.name)}
  }
}finally{$archive.Dispose()}
$archiveHash=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($OutputPath+'.sha256'),($archiveHash+'  '+[IO.Path]::GetFileName($OutputPath)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
$report=[ordered]@{
  version=$ReleaseVersion;archive=[IO.Path]::GetFileName($OutputPath);entries=@($entries.name)
  publicSignatureValid=$true;installerHash=$installerHash;archiveHash=$archiveHash.ToLowerInvariant()
  downloadUrl=$downloadUrls[0];privateKeyRead=$false;archiveContentMatches=$true
}
$reportPath=Join-Path $projectRoot 'dist\preparation\website-update-package.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath)|Out-Null
[IO.File]::WriteAllText($reportPath,($report|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
Get-Item -LiteralPath $OutputPath|Select-Object Name,Length
Write-Output 'WEBSITE_AND_UPDATE_PACKAGE_VERIFIED'
