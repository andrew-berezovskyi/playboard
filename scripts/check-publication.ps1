$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath '.git')) { throw 'Git history is absent; history scan must run after local Git setup and before publication.' }
if (Get-Command gitleaks -ErrorAction SilentlyContinue) { $scanner = 'gitleaks' }
elseif (Test-Path -LiteralPath '.local/tools/gitleaks/gitleaks.exe') { $scanner = (Resolve-Path '.local/tools/gitleaks/gitleaks.exe').Path }
else { throw 'Install the official Gitleaks binary first. No scan was performed.' }
$workspacePath = (Resolve-Path '.').Path
$scanPath = Join-Path $workspacePath ('.local/publication-scan-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $scanPath | Out-Null
$trackedPaths = @(git -c core.quotepath=false ls-files --cached)
if ($LASTEXITCODE -ne 0 -or $trackedPaths.Count -eq 0) { throw 'Stage publication files before scanning.' }
foreach ($relativeFile in $trackedPaths) {
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $workspacePath $relativeFile))
    $destinationPath = [IO.Path]::GetFullPath((Join-Path $scanPath $relativeFile))
    if (-not $sourcePath.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar) -or -not $destinationPath.StartsWith($scanPath + [IO.Path]::DirectorySeparatorChar)) { throw 'Publication path escapes workspace.' }
    New-Item -ItemType Directory -Force -Path (Split-Path $destinationPath -Parent) | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}
& $scanner dir $scanPath --redact --config .gitleaks.toml --report-format json --report-path .local/publication-secrets.json --no-banner
if ($LASTEXITCODE -ne 0) { throw 'Publication file secret scan failed; see redacted local report.' }
& $scanner git . --redact --config .gitleaks.toml --no-banner
if ($LASTEXITCODE -ne 0) { throw 'Git history secret scan failed.' }
