$baseUrl = "http://localhost:5000/api"
$creds = @{
    email    = "xss.test@example.com"
    password = "TestPass123"
}

Write-Host "1. Logging in..."
try {
    # -SessionVariable stores the session (cookies) in $sess
    $loginData = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body ($creds | ConvertTo-Json) -ContentType "application/json" -SessionVariable sess
    Write-Host "   Login successful. Session cookie acquired."
}
catch {
    Write-Error "   Login failed: $_"
    exit
}

$articleId = 15
$payload = "Before <script>alert('XSS')</script> After"

Write-Host "2. Posting malicious comment..."
try {
    $commentData = @{
        article_id = $articleId
        content    = $payload
    }
    # Pass $sess back to maintain session
    $postRes = Invoke-RestMethod -Uri "$baseUrl/comments" -Method Post -Body ($commentData | ConvertTo-Json) -ContentType "application/json" -WebSession $sess
    Write-Host "   Comment posted."
}
catch {
    Write-Error "   Post failed: $_"
    exit
}

Write-Host "3. Verifying sanitization..."
try {
    $comments = Invoke-RestMethod -Uri "$baseUrl/comments/$articleId" -Method Get -WebSession $sess
    
    # Check the latest comment or look for our content
    $found = $comments.comments | Where-Object { $_.content -like "*Before*After*" }
    
    if ($found) {
        Write-Host "   Found comment content: '$($found.content)'"
        if ($found.content -match "<script>") {
            Write-Host "   [FAIL] SCIPT TAG FOUND! Project is VULNERABLE." -ForegroundColor Red
        }
        elseif ($found.content -match "alert") {
            Write-Host "   [WARN] 'alert' found, but hopefully plain text. Check content." -ForegroundColor Yellow
        }
        else {
            Write-Host "   [PASS] Script tag NOT found. Sanitization worked." -ForegroundColor Green
        }
    }
    else {
        Write-Host "   [WARN] Could not find the comment we just posted." -ForegroundColor Yellow
        Write-Host "   Last 3 comments:"
        $comments.comments | Select-Object -Last 3 | ForEach-Object { Write-Host "   - $($_.content)" }
    }

}
catch {
    Write-Error "   Verification failed: $_"
}
