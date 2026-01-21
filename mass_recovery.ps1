
$backupPath = "D:\Downloads\SQ-main - backup"
$currentPath = "D:\Downloads\SQ-main"
$solitiquoCss = Join-Path $currentPath "solitiquo.css"
$excluded = @("index.html", "social.html", "politique.html")

$files = Get-ChildItem -Path $backupPath -Filter "*.html"

foreach ($file in $files) {
    if ($excluded -contains $file.Name) {
        Write-Host "Skipping $($file.Name) (already processed)"
        continue
    }

    Write-Host "Processing $($file.Name)..."

    # 1. Copy file from backup to current (Restore Truth)
    $destPath = Join-Path $currentPath $file.Name
    Copy-Item -Path $file.FullName -Destination $destPath -Force

    # 2. Read Content
    $content = Get-Content -Path $destPath -Raw -Encoding UTF8

    # 3. Find Style Block
    $styleStart = $content.IndexOf("<style>")
    
    if ($styleStart -ge 0) {
        $styleEnd = $content.IndexOf("</style>")
        if ($styleEnd -gt $styleStart) {
            # Extract CSS
            # +7 for <style> length
            $cssContent = $content.Substring($styleStart + 7, $styleEnd - ($styleStart + 7))
            
            # Prepare Header
            $header = "
/* ═══════════════════════════════════════════════════════════
   $($file.Name.ToUpper()) - RECUPERATION BACKUP
   ═══════════════════════════════════════════════════════════
   Date : $(Get-Date -Format 'yyyy-MM-dd')
   Source : backup/$($file.Name)
   ═══════════════════════════════════════════════════════════ */
"
            # Append to solitiquo.css
            Add-Content -Path $solitiquoCss -Value $header -Encoding UTF8
            Add-Content -Path $solitiquoCss -Value $cssContent -Encoding UTF8
            
            # Remove from HTML
            # We construct new content: Pre-style + Post-style
            # Post-style starts at $styleEnd + 8 (</style>)
            $preStyle = $content.Substring(0, $styleStart)
            $postStyle = $content.Substring($styleEnd + 8)
            
            $newContent = $preStyle + $postStyle
            
            # Save HTML
            $newContent | Set-Content -Path $destPath -Encoding UTF8
            Write-Host "  -> styles extracted and removed."
        }
        else {
            Write-Host "  -> <style> found but end tag missing or invalid."
        }
    }
    else {
        Write-Host "  -> No inline styles found."
    }
}

Write-Host "Mass recovery complete."
