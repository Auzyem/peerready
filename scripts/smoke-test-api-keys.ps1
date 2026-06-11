<#
.SYNOPSIS
  Smoke tests for the PeerReady API key system (Final Checklist items 5 & 6,
  plus auth/scope sanity checks).

.DESCRIPTION
  Exercises the Bearer-token auth path on the API-key-protected routes:
    - POST /api/upload          (scope: manuscript:write)
    - POST /api/review/start    (scope: review:write)
    - GET  /api/review/status   (scope: review:read)

  Requires PowerShell 7+ (uses -SkipHttpErrorCheck and -Form).

.PREREQUISITES
  In the live app, on a Pro (or Team) account at /settings/api-keys, create:
    Key A ("smoke-write")    -> scopes: manuscript:write + review:write
    Key B ("smoke-readonly") -> scope:  review:read  ONLY
  Then grab a manuscriptId and draftId you own (from the app UI/network tab)
  and point $file at a small test PDF.

  Fill in the variables below, then run:  pwsh ./scripts/smoke-test-api-keys.ps1
  Revoke the two test keys afterwards.

.NOTES
  By design this does NOT start a real review with the write key (that would
  trigger the AI pipeline and consume quota). Uncomment T5 if you want that.
#>

# ── Fill these in ─────────────────────────────────────────────
$base = 'https://peerready.vercel.app'
$keyW = 'pr_live_XXXX'          # Key A: manuscript:write + review:write
$keyR = 'pr_live_YYYY'          # Key B: review:read ONLY
$mid  = '<manuscriptId-you-own>'
$did  = '<draftId-you-own>'
$file = 'C:\path\to\test.pdf'
$sid  = '<sessionId-you-own>'   # only needed for the optional T5
# ──────────────────────────────────────────────────────────────

$script:failures = 0

function Test-Case {
  param(
    [string]$Name,
    [int]$Expected,
    [scriptblock]$Call
  )
  $r = & $Call
  $code = [int]$r.StatusCode
  $body = $null
  try { $body = $r.Content | ConvertFrom-Json -ErrorAction Stop } catch {}
  $ok = $code -eq $Expected
  if (-not $ok) { $script:failures++ }
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  '{0}  [{1}] expected {2}, got {3}  {4}' -f $status, $Name, $Expected, $code, ($body.error ?? '')
}

# T1 — malformed/invalid key → 401
Test-Case 'invalid-key' 401 {
  Invoke-WebRequest "$base/api/review/start" -Method Post -SkipHttpErrorCheck `
    -Headers @{ Authorization = 'Bearer pr_live_not_a_real_key' } `
    -ContentType 'application/json' -Body (@{ draftId = $did } | ConvertTo-Json)
}

# T2 — no auth at all → 401
Test-Case 'no-auth' 401 {
  Invoke-WebRequest "$base/api/review/start" -Method Post -SkipHttpErrorCheck `
    -ContentType 'application/json' -Body (@{ draftId = $did } | ConvertTo-Json)
}

# T3 — CHECKLIST #5: upload with manuscript:write key → 200
Test-Case 'upload-write-key' 200 {
  Invoke-WebRequest "$base/api/upload" -Method Post -SkipHttpErrorCheck `
    -Headers @{ Authorization = "Bearer $keyW" } `
    -Form @{ file = Get-Item $file; manuscriptId = $mid }
}

# T4 — CHECKLIST #6: review:read-only key starting a review → 403 (missing review:write)
Test-Case 'readonly-blocked' 403 {
  Invoke-WebRequest "$base/api/review/start" -Method Post -SkipHttpErrorCheck `
    -Headers @{ Authorization = "Bearer $keyR" } `
    -ContentType 'application/json' -Body (@{ draftId = $did } | ConvertTo-Json)
}

# T5 — read-only key CAN read status → 200  (optional; needs a real sessionId)
# Test-Case 'readonly-can-read' 200 {
#   Invoke-WebRequest "$base/api/review/status/$sid" -Method Get -SkipHttpErrorCheck `
#     -Headers @{ Authorization = "Bearer $keyR" }
# }

Write-Host ''
if ($script:failures -eq 0) {
  Write-Host 'All smoke tests passed.' -ForegroundColor Green
} else {
  Write-Host "$($script:failures) smoke test(s) FAILED." -ForegroundColor Red
  exit 1
}
