@echo off
chcp 65001 >nul
title VIARA RCMS — فحص صحة وجاهزية النظام (Health & Network Diagnostic)
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo ======================================================================
echo           VIARA RCMS — أداة تشخيص النظام والشبكة المحلية
echo ======================================================================
echo.

REM 1. استخراج عناوين IP المحلية للخادم
echo [1/3] فحص بطاقات الشبكة وعناوين IP المحلية للخادم:
echo ----------------------------------------------------------------------
powershell -NoProfile -Command ^
    "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback|Docker' -and $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty IPAddress;" ^
    "if ($ips) {" ^
    "    foreach ($ip in $ips) {" ^
    "        Write-Host \"  • عنوان الـ IP المحلي: \" -NoNewline; Write-Host $ip -ForegroundColor Green;" ^
    "        Write-Host \"    - واجهة المركز:      http://$($ip):5173\" -ForegroundColor Cyan;" ^
    "        Write-Host \"    - بوابة المرضى:     http://$($ip):5174\" -ForegroundColor Cyan;" ^
    "        Write-Host \"    - منفذ الأشعة DICOM:  $($ip):4242 (AET: MiPACS2)\" -ForegroundColor Yellow;" ^
    "    }" ^
    "} else {" ^
    "    Write-Host \"  لم يتم العثور على عنوان IP محلي نشط! تأكد من توصيل كابل الشبكة أو الـ Wi-Fi.\" -ForegroundColor Red;" ^
    "}"
echo ----------------------------------------------------------------------
echo.

REM 2. حالة الحاويات النشطة
echo [2/3] فحص حالة حاويات النظام (Containers Status):
echo ----------------------------------------------------------------------
docker compose ps
echo ----------------------------------------------------------------------
echo.

REM 3. فحص استجابة واجهة الويب
echo [3/3] فحص استجابة الواجهات الطبية:
powershell -NoProfile -Command ^
    "try {" ^
    "    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 3;" ^
    "    if ($r.StatusCode -eq 200) { Write-Host '  [✓] واجهة المركز (RIS Core): تعمل بكفاءة تامة.' -ForegroundColor Green } else { Write-Host '  [!] واجهة المركز استجابت برمز: ' $r.StatusCode -ForegroundColor Yellow }" ^
    "} catch {" ^
    "    Write-Host '  [✗] تعذر الاتصال بواجهة المركز على http://localhost:5173 (تأكد من تشغيل START_VIARA.bat)' -ForegroundColor Red;" ^
    "}"
echo.
echo ======================================================================
pause
