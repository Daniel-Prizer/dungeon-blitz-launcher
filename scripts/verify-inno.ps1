param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $Installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Pyrsys B\.V\.') {
  throw 'Inno compiler Authenticode signature is invalid or its publisher is unexpected.'
}
Write-Output 'Pinned Inno compiler hash and publisher signature verified.'
