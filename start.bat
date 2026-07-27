@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="--public" (
    python run.py --public
) else (
    python run.py --local
)
