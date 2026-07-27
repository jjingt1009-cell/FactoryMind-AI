param(
    [switch]$Public
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if ($Public) {
    python .\run.py --public
} else {
    python .\run.py --local
}
