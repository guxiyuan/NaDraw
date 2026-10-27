$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$version=[IO.File]::ReadAllText((Join-Path $projectRoot 'VERSION')).Trim()
$webRoot=Join-Path $projectRoot 'server-deploy\wwwroot'
$zipPath=Join-Path $projectRoot ('dist\NaDraw-UpdateServer-'+$version+'.zip')
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$stream=[IO.File]::Open($zipPath,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{
 Get-Item -LiteralPath (Join-Path $webRoot ('nadraw\releases\NaDraw-Setup-'+$version+'.exe')),(Join-Path $webRoot 'nadraw\latest.json') | ForEach-Object {
  $entryName=$_.FullName.Substring($webRoot.Length+1).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$entryName,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 }
}finally{$archive.Dispose();$stream.Dispose()}
$fullZipPath=Join-Path $projectRoot ('dist\NaDraw-Server-Full-'+$version+'.zip')
Copy-Item -LiteralPath $zipPath -Destination $fullZipPath -Force
Write-Output ('SERVER_UPLOAD_ZIP_READY='+$zipPath)
Write-Output ('FULL_SERVER_ZIP_READY='+$fullZipPath)
