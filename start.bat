@echo off
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%
odejs"
node serve.mjs || echo Node.js is needed to run from the source folder: https://nodejs.org (or download the ready-made app from the releases page)
pause
