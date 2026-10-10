$Host.UI.RawUI.WindowTitle = "VIARA RCMS - Linux VM instructions"

Write-Host "VIARA RCMS production deployment" -ForegroundColor Cyan
Write-Host ""
Write-Host "Windows Server is supported only as a host for the supported Linux VM." -ForegroundColor Yellow
Write-Host "This Windows launcher does not start production containers."
Write-Host ""
Write-Host "Copy the approved release bundle to the Linux VM, then run:"
Write-Host "  cd /opt/viara/viara-production-package"
Write-Host "  ./scripts/start.sh"
Write-Host ""
Write-Host "Configure the signed customer license, immutable image digests, HTTPS edge,"
Write-Host "VPN/mTLS clinical access, firewall rules, and backups before use."
Write-Host "Do not expose DICOM, Orthanc, PostgreSQL, or staff services publicly."
