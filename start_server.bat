@echo off
REM Устанавливаем кодировку консоли
chcp 65001 > nul

REM Очищаем экран
cls

REM Активируем виртуальное окружение
call venv\Scripts\activate

REM Пишем пользователю инструкцию
echo Запуск сервера Uvicorn...

REM Автоматически открываем браузер с игрой
start http://127.0.0.1:8000/static/game.html

REM Запускаем сервер
uvicorn main:app --reload
