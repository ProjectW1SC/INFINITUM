param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$AppExe
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Verify-Authenticode {
  param([string]$FilePath)
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw "Release bloqueada: binário não encontrado: $FilePath"
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $FilePath
  if ($null -eq $signature.SignerCertificate -or $signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Release bloqueada: assinatura Authenticode inválida ou não confiável em $FilePath (status: $($signature.Status))"
  }
  $hasCodeSigning = @($signature.SignerCertificate.EnhancedKeyUsageList | Where-Object {
    $_.ObjectId.Value -eq '1.3.6.1.5.5.7.3.3'
  }).Count -gt 0
  if (-not $hasCodeSigning) {
    throw "Release bloqueada: certificado sem uso permitido para assinatura de código."
  }
  Write-Host "Assinatura Authenticode válida: $([IO.Path]::GetFileName($FilePath))"
  return $signature
}

$app = Verify-Authenticode -FilePath $AppExe
$setup = Verify-Authenticode -FilePath $Installer
if ($app.SignerCertificate.Thumbprint -ne $setup.SignerCertificate.Thumbprint) {
  throw 'Release bloqueada: editor do aplicativo e editor do instalador não coincidem.'
}
Write-Host 'Aplicativo e instalador verificados pelo Windows, assinados com o mesmo certificado confiável.'
