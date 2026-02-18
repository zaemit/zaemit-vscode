@echo off
echo ============================================
echo   Zaemit Visual Editor - Install
echo ============================================
echo.

code --install-extension "%~dp0zaemit-visual-editor-0.0.1.vsix" --force

if %errorlevel% equ 0 (
    echo.
    echo [OK] Installation successful! Please restart VS Code.
) else (
    echo.
    echo [ERROR] Installation failed. Please make sure VS Code is installed.
)

echo.
pause
