param(
  [Parameter(Mandatory = $true)]
  [string]$BundleDirectory,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,
  [switch]$RequireAuthenticode,
  [switch]$RequireSevenZip
)

$ErrorActionPreference = "Stop"
$resolvedBundle = (Resolve-Path -LiteralPath $BundleDirectory).Path
$versionPattern = [regex]::Escape($ExpectedVersion)
$installers = Get-ChildItem -LiteralPath $resolvedBundle -Recurse -File |
  Where-Object { $_.Name -match "_${versionPattern}_" }
$nsis = @($installers | Where-Object { $_.Name -match "setup\.exe$" })
$msi = @($installers | Where-Object { $_.Extension -eq ".msi" })

if ($nsis.Count -ne 1) {
  throw "Expected one NSIS installer, found $($nsis.Count)."
}
if ($msi.Count -ne 1) {
  throw "Expected one MSI installer, found $($msi.Count)."
}
if (-not (Test-Path -LiteralPath "$($nsis[0].FullName).sig")) {
  throw "The NSIS updater signature is missing."
}

$sevenZipCommand = Get-Command 7z -ErrorAction SilentlyContinue
$sevenZipExecutable = if ($sevenZipCommand) { $sevenZipCommand.Source } else { $null }
if (-not $sevenZipExecutable) {
  $sevenZipExecutable = @(
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if ($sevenZipExecutable) {
  $nsisListing = & $sevenZipExecutable l $nsis[0].FullName
  if ($LASTEXITCODE -ne 0) {
    throw "7-Zip could not inspect the NSIS installer."
  }
  if (-not ($nsisListing -match "grokdesk\.exe")) {
    throw "The NSIS installer does not contain grokdesk.exe."
  }
  if (-not ($nsisListing -match "GrokDesk-v$([regex]::Escape($ExpectedVersion))\.ico")) {
    throw "The NSIS installer does not contain the versioned desktop icon."
  }
} elseif ($RequireSevenZip) {
  throw "7-Zip is required for the NSIS structure smoke test."
} else {
  Write-Output "NSIS archive inspection skipped because 7-Zip is not installed."
}

$temporaryRoot = if ($env:RUNNER_TEMP) {
  $env:RUNNER_TEMP
} else {
  [IO.Path]::GetTempPath()
}
$resolvedExtractParent = (Resolve-Path -LiteralPath $temporaryRoot).Path
$extractDirectory = Join-Path $resolvedExtractParent "grokdesk-msi-smoke-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null
try {
  $resolvedExtract = (Resolve-Path -LiteralPath $extractDirectory).Path
  if (-not $resolvedExtract.StartsWith($resolvedExtractParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to extract the MSI outside RUNNER_TEMP."
  }
  $process = Start-Process msiexec.exe -ArgumentList @(
    "/a",
    "`"$($msi[0].FullName)`"",
    "/qn",
    "TARGETDIR=`"$resolvedExtract`""
  ) -PassThru -Wait -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "MSI administrative extraction failed with exit code $($process.ExitCode)."
  }

  $executable = Get-ChildItem -LiteralPath $resolvedExtract -Recurse -File -Filter "grokdesk.exe" |
    Select-Object -First 1
  $versionedIcon = Get-ChildItem -LiteralPath $resolvedExtract -Recurse -File -Filter "GrokDesk-v$ExpectedVersion.ico" |
    Select-Object -First 1
  $shortcutRepairScript = Get-ChildItem -LiteralPath $resolvedExtract -Recurse -File -Filter "repair-versioned-shortcut.vbs" |
    Select-Object -First 1
  if (-not $executable) {
    throw "The extracted MSI does not contain grokdesk.exe."
  }
  if (-not $versionedIcon) {
    throw "The extracted MSI does not contain the versioned desktop icon."
  }
  if (-not $shortcutRepairScript) {
    throw "The extracted MSI does not contain the shortcut repair script."
  }
} finally {
  if (Test-Path -LiteralPath $extractDirectory) {
    Remove-Item -LiteralPath $extractDirectory -Recurse -Force
  }
}

$windowsInstaller = New-Object -ComObject WindowsInstaller.Installer
$database = $windowsInstaller.GetType().InvokeMember(
  "OpenDatabase",
  "InvokeMethod",
  $null,
  $windowsInstaller,
  @($msi[0].FullName, 0)
)
$view = $database.GetType().InvokeMember(
  "OpenView",
  "InvokeMethod",
  $null,
  $database,
  @("SELECT `Action`, `Target` FROM `CustomAction` WHERE `Action` = 'RepairVersionedDesktopShortcut'")
)
$view.GetType().InvokeMember("Execute", "InvokeMethod", $null, $view, $null) | Out-Null
$record = $view.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $view, $null)
if (-not $record) {
  throw "The MSI does not schedule the versioned desktop-shortcut repair."
}
$repairTarget = $record.GetType().InvokeMember(
  "StringData",
  "GetProperty",
  $null,
  $record,
  2
)
if ($repairTarget -notmatch "GrokDesk-v$versionPattern\.ico") {
  throw "The MSI shortcut repair does not reference the expected versioned icon."
}

$signatureTargets = @($nsis[0], $msi[0])
foreach ($target in $signatureTargets) {
  $signature = Get-AuthenticodeSignature -LiteralPath $target.FullName
  if ($RequireAuthenticode -and $signature.Status -ne "Valid") {
    throw "$($target.Name) does not have a valid Authenticode signature."
  }
  Write-Output "$($target.Name): Authenticode=$($signature.Status)"
}

Write-Output "Windows package smoke test passed for GrokDesk $ExpectedVersion."
