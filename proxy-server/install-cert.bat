@echo off
@CHCP 65001 >nul
title VIP Ultra — Instalar Certificado
echo.
echo   =========================================
echo     VIP Ultra — Instalador de Certificado
echo   =========================================
echo.
echo   Para interceptar o trafego HTTPS sem alertas de "Nao Seguro",
echo   precisamos confiar no certificado CA local do proxy.
echo.
echo   [!] O Windows vai pedir confirmacao de Administrador.
echo.

cd /d "%~dp0"
set CERT_PATH="%cd%\certs\certs\ca.pem"

if not exist %CERT_PATH% (
    echo [ERRO] Certificado nao encontrado em: %CERT_PATH%
    echo Inicie o proxy pelo menos uma vez para gerar o certificado.
    echo.
    pause
    exit /b
)

:: Executa o certutil como Administrador pedindo permissao
powershell -Command "Start-Process certutil -ArgumentList '-addstore -user Root \"%CERT_PATH%\"' -Verb RunAs"

echo.
echo [✓] Procedimento concluido!
echo [!] Reinicie o Chrome para que ele reconheca o novo certificado.
echo.
pause
EXIT /B 0
