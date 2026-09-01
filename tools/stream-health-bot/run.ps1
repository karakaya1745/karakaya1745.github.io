# Stream health bot — Windows TLS probe fix
$env:NODE_OPTIONS = "--use-system-ca"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
node @args
