$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -LiteralPath (Join-Path $root 'src') -Recurse -File -Filter '*.js' |
  Where-Object { $_.FullName -notmatch '\\vendor\\' }

foreach ($file in $files) {
  & node --check $file.FullName
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Output "Checked $($files.Count) JavaScript files."
