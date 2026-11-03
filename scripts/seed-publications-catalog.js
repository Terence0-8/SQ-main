'use strict';

/**
 * Script de chargement / synchronisation du corpus documentaire statistique
 */

require('dotenv').config();
const pool = require('../backend/config/database');
const { OFFICIAL_INSTITUTIONS, INDICATORS_CATALOG } = require('../backend/data/indicatorsCatalog');
const { PUBLICATIONS_CATALOG } = require('../backend/data/publicationsCatalog');

async function seedPublications() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Synchroniser les institutions officielles
    for (const inst of OFFICIAL_INSTITUTIONS) {
      await client.query(`
        INSERT INTO data_sources (name, acronym, institution_type, website_url, description)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING;
      `, [inst.name, inst.acronym, inst.institution_type, inst.website_url, inst.description]);
    }

    // 2. Synchroniser les indicateurs du catalogue
    for (const ind of INDICATORS_CATALOG) {
      const geoLevels = JSON.stringify(ind.geographical_levels || ['country']);
      await client.query(`
        INSERT INTO data_indicators (
          code, name, short_name, description, category, subdomain, unit,
          data_nature, calculation_formula, expected_periodicity, geographical_levels,
          producer_institution, potential_sources, methodological_limitations,
          availability_start_year, definition_status, status, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          short_name = EXCLUDED.short_name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          subdomain = EXCLUDED.subdomain,
          unit = EXCLUDED.unit,
          data_nature = EXCLUDED.data_nature,
          calculation_formula = EXCLUDED.calculation_formula,
          expected_periodicity = EXCLUDED.expected_periodicity,
          geographical_levels = EXCLUDED.geographical_levels,
          producer_institution = EXCLUDED.producer_institution,
          potential_sources = EXCLUDED.potential_sources,
          methodological_limitations = EXCLUDED.methodological_limitations,
          availability_start_year = EXCLUDED.availability_start_year,
          definition_status = EXCLUDED.definition_status,
          status = EXCLUDED.status,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
      `, [
        ind.code, ind.name, ind.short_name, ind.description, ind.category, ind.subdomain,
        ind.unit, ind.data_nature, ind.calculation_formula, ind.expected_periodicity,
        geoLevels, ind.producer_institution, ind.potential_sources, ind.methodological_limitations,
        ind.availability_start_year, ind.definition_status, ind.status, ind.status === 'active'
      ]);
    }

    console.log(`Initialisation de l'ingestion de ${PUBLICATIONS_CATALOG.length} publications...`);

    // Charger les sources par acronyme
    const srcRes = await client.query('SELECT id, acronym FROM data_sources WHERE acronym IS NOT NULL');
    const sourceByAcronym = new Map(srcRes.rows.map(r => [r.acronym.toUpperCase(), r.id]));

    // Charger les indicateurs par code
    const indRes = await client.query('SELECT id, code FROM data_indicators');
    const indicatorByCode = new Map(indRes.rows.map(r => [r.code.toUpperCase(), r.id]));

    let insertedCount = 0;
    let linksCount = 0;

    for (const pub of PUBLICATIONS_CATALOG) {
      let instId = sourceByAcronym.get(pub.institution_acronym.toUpperCase());
      if (!instId) {
        // Fallback: rechercher par nom partiel ou créer
        const fallbackRes = await client.query('SELECT id FROM data_sources WHERE acronym ILIKE $1 LIMIT 1', [`%${pub.institution_acronym}%`]);
        if (fallbackRes.rows.length > 0) {
          instId = fallbackRes.rows[0].id;
        } else {
          console.warn(`Institution introuvable pour "${pub.institution_acronym}", publication ignorée : ${pub.title}`);
          continue;
        }
      }

      const insertPubSql = `
        INSERT INTO data_publications (
          institution_id, title, publisher_organization, publication_year,
          coverage_period_start, coverage_period_end, document_category,
          documentary_tier, url, bibliographic_reference, geographical_coverage,
          consultation_date, verification_status, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT DO NOTHING
        RETURNING id;
      `;

      let pubId;
      const res = await client.query(insertPubSql, [
        instId,
        pub.title,
        pub.publisher_organization || null,
        pub.publication_year || null,
        pub.coverage_period_start || null,
        pub.coverage_period_end || null,
        pub.document_category,
        pub.documentary_tier || 'TIER_1_OFFICIAL',
        pub.url || null,
        pub.bibliographic_reference || null,
        pub.geographical_coverage || 'national',
        pub.consultation_date || null,
        pub.verification_status,
        pub.notes || null
      ]);

      if (res.rows.length > 0) {
        pubId = res.rows[0].id;
        insertedCount++;
      } else {
        const existing = await client.query('SELECT id FROM data_publications WHERE title = $1 LIMIT 1', [pub.title]);
        pubId = existing.rows[0].id;
      }

      // Associer les indicateurs cibles
      if (pub.target_indicators && Array.isArray(pub.target_indicators)) {
        for (const target of pub.target_indicators) {
          const indId = indicatorByCode.get(target.code.toUpperCase());
          if (indId) {
            await client.query(`
              INSERT INTO data_publication_indicators (publication_id, indicator_id, specific_section)
              VALUES ($1, $2, $3)
              ON CONFLICT (publication_id, indicator_id) DO UPDATE SET
                specific_section = EXCLUDED.specific_section;
            `, [pubId, indId, target.section || null]);
            linksCount++;
          } else {
            console.warn(`Indicateur "${target.code}" non trouvé en base pour la publication "${pub.title}"`);
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Corpus documentaire synchronisé avec succès : ${insertedCount} publications traitées, ${linksCount} liaisons indicateurs établies.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur lors de la synchronisation des publications :', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedPublications()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedPublications };
