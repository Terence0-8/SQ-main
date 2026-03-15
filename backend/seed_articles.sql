-- ============================================================
-- Seed articles de test — Solitiquo
-- Simule un site actif depuis plusieurs mois (Nov 2025 – Mar 2026)
-- Usage : psql $DATABASE_URL -f seed_articles.sql
-- ============================================================

-- Utilisateur auteur de test (upsert silencieux si existe déjà)
INSERT INTO users (username, email, password, role, is_active)
VALUES ('redaction', 'redaction@solitiquo.com', '$2b$10$dummyhashforseeding000000000000000000000000000000000', 'writer', true)
ON CONFLICT (email) DO NOTHING;

-- ID de l'auteur de test
DO $$
DECLARE
  author INT;
BEGIN
  SELECT id INTO author FROM users WHERE email = 'redaction@solitiquo.com';

  -- ================================================================
  -- POLITIQUE (20 articles)
  -- ================================================================

  INSERT INTO articles (title, slug, content, excerpt, featured_image, author_id, category, status, language, is_premium, views_count, read_time, published_at) VALUES
  (
    'Paul Biya confirme sa candidature pour 2026 : réactions à travers le pays',
    'paul-biya-candidature-2026-reactions',
    '<p>Le président Paul Biya a officialisé sa candidature à l'élection présidentielle de 2026, déclenchant une vague de réactions au sein de la société civile et des partis d'opposition. Depuis Yaoundé jusqu'à Douala, les Camerounais expriment des opinions divergentes sur ce nouveau mandat potentiel.</p><p>Les partisans du Rassemblement Démocratique du Peuple Camerounais (RDPC) ont accueilli cette annonce avec enthousiasme, organisant des rassemblements dans plusieurs capitales régionales. En revanche, les coalitions d'opposition appellent à une mobilisation citoyenne pour contester cette candidature jugée inconstitutionnelle par certains juristes.</p><p>La Commission Électorale Nationale Indépendante (CÉNI) a annoncé que le calendrier électoral sera publié d'ici fin mars 2026, fixant les règles du scrutin à venir.</p>',
    'Après des semaines de spéculations, le président Paul Biya a confirmé sa candidature pour 2026. Le pays se divise entre partisans enthousiastes et opposition mobilisée.',
    'https://picsum.photos/seed/pol001/800/450',
    author, 'Politique', 'published', 'fr', false, 1842, 4,
    NOW() - INTERVAL '2 days'
  ),
  (
    'La crise anglophone : bilan d''une décennie de tensions au Cameroun',
    'crise-anglophone-bilan-decennie',
    '<p>Dix ans après les premières manifestations des avocats et enseignants anglophones, le conflit dans les régions du Nord-Ouest et du Sud-Ouest continue de peser lourdement sur le tissu social et économique du pays. Des milliers de déplacés internes et une économie régionale à genoux : voici le bilan d'une crise qui n'en finit pas.</p><p>Les organisations humanitaires estiment à plus de 700 000 le nombre de personnes déplacées en raison des affrontements entre les forces gouvernementales et les groupes séparatistes. Les négociations de paix, malgré plusieurs tentatives de médiation internationale, n'ont pas abouti à un accord durable.</p>',
    'Dix ans après le début des tensions, la crise anglophone reste une plaie ouverte pour le Cameroun. Bilan humain, économique et politique d''une décennie de conflit.',
    'https://picsum.photos/seed/pol002/800/450',
    author, 'Politique', 'published', 'fr', true, 3210, 6,
    NOW() - INTERVAL '5 days'
  ),
  (
    'Élections municipales 2025 : l''opposition revendique des victoires dans 12 communes',
    'elections-municipales-2025-opposition-victoires',
    '<p>Les résultats préliminaires des élections municipales de novembre 2025 montrent une percée significative de l'opposition dans plusieurs grandes villes du Cameroun. Le Mouvement pour la Renaissance du Cameroun (MRC) et le Front Social Démocrate (SDF) auraient remporté la mairie dans au moins 12 communes, selon leurs propres décomptes.</p><p>Elections Cameroon (ELECAM) n'a pas encore publié les résultats définitifs, mais les observateurs internationaux notent une amélioration du processus électoral par rapport aux scrutins précédents, même si des irrégularités ont été signalées dans certains bureaux de vote.</p>',
    'Percée de l''opposition dans 12 communes selon ses propres chiffres. ELECAM n''a pas encore validé les résultats définitifs des municipales 2025.',
    'https://picsum.photos/seed/pol003/800/450',
    author, 'Politique', 'published', 'fr', false, 2654, 4,
    NOW() - INTERVAL '8 days'
  ),
  (
    'Le MRC de Kamto appelle à un dialogue national inclusif avant 2026',
    'mrc-kamto-dialogue-national-2026',
    '<p>Maurice Kamto, président du Mouvement pour la Renaissance du Cameroun, a lancé un appel solennel en faveur d'un dialogue national inclusif associant toutes les composantes politiques et sociales du pays avant les élections présidentielles de 2026. Dans un communiqué publié ce mardi, le parti souligne l'urgence d'un consensus sur les règles du jeu électoral.</p><p>Cette initiative intervient dans un contexte de méfiance croissante entre le pouvoir et les partis d'opposition, après la controverse autour des résultats de la présidentielle de 2018.</p>',
    'Le MRC réclame un dialogue national avant 2026. Maurice Kamto veut fixer les règles du jeu électoral avec l''ensemble des acteurs politiques.',
    'https://picsum.photos/seed/pol004/800/450',
    author, 'Politique', 'published', 'fr', false, 1456, 3,
    NOW() - INTERVAL '12 days'
  ),
  (
    'Remaniement ministériel : 8 nouveaux visages au gouvernement Dion Ngute',
    'remaniement-ministeriel-8-nouveaux-ministres',
    '<p>Le Premier ministre Joseph Dion Ngute a procédé à un remaniement partiel du gouvernement, nommant huit nouveaux ministres dans des secteurs stratégiques. Les portefeuilles de l'Économie, de l'Education de Base et des Relations Extérieures ont fait l'objet des changements les plus commentés.</p><p>Ce remaniement intervient à un an et demi des échéances électorales de 2026 et est interprété par les analystes comme une préparation du terrain politique pour les prochaines consultations électorales.</p>',
    'Huit nouveaux ministres entrent au gouvernement. Ce remaniement stratégique à 18 mois des élections est scruté de près par l''ensemble des acteurs politiques.',
    'https://picsum.photos/seed/pol005/800/450',
    author, 'Politique', 'published', 'fr', false, 1987, 3,
    NOW() - INTERVAL '15 days'
  ),
  (
    'Assemblée nationale : le budget 2026 adopté après deux semaines de débats houleux',
    'budget-2026-adopte-assemblee-nationale',
    '<p>L'Assemblée nationale a adopté le budget de l'État pour l'exercice 2026, chiffré à 7 200 milliards de francs CFA, après deux semaines de débats parfois très vifs entre les groupes parlementaires. Le RDPC, fort de sa large majorité, a imposé ses orientations malgré les critiques de l'opposition sur les postes dédiés à l'éducation et à la santé.</p><p>Les députés d'opposition ont notamment dénoncé une sous-dotation chronique des hôpitaux de district et une part trop belle accordée aux grands travaux d'infrastructure.</p>',
    'Le budget 2026 de 7 200 milliards de FCFA est adopté. L''opposition dénonce des coupes dans l''éducation et la santé au profit des infrastructures.',
    'https://picsum.photos/seed/pol006/800/450',
    author, 'Politique', 'published', 'fr', false, 2100, 4,
    NOW() - INTERVAL '19 days'
  ),
  (
    'Terrorisme dans l''Extrême-Nord : l''armée annonce la neutralisation d''un chef Boko Haram',
    'terrorisme-extreme-nord-chef-boko-haram-neutralise',
    '<p>Le ministre de la Défense a annoncé la neutralisation d'un commandant de Boko Haram lors d'une opération de l'armée dans la zone du lac Tchad. L'opération, menée conjointement avec les forces tchadiennes dans le cadre de la Force Multinationale Mixte (FMM), a également permis la libération de quatre otages civils.</p><p>Malgré ces succès ponctuels, la menace terroriste dans l'Extrême-Nord reste prégnante, avec plusieurs attaques perpétrées ces dernières semaines contre des villages frontaliers.</p>',
    'L''armée neutralise un chef Boko Haram dans l''Extrême-Nord. Quatre otages civils libérés lors d''une opération conjointe avec les forces tchadiennes.',
    'https://picsum.photos/seed/pol007/800/450',
    author, 'Politique', 'published', 'fr', false, 3450, 4,
    NOW() - INTERVAL '22 days'
  ),
  (
    'Décentralisation : les régions réclament plus de ressources financières à Yaoundé',
    'decentralisation-regions-reclament-ressources',
    '<p>Les exécutifs régionaux, réunis en conclave à Bafoussam, ont adopté une déclaration commune exigeant une réforme en profondeur du mécanisme de transfert des ressources financières de l'État vers les collectivités territoriales décentralisées (CTD). Ils soulignent que les dotations actuelles ne permettent pas de financer les compétences transférées.</p>',
    'Les présidents de régions réunis à Bafoussam réclament une meilleure répartition des ressources entre l''État central et les collectivités décentralisées.',
    'https://picsum.photos/seed/pol008/800/450',
    author, 'Politique', 'published', 'fr', false, 987, 3,
    NOW() - INTERVAL '26 days'
  ),
  (
    'Affaire Marafa : le détenu politique toujours sans accès médical adéquat selon sa famille',
    'marafa-detenu-politique-acces-medical',
    '<p>La famille de l'ancien ministre Marafa Hamidou Yaya dénonce une fois de plus les conditions de détention de celui qui est présenté comme un prisonnier politique par ses soutiens. Incarcéré depuis 2012 à la prison centrale de Kondengui, Marafa serait privé de soins médicaux adaptés malgré son état de santé dégradé.</p>',
    'La famille de Marafa Hamidou Yaya alerte sur l''état de santé du détenu. Plus de 13 ans derrière les barreaux sans accès médical adéquat selon ses proches.',
    'https://picsum.photos/seed/pol009/800/450',
    author, 'Politique', 'published', 'fr', true, 1654, 3,
    NOW() - INTERVAL '30 days'
  ),
  (
    'RDPC : le congrès ordinaire se tiendra en juillet 2026, les militants en ébullition',
    'rdpc-congres-ordinaire-juillet-2026',
    '<p>Le Rassemblement Démocratique du Peuple Camerounais a annoncé la tenue de son congrès ordinaire en juillet 2026. Cet événement, qui réunit des milliers de délégués venus des dix régions du pays, sera l'occasion de renouveler les instances dirigeantes du parti et d'arrêter les grandes orientations politiques pour la prochaine décennie.</p>',
    'Le RDPC annonce son congrès ordinaire pour juillet 2026. Renouvellement des instances et orientations politiques au programme de cette grand-messe partisane.',
    'https://picsum.photos/seed/pol010/800/450',
    author, 'Politique', 'published', 'fr', false, 1123, 3,
    NOW() - INTERVAL '35 days'
  ),
  (
    'Liberté de la presse : deux journalistes camerounais libérés après six mois de détention',
    'journalistes-liberes-six-mois-detention',
    '<p>Deux journalistes camerounais, arrêtés en août 2025 pour « diffusion de fausses nouvelles » après avoir couvert des manifestations dans la région du Nord-Ouest, ont été libérés suite à une campagne internationale de Reporters Sans Frontières (RSF) et d'Amnesty International. Leur libération intervient après six mois de détention préventive.</p>',
    'RSF et Amnesty International obtiennent la libération de deux journalistes détenus depuis six mois. Un signal fort pour la liberté de la presse au Cameroun.',
    'https://picsum.photos/seed/pol011/800/450',
    author, 'Politique', 'published', 'fr', false, 2876, 3,
    NOW() - INTERVAL '40 days'
  ),
  (
    'Présidentielle 2026 : qui sont les candidats déclarés de l''opposition ?',
    'presidentielle-2026-candidats-oppositon-declares',
    '<p>À un an et demi de l'élection présidentielle, trois candidats de l'opposition ont officiellement annoncé leur intention de briguer la magistrature suprême. Analyse des profils, des programmes et des chances de chacun face au président sortant.</p>',
    'Trois candidats de l''opposition déjà en lice pour 2026. Profils, programmes et réalisme électoral : décryptage de la scène politique camerounaise.',
    'https://picsum.photos/seed/pol012/800/450',
    author, 'Politique', 'published', 'fr', false, 4230, 5,
    NOW() - INTERVAL '45 days'
  ),
  (
    'Gouvernance : le rapport annuel de l''ANIF épingle 47 cas de détournements présumés',
    'anif-rapport-annuel-detournements',
    '<p>L'Agence Nationale d'Investigation Financière (ANIF) a publié son rapport annuel 2025, identifiant 47 cas présumés de détournements de fonds publics représentant un préjudice estimé à plus de 85 milliards de francs CFA. Le rapport a été transmis au parquet pour suites judiciaires.</p>',
    'L''ANIF identifie 47 cas présumés de détournements pour 85 milliards de FCFA. Le dossier transmis au parquet : le CONAC sous pression.',
    'https://picsum.photos/seed/pol013/800/450',
    author, 'Politique', 'published', 'fr', true, 3780, 4,
    NOW() - INTERVAL '52 days'
  ),
  (
    'Diplomatie : Paul Biya reçoit l''ambassadeur de Chine, les projets d''infrastructure au cœur des discussions',
    'diplomatie-biya-ambassadeur-chine-infrastructure',
    '<p>Le président Paul Biya a reçu en audience l'ambassadeur de Chine au Cameroun, Wang Lifen. Les discussions ont porté sur l'avancement des grands projets d'infrastructure financés par Pékin, notamment le port en eau profonde de Kribi et le barrage hydroélectrique de Nachtigal.</p>',
    'Biya reçoit l''ambassadeur chinois. Les grands chantiers financés par Pékin — Kribi, Nachtigal — au cœur d''une rencontre diplomatique stratégique.',
    'https://picsum.photos/seed/pol014/800/450',
    author, 'Politique', 'published', 'fr', false, 1560, 3,
    NOW() - INTERVAL '58 days'
  ),
  (
    'Sénat : Roland Onambélé réélu à la présidence de la chambre haute',
    'senat-onambele-reelu-president',
    '<p>Le Sénat camerounais a réélu à l'unanimité de ses membres présents Roland Onambélé Nkolo à la présidence de la chambre haute du Parlement. Cette reconduction intervient dans un contexte politique marqué par les préparatifs des élections de 2026.</p>',
    'Réélection sans surprise de Roland Onambélé à la tête du Sénat. La chambre haute prépare son agenda législatif pour la session budgétaire 2026.',
    'https://picsum.photos/seed/pol015/800/450',
    author, 'Politique', 'published', 'fr', false, 876, 2,
    NOW() - INTERVAL '65 days'
  ),
  (
    'Gestion des ressources pétrolières : la SNH sous surveillance du FMI',
    'snh-surveillance-fmi-ressources-petrolieres',
    '<p>Le Fonds Monétaire International (FMI) a publié un rapport pointant des lacunes dans la gouvernance de la Société Nationale des Hydrocarbures (SNH). Les experts recommandent une plus grande transparence dans la publication des comptes et dans la répartition des revenus pétroliers entre l'État et les investisseurs étrangers.</p>',
    'Le FMI pointe des lacunes dans la gouvernance de la SNH. Transparence insuffisante sur les revenus pétroliers selon le rapport de l''institution de Bretton Woods.',
    'https://picsum.photos/seed/pol016/800/450',
    author, 'Politique', 'published', 'fr', true, 2340, 4,
    NOW() - INTERVAL '72 days'
  ),
  (
    'SDF : Joshua Osih officiellement investi candidat du parti pour 2026',
    'sdf-joshua-osih-investi-candidat-2026',
    '<p>Le Social Democratic Front (SDF) a officiellement investi Joshua Osih comme candidat du parti à l'élection présidentielle de 2026. Osih, qui avait déjà représenté le SDF en 2018, devra convaincre un électorat anglophone qui se montre de plus en plus abstentionniste.</p>',
    'Le SDF choisit à nouveau Joshua Osih pour affronter Biya en 2026. Le défi : reconquérir un électorat anglophone déçu par les processus électoraux.',
    'https://picsum.photos/seed/pol017/800/450',
    author, 'Politique', 'published', 'fr', false, 1890, 3,
    NOW() - INTERVAL '80 days'
  ),
  (
    'Affaire Paul Chouta : le blogueur libéré après 4 ans de détention',
    'paul-chouta-blogueur-libere-4-ans',
    '<p>Paul Chouta, blogueur camerounais condamné en 2021 pour « outrage au corps constitué » après des publications critiques sur les réseaux sociaux, a été libéré. Sa sortie de prison, obtenue suite à une révision judiciaire, est saluée par les organisations de défense de la liberté d'expression.</p>',
    'Paul Chouta sort de prison après 4 ans de détention. Sa libération est une victoire pour la liberté d''expression en ligne selon les organisations de défense des droits.',
    'https://picsum.photos/seed/pol018/800/450',
    author, 'Politique', 'published', 'fr', false, 5420, 3,
    NOW() - INTERVAL '88 days'
  ),
  (
    'Parlement : l''opposition dépose une motion de censure contre le gouvernement',
    'parlement-motion-censure-opposition',
    '<p>Les groupes parlementaires d'opposition ont déposé conjointement une motion de censure contre le gouvernement Dion Ngute, invoquant la mauvaise gestion de la crise dans les régions anglophones et le retard dans l'exécution du budget d'investissement. La motion, qui requiert la signature d'un tiers des députés, a peu de chances d'aboutir au vu de la configuration de l'Assemblée.</p>',
    'Motion de censure contre le gouvernement. L''opposition dénonce la mauvaise gestion de la crise anglophone et les retards budgétaires. Résultat attendu.',
    'https://picsum.photos/seed/pol019/800/450',
    author, 'Politique', 'published', 'fr', false, 1670, 3,
    NOW() - INTERVAL '95 days'
  ),
  (
    'Corruption : condamnation de l''ancien DG de CAMAIR-CO à 12 ans de prison ferme',
    'corruption-camair-co-dg-condamne',
    '<p>Le Tribunal Criminel Spécial (TCS) a condamné l'ancien directeur général de CAMAIR-CO à douze ans d'emprisonnement ferme pour détournement de fonds publics et enrichissement illicite. Cette affaire impliquant la compagnie aérienne nationale fait partie des dossiers emblématiques du vaste programme Épervier.</p>',
    'L''ex-DG de CAMAIR-CO écope de 12 ans ferme. Une condamnation symbolique pour le programme Épervier qui peine à mettre fin à la grande corruption.',
    'https://picsum.photos/seed/pol020/800/450',
    author, 'Politique', 'published', 'fr', true, 4120, 4,
    NOW() - INTERVAL '105 days'
  );

  -- ================================================================
  -- SOCIAL (15 articles)
  -- ================================================================

  INSERT INTO articles (title, slug, content, excerpt, featured_image, author_id, category, status, language, is_premium, views_count, read_time, published_at) VALUES
  (
    'Hausse du prix du carburant : les transporteurs en grève à Douala et Yaoundé',
    'hausse-carburant-greve-transporteurs',
    '<p>Suite à la révision à la hausse des prix à la pompe annoncée par le gouvernement, les syndicats de transporteurs ont déclenché une grève de 48 heures à Douala et Yaoundé, paralysant de nombreux quartiers populaires. Le prix du litre de super est passé de 730 à 790 francs CFA, une augmentation jugée insupportable par les professionnels du secteur.</p><p>Les négociations entre les syndicats et le ministère des Transports ont repris en urgence pour trouver un compromis avant la fin de la semaine.</p>',
    'Les transporteurs paralysent Douala et Yaoundé après la hausse des prix du carburant. 60 FCFA de plus par litre : une augmentation qui frappe d''abord les plus fragiles.',
    'https://picsum.photos/seed/soc001/800/450',
    author, 'Social', 'published', 'fr', false, 6540, 4,
    NOW() - INTERVAL '3 days'
  ),
  (
    'Santé : pénurie de médicaments essentiels dans les hôpitaux publics du Centre',
    'penurie-medicaments-hopitaux-region-centre',
    '<p>Une enquête de l'association Transparence Médicale Cameroun révèle une pénurie critique de médicaments essentiels dans plusieurs hôpitaux de district de la région du Centre. Paracétamol, sérum physiologique, antibiotiques de base : les ruptures de stock touchent des produits indispensables à la prise en charge des malades.</p>',
    'Manque criant de médicaments essentiels dans les hôpitaux du Centre. Une enquête pointe les défaillances criantes de la chaîne d''approvisionnement publique.',
    'https://picsum.photos/seed/soc002/800/450',
    author, 'Social', 'published', 'fr', false, 4320, 4,
    NOW() - INTERVAL '7 days'
  ),
  (
    'Éducation : grève des enseignants du secondaire pour le paiement des primes impayées',
    'greve-enseignants-secondaire-primes-impayees',
    '<p>Les syndicats d'enseignants du secondaire ont observé une grève de trois jours dans plusieurs régions du pays pour exiger le paiement de primes d'incitation à la résidence impayées depuis plus de dix-huit mois. Des milliers d'élèves ont été privés de cours, notamment en terminale à quelques semaines des examens officiels.</p>',
    'Les enseignants du secondaire croisent les bras pour 18 mois de primes impayées. Des milliers d''élèves de terminale impactés à quelques semaines du baccalauréat.',
    'https://picsum.photos/seed/soc003/800/450',
    author, 'Social', 'published', 'fr', false, 3870, 3,
    NOW() - INTERVAL '11 days'
  ),
  (
    'Inondations dans l''Adamaoua : 2 000 familles déplacées, l''urgence humanitaire déclarée',
    'inondations-adamaoua-familles-deplacees',
    '<p>Des pluies diluviennes ont provoqué des inondations dévastatrices dans plusieurs arrondissements de l'Adamaoua, forçant plus de 2 000 familles à quitter leurs habitations. Le gouverneur a déclaré l'état d'urgence humanitaire et sollicité l'aide de la Croix-Rouge et du PAM pour l'acheminement de vivres et d'abris de fortune.</p>',
    '2 000 familles déplacées dans l''Adamaoua après des inondations dévastatrices. L''urgence humanitaire est déclarée, les secours s''organisent.',
    'https://picsum.photos/seed/soc004/800/450',
    author, 'Social', 'published', 'fr', false, 2890, 3,
    NOW() - INTERVAL '14 days'
  ),
  (
    'Chômage des jeunes : 65 % des 18-35 ans en situation précaire selon une étude INS',
    'chomage-jeunes-65-pourcent-etude-ins',
    '<p>Une étude de l'Institut National de la Statistique (INS) révèle que 65 % des Camerounais âgés de 18 à 35 ans se trouvent dans une situation d'emploi précaire ou de chômage. Ce chiffre alarmant interpelle les pouvoirs publics alors que le gouvernement a lancé plusieurs programmes d'insertion professionnelle aux résultats jugés insuffisants.</p>',
    '65 % des jeunes camerounais dans la précarité selon l''INS. Les programmes gouvernementaux d''insertion peinent à répondre à l''ampleur du phénomène.',
    'https://picsum.photos/seed/soc005/800/450',
    author, 'Social', 'published', 'fr', true, 5670, 5,
    NOW() - INTERVAL '18 days'
  ),
  (
    'Violences conjugales : une campagne nationale pour briser le silence dans les familles',
    'violences-conjugales-campagne-nationale',
    '<p>Le ministère de la Femme et de la Famille, en partenariat avec ONU Femmes, lance une campagne nationale de sensibilisation contre les violences conjugales. Intitulée « Briser le Silence », cette campagne vise à encourager les victimes à porter plainte et à sensibiliser les communautés aux signes précoces de la violence domestique.</p>',
    'Lancement de la campagne nationale contre les violences conjugales. ONU Femmes et le gouvernement s''allient pour inciter les victimes à parler.',
    'https://picsum.photos/seed/soc006/800/450',
    author, 'Social', 'published', 'fr', false, 2140, 3,
    NOW() - INTERVAL '23 days'
  ),
  (
    'Université de Yaoundé I : les étudiants protestent contre la surpopulation des amphithéâtres',
    'universite-yaounde-i-surpopulation-amphitheatres',
    '<p>Des centaines d'étudiants de l'Université de Yaoundé I ont manifesté pacifiquement pour dénoncer la surpopulation chronique des amphithéâtres et le manque d'enseignants dans plusieurs facultés. Certains cours regroupent plus de 800 étudiants dans des salles conçues pour en accueillir 300.</p>',
    'Les étudiants de Yaoundé I dans la rue contre la surpopulation. Des amphis à 800 élèves pour 300 places : le cri d''alarme d''une université en crise.',
    'https://picsum.photos/seed/soc007/800/450',
    author, 'Social', 'published', 'fr', false, 3210, 3,
    NOW() - INTERVAL '28 days'
  ),
  (
    'Accès à l''eau potable : moins de 50 % des ménages ruraux équipés selon la CDE',
    'acces-eau-potable-menages-ruraux-cde',
    '<p>La Camerounaise des Eaux (CDE) publie son rapport semestriel sur l'accès à l'eau potable. Moins de 50 % des ménages ruraux disposent d'un accès à l'eau courante, selon les données officielles. Dans les zones les plus enclavées du Nord et de l'Adamaoua, ce taux descend sous les 30 %.</p>',
    'La CDE confirme : moins de 50 % des ruraux ont accès à l''eau potable. Dans le Nord et l''Adamaoua, le taux descend sous 30 %. Un droit fondamental bafoué.',
    'https://picsum.photos/seed/soc008/800/450',
    author, 'Social', 'published', 'fr', false, 2450, 4,
    NOW() - INTERVAL '33 days'
  ),
  (
    'Hausse des loyers à Douala : les locataires étranglés par la flambée des prix',
    'hausse-loyers-douala-locataires-etrangles',
    '<p>En deux ans, les loyers dans les quartiers populaires de Douala ont augmenté de 30 à 45 % selon une enquête du collectif Droits au Logement. Cette flambée des prix, alimentée par la spéculation immobilière et l'afflux de populations déplacées, pousse de nombreuses familles vers les périphéries précaires de la mégalopole.</p>',
    'Les loyers ont bondi de 40 % en deux ans à Douala. Les familles modestes quittent les quartiers centraux, chassées par la spéculation immobilière.',
    'https://picsum.photos/seed/soc009/800/450',
    author, 'Social', 'published', 'fr', false, 4120, 4,
    NOW() - INTERVAL '38 days'
  ),
  (
    'Santé mentale : premier centre psychiatrique communautaire ouvre ses portes à Bafoussam',
    'sante-mentale-centre-psychiatrique-bafoussam',
    '<p>Le premier centre psychiatrique communautaire de la région de l'Ouest vient d'ouvrir ses portes à Bafoussam. Financé en partie par l'Union Européenne, cet établissement propose une prise en charge ambulatoire et un accompagnement psychosocial pour les personnes souffrant de troubles mentaux, encore très stigmatisées au Cameroun.</p>',
    'Un premier centre psychiatrique communautaire ouvre à Bafoussam. Soutenu par l''UE, il veut déstigmatiser la maladie mentale dans une région qui en a besoin.',
    'https://picsum.photos/seed/soc010/800/450',
    author, 'Social', 'published', 'fr', false, 1780, 3,
    NOW() - INTERVAL '44 days'
  ),
  (
    'Travail des enfants : 800 000 mineurs encore au travail selon l''OIT Cameroun',
    'travail-enfants-800000-mineurs-oit',
    '<p>Le bureau camerounais de l'Organisation Internationale du Travail (OIT) estime à 800 000 le nombre d'enfants de moins de 15 ans impliqués dans des formes de travail considérées comme dangereuses ou préjudiciables à leur développement. La situation est particulièrement préoccupante dans les zones de culture du cacao et du café dans le Littoral et le Centre.</p>',
    '800 000 enfants au travail selon l''OIT. Les plantations de cacao et café restent les premiers employeurs de mineurs au Cameroun. Un fléau difficile à enrayer.',
    'https://picsum.photos/seed/soc011/800/450',
    author, 'Social', 'published', 'fr', true, 3450, 4,
    NOW() - INTERVAL '50 days'
  ),
  (
    'Douala 5e : des habitants sans logement après la démolition de constructions illicites',
    'douala-5e-demolition-constructions-illicites',
    '<p>Les opérations de démolition de constructions illicites dans l''arrondissement de Douala 5e ont laissé plusieurs centaines de familles sans abri. Les habitants, pour la plupart des déplacés internes, dénoncent l''absence de solutions de relogement proposées par les autorités locales avant le début des opérations.</p>',
    'Douala 5e : des centaines de familles à la rue après les démolitions. Les déplacés internes ont été expulsés sans aucune solution de relogement.',
    'https://picsum.photos/seed/soc012/800/450',
    author, 'Social', 'published', 'fr', false, 2890, 3,
    NOW() - INTERVAL '57 days'
  ),
  (
    'Genre : le Cameroun adopte une loi sur les quotas féminins dans les fonctions électives',
    'cameroun-loi-quotas-feminins-fonctions-electives',
    '<p>L'Assemblée nationale a adopté en deuxième lecture une loi imposant un quota minimum de 30 % de femmes sur les listes électorales pour les prochaines élections législatives et municipales. Cette avancée législative, saluée par les organisations féministes, est toutefois jugée insuffisante par celles qui militent pour la parité complète.</p>',
    'Le Cameroun adopte des quotas féminins à 30 % pour les élections. Un progrès pour les unes, une demi-mesure pour les autres qui réclament la parité intégrale.',
    'https://picsum.photos/seed/soc013/800/450',
    author, 'Social', 'published', 'fr', false, 2120, 3,
    NOW() - INTERVAL '63 days'
  ),
  (
    'Crise alimentaire dans l''Extrême-Nord : le PAM alerte sur une situation critique',
    'crise-alimentaire-extreme-nord-pam-alerte',
    '<p>Le Programme Alimentaire Mondial (PAM) a tiré la sonnette d'alarme sur la situation alimentaire dans l'Extrême-Nord du Cameroun, où plus de 400 000 personnes se trouveraient en situation d'insécurité alimentaire sévère. La combinaison des effets des changements climatiques et des déplacements liés à l'insécurité Boko Haram aggrave une situation déjà précaire.</p>',
    'Le PAM alerte : 400 000 personnes en insécurité alimentaire sévère dans l''Extrême-Nord. Sécheresse et insécurité Boko Haram forment un cocktail explosif.',
    'https://picsum.photos/seed/soc014/800/450',
    author, 'Social', 'published', 'fr', true, 3670, 4,
    NOW() - INTERVAL '70 days'
  ),
  (
    'Internet mobile : le Cameroun parmi les pays africains avec le débit le plus faible',
    'internet-mobile-cameroun-debit-faible-afrique',
    '<p>Selon le classement Speedtest de janvier 2026, le Cameroun figure parmi les dix pays africains affichant les débits moyens de connexion mobile les plus faibles du continent. Avec une vitesse de téléchargement moyenne de 8,7 Mbit/s, le pays est loin derrière ses voisins comme le Nigeria (31 Mbit/s) ou le Sénégal (27 Mbit/s).</p>',
    'Le Cameroun dans le bas du classement africain pour la vitesse d''internet mobile. 8,7 Mbit/s en moyenne contre 31 Mbit/s pour le Nigeria voisin.',
    'https://picsum.photos/seed/soc015/800/450',
    author, 'Social', 'published', 'fr', false, 2340, 3,
    NOW() - INTERVAL '78 days'
  );

  -- ================================================================
  -- ÉCONOMIE (8 articles)
  -- ================================================================

  INSERT INTO articles (title, slug, content, excerpt, featured_image, author_id, category, status, language, is_premium, views_count, read_time, published_at) VALUES
  (
    'Franc CFA : le débat sur la souveraineté monétaire refait surface',
    'franc-cfa-debat-souverainete-monetaire',
    '<p>Le débat sur le franc CFA et la souveraineté monétaire des pays d'Afrique centrale et de l'Ouest a été relancé par plusieurs économistes lors d'un colloque à Yaoundé. La question de la réforme ou de l'abandon de cette monnaie héritée de la colonisation française est de plus en plus présente dans le débat public camerounais.</p>',
    'Le franc CFA au cœur d''un colloque à Yaoundé. Économistes et politiques débattent de souveraineté monétaire à l''heure où l''Afrique centrale cherche ses propres voies.',
    'https://picsum.photos/seed/eco001/800/450',
    author, 'Économie', 'published', 'fr', true, 4560, 5,
    NOW() - INTERVAL '9 days'
  ),
  (
    'Hydrocarbures : la SNH annonce la découverte d''un nouveau gisement offshore',
    'snh-nouveau-gisement-offshore-hydrocarbures',
    '<p>La Société Nationale des Hydrocarbures (SNH) a annoncé la découverte d'un nouveau gisement pétrolier offshore dans le bassin du Rio del Rey, évalué à plusieurs centaines de millions de barils. Cette découverte pourrait prolonger la durée de vie de la production pétrolière camerounaise au-delà de 2040.</p>',
    'La SNH découvre un nouveau gisement offshore dans le bassin du Rio del Rey. Une annonce qui prolonge les espoirs pétroliers du Cameroun au-delà de 2040.',
    'https://picsum.photos/seed/eco002/800/450',
    author, 'Économie', 'published', 'fr', false, 5230, 4,
    NOW() - INTERVAL '20 days'
  ),
  (
    'Budget 2026 : les investissements dans les PME quadruplent sur papier',
    'budget-2026-investissements-pme-quadruplent',
    '<p>Le budget 2026 prévoit une enveloppe de 45 milliards de francs CFA destinée à soutenir les petites et moyennes entreprises camerounaises, soit quatre fois plus que l'année précédente. Cependant, les organisations patronales restent sceptiques sur la capacité des mécanismes de distribution à atteindre les véritables bénéficiaires.</p>',
    '45 milliards pour les PME dans le budget 2026, soit 4 fois plus qu''en 2025. Le patronat salue l''annonce mais s''interroge sur les mécanismes de distribution.',
    'https://picsum.photos/seed/eco003/800/450',
    author, 'Économie', 'published', 'fr', false, 1870, 3,
    NOW() - INTERVAL '32 days'
  ),
  (
    'Kribi : le port en eau profonde dépasse le cap du million de conteneurs',
    'kribi-port-eau-profonde-million-conteneurs',
    '<p>Le port autonome de Kribi a franchi pour la première fois le cap symbolique du million de conteneurs traités en une année. Cette performance marque une étape importante dans le positionnement de Kribi comme hub logistique régional pour l'Afrique centrale.</p>',
    'Kribi franchit le cap du million de conteneurs. Une étape symbolique pour le hub logistique régional qui ambitionne de devancer Douala à l''horizon 2030.',
    'https://picsum.photos/seed/eco004/800/450',
    author, 'Économie', 'published', 'fr', false, 2870, 3,
    NOW() - INTERVAL '47 days'
  ),
  (
    'Inflation : le taux annuel atteint 7,2 % en janvier 2026, les ménages sous pression',
    'inflation-taux-annuel-7-pourcent-2026',
    '<p>L'Institut National de la Statistique (INS) a publié les données d'inflation pour janvier 2026, faisant état d'un taux annuel de 7,2 %, principalement tiré par les produits alimentaires et l'énergie. Ce niveau, le plus élevé depuis 2009, érode significativement le pouvoir d'achat des ménages à revenu fixe.</p>',
    '7,2 % d''inflation en janvier 2026 : le plus haut niveau depuis 2009. Les fonctionnaires et les salariés à revenu fixe sont les premières victimes de cette flambée.',
    'https://picsum.photos/seed/eco005/800/450',
    author, 'Économie', 'published', 'fr', true, 3890, 4,
    NOW() - INTERVAL '55 days'
  ),
  (
    'Startups camerounaises : levée de fonds record de 12 millions USD en 2025',
    'startups-camerounaises-levee-fonds-record-2025',
    '<p>Le secteur des startups camerounaises a enregistré en 2025 un volume de levées de fonds record de 12 millions de dollars, selon le rapport annuel de l'écosystème numérique camerounais. Les fintech et les agritech dominent ce palmarès, attirant l'attention des fonds d'investissement panafricains.</p>',
    '12 millions de dollars levés par les startups camerounaises en 2025, un record. Fintech et agritech mènent la danse dans un écosystème en pleine ébullition.',
    'https://picsum.photos/seed/eco006/800/450',
    author, 'Économie', 'published', 'fr', false, 2450, 4,
    NOW() - INTERVAL '68 days'
  ),
  (
    'Cacao : la campagne 2025-2026 s''annonce en hausse de 8 % malgré les aléas climatiques',
    'cacao-campagne-2025-2026-hausse-8-pourcent',
    '<p>Le Conseil Interprofessionnel du Cacao et du Café (CICC) a publié ses premières estimations pour la campagne 2025-2026, anticipant une production de 310 000 tonnes, soit une hausse de 8 % par rapport à la campagne précédente. Cette progression est portée par les nouvelles plantations dans la région du Centre.</p>',
    'La campagne cacaoyère 2025-2026 pourrait atteindre 310 000 tonnes, +8 %. Les nouvelles plantations du Centre portent la croissance malgré les aléas climatiques.',
    'https://picsum.photos/seed/eco007/800/450',
    author, 'Économie', 'published', 'fr', false, 1980, 3,
    NOW() - INTERVAL '83 days'
  ),
  (
    'Banques : la BEAC maintient son taux directeur à 5 % malgré les pressions inflationnistes',
    'beac-taux-directeur-5-pourcent-maintien',
    '<p>La Banque des États de l'Afrique Centrale (BEAC) a décidé de maintenir son taux directeur à 5 % lors de son comité de politique monétaire de décembre 2025, malgré les pressions inflationnistes persistantes dans la zone CEMAC. Cette décision vise à préserver la croissance économique sans aggraver le coût du crédit.</p>',
    'La BEAC maintient son taux directeur à 5 %. Un équilibre délicat entre lutte contre l''inflation et soutien à la croissance dans une zone CEMAC sous tension.',
    'https://picsum.photos/seed/eco008/800/450',
    author, 'Économie', 'published', 'fr', true, 1560, 4,
    NOW() - INTERVAL '92 days'
  );

  -- ================================================================
  -- CULTURE (6 articles)
  -- ================================================================

  INSERT INTO articles (title, slug, content, excerpt, featured_image, author_id, category, status, language, is_premium, views_count, read_time, published_at) VALUES
  (
    'Makossa : Manu Dibango, dix ans après, son héritage musical toujours vivant',
    'makossa-manu-dibango-heritage-musical',
    '<p>Cinq ans après la disparition du « géant du makossa », la musique de Manu Dibango continue de résonner à travers le monde. Festival, rééditions, hommages : retour sur un héritage musical qui transcende les générations et fait rayonner le Cameroun sur la scène internationale.</p>',
    'Manu Dibango, cinq ans après sa mort, reste une figure musicale incontournable. Son héritage makossa continue de traverser les continents et les générations.',
    'https://picsum.photos/seed/cul001/800/450',
    author, 'Culture', 'published', 'fr', false, 3450, 4,
    NOW() - INTERVAL '6 days'
  ),
  (
    'Littérature : Leonora Miano remporte le Grand Prix du Roman de l''Académie française',
    'leonora-miano-grand-prix-roman-academie-francaise',
    '<p>Leonora Miano, romancière camerounaise installée en France, a remporté le Grand Prix du Roman de l'Académie française pour son dernier ouvrage. Une consécration internationale pour l'une des voix les plus singulières de la littérature africaine contemporaine.</p>',
    'Leonora Miano couronnée par l''Académie française. La romancière camerounaise confirme son statut de grande voix de la littérature africaine contemporaine.',
    'https://picsum.photos/seed/cul002/800/450',
    author, 'Culture', 'published', 'fr', false, 2780, 3,
    NOW() - INTERVAL '21 days'
  ),
  (
    'Cinéma camerounais : « Les Fils de la Terre » sélectionné au festival de Cannes 2026',
    'cinema-camerounais-fils-terre-cannes-2026',
    '<p>Le film « Les Fils de la Terre » du réalisateur camerounais Thierry Ntamack a été sélectionné dans la section Un Certain Regard du festival de Cannes 2026. Cette sélection marque une étape majeure pour le septième art camerounais, encore peu présent sur les grands circuits internationaux.</p>',
    '« Les Fils de la Terre » en sélection à Cannes : une première pour le cinéma camerounais. Le réalisateur Thierry Ntamack porte la bannière du pays sur la Croisette.',
    'https://picsum.photos/seed/cul003/800/450',
    author, 'Culture', 'published', 'fr', false, 4230, 3,
    NOW() - INTERVAL '36 days'
  ),
  (
    'FESPAM 2026 : le Cameroun sélectionné pour accueillir le festival panafricain de musique',
    'fespam-2026-cameroun-accueillera-festival',
    '<p>Le Cameroun a été officiellement désigné pour accueillir la prochaine édition du Festival Panafricain de Musique (FESPAM), en remplacement de Brazzaville qui a renoncé à l'organisation. Yaoundé et Douala partageront les festivités en juillet 2026, avec la participation attendue d'artistes de plus de 40 pays africains.</p>',
    'Le Cameroun accueillera le FESPAM 2026. Yaoundé et Douala partagent le podium d''un festival panafricain qui rassemblera 40 pays en juillet.',
    'https://picsum.photos/seed/cul004/800/450',
    author, 'Culture', 'published', 'fr', false, 2100, 3,
    NOW() - INTERVAL '53 days'
  ),
  (
    'Samuel Eto''o : la FECAFOOT présente son bilan à mi-mandat',
    'samuel-etoo-fecafoot-bilan-mi-mandat',
    '<p>Samuel Eto'o, président de la Fédération Camerounaise de Football (FECAFOOT) depuis 2021, a présenté un bilan à mi-mandat de quatre ans. Entre les ambitions affichées et les réalisations concrètes, l'écart reste important selon les observateurs du football camerounais, mais certains chantiers ont indéniablement progressé.</p>',
    'Eto''o à mi-mandat : promesses tenues ou bilan mitigé ? Le président de la FECAFOOT présente son rapport d''étape face à un football camerounais en attente de renouveau.',
    'https://picsum.photos/seed/cul005/800/450',
    author, 'Culture', 'published', 'fr', false, 6780, 4,
    NOW() - INTERVAL '74 days'
  ),
  (
    'Ngondo 2025 : le festival traditionnel sawa réunit 50 000 participants à Douala',
    'ngondo-2025-festival-sawa-50000-participants',
    '<p>Le Ngondo, festival traditionnel des peuples Sawa du littoral camerounais, a rassemblé plus de 50 000 participants sur les rives du Wouri à Douala. Cette édition 2025, placée sous le signe de la préservation de l'environnement aquatique, a donné lieu à des rituels ancestraux et des compétitions sportives traditionnelles.</p>',
    '50 000 participants au Ngondo 2025 à Douala. Le festival des peuples Sawa porte cette année un message fort pour la préservation du fleuve Wouri.',
    'https://picsum.photos/seed/cul006/800/450',
    author, 'Culture', 'published', 'fr', false, 3450, 3,
    NOW() - INTERVAL '90 days'
  );

  -- ================================================================
  -- GÉOPOLITIQUE (5 articles)
  -- ================================================================

  INSERT INTO articles (title, slug, content, excerpt, featured_image, author_id, category, status, language, is_premium, views_count, read_time, published_at) VALUES
  (
    'Cameroun-Nigeria : la Commission mixte confirme l''avancement de la démarcation frontalière',
    'cameroun-nigeria-commission-demarcation-frontaliere',
    '<p>La Commission Mixte Cameroun-Nigeria de la frontière terrestre a tenu sa session ordinaire à Abuja, confirmant l'avancement des travaux de démarcation physique de la frontière issue de l'arrêt de la Cour Internationale de Justice de 2002. Plus de 80 % de la frontière terrestre a désormais été balisée.</p>',
    'La frontière Cameroun-Nigeria avance dans sa démarcation. 80 % du tracé terrestre est désormais balisé, 23 ans après l''arrêt historique de la CIJ.',
    'https://picsum.photos/seed/geo001/800/450',
    author, 'Géopolitique', 'published', 'fr', false, 2340, 4,
    NOW() - INTERVAL '16 days'
  ),
  (
    'CEMAC : sommet extraordinaire sur la stabilité financière régionale à Malabo',
    'cemac-sommet-extraordinaire-stabilite-financiere',
    '<p>Les chefs d'État de la Communauté Économique et Monétaire de l'Afrique Centrale (CEMAC) se réunissent en sommet extraordinaire à Malabo pour débattre de la stabilité financière de la zone, menacée par la chute des recettes pétrolières de plusieurs pays membres et la montée des dettes souveraines.</p>',
    'Sommet d''urgence de la CEMAC à Malabo face à la fragilité financière de la zone. La chute des recettes pétrolières et les dettes souveraines inquiètent les États membres.',
    'https://picsum.photos/seed/geo002/800/450',
    author, 'Géopolitique', 'published', 'fr', true, 1980, 4,
    NOW() - INTERVAL '29 days'
  ),
  (
    'Bassin du Congo : le Cameroun et la RDC signent un accord de cogestion forestière',
    'bassin-congo-cameroun-rdc-accord-forestier',
    '<p>Les gouvernements camerounais et congolais ont signé un accord de cogestion du bassin forestier du Congo, deuxième poumon vert de la planète après l'Amazonie. Cet accord, encadré par la CAFI (Initiative pour les Forêts d'Afrique Centrale), prévoit des mécanismes conjoints de lutte contre la déforestation illégale.</p>',
    'Cameroun et RDC s''allient pour protéger le bassin du Congo. Un accord de cogestion forestière signé sous l''égide de la CAFI pour lutter contre la déforestation.',
    'https://picsum.photos/seed/geo003/800/450',
    author, 'Géopolitique', 'published', 'fr', false, 2670, 4,
    NOW() - INTERVAL '43 days'
  ),
  (
    'Présence française en Afrique : le Cameroun reconsidère-t-il sa relation avec Paris ?',
    'cameroun-france-relation-reconfiguration',
    '<p>Dans un contexte de remise en question généralisée de la présence militaire et diplomatique française en Afrique subsaharienne — illustrée par les ruptures avec le Mali, le Burkina Faso et le Niger — le Cameroun observe une position délicate entre maintien de ses partenariats historiques et aspiration à une plus grande autonomie stratégique.</p>',
    'Le Cameroun entre Paris et l''autonomie : comment Yaoundé navigue dans un contexte de reconfiguration des partenariats franco-africains. Décryptage.',
    'https://picsum.photos/seed/geo004/800/450',
    author, 'Géopolitique', 'published', 'fr', true, 5670, 6,
    NOW() - INTERVAL '61 days'
  ),
  (
    'UA : le Cameroun élu au Conseil de Paix et de Sécurité pour un mandat de deux ans',
    'cameroun-elu-conseil-paix-securite-ua',
    '<p>Le Cameroun a été élu membre du Conseil de Paix et de Sécurité de l'Union Africaine pour un mandat de deux ans. Cette élection confère au pays un rôle accru dans la gestion des crises sur le continent africain, notamment en Afrique centrale où plusieurs foyers de tension persistent.</p>',
    'Le Cameroun rejoint le Conseil de Paix et de Sécurité de l''UA. Un mandat de deux ans qui renforce son rôle dans la gestion des crises en Afrique centrale.',
    'https://picsum.photos/seed/geo005/800/450',
    author, 'Géopolitique', 'published', 'fr', false, 1870, 3,
    NOW() - INTERVAL '76 days'
  );

END $$;

-- Confirmation
SELECT category, COUNT(*) AS nb_articles
FROM articles
WHERE status = 'published'
GROUP BY category
ORDER BY nb_articles DESC;
