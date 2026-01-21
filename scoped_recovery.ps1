
$backupPath = "D:\Downloads\SQ-main - backup"
$currentPath = "D:\Downloads\SQ-main"
$solitiquoCss = Join-Path $currentPath "solitiquo.css"
$files = Get-ChildItem -Path $backupPath -Filter "*.html"

Write-Host "Starting Scoped Mass Recovery..."

foreach ($file in $files) {
    Write-Host "Processing $($file.Name)..."
    
    # 1. Copy from backup (Restore Truth)
    $destPath = Join-Path $currentPath $file.Name
    Copy-Item -Path $file.FullName -Destination $destPath -Force
    
    # 2. Prepare ID
    $pageId = "page-" + $file.BaseName.ToLower()
    
    # 3. Read Content
    $content = Get-Content -Path $destPath -Raw -Encoding UTF8
    
    # 4. Inject ID into body
    # Regex to find <body ...> or <body>
    if ($content -match '<body([^>]*)>') {
        $content = $content -replace '<body([^>]*)>', "<body id=`"$pageId`"`$1>"
    }
    else {
        Write-Host "  Warning: No <body> tag found in $($file.Name)"
    }
    
    # 5. Extract and Scope CSS
    $styleStart = $content.IndexOf("<style>")
    if ($styleStart -ge 0) {
        $styleEnd = $content.IndexOf("</style>")
        if ($styleEnd -gt $styleStart) {
            $cssRaw = $content.Substring($styleStart + 7, $styleEnd - ($styleStart + 7))
            
            # Smart Scoping:
            # Replace :root with the ID (variables will work on body)
            $cssScoped = $cssRaw -replace ":root", "#$pageId"
            
            # Wrap everything else in #page-id { ... } using CSS Nesting
            $cssFinal = "
/* ═══════════════════════════════════════════════════════════
   $($file.Name.ToUpper()) - SCOPED ($(Get-Date -Format 'yyyy-MM-dd'))
   ═══════════════════════════════════════════════════════════ */
#$pageId {
$cssScoped
}
"
            
            # Append to solitiquo.css
            Add-Content -Path $solitiquoCss -Value $cssFinal -Encoding UTF8
            
            # Remove style block from HTML
            $preStyle = $content.Substring(0, $styleStart)
            $postStyle = $content.Substring($styleEnd + 8)
            $content = $preStyle + $postStyle
            
            Write-Host "  -> CSS extracted and scoped."
        }
    }
    
    # 6. Save HTML
    $content | Set-Content -Path $destPath -Encoding UTF8
}

Write-Host "Scoped Recovery Complete."
