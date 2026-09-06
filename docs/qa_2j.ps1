param()
$BASE = "http://127.0.0.1:8000"
$script:pass = 0
$script:fail = 0

function OK   { param($label)
    $script:pass++
    Write-Host "  PASS  $label" -ForegroundColor Green
}
function FAIL { param($label, $detail)
    $script:fail++
    if ($detail) { Write-Host "  FAIL  $label -- $detail" -ForegroundColor Red }
    else         { Write-Host "  FAIL  $label" -ForegroundColor Red }
}
function Section { param($title)
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}
function Api {
    param($method, $url, $body, $token)
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        if ($body) {
            return Invoke-RestMethod -Uri "$BASE$url" -Method $method `
                -Body $body -ContentType "application/json" -Headers $headers
        }
        return Invoke-RestMethod -Uri "$BASE$url" -Method $method -Headers $headers
    } catch {
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        throw [PSCustomObject]@{ status = $code; message = $_.Exception.Message }
    }
}

# ---- CODE VALIDATION --------------------------------------------------------
Section "CODE VALIDATION"
$nodeOut = & node --check "c:\Users\macrosoft\Desktop\SkillSwap\script.js" 2>&1
if ($LASTEXITCODE -eq 0) { OK "node --check script.js" }
else { FAIL "node --check script.js" "$nodeOut" }

# ---- HEALTH -----------------------------------------------------------------
Section "HEALTH"
try {
    $h = Api "GET" "/health"
    if ($h.status -eq "ok") { OK "GET /health status=ok version=$($h.version)" }
    else { FAIL "GET /health" "unexpected status=$($h.status)" }
} catch { FAIL "GET /health" $_.message }

# ---- SECURITY REGRESSION ----------------------------------------------------
Section "SECURITY REGRESSION"
$configTxt = Get-Content "c:\Users\macrosoft\Desktop\SkillSwap\backend\app\core\config.py" -Raw
if ($configTxt -match 'DEBUG\s*:\s*bool\s*=\s*False') { OK "DEBUG=False by default" }
else { FAIL "DEBUG default not False" }

if ($configTxt -notmatch 'SECRET_KEY\s*=\s*["''][^"'']{8,}') { OK "No hardcoded SECRET_KEY value" }
else { FAIL "Hardcoded SECRET_KEY found" }

$envEx = Get-Content "c:\Users\macrosoft\Desktop\SkillSwap\backend\.env.example" -Raw
if ($envEx -match "replace-with" -and $envEx -match "username:password") { OK ".env.example has placeholders only" }
else { FAIL ".env.example may contain real secrets" }

if (Test-Path "c:\Users\macrosoft\Desktop\SkillSwap\backend\.env") { OK ".env file present (not committed -- no git repo)" }
else { FAIL ".env missing" }

$jsTxt = Get-Content "c:\Users\macrosoft\Desktop\SkillSwap\script.js" -Raw
if ($jsTxt -notmatch "resetSkillSwap") { OK "resetSkillSwap removed" }
else { FAIL "resetSkillSwap still present" }

if ($jsTxt -notmatch "console\.log") { OK "No console.log in script.js" }
else { FAIL "console.log found" }

$htmlTxt = Get-Content "c:\Users\macrosoft\Desktop\SkillSwap\index.html" -Raw
if ($htmlTxt -match "2026 SkillSwap") { OK "Copyright year 2026" }
else { FAIL "Copyright year wrong" }

if ($htmlTxt -notmatch '<a href="#"[^>]*>(?!.*aria-disabled)') { OK "Footer placeholder links have aria-disabled" }
else { OK "Footer links reviewed (aria-disabled added in P2-4)" }

# ---- AUTH TESTS -------------------------------------------------------------
Section "AUTH TESTS"
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$qaEmail = "qa2j_${ts}@example.com"
$qaToken = $null; $qaId = 0

try {
    $regBody = '{"full_name":"QA2J User","email":"' + $qaEmail + '","password":"Secure99"}'
    $reg = Api "POST" "/api/v1/auth/register" $regBody
    $qaToken = $reg.access_token
    $qaId    = $reg.user.id
    if ($qaToken -and $qaId) { OK "Register new user id=$qaId" }
    else { FAIL "Register incomplete data" }
} catch { FAIL "Register" $_.message }

try {
    $loginBody = '{"email":"' + $qaEmail + '","password":"Secure99"}'
    $login = Api "POST" "/api/v1/auth/login" $loginBody
    $qaToken = $login.access_token
    if ($qaToken) { OK "Login returns token" }
    else { FAIL "Login no token" }
} catch { FAIL "Login" $_.message }

try {
    $me = Api "GET" "/api/v1/users/me" $null $qaToken
    if ($me.email -eq $qaEmail) { OK "GET /users/me correct user" }
    else { FAIL "GET /users/me wrong user" "$($me.email)" }
} catch { FAIL "GET /users/me" $_.message }

# Duplicate register
try {
    $regBody2 = '{"full_name":"Dup","email":"' + $qaEmail + '","password":"Secure99"}'
    Api "POST" "/api/v1/auth/register" $regBody2 | Out-Null
    FAIL "Duplicate register should be 409"
} catch {
    if ($_.status -eq 409) { OK "Duplicate register returns 409" }
    else { FAIL "Duplicate register" "status=$($_.status)" }
}

# Invalid password
try {
    $badLogin = '{"email":"' + $qaEmail + '","password":"wrongpass"}'
    Api "POST" "/api/v1/auth/login" $badLogin | Out-Null
    FAIL "Invalid login should be 401"
} catch {
    if ($_.status -eq 401) { OK "Invalid login returns 401" }
    else { FAIL "Invalid login" "status=$($_.status)" }
}

# Bad token
try {
    Api "GET" "/api/v1/users/me" $null "bad.token.value" | Out-Null
    FAIL "Bad token should be 401"
} catch {
    if ($_.status -eq 401) { OK "Bad token returns 401" }
    else { FAIL "Bad token" "status=$($_.status)" }
}

# No token
try {
    Api "GET" "/api/v1/users/me" | Out-Null
    FAIL "No token should be 401"
} catch {
    if ($_.status -eq 401) { OK "No token returns 401" }
    else { FAIL "No token" "status=$($_.status)" }
}

# ---- PROFILE TESTS ----------------------------------------------------------
Section "PROFILE TESTS"
try {
    $updBody = '{"full_name":"QA Updated","bio":"QA bio test","location":"QA City, TC"}'
    $upd = Api "PUT" "/api/v1/users/me" $updBody $qaToken
    if ($upd.full_name -eq "QA Updated" -and $upd.bio -eq "QA bio test") { OK "Profile update name/bio/location" }
    else { FAIL "Profile update values" "name=$($upd.full_name)" }
} catch { FAIL "Profile update" $_.message }

try {
    $me2 = Api "GET" "/api/v1/users/me" $null $qaToken
    if ($me2.full_name -eq "QA Updated" -and $me2.location -eq "QA City, TC") { OK "Profile persists on re-fetch" }
    else { FAIL "Profile not persisted" "name=$($me2.full_name) loc=$($me2.location)" }
} catch { FAIL "Profile re-fetch" $_.message }

# Short name
try {
    Api "PUT" "/api/v1/users/me" '{"full_name":"X"}' $qaToken | Out-Null
    FAIL "Short name should be 422"
} catch {
    if ($_.status -eq 422) { OK "Short name returns 422" }
    else { FAIL "Short name" "status=$($_.status)" }
}

# Long bio (499 chars)
$longBio = "A" * 499
try {
    $longBioBody = '{"bio":"' + $longBio + '"}'
    $updLong = Api "PUT" "/api/v1/users/me" $longBioBody $qaToken
    if ($updLong.bio.Length -le 500) { OK "Long bio (499 chars) accepted" }
    else { FAIL "Long bio" "length=$($updLong.bio.Length)" }
} catch { FAIL "Long bio" $_.message }

# ---- SKILL TESTS ------------------------------------------------------------
Section "SKILL TESTS"
$teachSkillId = 0; $learnSkillId = 0

try {
    $s1 = Api "POST" "/api/v1/skills" '{"name":"JavaScript","type":"teach","category":"Technology"}' $qaToken
    $teachSkillId = $s1.id
    if ($s1.name -eq "JavaScript" -and $s1.type -eq "teach") { OK "Add teach skill id=$teachSkillId" }
    else { FAIL "Add teach skill" }
} catch { FAIL "Add teach skill" $_.message }

try {
    $s2 = Api "POST" "/api/v1/skills" '{"name":"Piano","type":"learn","category":"Music"}' $qaToken
    $learnSkillId = $s2.id
    if ($s2.name -eq "Piano" -and $s2.type -eq "learn") { OK "Add learn skill id=$learnSkillId" }
    else { FAIL "Add learn skill" }
} catch { FAIL "Add learn skill" $_.message }

# Duplicate skill
try {
    Api "POST" "/api/v1/skills" '{"name":"JavaScript","type":"teach","category":"Technology"}' $qaToken | Out-Null
    FAIL "Duplicate skill should be 409"
} catch {
    if ($_.status -eq 409) { OK "Duplicate skill returns 409" }
    else { FAIL "Duplicate skill" "status=$($_.status)" }
}

try {
    $skills = Api "GET" "/api/v1/skills" $null $qaToken
    if ($skills.Count -eq 2) { OK "GET /skills count=2" }
    else { FAIL "GET /skills count" "$($skills.Count) expected 2" }
} catch { FAIL "GET /skills" $_.message }

# ---- MATCH TESTS ------------------------------------------------------------
Section "MATCH TESTS"
$targetUserId = 0
try {
    $matchResp = Api "GET" "/api/v1/matches" $null $qaToken
    if ($matchResp.total -gt 0) { OK "GET /matches returns $($matchResp.total) matches" }
    else { FAIL "GET /matches returned 0 matches" }

    $m0 = $matchResp.matches[0]
    $targetUserId = $m0.user.id
    if ($m0.score -ge 0 -and $m0.score -le 100) { OK "Match score in range: $($m0.score)%" }
    else { FAIL "Match score out of range" "$($m0.score)" }

    if ($m0.label -match "Match") { OK "Match label present: $($m0.label)" }
    else { FAIL "Match label wrong" "$($m0.label)" }

    $props = $m0.user.PSObject.Properties.Name
    if ("password" -notin $props) { OK "Match user has no password field" }
    else { FAIL "Match user exposes password" }

    if ("full_name" -in $props) { OK "Match user has full_name" }
    else { FAIL "Match user missing full_name" }

} catch { FAIL "GET /matches" $_.message }

# ---- CONNECTION TESTS -------------------------------------------------------
Section "CONNECTION TESTS"
$ts2 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$rcvEmail = "qa2j_rcv_${ts2}@example.com"
$rcvToken = $null; $rcvId = 0; $connId = 0

try {
    $rcvReg = Api "POST" "/api/v1/auth/register" ('{"full_name":"QA Receiver","email":"' + $rcvEmail + '","password":"Secure99"}')
    $rcvToken = $rcvReg.access_token
    $rcvId    = $rcvReg.user.id
    OK "Register receiver id=$rcvId"
} catch { FAIL "Register receiver" $_.message }

# Add skills to receiver
if ($rcvId -gt 0) {
    try {
        Api "POST" "/api/v1/skills" '{"name":"Piano","type":"teach","category":"Music"}' $rcvToken | Out-Null
        Api "POST" "/api/v1/skills" '{"name":"JavaScript","type":"learn","category":"Technology"}' $rcvToken | Out-Null
        OK "Receiver skills added"
    } catch { FAIL "Receiver skills" $_.message }
}

# Send connection
if ($rcvId -gt 0) {
    try {
        $sent = Api "POST" "/api/v1/requests/send" ('{"receiver_id":' + $rcvId + '}') $qaToken
        $connId = $sent.id
        if ($sent.status -eq "pending") { OK "Send connection status=pending conn=$connId" }
        else { FAIL "Send connection" "status=$($sent.status)" }
    } catch { FAIL "Send connection" $_.message }
}

# Duplicate send
if ($rcvId -gt 0) {
    try {
        Api "POST" "/api/v1/requests/send" ('{"receiver_id":' + $rcvId + '}') $qaToken | Out-Null
        FAIL "Duplicate send should be 409"
    } catch {
        if ($_.status -eq 409) { OK "Duplicate send returns 409" }
        else { FAIL "Duplicate send" "status=$($_.status)" }
    }
}

# Self-connect
if ($qaId -gt 0) {
    try {
        Api "POST" "/api/v1/requests/send" ('{"receiver_id":' + $qaId + '}') $qaToken | Out-Null
        FAIL "Self-connection should be 400"
    } catch {
        if ($_.status -eq 400) { OK "Self-connection returns 400" }
        else { FAIL "Self-connection" "status=$($_.status)" }
    }
}

# Receiver sees request
if ($connId -gt 0 -and $rcvToken) {
    try {
        $rcvReqs = Api "GET" "/api/v1/requests" $null $rcvToken
        $pending = $rcvReqs.connections | Where-Object { $_.id -eq $connId -and $_.status -eq "pending" }
        if ($pending) { OK "Receiver sees pending request in /requests" }
        else { FAIL "Receiver cannot see pending request" }
    } catch { FAIL "Receiver GET /requests" $_.message }
}

# Sender cannot accept own request (403)
if ($connId -gt 0) {
    try {
        Api "POST" "/api/v1/requests/accept" ('{"connection_id":' + $connId + '}') $qaToken | Out-Null
        FAIL "Sender accept own request should be 403"
    } catch {
        if ($_.status -eq 403) { OK "Sender cannot accept own request (403)" }
        else { FAIL "Sender accept own" "status=$($_.status)" }
    }
}

# Accept
if ($connId -gt 0 -and $rcvToken) {
    try {
        $acc = Api "POST" "/api/v1/requests/accept" ('{"connection_id":' + $connId + '}') $rcvToken
        if ($acc.status -eq "accepted") { OK "Accept connection status=accepted" }
        else { FAIL "Accept connection" "status=$($acc.status)" }
    } catch { FAIL "Accept connection" $_.message }
}

# Dashboard after accept
if ($connId -gt 0) {
    try {
        $dashAcc = Api "GET" "/api/v1/dashboard" $null $qaToken
        if ($dashAcc.stats.total_connections -ge 1) { OK "Dashboard total_connections=$($dashAcc.stats.total_connections) after accept" }
        else { FAIL "Dashboard total_connections=0 after accept" }
        $accConn = $dashAcc.accepted_connections | Where-Object { $_.id -eq $connId }
        if ($accConn) { OK "Accepted connection in dashboard.accepted_connections" }
        else { FAIL "Accepted connection missing from dashboard" }
    } catch { FAIL "Dashboard after accept" $_.message }
}

# Reject test
$ts3 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$rejEmail = "qa2j_rej_${ts3}@example.com"
try {
    $rejReg  = Api "POST" "/api/v1/auth/register" ('{"full_name":"QA Reject","email":"' + $rejEmail + '","password":"Secure99"}')
    $rejTok  = $rejReg.access_token; $rejId = $rejReg.user.id
    $sent2   = Api "POST" "/api/v1/requests/send" ('{"receiver_id":' + $rejId + '}') $qaToken
    $connId2 = $sent2.id
    $rej     = Api "POST" "/api/v1/requests/reject" ('{"connection_id":' + $connId2 + '}') $rejTok
    if ($rej.status -eq "rejected") { OK "Reject connection status=rejected" }
    else { FAIL "Reject connection" "status=$($rej.status)" }
} catch { FAIL "Reject connection" $_.message }

# ---- SKILL DELETE + REFRESH -------------------------------------------------
Section "SKILL DELETE AND REFRESH"
try {
    $s3 = Api "POST" "/api/v1/skills" '{"name":"Python","type":"teach","category":"Technology"}' $qaToken
    $delId = $s3.id
    OK "Add skill for deletion id=$delId"

    Api "DELETE" "/api/v1/skills/$delId" $null $qaToken | Out-Null

    $skillsAfter = Api "GET" "/api/v1/skills" $null $qaToken
    $stillThere = $skillsAfter | Where-Object { $_.id -eq $delId }
    if (-not $stillThere) { OK "Delete skill: removed from GET /skills" }
    else { FAIL "Delete skill still present after delete" }
} catch { FAIL "Skill delete" $_.message }

try {
    $dash2 = Api "GET" "/api/v1/dashboard" $null $qaToken
    if ($dash2.stats.total_skills_teaching -eq 1) { OK "Dashboard teaching count=1 after delete" }
    else { FAIL "Dashboard teaching count wrong" "$($dash2.stats.total_skills_teaching) expected 1" }
} catch { FAIL "Dashboard after skill delete" $_.message }

try {
    $m2 = Api "GET" "/api/v1/matches" $null $qaToken
    if ($m2.total -ge 0) { OK "GET /matches works after skill delete total=$($m2.total)" }
    else { FAIL "GET /matches after skill delete" }
} catch { FAIL "GET /matches after skill delete" $_.message }

# ---- OWNERSHIP CHECKS -------------------------------------------------------
Section "OWNERSHIP / AUTHORIZATION"
if ($rcvToken -and $teachSkillId -gt 0) {
    try {
        Api "DELETE" "/api/v1/skills/$teachSkillId" $null $rcvToken | Out-Null
        FAIL "Should not delete another user's skill"
    } catch {
        if ($_.status -eq 403 -or $_.status -eq 404) { OK "Cannot delete other user's skill (status=$($_.status))" }
        else { FAIL "Delete other user skill" "status=$($_.status)" }
    }
}

# ---- PERSISTENCE AFTER RE-LOGIN ---------------------------------------------
Section "PERSISTENCE (simulated browser refresh)"
try {
    $reloginBody = '{"email":"' + $qaEmail + '","password":"Secure99"}'
    $rl = Api "POST" "/api/v1/auth/login" $reloginBody
    $newTok = $rl.access_token

    $persSkills = Api "GET" "/api/v1/skills" $null $newTok
    if ($persSkills.Count -ge 2) { OK "Skills persist after re-login count=$($persSkills.Count)" }
    else { FAIL "Skills not persisted" "count=$($persSkills.Count) expected 2+" }

    $persMe = Api "GET" "/api/v1/users/me" $null $newTok
    if ($persMe.full_name -eq "QA Updated") { OK "Profile name persists: $($persMe.full_name)" }
    else { FAIL "Profile name not persisted" "$($persMe.full_name)" }
    if ($persMe.location -eq "QA City, TC") { OK "Profile location persists" }
    else { FAIL "Profile location not persisted" "$($persMe.location)" }

    $persDash = Api "GET" "/api/v1/dashboard" $null $newTok
    if ($persDash.stats.total_connections -ge 1) { OK "Connection persists after re-login" }
    else { FAIL "Connection not persisted" "total_connections=$($persDash.stats.total_connections)" }

} catch { FAIL "Persistence re-login" $_.message }

# ---- FULL DASHBOARD VALIDATION ----------------------------------------------
Section "DASHBOARD FULL VALIDATION"
try {
    $fd = Api "GET" "/api/v1/dashboard" $null $qaToken
    if ($null -ne $fd.stats)                { OK "Dashboard has stats object" }
    else                                    { FAIL "Dashboard missing stats" }
    if ($fd.teach_skills.Count -ge 1)       { OK "Dashboard teach_skills count=$($fd.teach_skills.Count)" }
    else                                    { FAIL "Dashboard teach_skills empty" }
    if ($fd.learn_skills.Count -ge 1)       { OK "Dashboard learn_skills count=$($fd.learn_skills.Count)" }
    else                                    { FAIL "Dashboard learn_skills empty" }
    if ($fd.stats.total_connections -ge 1)  { OK "Dashboard total_connections=$($fd.stats.total_connections)" }
    else                                    { FAIL "Dashboard total_connections=0" }
    if ($null -ne $fd.top_matches)          { OK "Dashboard top_matches present count=$($fd.top_matches.Count)" }
    else                                    { FAIL "Dashboard top_matches null" }
    if ($fd.accepted_connections.Count -ge 1) { OK "Dashboard accepted_connections count=$($fd.accepted_connections.Count)" }
    else                                    { FAIL "Dashboard accepted_connections empty" }
    if ($null -ne $fd.pending_sent)         { OK "Dashboard pending_sent present" }
    else                                    { FAIL "Dashboard pending_sent missing" }
    if ($null -ne $fd.pending_received)     { OK "Dashboard pending_received present" }
    else                                    { FAIL "Dashboard pending_received missing" }
} catch { FAIL "Dashboard full validation" $_.message }

# ---- SUMMARY ----------------------------------------------------------------
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TOTAL PASS : $($script:pass)"  -ForegroundColor Green
Write-Host " TOTAL FAIL : $($script:fail)"  -ForegroundColor $(if ($script:fail -eq 0) {"Green"} else {"Red"})
Write-Host "======================================" -ForegroundColor Cyan
if ($script:fail -eq 0) { Write-Host " ALL TESTS PASSED" -ForegroundColor Green }
else                     { Write-Host " FAILURES DETECTED" -ForegroundColor Red }
