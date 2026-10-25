@echo off
title OpenPlay - Dev Server

cd /d "%~dp0"

echo ============================================================
echo   Starting OpenPlay Development Environment
echo ============================================================
echo(

rem Add Cargo bin directory to PATH if it exists
if exist "%USERPROFILE%\.cargo\bin" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

rem Verify Cargo / Rust
where cargo >nul 2>&1
if errorlevel 1 goto :no_cargo

rem Verify Node.js / npm
where npm >nul 2>&1
if errorlevel 1 goto :no_npm

echo [OK] Rust/Cargo:
cargo --version
echo [OK] Node/npm:
call node -v
call npm -v
echo(
echo Launching OpenPlay dev server...
echo(

call npm run tauri dev

if errorlevel 1 (
    echo(
    echo [ERROR] Dev server stopped with error code %errorlevel%
    pause
)
exit /b 0

:no_cargo
echo [ERROR] Cargo / Rust was not found in PATH or %USERPROFILE%\.cargo\bin.
echo Please install Rust from: https://rustup.rs/
echo(
pause
exit /b 1

:no_npm
echo [ERROR] Node.js / npm was not found in PATH.
echo Please install Node.js from: https://nodejs.org/
echo(
pause
exit /b 1
