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

const upload = multer({ dest: 'uploads/' });

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const partySchema = Joi.object({
    name: Joi.string().min(3).max(255).required()
        .messages({
            'string.min': 'Le nom du parti doit contenir au moins 3 caractères',
            'string.max': 'Le nom du parti ne doit pas dépasser 255 caractères',
            'any.required': 'Le nom du parti est requis'
        }),

    acronym: Joi.string().max(20).allow('').optional(),

    logo_url: Joi.string().uri().allow('').optional(),

    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow('').optional()
        .messages({
            'string.pattern.base': 'La couleur doit être au format hexadécimal (#FF5733)'
        }),

    founded_year: Joi.number().integer().min(1800).max(2100).allow(null).optional(),

    leader_name: Joi.string().max(255).allow('').optional(),

    ideology: Joi.string().max(100).allow('').optional(),

    description: Joi.string().allow('').optional(),

    program_summary: Joi.string().allow('').optional(),

    website_url: Joi.string().uri().allow('').optional(),

    social_twitter: Joi.string().max(255).allow('').optional(),

    social_facebook: Joi.string().max(255).allow('').optional(),

    contact_email: Joi.string().email().allow('').optional(),

    is_active: Joi.boolean().optional()
});

// ==========================================
// 1. LISTE DES PARTIS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const { active } = req.query;

        let query = 'SELECT * FROM parties';
        const params = [];

        // Filtrer par statut actif si demandé
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

        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        const result = await pool.query('SELECT * FROM parties WHERE id = $1', [id]);

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
router.post('/', isAdmin, upload.single('logo_file'), async (req, res) => {
    try {
        // Validation
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
            color,
            founded_year,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            is_active
        } = value;

        // Gestion upload logo
        let finalLogoUrl = logo_url;
        if (req.file) {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: "solitiquo_parties"
                });
                finalLogoUrl = result.secure_url;
                fs.unlinkSync(req.file.path);
            } catch (e) {
                console.error("❌ Erreur Cloudinary:", e);
            }
        }

        const query = `
      INSERT INTO parties 
      (name, acronym, logo_url, color, founded_year, leader_name, ideology, description, program_summary, website_url, social_twitter, social_facebook, contact_email, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING id, name, acronym
    `;

        // ✅ SANITISATION XSS
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        program_summary = program_summary ? sanitizeHTML(program_summary) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        const values = [
            name,
            acronym || null,
            finalLogoUrl || null,
            color || null,
            founded_year || null,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url || null,
            social_twitter || null,
            social_facebook || null,
            contact_email || null,
            is_active !== undefined ? is_active : true
        ];

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Parti politique créé',
            party: result.rows[0]
        });

    } catch (err) {
        console.error('❌ Erreur création parti:', err);

        // Gestion erreur nom déjà existant
        if (err.code === '23505') {
            return res.status(400).json({
                success: false,
                error: 'Un parti avec ce nom existe déjà'
            });
        }

        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 4. MODIFIER UN PARTI (Admin seulement)
// ==========================================
router.put('/:id', isAdmin, upload.single('logo_file'), async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        // Validation
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
            color,
            founded_year,
            leader_name,
            ideology,
            description,
            program_summary,
            website_url,
            social_twitter,
            social_facebook,
            contact_email,
            is_active
        } = value;

        // Gestion upload logo
        let finalLogoUrl = logo_url;
        if (req.file) {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: "solitiquo_parties"
                });
                finalLogoUrl = result.secure_url;
                fs.unlinkSync(req.file.path);
            } catch (e) {
                console.error("❌ Erreur Cloudinary:", e);
            }
        }

        // ✅ SANITISATION XSS
        name = sanitizeText(name);
        description = description ? sanitizeHTML(description) : null;
        program_summary = program_summary ? sanitizeHTML(program_summary) : null;
        leader_name = leader_name ? sanitizeText(leader_name) : null;
        ideology = ideology ? sanitizeText(ideology) : null;

        let query, values;

        if (finalLogoUrl) {
            query = `
        UPDATE parties 
        SET name=$1, acronym=$2, logo_url=$3, color=$4, founded_year=$5, leader_name=$6, ideology=$7, description=$8, program_summary=$9, website_url=$10, social_twitter=$11, social_facebook=$12, contact_email=$13, is_active=$14, updated_at=NOW()
        WHERE id=$15 
        RETURNING id, name, acronym
      `;
            values = [name, acronym, finalLogoUrl, color, founded_year, leader_name, ideology, description, program_summary, website_url, social_twitter, social_facebook, contact_email, is_active, id];
        } else {
            query = `
        UPDATE parties 
        SET name=$1, acronym=$2, color=$3, founded_year=$4, leader_name=$5, ideology=$6, description=$7, program_summary=$8, website_url=$9, social_twitter=$10, social_facebook=$11, contact_email=$12, is_active=$13, updated_at=NOW()
        WHERE id=$14 
        RETURNING id, name, acronym
      `;
            values = [name, acronym, color, founded_year, leader_name, ideology, description, program_summary, website_url, social_twitter, social_facebook, contact_email, is_active, id];
        }

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Parti politique introuvable'
            });
        }

        res.json({
            success: true,
            message: 'Parti politique mis à jour',
            party: result.rows[0]
        });

    } catch (err) {
        console.error('❌ Erreur modification parti:', err);

        if (err.code === '23505') {
            return res.status(400).json({
                success: false,
                error: 'Un parti avec ce nom existe déjà'
            });
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

        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        const result = await pool.query('DELETE FROM parties WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Parti politique introuvable'
            });
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
