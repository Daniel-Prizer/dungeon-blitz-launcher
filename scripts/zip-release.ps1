param([string]$Payload,[string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination }
$base = [IO.Path]::GetFullPath($Payload).TrimEnd('\') + '\'
$zip = [IO.Compression.ZipFile]::Open($Destination,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($file in Get-ChildItem -LiteralPath $Payload -File -Recurse) {
  $name = $file.FullName.Substring($base.Length).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
} finally { $zip.Dispose() }
