<#
.SYNOPSIS
  Two-session concurrency verification for SALO table reservations.
  Fires two simultaneous POST /api/customer/reservations requests for the same
  last free table/slot using separate sessions and CSRF handshakes.

.EXAMPLE
  .\docs\reservation\concurrency-check.ps1 -BaseUrl "http://127.0.0.1:8000" -RestaurantId 1 -Date "2026-11-28" -Time "18:00" -Rounds 3
#>
param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [int]$RestaurantId = 1,
  [string]$Date = "2026-11-28",
  [string]$Time = "18:00",
  [int]$PartySize = 2,
  [int]$Rounds = 3,
  [string]$Customer1Email = "customer1@example.com",
  [string]$Customer1Password = "SecretPass123!",
  [string]$Customer2Email = "customer2@example.com",
  [string]$Customer2Password = "SecretPass123!"
)

$ErrorActionPreference = "Stop"

function Invoke-BookJob {
  param($BaseUrl, $Email, $Password, $RestaurantId, $Start, $PartySize, $Key)
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-WebRequest -Uri "$BaseUrl/api/auth/csrf" -Method GET -WebSession $session -UseBasicParsing | Out-Null
  $xsrf = ($session.Cookies.GetCookies($BaseUrl) | Where-Object { $_.Name -eq "XSRF-TOKEN" }).Value
  $headers = @{ "X-XSRF-TOKEN" = [System.Uri]::UnescapeDataString($xsrf); "Accept" = "application/json" }

  $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -Headers $headers -WebSession $session -UseBasicParsing | Out-Null

  $xsrf2 = ($session.Cookies.GetCookies($BaseUrl) | Where-Object { $_.Name -eq "XSRF-TOKEN" }).Value
  $headers["X-XSRF-TOKEN"] = [System.Uri]::UnescapeDataString($xsrf2)
  $bookBody = @{
    restaurant_id = $RestaurantId
    start = $Start
    party_size = $PartySize
    idempotency_key = $Key
  } | ConvertTo-Json

  try {
    $resp = Invoke-WebRequest -Uri "$BaseUrl/api/customer/reservations" -Method POST -Body $bookBody -ContentType "application/json" -Headers $headers -WebSession $session -UseBasicParsing
    return [PSCustomObject]@{ Status = [int]$resp.StatusCode; Body = $resp.Content }
  } catch {
    $r = $_.Exception.Response
    return [PSCustomObject]@{ Status = [int]$r.StatusCode; Body = $_.ErrorDetails.Message }
  }
}

for ($round = 1; $round -le $Rounds; $round++) {
  $start = "${Date}T${Time}"
  $k1 = "conc-r$round-u1-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
  $k2 = "conc-r$round-u2-" + [guid]::NewGuid().ToString("N").Substring(0, 8)

  $j1 = Start-Job -ScriptBlock ${function:Invoke-BookJob} -ArgumentList $BaseUrl, $Customer1Email, $Customer1Password, $RestaurantId, $start, $PartySize, $k1
  $j2 = Start-Job -ScriptBlock ${function:Invoke-BookJob} -ArgumentList $BaseUrl, $Customer2Email, $Customer2Password, $RestaurantId, $start, $PartySize, $k2

  Wait-Job $j1, $j2 | Out-Null
  $res1 = Receive-Job $j1
  $res2 = Receive-Job $j2
  Remove-Job $j1, $j2

  $wins = @($res1, $res2 | Where-Object { $_.Status -eq 201 }).Count
  Write-Host "Round $round -> User1: $($res1.Status), User2: $($res2.Status) | Created count: $wins (expected 1 when 1 table left)"
}
