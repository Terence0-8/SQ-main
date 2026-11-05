'use strict';

const pool = require('../backend/config/database');
const { PUBLICATIONS_CATALOG } = require('../backend/data/publicationsCatalog');

function normalizeStr(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  try {
    const dbRes = await pool.query(`
      SELECT dp.id, dp.title, dp.institution_id, ds.acronym AS inst_acronym, ds.name AS inst_name,
             dp.publication_year, dp.document_category, dp.documentary_tier, dp.url,
             dp.bibliographic_reference, dp.verification_status, dp.consultation_date,
             (SELECT json_agg(json_build_object('code', di.code, 'section', dpi.specific_section))
              FROM data_publication_indicators dpi
              JOIN data_indicators di ON di.id = dpi.indicator_id
              WHERE dpi.publication_id = dp.id) AS indicators
      FROM data_publications dp
      JOIN data_sources ds ON ds.id = dp.institution_id
      ORDER BY dp.id ASC;
    `);

    const dbPubs = dbRes.rows;
    console.log(`\n=== 1. MESURE DU NOMBRE RÉEL DE PUBLICATIONS ===`);
    console.log(`Nombre de publications dans PUBLICATIONS_CATALOG: ${PUBLICATIONS_CATALOG.length}`);
    console.log(`Nombre de publications en base (data_publications): ${dbPubs.length}`);

    // Statuts de vérification
    const statusCounts = {};
    for (const p of dbPubs) {
      statusCounts[p.verification_status] = (statusCounts[p.verification_status] || 0) + 1;
    }
    console.log('Répartition des statuts de vérification en base:', statusCounts);

    // Contrôler si verified_consulted est attribué avec juste une URL
    const verifiedWithoutConsultDate = dbPubs.filter(p => p.verification_status === 'verified_consulted' && !p.consultation_date);
    console.log(`Publications verified_consulted SANS date de consultation: ${verifiedWithoutConsultDate.length}`);
    if (verifiedWithoutConsultDate.length > 0) {
      console.log('Détail SANS date consultation:', verifiedWithoutConsultDate.map(p => ({ id: p.id, title: p.title, url: p.url })));
    }

    const verifiedWithoutBibRef = dbPubs.filter(p => p.verification_status === 'verified_consulted' && (!p.bibliographic_reference || p.bibliographic_reference.trim().length < 5));
    console.log(`Publications verified_consulted SANS référence bibliographique: ${verifiedWithoutBibRef.length}`);

    // Recherche de doublons
    console.log(`\n=== 2. ANALYSE DES DOUBLONS DANS LE CORPUS ===`);
    const duplicateGroups = [];
    for (let i = 0; i < dbPubs.length; i++) {
      for (let j = i + 1; j < dbPubs.length; j++) {
        const p1 = dbPubs[i];
        const p2 = dbPubs[j];

        const norm1 = normalizeStr(p1.title);
        const norm2 = normalizeStr(p2.title);

        // Score de similarité simple (Jaccard sur tokens)
        const tokens1 = new Set(norm1.split(' '));
        const tokens2 = new Set(norm2.split(' '));
        const intersection = [...tokens1].filter(x => tokens2.has(x));
        const union = new Set([...tokens1, ...tokens2]);
        const jaccard = intersection.length / union.size;

        const sameInst = p1.inst_acronym === p2.inst_acronym;
        const sameYear = p1.publication_year === p2.publication_year;
        const sameUrl = p1.url && p2.url && p1.url === p2.url;

        let status = null;
        let reason = '';

        if (norm1 === norm2 && sameInst) {
          status = 'DOUBLON CERTAIN';
          reason = `Titres normalisés strictement identiques et même institution (${p1.inst_acronym})`;
        } else if (sameUrl && p1.url) {
          status = 'DOUBLON CERTAIN';
          reason = `Même URL directe (${p1.url})`;
        } else if (jaccard >= 0.75 && sameInst) {
          status = 'DOUBLON PROBABLE';
          reason = `Similarité lexicale ${Math.round(jaccard * 100)}% et même institution (${p1.inst_acronym})`;
        } else if (jaccard >= 0.6 && sameInst && sameYear) {
          status = 'PUBLICATIONS PROCHES MAIS DISTINCTES';
          reason = `Similarité ${Math.round(jaccard * 100)}%, même institution et même année (${p1.publication_year}), mais portées éditoriales ou éditions distinctes`;
        }

        if (status) {
          duplicateGroups.push({
            p1_id: p1.id,
            p1_title: p1.title,
            p2_id: p2.id,
            p2_title: p2.title,
            inst: p1.inst_acronym,
            year: `${p1.publication_year} vs ${p2.publication_year}`,
            status,
            reason,
            jaccard: Math.round(jaccard * 100)
          });
        }
      }
    }

    console.log(`Paires de publications rapprochées détectées : ${duplicateGroups.length}`);
    console.table(duplicateGroups);

    // Tableau de réconciliation complet
    console.log(`\n=== 3. TABLEAU DE RÉCONCILIATION DU CORPUS COMPLET ===`);
    const reconciliationRows = dbPubs.map(p => {
      // Trouver si cette publication apparaît dans une paire de doublon
      const dup = duplicateGroups.find(d => d.p1_id === p.id || d.p2_id === p.id);
      let duplicateType = 'Aucun';
      let recommendedDecision = 'Conserver (document unique)';

      if (dup) {
        if (dup.status === 'DOUBLON CERTAIN') {
          duplicateType = `Certain (avec #${dup.p1_id === p.id ? dup.p2_id : dup.p1_id})`;
          recommendedDecision = p.id === Math.min(dup.p1_id, dup.p2_id)
            ? 'Conserver comme notice principale'
            : 'Fusionner/Supprimer via migration réversible';
        } else if (dup.status === 'DOUBLON PROBABLE') {
          duplicateType = `Probable (avec #${dup.p1_id === p.id ? dup.p2_id : dup.p1_id})`;
          recommendedDecision = 'Revue humaine requise — conserver dans l\'attente';
        } else {
          duplicateType = `Proche distinct (avec #${dup.p1_id === p.id ? dup.p2_id : dup.p1_id})`;
          recommendedDecision = 'Conserver (séries chronologiques ou rapports complémentaires)';
        }
      }

      return {
        id: p.id,
        title: p.title.length > 50 ? p.title.substring(0, 47) + '...' : p.title,
        institution: p.inst_acronym,
        year: p.publication_year,
        url: p.url ? (p.url.length > 35 ? p.url.substring(0, 32) + '...' : p.url) : 'NULL',
        verification_status: p.verification_status,
        indicators_count: (p.indicators || []).length,
        duplicate_type: duplicateType,
        recommended_decision: recommendedDecision
      };
    });

    console.table(reconciliationRows);

  } catch (err) {
    console.error('Erreur run reconciliation:', err);
  } finally {
    await pool.end();
  }
}

run();

