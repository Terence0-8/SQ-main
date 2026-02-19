$baseUrl = "http://localhost:5000/api"
$creds = @{
    email    = "xss.test@example.com"
    password = "TestPass123"
}

Write-Host "1. Logging in as Admin..."
try {
    Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body ($creds | ConvertTo-Json) -ContentType "application/json" -SessionVariable sess
    Write-Host "   Login successful."
}
catch {
    Write-Error "   Login failed: $_"
    exit
}

Write-Host "2. Creating Malicious Article..."
$payload = "<p>Safe</p><script>alert('XSS')</script><iframe src='https://www.youtube.com/embed/xyz'></iframe>"
$articleData = @{
    title      = "XSS Test Article"
    content    = $payload
    excerpt    = "Testing sanitization"
    tags       = "security,test"
    category   = "Politique"
    is_premium = $false
    image_url  = ""
}

try {
    $res = Invoke-RestMethod -Uri "$baseUrl/articles" -Method Post -Body ($articleData | ConvertTo-Json) -ContentType "application/json" -WebSession $sess
    $articleId = $res.article.id
    Write-Host "   Article created. ID: $articleId"
}
catch {
    Write-Error "   Article creation failed: $_"
    # If failed, maybe user is not admin or server error
    exit
}

Write-Host "3. Verifying Article Content..."
try {
    $article = Invoke-RestMethod -Uri "$baseUrl/articles/$articleId" -Method Get -WebSession $sess
    $content = $article.content

    Write-Host "   Stored Content: $content"

    if ($content -match "<script>") {
        Write-Host "   [FAIL] <script> tag FOUND! Vulnerable." -ForegroundColor Red
    }
    else {
        Write-Host "   [PASS] <script> tag NOT found. Sanitized." -ForegroundColor Green
    }
    
    if ($content -match "<iframe") {
        Write-Host "   [INFO] <iframe> tag preserved." -ForegroundColor Cyan
    }
    else {
        Write-Host "   [WARN] <iframe> tag removed (Expected if server not restarted)." -ForegroundColor Yellow
    }

}
catch {
    Write-Error "   Verification failed: $_"
}
