@echo off
chcp 65001 >nul
title VIARA RCMS - Linux VM instructions

echo ======================================================================
echo VIARA RCMS production deployment
echo ======================================================================
echo.
echo Windows Server is supported only as a host for the supported Linux VM.
echo This Windows launcher does not start production containers.
echo.
echo Copy the approved release bundle to the Linux VM, then run:
echo   cd /opt/viara/viara-production-package
echo   ./scripts/start.sh
echo.
echo Configure the signed customer license, immutable image digests, HTTPS
echo edge, VPN/mTLS clinical access, firewall rules, and backups before use.
echo Do not expose DICOM, Orthanc, PostgreSQL, or staff services publicly.
echo.
pause
exit /b 1
