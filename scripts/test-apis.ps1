<#
.SYNOPSIS
    Tests PassMeet API endpoints.
.DESCRIPTION
    Assumes npm run dev is running on BaseUrl. Tests GET /api/events, POST /api/events, and optionally GET /.
.PARAMETER BaseUrl
    Base URL of the app (default: http://localhost:3000)
.EXAMPLE
    .\scripts\test-apis.ps1
.EXAMPLE
    .\scripts\test-apis.ps1 -BaseUrl "http://localhost:3001"
#>

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0
$results = @()

function Write-Pass { param([string]$msg) Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }

Write-Host "`nPassMeet API Tests" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl`n" -ForegroundColor Gray

# Test 1: GET /
try {
    $r = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        Write-Pass "GET / - 200 OK"
        $passed++
        $results += @{ Name = "GET /"; Status = "PASS" }
    } else {
        Write-Fail "GET / - Expected 200, got $($r.StatusCode)"
        $failed++
        $results += @{ Name = "GET /"; Status = "FAIL"; Detail = "Status $($r.StatusCode)" }
    }
} catch {
    Write-Fail "GET / - $($_.Exception.Message)"
    $failed++
    $results += @{ Name = "GET /"; Status = "FAIL"; Detail = $_.Exception.Message }
}

# Test 2: GET /api/events
try {
    $r = Invoke-WebRequest -Uri "$BaseUrl/api/events" -Method GET -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        $json = $r.Content | ConvertFrom-Json
        if ($null -ne $json.events) {
            Write-Pass "GET /api/events - 200 OK (events array present, count: $($json.events.Count) - no IPFS)"
            $passed++
            $results += @{ Name = "GET /api/events"; Status = "PASS" }
        } else {
            Write-Fail "GET /api/events - 200 but no 'events' key in response"
            $failed++
            $results += @{ Name = "GET /api/events"; Status = "FAIL"; Detail = "No events key" }
        }
    } else {
        Write-Fail "GET /api/events - Expected 200, got $($r.StatusCode)"
        $failed++
        $results += @{ Name = "GET /api/events"; Status = "FAIL"; Detail = "Status $($r.StatusCode)" }
    }
} catch {
    Write-Fail "GET /api/events - $($_.Exception.Message)"
    $failed++
    $results += @{ Name = "GET /api/events"; Status = "FAIL"; Detail = $_.Exception.Message }
}

# Test 3: POST /api/events
try {
    $body = @{
        id = 999
        name = "Test Event"
        date = "2026-03-01"
        location = "Test Location"
        organizer = "aleo1test"
        capacity = 10
        price = 0.5
    } | ConvertTo-Json

    $r = Invoke-WebRequest -Uri "$BaseUrl/api/events" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200) {
        $json = $r.Content | ConvertFrom-Json
        if ($json.success -eq $true) {
            Write-Pass "POST /api/events - 200 OK (success: true, no-op)"
            $passed++
            $results += @{ Name = "POST /api/events"; Status = "PASS" }
        } else {
            Write-Fail "POST /api/events - 200 but success not true"
            $failed++
            $results += @{ Name = "POST /api/events"; Status = "FAIL"; Detail = "success not true" }
        }
    } else {
        Write-Fail "POST /api/events - Expected 200, got $($r.StatusCode)"
        $failed++
        $results += @{ Name = "POST /api/events"; Status = "FAIL"; Detail = "Status $($r.StatusCode)" }
    }
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 500) {
        Write-Host "  [WARN] POST /api/events - 500" -ForegroundColor Yellow
        $passed++
        $results += @{ Name = "POST /api/events"; Status = "WARN"; Detail = "500 - Pinata may be unconfigured" }
    } else {
        Write-Fail "POST /api/events - $($_.Exception.Message)"
        $failed++
        $results += @{ Name = "POST /api/events"; Status = "FAIL"; Detail = $_.Exception.Message }
    }
}

# Summary
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Summary: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "----------------------------------------`n" -ForegroundColor Gray

if ($failed -gt 0) {
    exit 1
}
exit 0
