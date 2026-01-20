const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const voteSchema = Joi.object({
    poll_id: Joi.number().integer().required(),
    option_index: Joi.number().integer().min(0).required()
});

// ==========================================
// 1. RÉCUPÉRER LE SONDAGE ACTIF
// ==========================================
router.get('/active', async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;

        // Trouver le sondage actif (le plus récent)
        const pollQuery = `
      SELECT 
        id,
        question,
        options,
        is_active,
        ends_at,
        created_at
      FROM polls 
      WHERE is_active = TRUE 
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY created_at DESC 
      LIMIT 1
    `;

        const pollRes = await pool.query(pollQuery);

        if (pollRes.rows.length === 0) {
            return res.json({
                success: false,
                message: "Aucun sondage actif pour le moment"
            });
        }

        const poll = pollRes.rows[0];

        // Vérifier si l'utilisateur a déjà voté
        let hasVoted = false;
        let userVote = null;

        if (userId) {
            const voteCheck = await pool.query(
                'SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
                [poll.id, userId]
            );

            if (voteCheck.rows.length > 0) {
                hasVoted = true;
                userVote = voteCheck.rows[0].option_index;
            }
        }

        // Calculer le total des votes
        const totalVotesRes = await pool.query(
            'SELECT COUNT(*) FROM poll_votes WHERE poll_id = $1',
            [poll.id]
        );
        const totalVotes = parseInt(totalVotesRes.rows[0].count);

        res.json({
            success: true,
            poll: {
                id: poll.id,
                question: poll.question,
                options: poll.options, // Array JSONB
                is_active: poll.is_active,
                ends_at: poll.ends_at,
                total_votes: totalVotes
            },
            hasVoted: hasVoted,
            userVote: userVote
        });

    } catch (err) {
        console.error('❌ Erreur récupération sondage:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 2. RÉCUPÉRER UN SONDAGE SPÉCIFIQUE
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        const userId = req.session && req.session.user ? req.session.user.id : null;

        const pollQuery = `
      SELECT 
        id,
        question,
        options,
        is_active,
        ends_at,
        created_at
      FROM polls 
      WHERE id = $1
    `;

        const pollRes = await pool.query(pollQuery, [id]);

        if (pollRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Sondage introuvable'
            });
        }

        const poll = pollRes.rows[0];

        // Vérifier si l'utilisateur a voté
        let hasVoted = false;
        let userVote = null;

        if (userId) {
            const voteCheck = await pool.query(
                'SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
                [poll.id, userId]
            );

            if (voteCheck.rows.length > 0) {
                hasVoted = true;
                userVote = voteCheck.rows[0].option_index;
            }
        }

        // Total votes
        const totalVotesRes = await pool.query(
            'SELECT COUNT(*) FROM poll_votes WHERE poll_id = $1',
            [poll.id]
        );
        const totalVotes = parseInt(totalVotesRes.rows[0].count);

        res.json({
            success: true,
            poll: {
                id: poll.id,
                question: poll.question,
                options: poll.options,
                is_active: poll.is_active,
                ends_at: poll.ends_at,
                total_votes: totalVotes
            },
            hasVoted: hasVoted,
            userVote: userVote
        });

    } catch (err) {
        console.error('❌ Erreur récupération sondage:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// 3. VOTER (Utilisateurs connectés uniquement)
// ==========================================
router.post('/vote', async (req, res) => {
    const client = await pool.connect();

    try {
        // Vérifier authentification
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Vous devez être connecté pour voter'
            });
        }

        const userId = req.session.user.id;

        // Validation
        const { error, value } = voteSchema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        const { poll_id, option_index } = value;

        await client.query('BEGIN');

        // A. Vérifier que le sondage existe et est actif
        const pollCheck = await client.query(
            `SELECT id, options, is_active, ends_at 
       FROM polls 
       WHERE id = $1`,
            [poll_id]
        );

        if (pollCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Sondage introuvable'
            });
        }

        const poll = pollCheck.rows[0];

        if (!poll.is_active) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Ce sondage est fermé'
            });
        }

        if (poll.ends_at && new Date(poll.ends_at) < new Date()) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Ce sondage est expiré'
            });
        }

        // B. Vérifier que l'index est valide
        const options = poll.options;
        if (option_index < 0 || option_index >= options.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Option invalide'
            });
        }

        // C. Vérifier si l'utilisateur a déjà voté
        const existingVote = await client.query(
            'SELECT id, option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
            [poll_id, userId]
        );

        // --- CAS 1 : MODIFIER SON VOTE ---
        if (existingVote.rows.length > 0) {
            const oldOptionIndex = existingVote.rows[0].option_index;

            // Si c'est le même choix, on ne fait rien
            if (oldOptionIndex === option_index) {
                await client.query('ROLLBACK');
                return res.json({
                    success: true,
                    message: 'Vote inchangé'
                });
            }

            // Décrémenter l'ancienne option
            options[oldOptionIndex].votes -= 1;

            // Incrémenter la nouvelle option
            options[option_index].votes += 1;

            // Mettre à jour le vote
            await client.query(
                'UPDATE poll_votes SET option_index = $1, created_at = NOW() WHERE id = $2',
                [option_index, existingVote.rows[0].id]
            );

            // Mettre à jour les options dans le poll
            await client.query(
                'UPDATE polls SET options = $1 WHERE id = $2',
                [JSON.stringify(options), poll_id]
            );

            await client.query('COMMIT');

            return res.json({
                success: true,
                message: 'Vote modifié',
                options: options
            });
        }

        // --- CAS 2 : PREMIER VOTE ---

        // Incrémenter l'option choisie
        options[option_index].votes += 1;

        // Insérer le vote
        await client.query(
            'INSERT INTO poll_votes (poll_id, user_id, option_index, created_at) VALUES ($1, $2, $3, NOW())',
            [poll_id, userId, option_index]
        );

        // Mettre à jour les options dans le poll
        await client.query(
            'UPDATE polls SET options = $1 WHERE id = $2',
            [JSON.stringify(options), poll_id]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Vote enregistré',
            options: options
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur vote:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    } finally {
        client.release();
    }
});

// ==========================================
// 4. LISTE DE TOUS LES SONDAGES (Pour archive)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        p.id,
        p.question,
        p.options,
        p.is_active,
        p.ends_at,
        p.created_at,
        (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as total_votes
      FROM polls p
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

        const result = await pool.query(query);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (err) {
        console.error('❌ Erreur liste sondages:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

module.exports = router;
