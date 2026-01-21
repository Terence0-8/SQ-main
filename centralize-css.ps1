# Script PowerShell - Centralisation CSS Automatisée
# Pour les fichiers restants (Batches 2-6)
# Date : 2026-01-21

$ErrorActionPreference = "Continue"

# Fichiers à traiter (exclure les déjà traités)
$filesProcessed = @("index.html", "politique.html", "social.html")
$allFiles = Get-ChildItem *.html | Where-Object { $filesProcessed -notcontains $_.Name }

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " CENTRALISATION CSS AUTOMATISÉE - SOLITIQUO" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Fichiers à traiter : $($allFiles.Count)" -ForegroundColor Yellow
Write-Host ""

$totalLines = 0
$fileCount = 0

foreach ($file in $allFiles) {
    try {
        $content = Get-Content $file.Name -Raw -Encoding UTF8
        
        # Extract CSS between <style> and </style>
        if ($content -match '(?s)<style>(.*?)</style>') {
            $css = $matches[1]
            $lines = ($css -split "`n").Count
            
            # Generate header for this file
            $fileName = $file.Name.ToUpper()
            $date = Get-Date -Format 'yyyy-MM-dd'
            
            $header = @"


/* ═══════════════════════════════════════════════════════════
   $fileName - STYLES SPÉCIFIQUES
   ═══════════════════════════════════════════════════════════
   Date transfert : $date
   Lignes transférées : $lines
   Traitement : Automatisé
   ═══════════════════════════════════════════════════════════ */

$css
"@
            
            # Append to solitiquo.css
            Add-Content -Path "solitiquo.css" -Value $header -Encoding UTF8
            
            # Remove <style> from HTML
            $newContent = $content -replace '(?s)<style>.*?</style>', "`n`n"
            Set-Content -Path $file.Name -Value $newContent -Encoding UTF8 -NoNewline
            
            $totalLines += $lines
            $fileCount++
            
            Write-Host "✅ $($file.Name): $lines lignes CSS transférées" -ForegroundColor Green
        }
        else {
            Write-Host "⚠️  $($file.Name): Aucun <style> trouvé" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "❌ $($file.Name): ERREUR - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " RÉSUMÉ" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Fichiers traités : $fileCount" -ForegroundColor Green
Write-Host "Total lignes CSS : $totalLines" -ForegroundColor Green
Write-Host ""

# Verification - chercher les <style> restants
Write-Host "Vérification finale..." -ForegroundColor Yellow
$remain = Get-ChildItem *.html | Select-String "<style" | Measure-Object
Write-Host "Balises <style> restantes : $($remain.Count)" -ForegroundColor $(if ($remain.Count -eq 0) { "Green" } else { "Red" })

# Supprimer la propriété invalide "group: hover"
$csscontent = Get-Content 'solitiquo.css' -Raw
$csscontent = $csscontent.Replace('  group: hover;', '')
Set-Content -Path 'solitiquo.css' -Value $csscontent -NoNewline -Encoding UTF8

Write-Host "✅ Nettoyage: propriété 'group: hover' supprimée" -ForegroundColor Green
Write-Host ""
Write-Host "TERMINÉ ! 🚀" -ForegroundColor Cyan
