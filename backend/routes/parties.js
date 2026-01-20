const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');

// --- UPLOAD CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Préfixe selon le type
        const prefix = file.fieldname === 'audio_file' ? 'pod-' : 'party-';
        cb(null, prefix + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// On accepte maintenant un fichier audio en plus des images
const cpUpload = upload.fields([
    { name: 'logo_file', maxCount: 1 }, 
    { name: 'leader_file', maxCount: 1 },
    { name: 'audio_file', maxCount: 1 } // NOUVEAU
]);

// --- ROUTES ---

// GET LISTE
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parties ORDER BY seats_assembly DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET ONE
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parties WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) res.json({ success: true, data: result.rows[0] });
        else res.status(404).json({ success: false, error: "Non trouvé" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// FONCTION UTILITAIRE : Gérer le podcast exclusif
async function handlePodcastUpload(client, req, currentName, currentLogo, customTitle) {
    // Si on upload un fichier
    if (req.files && req.files['audio_file']) {
        const audioPath = 'uploads/' + req.files['audio_file'][0].filename;
        // On utilise le titre personnalisé OU un titre par défaut
        const title = customTitle ? customTitle : `Dossier : ${currentName}`;
        
        const resPod = await client.query(
            `INSERT INTO podcasts (title, category, audio_url, image_url, is_hidden, description) 
             VALUES ($1, 'Politique', $2, $3, true, 'Podcast exclusif du dossier.') RETURNING id`,
            [title, audioPath, currentLogo || '']
        );
        return resPod.rows[0].id;
    }
    
    // Si pas de fichier mais qu'on veut juste changer le titre d'un podcast existant (Optionnel, pour plus tard)
    // Ici on gère surtout la création/remplacement avec upload
    return req.body.podcast_id || null;
}

// POST : CRÉER
router.post('/', cpUpload, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { name, acronym, description, leader_name, type, creation_date, seats_assembly, podcast_title } = req.body;
        
        let logo_url = req.body.logo_url;
        if (req.files && req.files['logo_file']) logo_url = 'uploads/' + req.files['logo_file'][0].filename;

        let leader_photo_url = req.body.leader_photo_url;
        if (req.files && req.files['leader_file']) leader_photo_url = 'uploads/' + req.files['leader_file'][0].filename;

        // On passe 'podcast_title' à la fonction
        const podcast_id = await handlePodcastUpload(client, req, name, logo_url, podcast_title);

        const result = await client.query(
            `INSERT INTO parties (name, acronym, description, leader_name, type, creation_date, seats_assembly, logo_url, leader_photo_url, podcast_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [name, acronym, description, leader_name, type, creation_date, seats_assembly, logo_url, leader_photo_url, podcast_id]
        );

        await client.query('COMMIT');
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); } finally { client.release(); }
});

// PUT : MODIFIER
router.put('/:id', cpUpload, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { name, acronym, description, leader_name, type, creation_date, seats_assembly, podcast_title } = req.body;

        let logo_url = req.body.logo_url;
        if (req.files && req.files['logo_file']) logo_url = 'uploads/' + req.files['logo_file'][0].filename;

        let leader_photo_url = req.body.leader_photo_url;
        if (req.files && req.files['leader_file']) leader_photo_url = 'uploads/' + req.files['leader_file'][0].filename;

        // On passe 'podcast_title'
        const podcast_id = await handlePodcastUpload(client, req, name, logo_url, podcast_title);

        await client.query(
            `UPDATE parties SET name=$1, acronym=$2, description=$3, leader_name=$4, type=$5, creation_date=$6, seats_assembly=$7, logo_url=$8, leader_photo_url=$9, podcast_id=$10 WHERE id=$11`,
            [name, acronym, description, leader_name, type, creation_date, seats_assembly, logo_url, leader_photo_url, podcast_id, req.params.id]
        );

        await client.query('COMMIT');
        res.json({ success: true, id: req.params.id });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); } finally { client.release(); }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM parties WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;