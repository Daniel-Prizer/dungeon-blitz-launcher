param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
$sdkLoader=Join-Path $Destination 'runtimes/win-x64/native/WebView2Loader.dll'
$sdkSignature=Get-AuthenticodeSignature -LiteralPath $sdkLoader
if($sdkSignature.Status -ne 'Valid' -or $sdkSignature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Official WebView2 loader signature did not verify.'}
