# Auto-commit and push script for SQ-main
# Run this script in PowerShell to automatically commit and push changes

$watchPath = "d:\Downloads\SQ-main"
$debounceSeconds = 5  # Wait 5 seconds after last change before committing

Write-Host "🔄 Auto-commit watcher started for: $watchPath" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Exclude patterns
$excludePatterns = @("\.git", "node_modules", "\.log$", "\.tmp$")

$global:lastChangeTime = $null
$global:pendingCommit = $false

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    
    # Skip excluded patterns
    foreach ($pattern in $excludePatterns) {
        if ($path -match $pattern) { return }
    }
    
    $global:lastChangeTime = Get-Date
    $global:pendingCommit = $true
    
    $relativePath = $path.Replace("d:\Downloads\SQ-main\", "")
    Write-Host "📝 Changed: $relativePath ($changeType)" -ForegroundColor DarkGray
}

Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null
Register-ObjectEvent $watcher "Created" -Action $action | Out-Null
Register-ObjectEvent $watcher "Deleted" -Action $action | Out-Null
Register-ObjectEvent $watcher "Renamed" -Action $action | Out-Null

# Main loop - check for pending commits
while ($true) {
    Start-Sleep -Seconds 1
    
    if ($global:pendingCommit -and $global:lastChangeTime) {
        $elapsed = (Get-Date) - $global:lastChangeTime
        
        if ($elapsed.TotalSeconds -ge $debounceSeconds) {
            $global:pendingCommit = $false
            
            Write-Host "`n🚀 Auto-committing changes..." -ForegroundColor Green
            
            Push-Location $watchPath
            try {
                # Stage all changes
                git add -A
                
                # Check if there are changes to commit
                $status = git status --porcelain
                if ($status) {
                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    git commit -m "🔄 Auto-save: $timestamp"
                    
                    # Push to remote
                    git push origin main 2>&1
                    Write-Host "✅ Committed and pushed successfully!" -ForegroundColor Green
                } else {
                    Write-Host "ℹ️ No changes to commit" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "❌ Error: $_" -ForegroundColor Red
            }
            Pop-Location
        }
    }
}
