@echo off
setlocal

chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launchers\run-selfhost.ps1"
if errorlevel 1 (
  echo.
  echo PowerShell script failed.
  pause
)
