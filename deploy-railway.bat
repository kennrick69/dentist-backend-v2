@echo off
chcp 65001 >nul
title Deploy Dental Ultra - Railway
color 0A

echo ============================================
echo   DEPLOY DENTAL ULTRA - Backend Railway
echo ============================================
echo.

set GIT="C:\Program Files\Git\bin\git.exe"
if not exist %GIT% (
    set GIT=git
)

cd /d "C:\Users\Lenovo\Desktop\backend"
echo Pasta: %CD%
echo.

:: Configurar identidade git
%GIT% config user.email "kennrick69@gmail.com"
%GIT% config user.name "kennrick69"

:: Inicializar git se nao existe
if not exist ".git" (
    echo Inicializando repositorio git...
    %GIT% init
    %GIT% remote add origin https://github.com/kennrick69/dentist-backend-v2.git
    echo       OK
    echo.
)

echo [1/3] Adicionando arquivos...
%GIT% add -A
echo       OK
echo.

echo [2/3] Criando commit...
%GIT% commit -m "feat: backend v7 - prontuario completo"
echo       OK
echo.

echo [3/3] Enviando para Railway...
%GIT% branch -M main
%GIT% push -u origin main --force
echo.

echo ============================================
echo   DEPLOY CONCLUIDO!
echo ============================================
echo.
pause
