const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
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

// ==========================================
// 1. LISTE DES PARTIS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const { active, lang } = req.query;
        const isEn = lang === 'en';

        let query = `
          SELECT 
            id,
            ${isEn ? 'COALESCE(title_en, name)' : 'name'} as name,
            acronym,
            logo_url,
            leader_photo_url,
            color,
            founded_year,
            creation_date,
            type,
            seats_assembly,
            leader_name,
            ideology,
            ${isEn ? 'COALESCE(description_en, description)' : 'description'} as description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id,
            is_active
          FROM parties
        `;
        const params = [];

        if (active !== undefined) {
            query += ' WHERE is_active = $1';
            params.push(active === 'true');
        }

        query += ' ORDER BY name ASC';

        const result = await pool.query(query, params);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
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
            leader_photo_url,
            color,
            founded_year,
            creation_date,
            type,
            seats_assembly,
            leader_name,
            ideology,
            ${isEn ? 'COALESCE(description_en, description)' : 'description'} as description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id,
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

        res.json({ success: true, data: result.rows[0] });
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
            leader_photo_url,
            color,
            founded_year,
            creation_date,
            type,
            seats_assembly,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id,
            podcast_title,
            is_active
        } = value;

        // Upload Logo
        const logoFile = req.files && (req.files['logo_file']?.[0] || req.files['logo']?.[0]);
        let finalLogoUrl = logo_url || null;
        if (logoFile) {
            const uploadedUrl = await uploadToCloudinary(logoFile, 'solitiquo_parties');
            if (uploadedUrl) finalLogoUrl = uploadedUrl;
        }

        // Upload Photo Leader
        const leaderFile = req.files && (req.files['leader_file']?.[0] || req.files['leader']?.[0]);
        let finalLeaderPhotoUrl = leader_photo_url || null;
        if (leaderFile) {
            const uploadedUrl = await uploadToCloudinary(leaderFile, 'solitiquo_leaders');
            if (uploadedUrl) finalLeaderPhotoUrl = uploadedUrl;
        }

        // Upload Audio Podcast
        const audioFile = req.files && req.files['audio_file']?.[0];
        let finalPodcastId = podcast_id || null;
        if (audioFile) {
            const audioUrl = await uploadToCloudinary(audioFile, 'solitiquo_podcasts', 'video');
            if (audioUrl) {
                const podRes = await pool.query(
                    `INSERT INTO podcasts (title, audio_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
                    [podcast_title || `Podcast ${name}`, audioUrl]
                );
                finalPodcastId = podRes.rows[0].id;
            }
        }

        // Sanitisation
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        const foundedYearVal = founded_year || (creation_date ? (parseInt(creation_date) || null) : null);
        const creationDateVal = creation_date || (founded_year ? String(founded_year) : null);

        const query = `
          INSERT INTO parties 
          (name, acronym, logo_url, leader_photo_url, color, founded_year, creation_date, type, seats_assembly, leader_name, ideology, description, program_summary, website_url, social_twitter, social_facebook, contact_email, podcast_id, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
          RETURNING id, name, acronym
        `;

        const values = [
            name,
            acronym || null,
            finalLogoUrl,
            finalLeaderPhotoUrl,
            color || null,
            foundedYearVal,
            creationDateVal,
            type || 'opposition',
            seats_assembly || 0,
            leader_name,
            ideology,
            description,
            program_summary || null,
            website_url || null,
            social_twitter || null,
            social_facebook || null,
            contact_email || null,
            finalPodcastId,
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
            leader_photo_url,
            color,
            founded_year,
            creation_date,
            type,
            seats_assembly,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            podcast_id,
            podcast_title,
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
        let finalLeaderPhotoUrl = leader_photo_url || existing.leader_photo_url;
        if (leaderFile) {
            const uploadedUrl = await uploadToCloudinary(leaderFile, 'solitiquo_leaders');
            if (uploadedUrl) finalLeaderPhotoUrl = uploadedUrl;
        }

        // Upload Audio Podcast
        const audioFile = req.files && req.files['audio_file']?.[0];
        let finalPodcastId = podcast_id || existing.podcast_id || null;
        if (audioFile) {
            const audioUrl = await uploadToCloudinary(audioFile, 'solitiquo_podcasts', 'video');
            if (audioUrl) {
                const podRes = await pool.query(
                    `INSERT INTO podcasts (title, audio_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
                    [podcast_title || `Podcast ${name}`, audioUrl]
                );
                finalPodcastId = podRes.rows[0].id;
            }
        }

        // Sanitisation
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        const foundedYearVal = founded_year || (creation_date ? (parseInt(creation_date) || null) : existing.founded_year);
        const creationDateVal = creation_date || (founded_year ? String(founded_year) : existing.creation_date);

        const query = `
          UPDATE parties 
          SET 
            name = $1,
            acronym = $2,
            logo_url = $3,
            leader_photo_url = $4,
            color = $5,
            founded_year = $6,
            creation_date = $7,
            type = $8,
            seats_assembly = $9,
            leader_name = $10,
            ideology = $11,
            description = $12,
            program_summary = $13,
            website_url = $14,
            social_twitter = $15,
            social_facebook = $16,
            contact_email = $17,
            podcast_id = $18,
            is_active = $19,
            updated_at = NOW()
          WHERE id = $20
          RETURNING id, name, acronym
        `;

        const values = [
            name,
            acronym || null,
            finalLogoUrl,
            finalLeaderPhotoUrl,
            color || null,
            foundedYearVal,
            creationDateVal,
            type || 'opposition',
            seats_assembly || 0,
            leader_name,
            ideology,
            description,
            program_summary || null,
            website_url || null,
            social_twitter || null,
            social_facebook || null,
            contact_email || null,
            finalPodcastId,
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
