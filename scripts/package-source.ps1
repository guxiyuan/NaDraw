param([string]$OutputPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$version=[IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION')).Trim()
if(!$OutputPath){$OutputPath=Join-Path $projectRoot ('dist\NaDraw-Source-'+$version+'-noncommercial.zip')}
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
$rootFiles=@('.gitignore','README.md','VERSION','release-notes.txt','LICENSE','NOTICE','LICENSE.zh-CN.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','宣传页/index.html','宣传页/使用说明.txt')
$sourceFolders=@('src','scripts','tests','docs','.github')
$files=@()
foreach($name in $rootFiles){$files+=Get-Item -LiteralPath (Join-Path $projectRoot $name)}
foreach($folder in $sourceFolders){
  $directory=Join-Path $projectRoot $folder
  $all=@(Get-Item -LiteralPath $directory)+@(Get-ChildItem -LiteralPath $directory -Force -Recurse)
  if($all | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }){throw '源码目录包含重解析点，请人工检查后再打包'}
  $files+=@($all | Where-Object { !$_.PSIsContainer })
}
$files=@($files | Sort-Object FullName)
foreach($file in $files){
  if($file.Name -match '(?i)(^\.env(\.|$)|-private\.xml$|\.(exe|dll|zip|nad|chd|key|pem|pfx|p12|p8|log|pyc)$)' -or $file.FullName -match '[\\/]__pycache__[\\/]'){throw ('源码白名单内发现不应发布的文件：'+$file.Name)}
  if($file.Extension -notin @('.png','.ico')){
    $body=[IO.File]::ReadAllText($file.FullName)
    if($body -match '-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----' -or $body -match '<(?:D|P|Q|DP|DQ|InverseQ)>[A-Za-z0-9+/=]{32,}</' -or $body -match '\bgh[pousr]_[A-Za-z0-9]{30,}') {throw ('发现疑似私钥或访问令牌：'+$file.Name)}
  }
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$stream=[IO.File]::Open($OutputPath,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{
  foreach($file in $files){
    $relative=$file.FullName.Substring($projectRoot.Length+1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,('NaDraw-Source/'+$relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
}finally{$archive.Dispose();$stream.Dispose()}
$hash=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($OutputPath+'.sha256'),($hash+'  '+[IO.Path]::GetFileName($OutputPath)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
Write-Output ('SOURCE_PACKAGE='+$OutputPath)
Write-Output ('SOURCE_FILE_COUNT='+$files.Count)
Write-Output 'SOURCE_PACKAGE_CHECKS_PASSED'
