const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Joi = require('joi');
const { isAdmin } = require('../middleware/auth');
const { sanitizeText, sanitizeHTML } = require('../middleware/sanitize');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const { imageUpload } = require('../middleware/upload');

// Middleware Multer supportant logo, leader et audio
const partyUpload = imageUpload.fields([
    { name: 'logo_file', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'leader_file', maxCount: 1 },
    { name: 'leader', maxCount: 1 },
    { name: 'audio_file', maxCount: 1 }
]);

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const partySchema = Joi.object({
    name: Joi.string().min(2).max(255).required()
        .messages({
            'string.min': 'Le nom du parti doit contenir au moins 2 caractères',
            'string.max': 'Le nom du parti ne doit pas dépasser 255 caractères',
            'any.required': 'Le nom du parti est requis'
        }),

    acronym: Joi.string().max(20).allow('').optional(),
    logo_url: Joi.string().allow('').optional(),
    leader_photo_url: Joi.string().allow('').optional(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow('').optional(),
    founded_year: Joi.number().integer().min(1800).max(2100).allow(null, '').optional(),
    creation_date: Joi.string().allow('').optional(),
    type: Joi.string().allow('').optional(),
    seats_assembly: Joi.number().integer().allow(null, '').optional(),
    leader_name: Joi.string().max(255).allow('').optional(),
    ideology: Joi.string().max(100).allow('').optional(),
    description: Joi.string().allow('').optional(),
    program_summary: Joi.string().allow('').optional(),
    website_url: Joi.string().allow('').optional(),
    social_twitter: Joi.string().max(255).allow('').optional(),
    social_facebook: Joi.string().max(255).allow('').optional(),
    contact_email: Joi.string().allow('').optional(),
    podcast_id: Joi.number().integer().allow(null, '').optional(),
    podcast_title: Joi.string().allow('').optional(),
    is_active: Joi.boolean().optional()
}).unknown(true);

// Helper upload Cloudinary
async function uploadToCloudinary(file, folder, resourceType = 'image') {
    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder: folder,
            resource_type: resourceType
        });
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return result.secure_url;
    } catch (e) {
        console.error(`❌ Erreur upload Cloudinary (${folder}):`, e);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return null;
    }
}

// Référentiel des métadonnées institutionnelles de référence des 6 partis permanents
// Note citoyenne : Les données de sièges relèvent strictement de la 10e Législature (2020) de l'Assemblée Nationale du Cameroun.
const PERMANENT_PARTIES_METADATA = {
    'RDPC': { seats_assembly: 152, type: 'majorite', leader_photo_url: null },
    'UNDP': { seats_assembly: 7, type: 'majorite', leader_photo_url: null },
    'MRC': { seats_assembly: 0, type: 'opposition', leader_photo_url: 'https://res.cloudinary.com/doa4gov1w/image/upload/v1787075390/solitiquo_leaders/eeakljokblqke4rfyolc.jpg' },
    'SDF': { seats_assembly: 5, type: 'opposition', leader_photo_url: 'https://res.cloudinary.com/doa4gov1w/image/upload/v1786891816/solitiquo_leaders/qro7scqfhju9ceytywbl.png' },
    'PCRN': { seats_assembly: 5, type: 'opposition', leader_photo_url: null },
    'UDC': { seats_assembly: 4, type: 'opposition', leader_photo_url: null }
};

/**
 * Normalise un enregistrement de parti vers le format d'exposition API
 * en utilisant exclusivement les colonnes réelles de la table parties et le référentiel institutionnel.
 */
function formatParty(row) {
    if (!row) return null;
    const acronym = row.acronym ? String(row.acronym).trim().toUpperCase() : '';
    const meta = PERMANENT_PARTIES_METADATA[acronym] || {};
    return {
        id: row.id,
        name: row.name,
        acronym: row.acronym,
        logo_url: row.logo_url,
        leader_photo_url: meta.leader_photo_url !== undefined ? meta.leader_photo_url : null,
        color: row.color,
        founded_year: row.founded_year,
        creation_date: row.founded_year ? String(row.founded_year) : null,
        type: meta.type || (acronym === 'RDPC' || acronym === 'UNDP' ? 'majorite' : 'opposition'),
        seats_assembly: meta.seats_assembly !== undefined ? meta.seats_assembly : null,
        leader_name: row.leader_name,
        ideology: row.ideology,
        description: row.description,
        program_summary: row.program_summary,
        website_url: row.website_url,
        social_twitter: row.social_twitter,
        social_facebook: row.social_facebook,
        contact_email: row.contact_email,
        podcast_id: null,
        is_active: row.is_active
    };
}

// ==========================================
// 1. LISTE DES PARTIS (Exclusion stricte des données de test pour les vues publiques)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const { active, lang, include_tests } = req.query;
        const isEn = lang === 'en';

        let query = `
          SELECT 
            id,
            ${isEn ? 'COALESCE(title_en, name)' : 'name'} as name,
            acronym,
            logo_url,
            color,
            founded_year,
            leader_name,
            ideology,
            ${isEn ? 'COALESCE(description_en, description)' : 'description'} as description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            is_active
          FROM parties
        `;
        const conditions = [];
        const params = [];

        if (active !== undefined) {
            params.push(active === 'true');
            conditions.push(`is_active = $${params.length}`);
        } else {
            // Vue publique par défaut : actifs uniquement
            conditions.push(`is_active = TRUE`);
        }

        // Filtre d'exclusion stricte des résidus de tests, migrations et fiches incomplètes pour le public
        if (include_tests !== 'true') {
            conditions.push(`name !~* '^(Parti )?(Mig[0-9]|Test|Demo|Breakdown|[0-9]{4,})'`);
            conditions.push(`(acronym IS NULL OR acronym !~* '^(P3|PTD|PTEST)$')`);
            conditions.push(`description IS NOT NULL AND length(trim(description)) >= 20`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY CASE WHEN acronym = \'RDPC\' THEN 1 WHEN acronym = \'MRC\' THEN 2 WHEN acronym = \'SDF\' THEN 3 WHEN acronym = \'UNDP\' THEN 4 WHEN acronym = \'PCRN\' THEN 5 WHEN acronym = \'UDC\' THEN 6 ELSE 7 END, name ASC';

        const result = await pool.query(query, params);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(formatParty)
        });
    } catch (err) {
        console.error('❌ Erreur liste partis:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 2. DÉTAIL D'UN PARTI
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { lang } = req.query;
        const isEn = lang === 'en';

        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        const query = `
          SELECT 
            id,
            ${isEn ? 'COALESCE(title_en, name)' : 'name'} as name,
            acronym,
            logo_url,
            color,
            founded_year,
            leader_name,
            ideology,
            ${isEn ? 'COALESCE(description_en, description)' : 'description'} as description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            is_active
          FROM parties WHERE id = $1
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Parti politique introuvable'
            });
        }

        res.json({ success: true, data: formatParty(result.rows[0]) });
    } catch (err) {
        console.error('❌ Erreur détail parti:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 3. CRÉER UN PARTI (Admin seulement)
// ==========================================
router.post('/', isAdmin, partyUpload, async (req, res) => {
    try {
        const { error, value } = partySchema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        let {
            name,
            acronym,
            logo_url,
            leader_photo_url: _leader_photo_url,
            color,
            founded_year,
            creation_date,
            type: _type,
            seats_assembly: _seats_assembly,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id: _podcast_id,
            podcast_title: _podcast_title,
            is_active
        } = value;

        // Upload Logo
        const logoFile = req.files && (req.files['logo_file']?.[0] || req.files['logo']?.[0]);
        let finalLogoUrl = logo_url || null;
        if (logoFile) {
            const uploadedUrl = await uploadToCloudinary(logoFile, 'solitiquo_parties');
            if (uploadedUrl) finalLogoUrl = uploadedUrl;
        }

        // Upload Photo Leader (si fichier transmis)
        const leaderFile = req.files && (req.files['leader_file']?.[0] || req.files['leader']?.[0]);
        let _finalLeaderPhotoUrl = _leader_photo_url || null;
        if (leaderFile) {
            const uploadedUrl = await uploadToCloudinary(leaderFile, 'solitiquo_leaders');
            if (uploadedUrl) _finalLeaderPhotoUrl = uploadedUrl;
        }

        // Upload Audio Podcast (si fichier transmis)
        const audioFile = req.files && req.files['audio_file']?.[0];
        let _finalPodcastId = _podcast_id || null;
        if (audioFile) {
            const audioUrl = await uploadToCloudinary(audioFile, 'solitiquo_podcasts', 'video');
            if (audioUrl) {
                const podRes = await pool.query(
                    `INSERT INTO podcasts (title, audio_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
                    [_podcast_title || `Podcast ${name}`, audioUrl]
                );
                _finalPodcastId = podRes.rows[0].id;
            }
        }

        // Sanitisation
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        const foundedYearVal = founded_year || (creation_date ? (parseInt(creation_date) || null) : null);

        const query = `
          INSERT INTO parties 
          (name, acronym, logo_url, color, founded_year, leader_name, ideology, description, program_summary, website_url, social_twitter, social_facebook, contact_email, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          RETURNING id, name, acronym
        `;

        const values = [
            name,
            acronym || null,
            finalLogoUrl,
            color || null,
            foundedYearVal,
            leader_name,
            ideology,
            description,
            program_summary || null,
            website_url || null,
            social_twitter || null,
            social_facebook || null,
            contact_email || null,
            is_active !== undefined ? is_active : true
        ];

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Parti politique créé avec succès',
            id: result.rows[0].id,
            party: result.rows[0]
        });

    } catch (err) {
        console.error('❌ Erreur création parti:', err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Un parti avec ce nom existe déjà' });
        }
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 4. MODIFIER UN PARTI (Admin seulement)
// ==========================================
router.put('/:id', isAdmin, partyUpload, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide' });

        const { error, value } = partySchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        let {
            name,
            acronym,
            logo_url,
            leader_photo_url: _leader_photo_url,
            color,
            founded_year,
            creation_date,
            type: _type,
            seats_assembly: _seats_assembly,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id: _podcast_id,
            podcast_title: _podcast_title,
            is_active
        } = value;

        // Récupérer le parti existant pour préserver les URLs actuelles si aucun nouveau fichier n'est fourni
        const existingRes = await pool.query('SELECT * FROM parties WHERE id = $1', [id]);
        if (existingRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Parti politique introuvable' });
        }
        const existing = existingRes.rows[0];

        // Upload Logo
        const logoFile = req.files && (req.files['logo_file']?.[0] || req.files['logo']?.[0]);
        let finalLogoUrl = logo_url || existing.logo_url;
        if (logoFile) {
            const uploadedUrl = await uploadToCloudinary(logoFile, 'solitiquo_parties');
            if (uploadedUrl) finalLogoUrl = uploadedUrl;
        }

        // Upload Photo Leader
        const leaderFile = req.files && (req.files['leader_file']?.[0] || req.files['leader']?.[0]);
        let _finalLeaderPhotoUrl = _leader_photo_url || existing.leader_photo_url;
        if (leaderFile) {
            const uploadedUrl = await uploadToCloudinary(leaderFile, 'solitiquo_leaders');
            if (uploadedUrl) _finalLeaderPhotoUrl = uploadedUrl;
        }

        // Upload Audio Podcast
        const audioFile = req.files && req.files['audio_file']?.[0];
        let _finalPodcastId = _podcast_id || existing.podcast_id || null;
        if (audioFile) {
            const audioUrl = await uploadToCloudinary(audioFile, 'solitiquo_podcasts', 'video');
            if (audioUrl) {
                const podRes = await pool.query(
                    `INSERT INTO podcasts (title, audio_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
                    [_podcast_title || `Podcast ${name}`, audioUrl]
                );
                _finalPodcastId = podRes.rows[0].id;
            }
        }

        // Sanitisation
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        const foundedYearVal = founded_year || (creation_date ? (parseInt(creation_date) || null) : existing.founded_year);

        const query = `
          UPDATE parties 
          SET 
            name = $1,
            acronym = $2,
            logo_url = $3,
            color = $4,
            founded_year = $5,
            leader_name = $6,
            ideology = $7,
            description = $8,
            program_summary = $9,
            website_url = $10,
            social_twitter = $11,
            social_facebook = $12,
            contact_email = $13,
            is_active = $14,
            updated_at = NOW()
          WHERE id = $15
          RETURNING id, name, acronym
        `;

        const values = [
            name,
            acronym || null,
            finalLogoUrl,
            color || null,
            foundedYearVal,
            leader_name,
            ideology,
            description,
            program_summary || null,
            website_url || null,
            social_twitter || null,
            social_facebook || null,
            contact_email || null,
            is_active !== undefined ? is_active : true,
            id
        ];

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Parti politique mis à jour avec succès',
            party: result.rows[0]
        });

    } catch (err) {
        console.error('❌ Erreur modification parti:', err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Un parti avec ce nom existe déjà' });
        }
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 5. SUPPRIMER UN PARTI (Admin seulement)
// ==========================================
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide' });

        const result = await pool.query('DELETE FROM parties WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Parti politique introuvable' });
        }

        res.json({
            success: true,
            message: 'Parti politique supprimé'
        });
    } catch (err) {
        console.error('❌ Erreur suppression parti:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

module.exports = router;
