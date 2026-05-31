param(
  [string]$Source = ".\skill-template\standard-non-mcp-skill",
  [string]$Output = ".\skill-template\dist\standard-non-mcp-skill.zip"
)

$ErrorActionPreference = "Stop"

$sourcePath = Resolve-Path $Source
$outputDir = Split-Path -Parent $Output
$outputPath = Resolve-Path $outputDir -ErrorAction SilentlyContinue

if (-not $outputPath) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (Test-Path $Output) {
  Remove-Item -LiteralPath $Output -Force
}

Compress-Archive -Path $sourcePath -DestinationPath $Output -Force
Write-Host "Skill zip created:" (Resolve-Path $Output)
