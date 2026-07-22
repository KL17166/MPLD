@echo off
@CHCP 65001 >nul
title VIP Ultra — MITM Proxy
echo.
echo   ==============================
echo     VIP Ultra — MITM Proxy
echo   ==============================
echo.

cd /d "%~dp0"

echo.
echo [Dica] Se o navegador mostrar aviso "Nao Seguro" (HTTPS),
echo        feche isso, de um clique-duplo em "install-cert.bat".
echo.

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [!] Erro ao iniciar. Verifique se o Node.js esta instalado.
    echo     Baixe em: https://nodejs.org
    echo.
    pause
    EXIT /B 1
)

EXIT /B 0
