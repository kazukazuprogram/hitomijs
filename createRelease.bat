@echo off

set PATH=%PATH%;%CD%\bin
set NAME=hitomijs-%1%.zip

yarn compile && 7z a -mx9 -mmt8 %NAME% main.js installDependency.bat bin README.md
