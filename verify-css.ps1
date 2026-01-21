# Script de Vérification Structurelle - CSS Centralization
# Date : 2026-01-21

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " VÉRIFICATION STRUCTURELLE - 27 FICHIERS HTML" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Liste des 27 fichiers attendus
$expectedFiles = @(
    'index.html', 'politique.html', 'social.html', 'article.html', 
    'contact.html', 'recherche.html', 'emissions.html', 'podcasts.html',
    'podcast.html', 'dossier.html', 'partis-politiques.html', 'partis.html',
    'editeur-article.html', 'editeur-emission.html', 'editeur-parti.html',
    'editeur-podcast.html', 'admin.html', 'auth.html', 'profil.html',
    'mentions-legales.html', 'politique-confidentialite.html',
    'conditions-utilisation.html', 'cookies.html', 'page-404.html',
    'abonnement.html', 'paiement.html', 'test-api-article.html'
)

$filesWithStyle = @()
$filesWithoutCSS = @()
$missingFiles = @()
$validFiles = 0

Write-Host "1. VÉRIFICATION EXISTENCE DES FICHIERS" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

foreach ($file in $expectedFiles) {
    if (Test-Path $file) {
        $validFiles++
        $content = Get-Content $file -Raw -Encoding UTF8
        
        # Check for <style> tags
        if ($content -match '<style') {
            $filesWithStyle += $file
        }
        
        # Check for solitiquo.css reference
        if (-not ($content -match 'solitiquo\.css')) {
            $filesWithoutCSS += $file
        }
    }
    else {
        $missingFiles += $file
    }
}

Write-Host "Fichiers trouvés : $validFiles / $($expectedFiles.Count)" -ForegroundColor $(if ($validFiles -eq $expectedFiles.Count) { "Green" } else { "Red" })
Write-Host ""

if ($missingFiles.Count -gt 0) {
    Write-Host "❌ FICHIERS MANQUANTS :" -ForegroundColor Red
    $missingFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host ""
}

Write-Host "2. VÉRIFICATION SUPPRESSION <STYLE>" -ForegroundColor Yellow
Write-Host "------------------------------------" -ForegroundColor Yellow

if ($filesWithStyle.Count -eq 0) {
    Write-Host "✅ SUCCÈS: Aucune balise <style> inline trouvée" -ForegroundColor Green
}
else {
    Write-Host "❌ ERREUR: $($filesWithStyle.Count) fichiers contiennent encore <style> :" -ForegroundColor Red
    $filesWithStyle | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
Write-Host ""

Write-Host "3. VÉRIFICATION RÉFÉRENCE SOLITIQUO.CSS" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

if ($filesWithoutCSS.Count -eq 0) {
    Write-Host "✅ SUCCÈS: Tous les fichiers référencent solitiquo.css" -ForegroundColor Green
}
else {
    Write-Host "⚠️ ATTENTION: $($filesWithoutCSS.Count) fichiers sans référence solitiquo.css :" -ForegroundColor Yellow
    $filesWithoutCSS | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
Write-Host ""

Write-Host "4. VÉRIFICATION SOLITIQUO.CSS" -ForegroundColor Yellow
Write-Host "------------------------------" -ForegroundColor Yellow

if (Test-Path 'solitiquo.css') {
    $cssContent = Get-Content 'solitiquo.css' -Raw -Encoding UTF8
    $cssLines = (Get-Content 'solitiquo.css').Count
    $sections = ([regex]::Matches($cssContent, '/\* ═+')).Count
    $invalidProps = ([regex]::Matches($cssContent, 'group:\s*hover')).Count
    
    Write-Host "Taille : $cssLines lignes" -ForegroundColor Cyan
    Write-Host "Sections documentées : $sections" -ForegroundColor Cyan
    
    if ($invalidProps -eq 0) {
        Write-Host "✅ Aucune propriété CSS invalide" -ForegroundColor Green
    }
    else {
        Write-Host "❌ $invalidProps propriétés 'group: hover' invalides trouvées" -ForegroundColor Red
    }
}
else {
    Write-Host "❌ ERREUR: solitiquo.css introuvable !" -ForegroundColor Red
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " RÉSUMÉ VÉRIFICATION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan

$allGood = ($filesWithStyle.Count -eq 0) -and ($filesWithoutCSS.Count -eq 0) -and ($missingFiles.Count -eq 0)

if ($allGood) {
    Write-Host "✅ TOUTES LES VÉRIFICATIONS ONT RÉUSSI !" -ForegroundColor Green
}
else {
    Write-Host "⚠️ CERTAINES VÉRIFICATIONS ONT ÉCHOUÉ" -ForegroundColor Yellow
}

Write-Host ""
