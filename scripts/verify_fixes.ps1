$ErrorActionPreference = "Continue"
# Demo password comes from the environment (seeders require TEST_USER_PASSWORD).
if (-not $env:TEST_USER_PASSWORD) {
    foreach ($p in @("$PSScriptRoot\..\backend\.env", "$PSScriptRoot\..\.env")) {
        if (Test-Path $p) {
            $m = Select-String -Path $p -Pattern '^TEST_USER_PASSWORD=(.+)$' | Select-Object -First 1
            if ($m) { $env:TEST_USER_PASSWORD = $m.Matches[0].Groups[1].Value.Trim(); break }
        }
    }
}
if (-not $env:TEST_USER_PASSWORD) { Write-Error "TEST_USER_PASSWORD is required (env or .env)"; exit 1 }
$demoPass = $env:TEST_USER_PASSWORD
$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -Uri "http://localhost:3000/api/csrf-token" -UseBasicParsing -WebSession $ws | Out-Null
$tok = ($ws.Cookies.GetCookies("http://localhost:3000") | Where-Object Name -eq "csrf_token").Value
$ft    = ((Invoke-WebRequest "http://localhost:3000/api/auth/login" -Method POST -Body ('{"email":"admin@VIARA.com","password":"' + $demoPass + '","rememberMe":true}') -ContentType "application/json" -UseBasicParsing -WebSession $ws -Headers @{"x-csrf-token"=$tok}).Content | ConvertFrom-Json).token
$ftRad = ((Invoke-WebRequest "http://localhost:3000/api/auth/login" -Method POST -Body ('{"email":"ahmed.hassan@VIARA.com","password":"' + $demoPass + '","rememberMe":true}') -ContentType "application/json" -UseBasicParsing -WebSession $ws -Headers @{"x-csrf-token"=$tok}).Content | ConvertFrom-Json).token
$h   = @{ Authorization="Bearer $ft" }
$ph  = @{ Authorization="Bearer $ft"; "Content-Type"="application/json"; "x-csrf-token"=$tok }
$hR  = @{ Authorization="Bearer $ftRad" }
$phR = @{ Authorization="Bearer $ftRad"; "Content-Type"="application/json"; "x-csrf-token"=$tok }
$today    = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

function T($id,$test,$pass,$detail) {
    $icon = if ($pass -eq $true) {"PASS"} elseif ($pass -eq $false) {"FAIL"} else {"SKIP"}
    Write-Host "[$icon] $($id.PadRight(8)) $test"
    if ($detail) { Write-Host "         $detail" }
    return $pass
}

$results = [ordered]@{}

# BUG-3: Search case-insensitive
$up = (Invoke-WebRequest "http://localhost:3000/api/patients?search=Ahmed&limit=3" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$lo = (Invoke-WebRequest "http://localhost:3000/api/patients?search=ahmed&limit=3" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$results["BUG-3"] = T "BUG-3" "Patient search case-insensitive" ($up.meta.total -gt 0 -and $up.meta.total -eq $lo.meta.total) "upper=$($up.meta.total) lower=$($lo.meta.total)"

# BUG-4: Radiologist WRITE_REPORTS
$wl = (Invoke-WebRequest "http://localhost:3000/api/exams/worklist?limit=5" -Headers $hR -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$unlocked = $wl | Where-Object { $_.report_locked -eq $false } | Select-Object -First 1
if ($unlocked) {
    try {
        $rep = (Invoke-WebRequest "http://localhost:3000/api/exams/$($unlocked.exam_id)/report" -Method PUT -Body '{"findings":"Lungs clear","impression":"Normal"}' -Headers $phR -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
        $results["BUG-4"] = T "BUG-4" "Radiologist can update report (WRITE_REPORTS)" $true "status=$($rep.report_status)"
    } catch {
        $results["BUG-4"] = T "BUG-4" "Radiologist can update report (WRITE_REPORTS)" $false "$($_.Exception.Response.StatusCode.Value__): $($_.ErrorDetails.Message)"
    }
} else { $results["BUG-4"] = T "BUG-4" "Radiologist can update report (WRITE_REPORTS)" $null "All exams locked" }

# BUG-5: No PHI in case-reports
$cr = (Invoke-WebRequest "http://localhost:3000/api/case-reports?limit=1" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$k = @($cr.items[0].PSObject.Properties.Name)
$noPhone = -not ($k -contains "patient_phone")
$noEmail = -not ($k -contains "patient_email_enc")
$results["BUG-5"] = T "BUG-5" "No PHI (patient_phone/email) in case-reports" ($noPhone -and $noEmail) "phone_absent=$noPhone email_enc_absent=$noEmail"

# BUG-6: Cancel requires reason
$pts  = (Invoke-WebRequest "http://localhost:3000/api/patients?limit=1" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$mach = (Invoke-WebRequest "http://localhost:3000/api/machines" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$mId  = ($mach | Where-Object {$_.status -eq 'Active'} | Select-Object -First 1).modality_id
$ptId = $pts.data[0].patient_id
$nb   = "{`"patientId`":`"$ptId`",`"modalityId`":`"$mId`",`"startTime`":`"${tomorrow}T07:00:00.000Z`",`"endTime`":`"${tomorrow}T08:00:00.000Z`",`"priority`":`"Routine`",`"appointmentSource`":`"Walk-in`",`"paymentMethod`":`"Cash`"}"
$newA = (Invoke-WebRequest "http://localhost:3000/api/appointments" -Method POST -Body $nb -Headers $ph -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$blocked = $false; $msg = ""
try {
    Invoke-WebRequest "http://localhost:3000/api/appointments/$($newA.appointment_id)" -Method DELETE -Body '{"reason":""}' -Headers $ph -WebSession $ws -UseBasicParsing | Out-Null
} catch {
    $blocked = $true
    $emsg = $_.ErrorDetails.Message | ConvertFrom-Json
    $msg = "blocked: $($emsg.details[0].message)"
}
$results["BUG-6"] = T "BUG-6" "Cancel appointment requires reason >= 3 chars" $blocked $msg
try { Invoke-WebRequest "http://localhost:3000/api/appointments/$($newA.appointment_id)" -Method DELETE -Body '{"reason":"test cleanup reason"}' -Headers $ph -WebSession $ws -UseBasicParsing | Out-Null } catch {}

# BUG-9: HR Shifts same-day range
$shOK = $false; $shMsg = ""
try {
    $sh = (Invoke-WebRequest "http://localhost:3000/api/hr/shifts?startDate=$today&endDate=$today" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
    $shOK = $true; $shMsg = "count=$($sh.Count)"
} catch { $shMsg = $_.ErrorDetails.Message }
$results["BUG-9"] = T "BUG-9" "HR Shifts: startDate=endDate allowed" $shOK $shMsg

# BUG-10: No portal_password_hash
$docs = (Invoke-WebRequest "http://localhost:3000/api/referring-doctors" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$noHash = -not (@($docs[0].PSObject.Properties.Name) -contains "portal_password_hash")
$results["BUG-10"] = T "BUG-10" "No portal_password_hash in referring-doctors" $noHash "fields=$(@($docs[0].PSObject.Properties.Name).Count) returned"

# BUG-11: Safety templates route
$mId2 = $mach[0].modality_id
$stOK = $false; $stMsg = ""
try {
    $st = (Invoke-WebRequest "http://localhost:3000/api/v1/clinical/templates/$mId2" -Headers $hR -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
    $stOK = $true; $stMsg = "count=$($st.Count)"
} catch {
    $stMsg = "$($_.Exception.Response.StatusCode.Value__)"
    $em = $_.ErrorDetails.Message | ConvertFrom-Json
    $stMsg = "$($em.statusCode):$($em.message)"
}
$results["BUG-11"] = T "BUG-11" "Safety templates /api/v1/clinical/templates/:id" $stOK $stMsg

# BUG-12: Queue schema clear error with path
$qOK = $false; $qMsg = ""
try {
    Invoke-WebRequest "http://localhost:3000/api/queue/00000000-0000-0000-0000-000000000000/transition" -Method POST -Body '{"notes":"x"}' -Headers $ph -WebSession $ws -UseBasicParsing | Out-Null
    $qMsg = "did not error"
} catch {
    $qe = $_.ErrorDetails.Message | ConvertFrom-Json
    $f = $qe.details | Where-Object { $_.field -eq "toStage" }
    $qOK = $null -ne $f
    $qMsg = "field=toStage msg=$($f.message)"
}
$results["BUG-12"] = T "BUG-12" "Queue schema error has field=toStage" $qOK $qMsg

# BUG-13: Pagination out-of-range returns empty
$bigP = (Invoke-WebRequest "http://localhost:3000/api/patients?page=9999&limit=10" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$results["BUG-13"] = T "BUG-13" "Pagination page>max returns empty data" ($bigP.data.Count -eq 0) "count=$($bigP.data.Count) total=$($bigP.meta.total)"

# BUG-22: Insurance entity_name in contracts
$c = (Invoke-WebRequest "http://localhost:3000/api/insurance/contracts" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$hasEntity = ($c[0].entity_name -ne $null -and $c[0].entity_name.Length -gt 0)
$results["BUG-22"] = T "BUG-22" "Insurance contracts display entity_name" $hasEntity "entity='$($c[0].entity_name)'"

# AUDIT: actor_name in login events
$try_pass = $false
try { Invoke-WebRequest "http://localhost:3000/api/auth/login" -Method POST -Body '{"email":"admin@VIARA.com","password":"wrongXYZ"}' -ContentType "application/json" -UseBasicParsing -WebSession $ws | Out-Null } catch {}
Start-Sleep -Milliseconds 500
$al = (Invoke-WebRequest "http://localhost:3000/api/audit-logs?limit=10" -Headers $h -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$authL = $al.logs | Where-Object { $_.action -like "*LOGIN*" } | Select-Object -First 1
$actorOK = ($null -ne $authL -and $authL.actor_name -ne $null -and $authL.actor_name -ne "")
$results["AUDIT"] = T "AUDIT" "Login audit logs have actor_name" $actorOK "actor_name='$($authL.actor_name)' action=$($authL.action)"

Write-Host ""
Write-Host "============================================"
$pass  = ($results.Values | Where-Object {$_ -eq $true}).Count
$fail  = ($results.Values | Where-Object {$_ -eq $false}).Count
$skip  = ($results.Values | Where-Object {$_ -eq $null}).Count
Write-Host "  PASS=$pass  FAIL=$fail  SKIP=$skip  TOTAL=$($results.Count)"
Write-Host "============================================"
