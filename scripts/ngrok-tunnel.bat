@echo off
REM Launcher: bypasses ExecutionPolicy so ngrok-tunnel.ps1 runs without code-signing errors.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ngrok-tunnel.ps1"
