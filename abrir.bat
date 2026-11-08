@echo off
rem Animasy: abre com dois cliques.
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 goto abrir
if not exist node_modules (
  echo Instalando ^(so na primeira vez^)...
  call npm install --no-audit --no-fund
)
echo Preparando o Animasy...
call npm run build --silent
:abrir
if not exist dist\index.html (
  echo Nao achei dist\index.html. Instale o Node.js ^(https://nodejs.org^) e rode de novo.
  pause
  exit /b 1
)
start "" "%~dp0dist\index.html"
