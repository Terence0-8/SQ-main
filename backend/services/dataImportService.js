'use strict';

const crypto = require('crypto');
const XLSX = require('xlsx');
const pool = require('../config/database');

/**
 * Service Métier - Lot 2D : Module d'Importation et d'Ingestion des Données
 * Gère le cycle de vie des lots d'import (import_batches, import_lines)
 * et garantit la création exclusive d'observations au statut 'draft'.
 */

// Limites de sécurité
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
const MAX_LINES_PER_BATCH = 50000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 Mo max décompressé (protection zip bomb)

/**
 * Inspection de bas niveau de la structure ZIP d'un classeur XLSX
 * Vérifie l'intégrité, la présence des parties OpenXML obligatoires et protège contre les bombes de décompression
 */
function inspectZipStructure(buffer) {
  // Signature locale PK\x03\x04
  if (buffer.length < 30 || buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    return { isValid: false, reason: 'Structure ZIP/XLSX invalide : signature de fichier OpenXML manquante' };
  }

  let offset = 0;
  let totalUncompressedSize = 0;
  let totalCompressedSize = 0;
  let fileCount = 0;
  let hasContentTypes = false;
  let hasXlFolder = false;

  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === 0x04034b50) { // Local file header
      fileCount++;
      if (fileCount > 1000) {
        return { isValid: false, reason: 'Archive XLSX suspecte : nombre excessif d\'entrées internes (> 1000)' };
      }
      const compSize = buffer.readUInt32LE(offset + 18);
      const uncompSize = buffer.readUInt32LE(offset + 22);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);

      if (offset + 30 + fileNameLen > buffer.length) {
        return { isValid: false, reason: 'Structure ZIP OpenXML tronquée ou corrompue' };
      }

      const entryName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
      if (entryName === '[Content_Types].xml') hasContentTypes = true;
      if (entryName.startsWith('xl/') || entryName.startsWith('/xl/')) hasXlFolder = true;

      totalCompressedSize += compSize;
      totalUncompressedSize += uncompSize;

      // Protection Decompression Bomb (Taille maximale totale décompressée)
      if (totalUncompressedSize > MAX_ZIP_UNCOMPRESSED_BYTES) {
        return { 
          isValid: false, 
          reason: `Archive XLSX excessivement volumineuse après décompression (${Math.round(totalUncompressedSize / (1024 * 1024))} Mo, limite: ${MAX_ZIP_UNCOMPRESSED_BYTES / (1024 * 1024)} Mo)` 
        };
      }

      // Protection Decompression Bomb (Taux de compression anormalement élevé)
      if (totalCompressedSize > 1024 && totalUncompressedSize > totalCompressedSize * 40 && totalUncompressedSize > 5 * 1024 * 1024) {
        return { 
          isValid: false, 
          reason: 'Taux de compression suspect détecté (suspicion de bombe de décompression)' 
        };
      }

      offset += 30 + fileNameLen + extraLen + compSize;
    } else if (sig === 0x02014b50 || sig === 0x06054b50) {
      // Début du répertoire central ou fin de répertoire central atteint
      break;
    } else {
      offset++;
    }
  }

  if (!hasContentTypes && !hasXlFolder) {
    return { 
      isValid: false, 
      reason: 'L\'archive ZIP ne présente pas la structure d\'un classeur Excel OpenXML valide ([Content_Types].xml ou dossier xl/ manquant)' 
    };
  }

  return { isValid: true, fileCount, totalUncompressedSize };
}

/**
 * Vérification stricte des signatures réelles (Magic Bytes) et protection contre les fichiers falsifiés
 */
function validateFileSignature(buffer, fileName) {
  if (!buffer || buffer.length === 0) {
    const err = new Error('Fichier vide ou corrompu');
    err.status = 400;
    throw err;
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`Fichier trop volumineux. Taille maximale autorisée: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} Mo`);
    err.status = 400;
    throw err;
  }

  const ext = (fileName ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '');

  // 1. Détection des signatures exécutables / binaires dangereuses
  // Windows PE (MZ)
  if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
    const err = new Error('Signature interdite : fichier exécutable Windows (MZ/PE) détecté');
    err.status = 400;
    throw err;
  }
  // Linux ELF
  if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    const err = new Error('Signature interdite : fichier exécutable Linux (ELF) détecté');
    err.status = 400;
    throw err;
  }
  // Java Bytecode / Mach-O universal
  if (buffer.length >= 4 && buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE) {
    const err = new Error('Signature interdite : binaire Java bytecode / Mach-O détecté');
    err.status = 400;
    throw err;
  }

  // 2. Vérification selon l'extension déclarée
  if (ext === '.xlsx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      const err = new Error('Signature de fichier XLSX invalide : archive OpenXML PK attendue');
      err.status = 400;
      throw err;
    }
    const zipInspection = inspectZipStructure(buffer);
    if (!zipInspection.isValid) {
      const err = new Error(zipInspection.reason);
      err.status = 400;
      throw err;
    }
  } else if (ext === '.xls') {
    const oleMagic = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(oleMagic)) {
      const err = new Error('Signature de fichier XLS invalide : classeur binaire OLE2 attendu');
      err.status = 400;
      throw err;
    }
  } else if (ext === '.csv') {
    // Ne doit pas être un ZIP ou un document OLE2 déguisé en CSV
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const err = new Error('Fichier falsifié : archive ZIP renommée en .csv');
      err.status = 400;
      throw err;
    }
    if (buffer.length >= 4 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
      const err = new Error('Fichier falsifié : document binaire OLE2 renommé en .csv');
      err.status = 400;
      throw err;
    }

    // Recherche d'octets nuls \0 sur l'échantillon initial (trahit des binaires)
    const sampleLength = Math.min(buffer.length, 4096);
    for (let i = 0; i < sampleLength; i++) {
      if (buffer[i] === 0x00) {
        const err = new Error('Fichier CSV invalide : présence de caractères binaires (octets nuls) interdits');
        err.status = 400;
        throw err;
      }
    }

    // Détection de scripts exécutables
    const startStr = buffer.subarray(0, Math.min(buffer.length, 100)).toString('utf8').trim().toLowerCase();
    if (startStr.startsWith('#!') || startStr.startsWith('<?php') || startStr.startsWith('<script')) {
      const err = new Error('Signature interdite : script exécutable détecté dans le fichier');
      err.status = 400;
      throw err;
    }
  } else {
    const err = new Error('Extension de fichier non supportée. Seuls les formats .csv, .xlsx et .xls sont acceptés');
    err.status = 400;
    throw err;
  }
}

/**
 * Nettoyage anti-formule / formula injection (Excel / CSV injection)
 * Empêche qu'une cellule commençant par =, +, -, @, \t, \r, \n n'exécute de macro externe.
 */
function sanitizeCellString(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^[=+@\-\t\r\n]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * 1. Initialisation d'un lot d'import après réception du fichier
 */
async function createBatch({ fileName, buffer, mimeType, userId }) {
  // Vérification stricte des signatures réelles et de la structure
  validateFileSignature(buffer, fileName);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  const insertSql = `
    INSERT INTO import_batches (
      file_name, file_size_bytes, mime_type, sha256_checksum,
      status, uploaded_by
    ) VALUES ($1, $2, $3, $4, 'uploaded', $5)
    RETURNING id, file_name, file_size_bytes, mime_type, sha256_checksum, status, created_at;
  `;

  const res = await pool.query(insertSql, [
    fileName.slice(0, 255),
    buffer.length,
    mimeType || 'application/octet-stream',
    checksum,
    userId
  ]);

  return res.rows[0];
}

/**
 * 2. Parsing du buffer CSV / XLSX pour extraire les colonnes et un échantillon
 */
function parsePreview(buffer, { maxPreviewRows = 20 } = {}) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      raw: false,
      sheetRows: maxPreviewRows + 50 // Lire un peu plus pour estimation
    });
  } catch (err) {
    const error = new Error('Format de fichier non reconnu ou impossible à lire (CSV/XLSX requis)');
    error.status = 400;
    throw error;
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    const err = new Error('Le classeur ne contient aucune feuille de calcul');
    err.status = 400;
    throw err;
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Préserver les cellules contenant des formules brutes pour la sécurité anti-injection
  Object.keys(worksheet).forEach(k => {
    if (k[0] !== '!' && worksheet[k] && worksheet[k].f && (worksheet[k].v === undefined || worksheet[k].v === null)) {
      worksheet[k].v = '=' + worksheet[k].f;
    }
  });

  // Extraction en JSON avec en-têtes bruts
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1, // Tableau de tableaux
    defval: '',
    blankrows: false
  });

  if (!jsonData || jsonData.length === 0) {
    const err = new Error('Le fichier est vide ou ne contient aucune ligne lisible');
    err.status = 400;
    throw err;
  }

  const headerRow = jsonData[0].map(h => String(h || '').trim()).filter(Boolean);
  if (headerRow.length === 0) {
    const err = new Error('Impossible de détecter la ligne d\'en-tête (colonnes vides)');
    err.status = 400;
    throw err;
  }

  const rawRows = jsonData.slice(1);
  const previewRows = rawRows.slice(0, maxPreviewRows).map((row, idx) => {
    const rowObj = {};
    headerRow.forEach((colName, cIdx) => {
      rowObj[colName] = row[cIdx] !== undefined ? sanitizeCellString(String(row[cIdx])) : '';
    });
    return {
      _rowNumber: idx + 2, // ligne 1 = headers
      ...rowObj
    };
  });

  return {
    sheetNames: workbook.SheetNames,
    activeSheet: firstSheetName,
    headers: headerRow,
    previewRows,
    estimatedTotalRows: rawRows.length
  };
}

/**
 * Parse l'intégralité du buffer pour traitement complet
 */
function parseAllRows(buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false
  });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Préserver les cellules contenant des formules brutes pour la sécurité anti-injection
  Object.keys(worksheet).forEach(k => {
    if (k[0] !== '!' && worksheet[k] && worksheet[k].f && (worksheet[k].v === undefined || worksheet[k].v === null)) {
      worksheet[k].v = '=' + worksheet[k].f;
    }
  });

  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false
  });

  if (!jsonData || jsonData.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = jsonData[0].map(h => String(h || '').trim());
  const rows = jsonData.slice(1).map((row, idx) => {
    const rowObj = {};
    headers.forEach((colName, cIdx) => {
      if (colName) {
        rowObj[colName] = row[cIdx] !== undefined ? String(row[cIdx]).trim() : '';
      }
    });
    return {
      _line_number: idx + 2,
      ...rowObj
    };
  });

  return { headers, rows };
}

/**
 * 3. Validation exhaustive et insertion dans import_lines
 */
async function validateAndStageLines(batchId, buffer, { mapping = {}, defaults = {} }, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Vérification du statut du lot
    const batchRes = await client.query('SELECT * FROM import_batches WHERE id = $1 FOR UPDATE', [batchId]);
    if (batchRes.rows.length === 0) {
      const err = new Error(`Lot d'import #${batchId} introuvable`);
      err.status = 404;
      throw err;
    }
    const batch = batchRes.rows[0];
    if (batch.status === 'applied') {
      const err = new Error('Ce lot d\'import a déjà été appliqué en base de données');
      err.status = 400;
      throw err;
    }

    // Charger les référentiels et observations existantes en cache mémoire
    const [indRes, terRes, srcRes, dbObsRes] = await Promise.all([
      client.query('SELECT id, code, name, unit FROM data_indicators WHERE is_active = TRUE'),
      client.query('SELECT id, code, name FROM territories'),
      client.query('SELECT id, name, acronym, institution_type FROM data_sources'),
      client.query(`
        SELECT 
          id, indicator_id, territory_id, period_type, 
          TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, 
          TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end, 
          methodology_nature, editorial_status, is_active, revision_number
        FROM data_values
        WHERE editorial_status NOT IN ('archived', 'revoked')
      `)
    ]);

    const indicatorByCode = new Map(indRes.rows.map(r => [r.code.toUpperCase(), r]));
    const indicatorById = new Map(indRes.rows.map(r => [r.id, r]));

    const territoryByCode = new Map(terRes.rows.map(r => [r.code.toUpperCase(), r]));
    const territoryById = new Map(terRes.rows.map(r => [r.id, r]));

    const sourceById = new Map(srcRes.rows.map(r => [r.id, r]));

    // Indexation des observations en base par tuple unique
    const existingDbTuples = new Map();
    for (const obs of dbObsRes.rows) {
      const dbKey = `${obs.indicator_id}|${obs.territory_id}|${obs.period_type}|${obs.period_start}|${obs.period_end}|${obs.methodology_nature}`;
      existingDbTuples.set(dbKey, obs);
    }

    // Supprimer d'éventuelles lignes préalablement analysées pour ce batch
    await client.query('DELETE FROM import_lines WHERE batch_id = $1', [batchId]);

    const { rows } = parseAllRows(buffer);

    if (rows.length === 0) {
      const err = new Error('Le fichier ne contient aucune ligne de données à importer');
      err.status = 400;
      throw err;
    }

    if (rows.length > MAX_LINES_PER_BATCH) {
      const err = new Error(`Le fichier contient ${rows.length} lignes, dépassant la limite maximale de ${MAX_LINES_PER_BATCH}`);
      err.status = 400;
      throw err;
    }

    const seenTuplesInBatch = new Set();
    const validatedRowsSummary = [];
    let validCount = 0;
    let errorCount = 0;

    for (const rawRow of rows) {
      const lineNum = rawRow._line_number;
      const errors = [];
      const warnings = [];

      // Résolution de l'indicateur
      let indicator = null;
      const indVal = mapping.indicator_code ? rawRow[mapping.indicator_code] : null;
      if (indVal) {
        indicator = indicatorByCode.get(indVal.toUpperCase());
        if (!indicator) {
          errors.push(`Code indicateur inconnu : "${indVal}"`);
        }
      } else if (defaults.indicator_id) {
        indicator = indicatorById.get(parseInt(defaults.indicator_id, 10));
        if (!indicator) errors.push(`Indicateur par défaut ID ${defaults.indicator_id} invalide`);
      } else {
        errors.push('Indicateur non spécifié (colonne non mappée et pas d\'indicateur par défaut)');
      }

      // Résolution du territoire
      let territory = null;
      const terVal = mapping.territory_code ? rawRow[mapping.territory_code] : null;
      if (terVal) {
        territory = territoryByCode.get(terVal.toUpperCase());
        if (!territory) {
          errors.push(`Code territoire inconnu : "${terVal}"`);
        }
      } else if (defaults.territory_id) {
        territory = territoryById.get(parseInt(defaults.territory_id, 10));
        if (!territory) errors.push(`Territoire par défaut ID ${defaults.territory_id} invalide`);
      } else {
        errors.push('Territoire non spécifié (colonne non mappée et pas de territoire par défaut)');
      }

      // Résolution de la temporalité
      const periodType = (mapping.period_type ? rawRow[mapping.period_type] : null) || defaults.period_type || 'ANNUAL';
      const validPeriodTypes = ['ANNUAL', 'MONTHLY', 'QUARTERLY', 'DAILY', 'POINT_IN_TIME', 'MULTI_YEAR_CYCLE', 'ELECTORAL_CYCLE'];
      if (!validPeriodTypes.includes(periodType)) {
        errors.push(`Type de période invalide : "${periodType}"`);
      }

      let periodStart = null;
      let periodEnd = null;

      const rawPeriodStart = mapping.period_start ? rawRow[mapping.period_start] : null;
      const rawPeriodEnd = mapping.period_end ? rawRow[mapping.period_end] : null;
      const rawYear = mapping.year ? rawRow[mapping.year] : null;

      if (rawPeriodStart) {
        const d = new Date(rawPeriodStart);
        if (isNaN(d.getTime())) {
          errors.push(`Date de début invalide : "${rawPeriodStart}"`);
        } else {
          periodStart = d.toISOString().split('T')[0];
        }
      } else if (rawYear) {
        const y = parseInt(rawYear, 10);
        if (isNaN(y) || y < 1900 || y > 2100) {
          errors.push(`Année invalide : "${rawYear}"`);
        } else {
          periodStart = `${y}-01-01`;
          if (!rawPeriodEnd) periodEnd = `${y}-12-31`;
        }
      } else if (defaults.period_start) {
        periodStart = defaults.period_start;
      } else {
        errors.push('Date ou année de début obligatoire');
      }

      if (rawPeriodEnd) {
        const d = new Date(rawPeriodEnd);
        if (isNaN(d.getTime())) {
          errors.push(`Date de fin invalide : "${rawPeriodEnd}"`);
        } else {
          periodEnd = d.toISOString().split('T')[0];
        }
      } else if (!periodEnd) {
        if (periodStart && periodType === 'ANNUAL') {
          const yr = periodStart.slice(0, 4);
          periodEnd = `${yr}-12-31`;
        } else if (defaults.period_end) {
          periodEnd = defaults.period_end;
        } else {
          periodEnd = periodStart; // fallback
        }
      }

      if (periodStart && periodEnd && periodStart > periodEnd) {
        errors.push(`Incohérence chronologique : date de début (${periodStart}) postérieure à la date de fin (${periodEnd})`);
      }

      // Résolution de la valeur (numérique, textuelle ou absence)
      let valueNumeric = null;
      let valueText = null;
      let missingReason = null;

      const rawValNum = mapping.value_numeric ? rawRow[mapping.value_numeric] : null;
      const rawValTxt = mapping.value_text ? rawRow[mapping.value_text] : null;
      const rawMissing = mapping.missing_reason ? rawRow[mapping.missing_reason] : null;

      const validMissingReasons = ['not_available', 'confidential', 'not_applicable', 'temporarily_withheld'];

      if (rawValNum !== null && rawValNum !== undefined && rawValNum !== '') {
        const cleaned = String(rawValNum).replace(/\s/g, '').replace(',', '.');
        const num = Number(cleaned);
        if (isNaN(num)) {
          errors.push(`Valeur numérique invalide : "${rawValNum}"`);
        } else {
          valueNumeric = num;
        }
      } else if (rawValTxt) {
        valueText = rawValTxt;
      } else if (rawMissing) {
        const mKey = rawMissing.toLowerCase().trim();
        if (validMissingReasons.includes(mKey)) {
          missingReason = mKey;
        } else {
          errors.push(`Motif d'absence invalide : "${rawMissing}". Valeurs autorisées: ${validMissingReasons.join(', ')}`);
        }
      } else if (defaults.missing_reason) {
        missingReason = defaults.missing_reason;
      } else {
        errors.push('Ligne sans valeur : renseignez une valeur numérique, textuelle ou un motif d\'indisponibilité');
      }

      // Résolution méthodologie
      const methodologyNature = (mapping.methodology_nature ? rawRow[mapping.methodology_nature] : null) || defaults.methodology_nature || 'administrative_record';
      const validNatures = ['census', 'sample_survey', 'administrative_record', 'nowcast_estimate', 'projection'];
      if (!validNatures.includes(methodologyNature)) {
        errors.push(`Nature méthodologique invalide : "${methodologyNature}". Valeurs: ${validNatures.join(', ')}`);
      }

      // Résolution source institutionnelle et qualification documentaire
      let sourceId = defaults.source_id ? parseInt(defaults.source_id, 10) : null;
      if (mapping.source_id && rawRow[mapping.source_id]) {
        sourceId = parseInt(rawRow[mapping.source_id], 10);
      }
      let source = null;
      if (sourceId) {
        source = sourceById.get(sourceId);
        if (!source) {
          errors.push(`Source ID ${sourceId} inconnue`);
        }
      }

      // Référence documentaire réelle (ne plus inventer de référence artificielle)
      const rawCitationRef = (mapping.citation_reference ? rawRow[mapping.citation_reference] : null) || defaults.citation_reference || null;
      const citationReference = rawCitationRef ? String(rawCitationRef).trim() : null;

      // URL documentaire
      const rawCitationUrl = (mapping.citation_url ? rawRow[mapping.citation_url] : null) || defaults.citation_url || (source?.website_url || null);
      const citationUrl = rawCitationUrl ? String(rawCitationUrl).trim() : null;

      // Qualification documentaire (documentary_tier)
      const validTiers = ['TIER_1_OFFICIAL', 'TIER_2_STATISTICAL', 'TIER_3_ACADEMIC_PEER', 'TIER_4_REPUTABLE_NGO', 'TIER_5_SECONDARY_PRESS'];
      const rawTier = (mapping.documentary_tier ? rawRow[mapping.documentary_tier] : null) || defaults.documentary_tier || null;
      let documentaryTier = null;
      if (rawTier) {
        const normalizedTier = String(rawTier).trim().toUpperCase();
        if (validTiers.includes(normalizedTier)) {
          documentaryTier = normalizedTier;
        } else {
          errors.push(`Niveau documentaire invalide : "${rawTier}". Valeurs autorisées: ${validTiers.join(', ')}`);
        }
      }

      // Robustesse méthodologique
      const validRobustness = ['high', 'medium', 'conditional', 'contentious'];
      const rawRobustness = (mapping.methodological_robustness ? rawRow[mapping.methodological_robustness] : null) || defaults.methodological_robustness || null;
      let methodologicalRobustness = null;
      if (rawRobustness) {
        const normalizedRob = String(rawRobustness).trim().toLowerCase();
        if (validRobustness.includes(normalizedRob)) {
          methodologicalRobustness = normalizedRob;
        } else {
          errors.push(`Robustesse méthodologique invalide : "${rawRobustness}". Valeurs autorisées: ${validRobustness.join(', ')}`);
        }
      }

      // Évaluation stricte de la qualification documentaire
      let isSourceQualified = false;
      let provenanceStatus = 'unqualified';

      if (source && citationReference) {
        // Une source institutionnelle réelle avec une référence documentaire précise est fournie
        isSourceQualified = true;
        provenanceStatus = 'verified_institutional';

        // RÈGLE MÉTIER : Ne plus attribuer automatiquement TIER 1 ni high !
        // Si l'utilisateur n'a pas explicitement qualifié un tier, repli prudent selon l'institution :
        if (!documentaryTier) {
          if (source.institution_type === 'national_statistical_office') {
            documentaryTier = 'TIER_2_STATISTICAL';
          } else if (['ministry', 'central_bank', 'electoral_commission'].includes(source.institution_type)) {
            documentaryTier = 'TIER_2_STATISTICAL';
          } else if (source.institution_type === 'academic_institute') {
            documentaryTier = 'TIER_3_ACADEMIC_PEER';
          } else if (source.institution_type === 'independent_ngo') {
            documentaryTier = 'TIER_4_REPUTABLE_NGO';
          } else {
            documentaryTier = 'TIER_5_SECONDARY_PRESS';
          }
        }

        // Si l'utilisateur n'a pas explicitement qualifié la robustesse, repli prudent sur 'medium' (JAMAIS 'high' d'office)
        if (!methodologicalRobustness) {
          methodologicalRobustness = 'medium';
        }
      } else {
        // Source non sélectionnée ou référence documentaire manquante
        isSourceQualified = false;
        provenanceStatus = 'unqualified';
        documentaryTier = null;
        methodologicalRobustness = null;

        if (source && !citationReference) {
          warnings.push(`Institution "${source.name}" sélectionnée sans référence documentaire précise : signalée comme non qualifiée (à documenter avant soumission éditoriale)`);
        } else if (!source) {
          warnings.push('Aucune source documentaire rattachée : observation signalée comme non qualifiée (à qualifier avant soumission éditoriale)');
        }
      }

      // Détection des doublons (intra-lot et base de données)
      if (indicator && territory && periodStart && periodEnd && methodologyNature) {
        const tupleKey = `${indicator.id}|${territory.id}|${periodType}|${periodStart}|${periodEnd}|${methodologyNature}`;
        
        // 1. Détection intra-lot (au sein du même fichier d'import)
        if (seenTuplesInBatch.has(tupleKey)) {
          warnings.push('Doublon intra-fichier : observation identique déjà présente plus haut dans ce lot');
          errors.push('Doublon intra-lot (même indicateur, territoire, période et méthodologie)');
        } else {
          seenTuplesInBatch.add(tupleKey);
        }

        // 2. Détection en base de données (conflit avec observations existantes)
        if (existingDbTuples.has(tupleKey)) {
          const dbObs = existingDbTuples.get(tupleKey);
          const conflictDesc = `ID #${dbObs.id}, statut: "${dbObs.editorial_status}", révision: ${dbObs.revision_number}${dbObs.is_active ? ', active' : ''}`;
          warnings.push(`Conflit d'unicité avec observation existante en base (${conflictDesc})`);
          errors.push(`Doublon avec une observation existante en base (${conflictDesc})`);
        }
      }

      const isLineValid = errors.length === 0;
      if (isLineValid) {
        validCount++;
      } else {
        errorCount++;
      }

      const status = isLineValid ? 'valid' : 'error';
      const errorMessage = errors.length > 0 ? errors.join(' ; ') : null;

      const stagedPayload = {
        indicator_id: indicator?.id || null,
        indicator_code: indicator?.code || null,
        indicator_name: indicator?.name || null,
        territory_id: territory?.id || null,
        territory_code: territory?.code || null,
        territory_name: territory?.name || null,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        value_numeric: valueNumeric,
        value_text: valueText,
        missing_reason: missingReason,
        methodology_nature: methodologyNature,
        source_id: source?.id || null,
        source_name: source?.name || null,
        citation_reference: citationReference,
        citation_url: citationUrl,
        documentary_tier: documentaryTier,
        methodological_robustness: methodologicalRobustness,
        is_source_qualified: isSourceQualified,
        provenance_status: provenanceStatus,
        notes: mapping.notes ? rawRow[mapping.notes] : null,
        raw_row: rawRow,
        warnings
      };

      // Insertion dans import_lines
      await client.query(`
        INSERT INTO import_lines (
          batch_id, line_number, raw_payload, status, error_message
        ) VALUES ($1, $2, $3, $4, $5);
      `, [
        batchId,
        lineNum,
        JSON.stringify(stagedPayload),
        status,
        errorMessage
      ]);

      if (validatedRowsSummary.length < 50) {
        validatedRowsSummary.push({
          line_number: lineNum,
          status,
          errors,
          warnings,
          is_source_qualified: isSourceQualified,
          provenance_status: provenanceStatus,
          preview: {
            indicator_code: indicator?.code,
            territory_code: territory?.code,
            period_start: periodStart,
            period_end: periodEnd,
            value_numeric: valueNumeric,
            value_text: valueText,
            missing_reason: missingReason,
            source_name: source?.name || null,
            citation_reference: citationReference,
            documentary_tier: documentaryTier,
            methodological_robustness: methodologicalRobustness,
            is_source_qualified: isSourceQualified,
            provenance_status: provenanceStatus
          }
        });
      }
    }

    const newBatchStatus = errorCount === rows.length ? 'rejected' : 'validated';
    await client.query(`
      UPDATE import_batches
      SET total_lines = $1, valid_lines = $2, error_lines = $3, status = $4, updated_at = NOW()
      WHERE id = $5;
    `, [rows.length, validCount, errorCount, newBatchStatus, batchId]);

    await client.query('COMMIT');

    return {
      batchId,
      totalLines: rows.length,
      validLines: validCount,
      errorLines: errorCount,
      status: newBatchStatus,
      preview: validatedRowsSummary
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 4. Application atomique d'un lot validé : création EXCLUSIVE de brouillons ('draft')
 */
async function applyValidatedBatch(batchId, user) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const batchRes = await client.query('SELECT * FROM import_batches WHERE id = $1 FOR UPDATE', [batchId]);
    if (batchRes.rows.length === 0) {
      const err = new Error(`Lot d'import #${batchId} introuvable`);
      err.status = 404;
      throw err;
    }
    const batch = batchRes.rows[0];

    if (batch.status === 'applied') {
      const err = new Error('Ce lot a déjà été appliqué en base de données');
      err.status = 400;
      throw err;
    }

    if (batch.status !== 'validated') {
      const err = new Error(`Impossible d'appliquer un lot au statut '${batch.status}' (statut 'validated' requis)`);
      err.status = 400;
      throw err;
    }

    const linesRes = await client.query(
      `SELECT id, line_number, raw_payload FROM import_lines WHERE batch_id = $1 AND status = 'valid' ORDER BY line_number ASC`,
      [batchId]
    );

    if (linesRes.rows.length === 0) {
      const err = new Error('Aucune ligne valide à appliquer dans ce lot');
      err.status = 400;
      throw err;
    }

    let appliedCount = 0;

    for (const line of linesRes.rows) {
      const payload = line.raw_payload;

      // 1. Insertion dans data_values au statut strict 'draft'
      const provenanceSummary = payload.is_source_qualified
        ? `Import de données documentées - Fichier: ${batch.file_name} (Lot #${batchId})`
        : `Import de données brutes - Fichier: ${batch.file_name} (Lot #${batchId})`;

      const internalNotes = [
        `Provenance fichier: ${batch.file_name} (Taille: ${batch.file_size_bytes} octets, SHA-256: ${batch.sha256_checksum})`,
        `Importé par: ${user.username} (ID: ${user.id}) - Ligne ${line.line_number}`,
        payload.is_source_qualified
          ? `Source documentaire vérifiée: ID #${payload.source_id} (${payload.source_name || 'Institution'}) | Réf: "${payload.citation_reference}" | Tier: ${payload.documentary_tier} | Robustesse: ${payload.methodological_robustness}`
          : `[SOURCE NON QUALIFIÉE] Importé sans source documentaire vérifiée. Qualification requise avant soumission éditoriale.`
      ].join(' | ');

      const insertValueSql = `
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, value_text, missing_reason, methodology_nature,
          editorial_status, is_active, revision_number,
          public_reason_summary, internal_notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          'draft', FALSE, 1,
          $10, $11, $12
        ) RETURNING id;
      `;

      const valueRes = await client.query(insertValueSql, [
        payload.indicator_id,
        payload.territory_id,
        payload.period_type,
        payload.period_start,
        payload.period_end,
        payload.value_numeric,
        payload.value_text,
        payload.missing_reason,
        payload.methodology_nature,
        provenanceSummary,
        internalNotes,
        user.id
      ]);

      const newValueId = valueRes.rows[0].id;

      // 2. Si et seulement si la source est qualifiée (institution ET référence documentaire réelle)
      if (payload.is_source_qualified && payload.source_id && payload.citation_reference) {
        await client.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, citation_url, methodological_robustness, notes, created_by
          ) VALUES ($1, $2, 'primary', $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING;
        `, [
          newValueId,
          payload.source_id,
          payload.documentary_tier, // Non automatique TIER 1 !
          payload.citation_reference, // Référence réelle non inventée !
          payload.citation_url || null,
          payload.methodological_robustness, // Non automatique high !
          `Qualification documentaire lors de l'import (Lot #${batchId})`,
          user.id
        ]);
      }

      // 3. Mise à jour de import_lines avec l'ID créé
      await client.query(
        `UPDATE import_lines SET data_value_id = $1, status = 'imported' WHERE id = $2`,
        [newValueId, line.id]
      );

      appliedCount++;
    }

    // 5. Bascule du statut du lot vers 'applied'
    await client.query(`
      UPDATE import_batches SET status = 'applied', updated_at = NOW() WHERE id = $1;
    `, [batchId]);

    await client.query('COMMIT');

    return {
      batchId,
      status: 'applied',
      importedCount: appliedCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 5. Extraction CSV des lignes rejetées pour correction
 */
async function generateRejectedCsv(batchId) {
  const batchRes = await pool.query('SELECT file_name FROM import_batches WHERE id = $1', [batchId]);
  if (batchRes.rows.length === 0) {
    const err = new Error(`Lot d'import #${batchId} introuvable`);
    err.status = 404;
    throw err;
  }

  const linesRes = await pool.query(
    `SELECT line_number, raw_payload, error_message FROM import_lines WHERE batch_id = $1 AND status = 'error' ORDER BY line_number ASC`,
    [batchId]
  );

  const errorRows = linesRes.rows;
  if (errorRows.length === 0) {
    return 'Ligne;Erreur\n';
  }

  const allHeadersSet = new Set(['Numero_Ligne', 'Erreur_Constatee']);
  errorRows.forEach(r => {
    if (r.raw_payload && r.raw_payload.raw_row) {
      Object.keys(r.raw_payload.raw_row).forEach(k => {
        if (!k.startsWith('_')) allHeadersSet.add(k);
      });
    }
  });

  const headers = Array.from(allHeadersSet);

  const sanitizeCsvExportCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    
    // Protection absolue contre l'injection de formules dans Excel / LibreOffice :
    // Si la chaîne commence par =, +, -, @, \t, \r, \n (ou précédée d'espaces/tabulations),
    // on préfixe impérativement par une apostrophe simple pour forcer l'interprétation en texte pur.
    if (/^[\s\t\r\n]*[=+@\-\t\r\n]/.test(str)) {
      str = "'" + str;
    }
    
    // Échappement standard RFC 4180
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csvLines = [headers.map(sanitizeCsvExportCell).join(';')];

  for (const r of errorRows) {
    const raw = (r.raw_payload && r.raw_payload.raw_row) || {};
    const lineArr = headers.map(h => {
      if (h === 'Numero_Ligne') return r.line_number;
      if (h === 'Erreur_Constatee') return r.error_message || '';
      return raw[h] !== undefined ? raw[h] : '';
    });
    csvLines.push(lineArr.map(sanitizeCsvExportCell).join(';'));
  }

  // Encodage avec UTF-8 BOM (\uFEFF) pour compatibilité native Excel
  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * 6. Consultation des lots et détails
 */
async function listBatches({ limit = 20, offset = 0 } = {}) {
  const sql = `
    SELECT 
      b.id, b.file_name, b.file_size_bytes, b.mime_type, b.sha256_checksum,
      b.total_lines, b.valid_lines, b.error_lines, b.status,
      b.created_at, b.updated_at,
      u.username AS uploaded_by_username
    FROM import_batches b
    JOIN users u ON u.id = b.uploaded_by
    ORDER BY b.id DESC
    LIMIT $1 OFFSET $2;
  `;
  const countSql = `SELECT COUNT(*) AS total FROM import_batches;`;

  const [res, countRes] = await Promise.all([
    pool.query(sql, [limit, offset]),
    pool.query(countSql)
  ]);

  return {
    batches: res.rows,
    total: parseInt(countRes.rows[0].total, 10),
    limit,
    offset
  };
}

async function getBatchById(batchId) {
  const batchSql = `
    SELECT 
      b.id, b.file_name, b.file_size_bytes, b.mime_type, b.sha256_checksum,
      b.total_lines, b.valid_lines, b.error_lines, b.status,
      b.created_at, b.updated_at,
      u.username AS uploaded_by_username
    FROM import_batches b
    JOIN users u ON u.id = b.uploaded_by
    WHERE b.id = $1;
  `;
  const linesSql = `
    SELECT id, line_number, raw_payload, status, error_message, data_value_id, created_at
    FROM import_lines
    WHERE batch_id = $1
    ORDER BY line_number ASC
    LIMIT 200;
  `;

  const [bRes, lRes] = await Promise.all([
    pool.query(batchSql, [batchId]),
    pool.query(linesSql, [batchId])
  ]);

  if (bRes.rows.length === 0) {
    const err = new Error(`Lot d'import #${batchId} introuvable`);
    err.status = 404;
    throw err;
  }

  return {
    batch: bRes.rows[0],
    lines: lRes.rows
  };
}

module.exports = {
  createBatch,
  parsePreview,
  validateAndStageLines,
  applyValidatedBatch,
  generateRejectedCsv,
  listBatches,
  getBatchById,
  validateFileSignature,
  inspectZipStructure,
  MAX_FILE_SIZE_BYTES
};
