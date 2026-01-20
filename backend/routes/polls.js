const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// 1. RÉCUPÉRER LE SONDAGE ACTIF
router.get('/active/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const userId = req.session && req.session.user ? req.session.user.id : null;
    const userIp = req.ip;
    
    // A. Trouver le sondage
    const pollQuery = `
      SELECT * FROM polls 
      WHERE category = $1 AND is_active = TRUE 
      ORDER BY created_at DESC LIMIT 1
    `;
    const pollRes = await pool.query(pollQuery, [category]);
    
    if (pollRes.rows.length === 0) {
      return res.json({ success: false, message: "Aucun sondage actif." });
    }
    const poll = pollRes.rows[0];

    // B. Récupérer les options (et leurs votes)
    const optionsRes = await pool.query(
      'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY id', 
      [poll.id]
    );

    // C. Vérifier si l'utilisateur a déjà voté (ID ou IP)
    let hasVoted = false;
    let checkQuery = 'SELECT id FROM poll_votes WHERE poll_id = $1 AND ip_address = $2';
    let checkParams = [poll.id, userIp];

    if (userId) {
        checkQuery = 'SELECT id FROM poll_votes WHERE poll_id = $1 AND user_id = $2';
        checkParams = [poll.id, userId];
    }
    
    const check = await pool.query(checkQuery, checkParams);
    hasVoted = check.rows.length > 0;

    res.json({
      success: true,
      poll: poll,
      options: optionsRes.rows,
      hasVoted: hasVoted
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// 2. VOTER OU MODIFIER SON VOTE
router.post('/vote', async (req, res) => {
    const client = await pool.connect();
    try {
        const { poll_id, option_id } = req.body;
        
        // Identification du votant (Même logique que le GET)
        const userId = req.session && req.session.user ? req.session.user.id : null;
        const userIp = req.ip;

        await client.query('BEGIN'); // Début de la transaction sécurisée

        // A. Chercher un vote existant
        let existingVoteQuery = 'SELECT * FROM poll_votes WHERE poll_id = $1 AND ip_address = $2';
        let existingVoteParams = [poll_id, userIp];
        
        if (userId) {
            existingVoteQuery = 'SELECT * FROM poll_votes WHERE poll_id = $1 AND user_id = $2';
            existingVoteParams = [poll_id, userId];
        }

        const existingVoteRes = await client.query(existingVoteQuery, existingVoteParams);
        const existingVote = existingVoteRes.rows[0];

        // --- CAS 1 : MODIFICATION (Déjà voté) ---
        if (existingVote) {
            const oldOptionId = existingVote.option_id;

            // Si c'est le même choix, on ne fait rien
            if (oldOptionId == option_id) {
                 await client.query('ROLLBACK');
                 return res.json({ success: true, message: "Vote inchangé." });
            }

            // 1. On retire 1 point à l'ancienne option
            await client.query(
                'UPDATE poll_options SET votes_count = votes_count - 1 WHERE id = $1',
                [oldOptionId]
            );

            // 2. On met à jour le vote de l'utilisateur
            await client.query(
                'UPDATE poll_votes SET option_id = $1, created_at = NOW() WHERE id = $2',
                [option_id, existingVote.id]
            );

            // 3. On ajoute 1 point à la nouvelle option
            await client.query(
                'UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = $1',
                [option_id]
            );

        } 
        // --- CAS 2 : PREMIER VOTE ---
        else {
            // 1. On insère le vote (avec user_id OU ip_address selon le cas)
            if (userId) {
                await client.query(
                    'INSERT INTO poll_votes (poll_id, option_id, user_id, ip_address) VALUES ($1, $2, $3, $4)',
                    [poll_id, option_id, userId, userIp]
                );
            } else {
                await client.query(
                    'INSERT INTO poll_votes (poll_id, option_id, ip_address) VALUES ($1, $2, $3)',
                    [poll_id, option_id, userIp]
                );
            }

            // 2. On ajoute 1 point à l'option choisie
            await client.query(
                'UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = $1',
                [option_id]
            );
        }

        await client.query('COMMIT'); // On valide tout

        // B. Renvoyer les résultats à jour
        const updatedOptions = await pool.query(
            'SELECT id, label, votes_count FROM poll_options WHERE poll_id = $1 ORDER BY id ASC',
            [poll_id]
        );

        res.json({ 
            success: true, 
            options: updatedOptions.rows,
            message: existingVote ? "Vote modifié !" : "A voté !" 
        });

    } catch (err) { 
        await client.query('ROLLBACK'); // Annuler si erreur
        console.error("Erreur vote:", err.message);
        res.status(500).json({ success: false, message: "Erreur serveur lors du vote" }); 
    } finally { 
        client.release(); 
    }
});

module.exports = router;