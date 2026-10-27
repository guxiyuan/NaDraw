param([string]$KeyPath=(Join-Path $env:LOCALAPPDATA 'NaDrawBuildTools\signing\NaDraw-update-private.xml'))
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$publicHeader=Join-Path $projectRoot 'src\native\common\update-public-key.h'
if(!(Test-Path -LiteralPath $KeyPath)){throw '官方发布需要原签名私钥；普通源码编译请勿使用 -OfficialRelease'}
$rsa=[Security.Cryptography.RSA]::Create()
try {
  $rsa.FromXmlString([IO.File]::ReadAllText($KeyPath))
  $public=$rsa.ExportParameters($false)
  [byte[]]$blob=[BitConverter]::GetBytes([uint32]0x31415352)+[BitConverter]::GetBytes([uint32]($public.Modulus.Length*8))+[BitConverter]::GetBytes([uint32]$public.Exponent.Length)+[BitConverter]::GetBytes([uint32]$public.Modulus.Length)+[BitConverter]::GetBytes([uint32]0)+[BitConverter]::GetBytes([uint32]0)+$public.Exponent+$public.Modulus
  $hex=($blob | ForEach-Object {'0x{0:X2}' -f $_}) -join ','
  $expected="#pragma once`ninline const unsigned char kNaDrawUpdatePublicKey[] = {$hex};`n"
  if(!(Test-Path -LiteralPath $publicHeader) -or [IO.File]::ReadAllText($publicHeader).Replace("`r`n","`n") -ne $expected){throw '私钥与源码中的更新公钥不匹配，拒绝替换信任密钥'}
} finally { $rsa.Dispose() }
Write-Output 'OFFICIAL_SIGNING_KEY_VERIFIED'
