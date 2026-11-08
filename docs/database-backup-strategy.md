# SOLITIQUO DATA — STRATÉGIE OPÉRATIONNELLE DE SAUVEGARDE ET RESTAURATION POSTGRESQL (LOT 3G)

## 1. Objectifs de Disponibilité et de Reprise d'Activité

- **RPO (Recovery Point Objective) :** Moins de 24 heures pour les sauvegardes nocturnes, 0 minute pour les déploiements (sauvegarde systématique avant migration).
- **RTO (Recovery Time Objective) :** Restauration opérationnelle complète en moins de 15 minutes.
- **Principe d'Intégrité Immuable :** Toute sauvegarde est obligatoirement accompagnée de son manifeste JSON comportant son empreinte SHA-256 et ses statistiques de contrôle de table.

---

## 2. Niveaux de Sauvegarde

```
                              [Sauvegardes PostgreSQL]
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
[Sauvegarde Nocturne]         [Sauvegarde Pré-Migration]       [Export Déporté Offsite]
• Quotidienne à 02h00         • Avant tout déploiement         • Chiffré AES-256
• Script: backup-db.js        • Script: pre-migration-backup   • Synchronisation S3/GCS
• Rétention: 7j / 4s / 12m    • Point de reprise immédiat       • Résilience multi-région
```

1. **Sauvegarde Quotidienne Automatique (Cron Job) :**
   - Fréquence : Tous les jours à 02h00 UTC.
   - Script : `node scripts/backup-db.js`
   - Emplacement local : `/var/backups/solitiquo/db/` (ou `backups/db/` sur l'hôte applicatif).
2. **Sauvegarde Pré-Déploiement / Pré-Migration :**
   - Fréquence : Systématique avant toute mise à jour de code ou migration de schéma.
   - Script : `node scripts/pre-migration-backup.js`
   - Préfixe de fichier : `pre_migration_backup_<timestamp>.sql`.
3. **Archivage Déporté (Offsite Recommandé) :**
   - Synchronisation périodique des fichiers `.sql` et `.manifest.json` vers un bucket Cloud chiffré (AWS S3, Cloudflare R2 ou Google Cloud Storage) avec verrouillage en écriture (Object Lock / WORM).

---

## 3. Scellement Cryptographique et Manifeste d'Audit

Chaque sauvegarde génère un fichier compagnon `.manifest.json` structuré comme suit :

```json
{
  "backup_file": "backup_solitiquo_2026-11-08T17-04-00-569Z.sql",
  "file_path": "backups/db/backup_solitiquo_2026-11-08T17-04-00-569Z.sql",
  "file_size_bytes": 4957417,
  "sha256_checksum": "ed200bdd286d3a74e1386c5ee9e372dd9721f61b434ad8bf1723d90b3128dea8",
  "created_at": "2026-11-08T17:04:01.061Z",
  "database_name": "solitiquo",
  "integrity_status": "VERIFIED",
  "database_stats": {
    "users": 1112,
    "data_values_total": 1293,
    "data_indicators_total": 546,
    "data_publications_total": 35,
    "published_observations": 174,
    "pilot_draft_observations": 24
  }
}
```

Ce manifeste garantit que :
- Le fichier n'a pas été corrompu lors du stockage ou du transfert.
- Le nombre d'observations publiées et de brouillons pilotes est exactement documenté.
- Aucune altération malveillante ne peut être injectée sans invalider le hachage.

---

## 4. Politique de Rotation et de Rétention

La fonction `rotateBackups()` dans `scripts/backup-db.js` applique les règles suivantes :
- **J0 à J7 (7 jours) :** Conservation de 100 % des sauvegardes quotidiennes.
- **S2 à S4 (4 semaines) :** Conservation d'une sauvegarde hebdomadaire (dimanche).
- **M2 à M12 (12 mois) :** Conservation d'une sauvegarde mensuelle archivée.
- **Au-delà de 365 jours :** Purge automatique des sauvegardes intermédiaires.

---

## 5. Procédure Opérationnelle de Restauration

### A. Test de conformité sans modification (Simulation / Dry Run)
```bash
node scripts/restore-db.js --dry-run
```
Le script calcule l'empreinte réelle du dump et la compare au manifeste. Si le test affiche `[✓] Contrôle d'intégrité SHA-256 : VALIDÉ`, le fichier est sûr pour restauration.

### B. Restauration de la sauvegarde la plus récente
```bash
node scripts/restore-db.js
```

### C. Restauration d'un fichier spécifique
```bash
node scripts/restore-db.js backups/db/backup_solitiquo_2026-11-08T17-04-00-569Z.sql
```

Le script effectue automatiquement les vérifications post-restauration :
- Vérification du nombre de tables et lignes ;
- Vérification que les 24 pilotes sont strictement confinés (`draft`) ;
- Vérification de la présence et du statut de l'observation #261.

