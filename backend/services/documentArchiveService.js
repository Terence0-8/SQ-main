const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/database');
const logger = require('../config/logger');

const ARCHIVE_DIR = path.resolve(__dirname, '..', 'storage', 'document_archive');

// Assurer l'existence du répertoire de stockage privé
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

const ALLOWED_STATUSES = [
  'original_consulted',
  'original_accessible_unconsulted',
  'institutional_reference_only',
  'unavailable',
];

/**
 * Calcule l'empreinte SHA-256 d'un buffer ou d'une chaîne
 * @param {Buffer|string} data
 * @returns {string} Empreinte hexadécimale SHA-256
 */
function computeSha256(data) {
  if (Buffer.isBuffer(data)) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  if (typeof data === 'string') {
    if (fs.existsSync(data)) {
      const fileBuffer = fs.readFileSync(data);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }
    return crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
  }
  throw new Error('Type de données non supporté pour computeSha256');
}

/**
 * Valide en profondeur si un buffer correspond à un document PDF authentique
 * Rejette : fichiers vides, HTML déguisé, fichiers tronqués sans marqueur EOF
 * @param {Buffer} buffer
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePdf(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return { valid: false, error: "Le contenu fourni n'est pas un Buffer binaire" };
  }

  // 1. Longueur minimale : un PDF valide ne peut être inférieur à 32 octets
  if (buffer.length < 32) {
    return { valid: false, error: 'Fichier vide ou trop court pour être un PDF valide' };
  }

  // 2. Signature d'en-tête (Magic bytes %PDF-)
  const hasMagicBytes =
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d; // -

  if (!hasMagicBytes) {
    return { valid: false, error: "Signature binaire PDF absente (l'en-tête ne commence pas par %PDF-)" };
  }

  // 3. Rejet des fichiers HTML ou scripts dissimulés dans les premiers octets
  const headerPreview = buffer.subarray(0, Math.min(buffer.length, 512)).toString('latin1').toLowerCase();
  if (
    headerPreview.includes('<!doctype') ||
    headerPreview.includes('<html') ||
    headerPreview.includes('<body') ||
    headerPreview.includes('<?xml') ||
    headerPreview.includes('<script')
  ) {
    return { valid: false, error: "Structure HTML/XML détectée sous l'en-tête (fichier HTML déguisé)" };
  }

  // 4. Marqueur de fin de fichier PDF (%%EOF) dans les 1024 derniers octets
  const tailStart = Math.max(0, buffer.length - 1024);
  const tailContent = buffer.subarray(tailStart).toString('latin1');
  if (!tailContent.includes('%%EOF')) {
    return { valid: false, error: 'Marqueur de fin %%EOF absent (fichier PDF corrompu ou tronqué)' };
  }

  return { valid: true };
}

/**
 * Rétrocompatibilité booléenne
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isValidPdf(buffer) {
  return validatePdf(buffer).valid;
}

/**
 * Retourne le chemin du répertoire d'archivage privé
 * @returns {string}
 */
function getArchiveDirectory() {
  return ARCHIVE_DIR;
}

/**
 * Vérifie qu'un chemin de fichier est strictement confiné au répertoire d'archivage privé
 * et exempt de tentative de traversée de chemin (path traversal)
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathSafe(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.includes('\0')) {
    return false;
  }
  const resolved = path.resolve(targetPath);
  const archiveRoot = path.resolve(ARCHIVE_DIR);
  return resolved.startsWith(archiveRoot + path.sep);
}

/**
 * Construit un nom de fichier d'archive sécurisé et déterministe
 * @param {number|string} publicationId
 * @param {string} sha256
 * @returns {string} Chemin absolu sécurisé
 */
function buildSafeArchivePath(publicationId, sha256) {
  const cleanId = parseInt(publicationId, 10);
  if (isNaN(cleanId) || cleanId <= 0) {
    throw new Error(`Identifiant de publication invalide pour l'archivage : ${publicationId}`);
  }

  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error('Empreinte SHA-256 hexadécimale de 64 caractères requise');
  }

  const fileName = `pub_${cleanId}_${sha256.slice(0, 16)}.pdf`;
  const fullPath = path.resolve(ARCHIVE_DIR, fileName);

  if (!isPathSafe(fullPath)) {
    throw new Error('Tentative de traversée de répertoire détectée');
  }

  return fullPath;
}

/**
 * Enregistre ou met à jour un élément de preuve documentaire dans data_document_evidence
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function registerEvidence({
  publicationId,
  indicatorId = null,
  title,
  institutionAcronym,
  publicationYear = null,
  originalUrl,
  documentStatus,
  filePath = null,
  fileSizeBytes = null,
  sha256Hash = null,
  retrievalDate = null,
  pageSectionReference = null,
  verificationNotes = null,
}) {
  if (!ALLOWED_STATUSES.includes(documentStatus)) {
    throw new Error(
      `Statut documentaire invalide : "${documentStatus}". Valeurs autorisées : ${ALLOWED_STATUSES.join(', ')}`
    );
  }

  if (!publicationId || !title || !institutionAcronym || !originalUrl) {
    throw new Error(
      'Paramètres obligatoires manquants : publicationId, title, institutionAcronym, originalUrl'
    );
  }

  if (filePath && !isPathSafe(filePath)) {
    throw new Error('Le chemin de fichier spécifié sort du répertoire de stockage privé sécurisé');
  }

  // Vérifier si un enregistrement existe déjà pour cette publication et indicateur
  const existingRes = await pool.query(
    `SELECT id FROM data_document_evidence
     WHERE publication_id = $1 AND (indicator_id = $2 OR ($2::INTEGER IS NULL AND indicator_id IS NULL))
     LIMIT 1`,
    [publicationId, indicatorId]
  );

  if (existingRes.rows.length > 0) {
    const evidenceId = existingRes.rows[0].id;
    const updateRes = await pool.query(
      `UPDATE data_document_evidence
       SET title = $1,
           institution_acronym = $2,
           publication_year = $3,
           original_url = $4,
           document_status = $5,
           file_path = COALESCE($6, file_path),
           file_size_bytes = COALESCE($7, file_size_bytes),
           sha256_hash = COALESCE($8, sha256_hash),
           retrieval_date = COALESCE($9, retrieval_date),
           page_section_reference = $10,
           verification_notes = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        title,
        institutionAcronym,
        publicationYear,
        originalUrl,
        documentStatus,
        filePath,
        fileSizeBytes,
        sha256Hash,
        retrievalDate,
        pageSectionReference,
        verificationNotes,
        evidenceId,
      ]
    );
    logger.info(`[DocumentArchive] Preuve mise à jour pour publication ${publicationId} (ID: ${evidenceId})`);
    return updateRes.rows[0];
  }

  const insertRes = await pool.query(
    `INSERT INTO data_document_evidence (
       publication_id, indicator_id, title,
       institution_acronym, publication_year, original_url, document_status,
       file_path, file_size_bytes, sha256_hash, retrieval_date,
       page_section_reference, verification_notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      publicationId,
      indicatorId,
      title,
      institutionAcronym,
      publicationYear,
      originalUrl,
      documentStatus,
      filePath,
      fileSizeBytes,
      sha256Hash,
      retrievalDate,
      pageSectionReference,
      verificationNotes,
    ]
  );
  logger.info(`[DocumentArchive] Preuve enregistrée pour publication ${publicationId} (ID: ${insertRes.rows[0].id})`);
  return insertRes.rows[0];
}

/**
 * Archive un fichier PDF réel et vérifié dans le stockage privé
 * Règle d'intégrité absolue : Rejette tout fichier qui n'est pas un vrai PDF (%PDF-)
 * Vérification SHA-256 post-écriture pour garantir l'absence de corruption sur disque.
 * @param {Object} params
 * @param {Buffer} params.pdfBuffer
 * @returns {Promise<Object>}
 */
async function archivePdfFile({
  publicationId,
  indicatorId = null,
  title,
  institutionAcronym,
  publicationYear = null,
  originalUrl,
  pdfBuffer,
  pageSectionReference = null,
  verificationNotes = null,
}) {
  const pdfCheck = validatePdf(pdfBuffer);
  if (!pdfCheck.valid) {
    throw new Error(`Intégrité documentaire violée : ${pdfCheck.error}. Refus d'archiver.`);
  }

  const sha256 = computeSha256(pdfBuffer);
  const fileSizeBytes = pdfBuffer.length;
  const fullPath = buildSafeArchivePath(publicationId, sha256);

  // Écriture atomique dans le dossier privé
  fs.writeFileSync(fullPath, pdfBuffer);

  // Vérification de lecture post-écriture
  const writtenBytes = fs.readFileSync(fullPath);
  const readHash = computeSha256(writtenBytes);
  if (readHash !== sha256 || writtenBytes.length !== fileSizeBytes) {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    throw new Error("Erreur d'intégrité à l'écriture : le hash relu sur disque ne correspond pas au buffer source");
  }

  return await registerEvidence({
    publicationId,
    indicatorId,
    title,
    institutionAcronym,
    publicationYear,
    originalUrl,
    documentStatus: 'original_consulted',
    filePath: fullPath,
    fileSizeBytes,
    sha256Hash: sha256,
    retrievalDate: new Date(),
    pageSectionReference,
    verificationNotes,
  });
}

/**
 * Vérifie l'intégrité matérielle d'une preuve archivée (détection de falsification / altération / remplacement)
 * @param {number} evidenceId
 * @returns {Promise<{ valid: boolean, reason?: string, evidence?: Object }>}
 */
async function verifyFileIntegrity(evidenceId) {
  const res = await pool.query(
    'SELECT * FROM data_document_evidence WHERE id = $1',
    [evidenceId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Élément de preuve introuvable (ID: ${evidenceId})`);
  }

  const row = res.rows[0];

  // Si le statut n'est pas original_consulted, aucun fichier physique n'est attendu
  if (row.document_status !== 'original_consulted' || !row.file_path) {
    return {
      valid: false,
      reason: 'NOT_ARCHIVED',
      status: row.document_status,
      evidence: row,
    };
  }

  // 1. Contrôle de sécurité du chemin
  if (!isPathSafe(row.file_path)) {
    return {
      valid: false,
      reason: 'PATH_TRAVERSAL_DETECTED',
      evidence: row,
    };
  }

  // 2. Présence physique du fichier
  if (!fs.existsSync(row.file_path)) {
    return {
      valid: false,
      reason: 'FILE_MISSING',
      evidence: row,
    };
  }

  // 3. Concordance de taille
  const stat = fs.statSync(row.file_path);
  if (stat.size !== Number(row.file_size_bytes)) {
    return {
      valid: false,
      reason: 'SIZE_MISMATCH',
      expectedSize: Number(row.file_size_bytes),
      actualSize: stat.size,
      evidence: row,
    };
  }

  // 4. Concordance d'empreinte SHA-256
  const diskBytes = fs.readFileSync(row.file_path);
  const diskHash = computeSha256(diskBytes);
  if (diskHash !== row.sha256_hash) {
    return {
      valid: false,
      reason: 'HASH_MISMATCH_TAMPERED',
      expectedHash: row.sha256_hash,
      actualHash: diskHash,
      evidence: row,
    };
  }

  // 5. Structure PDF valide
  const structureCheck = validatePdf(diskBytes);
  if (!structureCheck.valid) {
    return {
      valid: false,
      reason: 'CORRUPTED_PDF_STRUCTURE',
      error: structureCheck.error,
      evidence: row,
    };
  }

  return {
    valid: true,
    evidence: row,
  };
}

/**
 * Récupère les preuves d'une publication par son ID
 * @param {number} publicationId
 * @returns {Promise<Array>}
 */
async function getEvidenceByPublicationId(publicationId) {
  const res = await pool.query(
    `SELECT dde.*, di.code as indicator_code, di.name as indicator_name
     FROM data_document_evidence dde
     LEFT JOIN data_indicators di ON di.id = dde.indicator_id
     WHERE dde.publication_id = $1
     ORDER BY dde.id ASC`,
    [publicationId]
  );
  return res.rows;
}

/**
 * Récupère toutes les preuves avec filtres optionnels
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
async function getAllEvidences(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`dde.document_status = $${params.length}`);
  }
  if (filters.institution) {
    params.push(`%${filters.institution}%`);
    conditions.push(`dde.institution_acronym ILIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT dde.*, di.code as indicator_code, di.name as indicator_name, dp.title as publication_title
    FROM data_document_evidence dde
    JOIN data_publications dp ON dp.id = dde.publication_id
    LEFT JOIN data_indicators di ON di.id = dde.indicator_id
    ${whereClause}
    ORDER BY dde.id ASC
  `;

  const res = await pool.query(query, params);
  return res.rows;
}

/**
 * Produit le rapport d'audit documentaire exhaustif
 * @returns {Promise<Object>}
 */
async function getEvidenceAuditSummary() {
  const countsRes = await pool.query(`
    SELECT document_status, COUNT(*)::INTEGER as count
    FROM data_document_evidence
    GROUP BY document_status
  `);

  const counts = {
    original_consulted: 0,
    original_accessible_unconsulted: 0,
    institutional_reference_only: 0,
    unavailable: 0,
    total: 0,
  };

  for (const row of countsRes.rows) {
    const val = parseInt(row.count, 10);
    if (Object.prototype.hasOwnProperty.call(counts, row.document_status)) {
      counts[row.document_status] = val;
    }
    counts.total += val;
  }

  const itemsRes = await pool.query(`
    SELECT dde.id, dde.publication_id, dde.title, dde.institution_acronym,
           dde.publication_year, dde.original_url, dde.document_status,
           dde.sha256_hash, dde.file_size_bytes, dde.page_section_reference,
           dde.verification_notes
    FROM data_document_evidence dde
    ORDER BY dde.id ASC
  `);

  return {
    summary: counts,
    items: itemsRes.rows,
  };
}

module.exports = {
  ARCHIVE_DIR,
  ALLOWED_STATUSES,
  computeSha256,
  validatePdf,
  isValidPdf,
  isPathSafe,
  buildSafeArchivePath,
  getArchiveDirectory,
  registerEvidence,
  archivePdfFile,
  verifyFileIntegrity,
  getEvidenceByPublicationId,
  getAllEvidences,
  getEvidenceAuditSummary,
};
