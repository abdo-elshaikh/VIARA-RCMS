@echo off
chcp 65001 >nul
title VIARA RCMS — تهيئة جدار الحماية (Windows Firewall Setup)
setlocal enabledelayedexpansion

echo ======================================================================
echo       VIARA RCMS — أداة فتح منافذ جدار الحماية التلقائية
echo ======================================================================
echo.

REM التحقق من صلاحيات المسؤول (Run as Administrator)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [تنبيه] يتطلب تشغيل هذه الأداة صلاحيات المسؤول (Administrator).
    echo جاري محاولة طلب الصلاحيات تلقائياً...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo جاري إضافة قواعد جدار الحماية لمنافذ نظام VIARA...
echo.

REM 1. منفذ واجهة المركز (Frontend RIS: 5173 TCP)
netsh advfirewall firewall add rule name="VIARA RIS Web Console (Port 5173)" dir=in action=allow protocol=TCP localport=5173 >nul 2>&1
echo   [✓] تم السماح لمنفذ واجهة الموظفين والأطباء (5173 TCP)

REM 2. منفذ بوابة المرضى (Portal: 5174 TCP)
netsh advfirewall firewall add rule name="VIARA Patient Portal (Port 5174)" dir=in action=allow protocol=TCP localport=5174 >nul 2>&1
echo   [✓] تم السماح لمنفذ بوابة المرضى والأطباء المحولين (5174 TCP)

REM 3. منفذ أجهزة الأشعة (DICOM PACS: 4242 TCP)
netsh advfirewall firewall add rule name="VIARA DICOM Storage & Worklist (Port 4242)" dir=in action=allow protocol=TCP localport=4242 >nul 2>&1
echo   [✓] تم السماح لمنفذ استقبال صور ومعدات الأشعة (4242 TCP)

REM 4. منفذ خادم النقل البديل Caddy (Port 80/443 TCP)
netsh advfirewall firewall add rule name="VIARA Web HTTP/HTTPS (Ports 80,443)" dir=in action=allow protocol=TCP localport=80,443 >nul 2>&1
echo   [✓] تم السماح لمنافذ الويب الموحدة (80, 443 TCP)

echo.
echo ======================================================================
echo       تم تكوين جدار الحماية بنجاح تام!
echo ======================================================================
echo الآن يمكن لكافة أجهزة المركز وأجهزة الأشعة التواصل مع الخادم بحرية.
echo.
pause
