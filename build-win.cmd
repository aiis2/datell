@echo off
cd /d d:\python_project\auto_report
echo [1/3] TypeScript compile...
call npx tsc -p src/main/tsconfig.json
if errorlevel 1 ( echo TSC FAILED & exit /b 1 )
echo [2/3] Vite build...
call npx vite build
if errorlevel 1 ( echo VITE FAILED & exit /b 1 )
echo [3/3] electron-builder...
call npx electron-builder --win --publish never
echo Exit: %ERRORLEVEL%
