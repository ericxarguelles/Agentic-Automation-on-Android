$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot 'work\tools\tunnel-client'
$downloadDirectory = Join-Path $projectRoot 'work\tunnel-setup'
New-Item -ItemType Directory -Path $toolsDirectory,$downloadDirectory -Force | Out-Null

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$releaseArchitecture = switch ($architecture) {
    'x64' { 'amd64' }
    'arm64' { 'arm64' }
    default { throw "Unsupported Windows architecture: $architecture" }
}
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/openai/tunnel-client/releases/latest'
$expectedName = 'tunnel-client-{0}-windows-{1}.zip' -f $release.tag_name,$releaseArchitecture
$asset = @($release.assets | Where-Object name -eq $expectedName)
$checksums = @($release.assets | Where-Object name -eq 'SHA256SUMS.txt')
if ($asset.Count -ne 1 -or $checksums.Count -ne 1) { throw 'The official release does not contain the expected Windows binary and checksums.' }
foreach ($download in @($asset[0], $checksums[0])) {
    $downloadUri = [Uri]$download.browser_download_url
    if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'github.com' -or -not $downloadUri.AbsolutePath.StartsWith('/openai/tunnel-client/releases/download/')) {
        throw 'Unexpected release download origin.'
    }
}
$archivePath = Join-Path $downloadDirectory 'tunnel-client.zip'
$checksumPath = Join-Path $downloadDirectory 'SHA256SUMS.txt'
Invoke-WebRequest -Uri $asset[0].browser_download_url -OutFile $archivePath
Invoke-WebRequest -Uri $checksums[0].browser_download_url -OutFile $checksumPath
$checksumLine = @(Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match ('\s\*?' + [regex]::Escape($expectedName) + '$') })
if ($checksumLine.Count -ne 1) { throw 'Expected archive checksum is missing or ambiguous.' }
$expectedHash = ($checksumLine[0] -split '\s+')[0]
if ($expectedHash -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 checksum format.' }
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'Checksum mismatch. The downloaded archive will not be executed.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDirectory -Force
$executables = @(Get-ChildItem -LiteralPath $toolsDirectory -Filter 'tunnel-client.exe' -Recurse -File)
if ($executables.Count -ne 1) { throw 'Expected exactly one tunnel-client.exe in the extracted release.' }
Write-Output ('Installed official tunnel-client {0}; SHA-256 verified.' -f $release.tag_name)
Write-Output $executables[0].FullName
