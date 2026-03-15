// backend/scripts/seed_articles.js
// Usage: DB_USER=postgres DB_PASSWORD=xxx DB_NAME=solitiquo node backend/scripts/seed_articles.js
// Or:    set DB_USER=postgres && node backend/scripts/seed_articles.js  (Windows cmd)

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'solitiquo',
});

// ─── Articles data ────────────────────────────────────────────────────────────

const articles = [

  // ── POLITIQUE (20) ──────────────────────────────────────────────────────────
  {
    title: "Paul Biya confirme sa candidature pour 2026 : réactions à travers le pays",
    slug: "paul-biya-candidature-2026-reactions",
    content: "<p>Le président Paul Biya a officialisé sa candidature à l'élection présidentielle de 2026, déclenchant une vague de réactions au sein de la société civile et des partis d'opposition. Depuis Yaoundé jusqu'à Douala, les Camerounais expriment des opinions divergentes sur ce nouveau mandat potentiel.</p><p>Les partisans du Rassemblement Démocratique du Peuple Camerounais (RDPC) ont accueilli cette annonce avec enthousiasme, organisant des rassemblements dans plusieurs capitales régionales. En revanche, les coalitions d'opposition appellent à une mobilisation citoyenne pour contester cette candidature jugée inconstitutionnelle par certains juristes.</p>",
    excerpt: "Après des semaines de spéculations, le président Paul Biya a confirmé sa candidature pour 2026. Le pays se divise entre partisans enthousiastes et opposition mobilisée.",
    image: "https://picsum.photos/seed/pol001/800/450",
    category: "Politique", is_premium: false, views: 1842, read_time: 4, days_ago: 2,
  },
  {
    title: "Crise anglophone : nouvelles négociations secrètes entre Yaoundé et les séparatistes",
    slug: "crise-anglophone-negociations-secretes-yaounde",
    content: "<p>Des sources proches du gouvernement révèlent la tenue de pourparlers discrets entre des émissaires de Yaoundé et des représentants modérés du mouvement séparatiste ambazono. Ces négociations, facilitées par un médiateur international dont l'identité n'a pas été révélée, pourraient marquer un tournant dans la gestion de cette crise qui dure depuis 2016.</p>",
    excerpt: "Des négociations secrètes entre Yaoundé et les séparatistes ambazoniens seraient en cours. Un médiateur international faciliterait des pourparlers qui pourraient changer la donne.",
    image: "https://picsum.photos/seed/pol002/800/450",
    category: "Politique", is_premium: true, views: 5430, read_time: 5, days_ago: 5,
  },
  {
    title: "Assemblée nationale : adoption du budget 2026 en plénière, l'opposition absente",
    slug: "assemblee-nationale-budget-2026-adoption",
    content: "<p>L'Assemblée nationale a adopté le budget de l'État pour l'exercice 2026, d'un montant de 6 200 milliards de francs CFA, en séance plénière. L'opposition a boycotté le vote, dénonçant l'absence de débat contradictoire sur les postes de dépenses militaires. Le budget prévoit une hausse de 12 % des investissements dans les infrastructures routières.</p>",
    excerpt: "Budget 2026 de 6 200 milliards FCFA adopté par l'Assemblée nationale. L'opposition a boycotté le vote en dénonçant l'opacité sur les dépenses militaires.",
    image: "https://picsum.photos/seed/pol003/800/450",
    category: "Politique", is_premium: false, views: 2340, read_time: 3, days_ago: 8,
  },
  {
    title: "Maurice Kamto annonce une grande marche nationale pour le 1er mai",
    slug: "kamto-marche-nationale-1er-mai",
    content: "<p>Maurice Kamto, président du Mouvement pour la Renaissance du Cameroun (MRC), a annoncé lors d'une conférence de presse l'organisation d'une grande marche nationale le 1er mai prochain dans plusieurs villes du pays. Il appelle à une mobilisation citoyenne pour exiger des réformes électorales avant les scrutins de 2026.</p>",
    excerpt: "Maurice Kamto appelle à une grande marche nationale le 1er mai pour exiger des réformes électorales. Le MRC mobilise ses militants dans toutes les grandes villes.",
    image: "https://picsum.photos/seed/pol004/800/450",
    category: "Politique", is_premium: false, views: 3120, read_time: 3, days_ago: 12,
  },
  {
    title: "Remaniement ministériel : cinq nouveaux portefeuilles, les femmes mieux représentées",
    slug: "remaniement-ministeriel-cinq-nouveaux-portefeuilles",
    content: "<p>Un décret présidentiel publié samedi au Journal Officiel acte le remaniement du gouvernement. Cinq nouveaux ministres font leur entrée, dont deux femmes aux portefeuilles de l'Éducation de base et de l'Économie numérique. Ce remaniement intervient à la suite des critiques sur la parité au sein du gouvernement camerounais.</p>",
    excerpt: "Cinq nouveaux ministres entrent au gouvernement dont deux femmes. Ce remaniement répond aux critiques sur la sous-représentation féminine dans l'exécutif camerounais.",
    image: "https://picsum.photos/seed/pol005/800/450",
    category: "Politique", is_premium: false, views: 4560, read_time: 4, days_ago: 17,
  },
  {
    title: "CÉNI : le calendrier électoral pour 2026 sera publié avant la fin du premier trimestre",
    slug: "ceni-calendrier-electoral-2026-premier-trimestre",
    content: "<p>La Commission Électorale Nationale Indépendante (CÉNI) a annoncé que le calendrier officiel des élections présidentielle et législatives de 2026 sera rendu public avant fin mars. Cette annonce intervient dans un contexte de vives discussions sur la réforme du code électoral réclamée par plusieurs partis de l'opposition.</p>",
    excerpt: "La CÉNI annonce la publication du calendrier électoral 2026 avant fin mars. Les partis d'opposition réclament en parallèle une réforme du code électoral.",
    image: "https://picsum.photos/seed/pol006/800/450",
    category: "Politique", is_premium: false, views: 1890, read_time: 3, days_ago: 22,
  },
  {
    title: "Gouverneur du Littoral : un administrateur civil prend les rênes de la région",
    slug: "gouverneur-littoral-administrateur-civil",
    content: "<p>Le chef de l'État a procédé à la nomination d'un nouveau gouverneur pour la région du Littoral, remplaçant l'officier général en poste depuis cinq ans. Ce choix d'un administrateur civil est perçu par certains observateurs comme un signal d'apaisement dans la gestion des tensions politiques à Douala.</p>",
    excerpt: "Un administrateur civil remplace l'officier général à la tête du Littoral. Ce choix inhabituel est analysé comme un geste politique envers la capitale économique.",
    image: "https://picsum.photos/seed/pol007/800/450",
    category: "Politique", is_premium: false, views: 2780, read_time: 3, days_ago: 27,
  },
  {
    title: "Décentralisation : les communes réclament 30 % du budget national",
    slug: "decentralisation-communes-30-pourcent-budget",
    content: "<p>L'Association des Communes et Villes Unies du Cameroun (CVUC) a tenu son congrès annuel à Bafoussam, adoptant une résolution réclamant l'augmentation de la part des collectivités territoriales dans le budget national à 30 %. La loi portant décentralisation prévoit théoriquement 15 %, un seuil qui n'est pas encore atteint selon les élus locaux.</p>",
    excerpt: "Les maires camerounais réclament 30 % du budget national pour les communes. La loi prévoit 15 %, un seuil pas encore atteint. Le congrès de la CVUC monte au créneau.",
    image: "https://picsum.photos/seed/pol008/800/450",
    category: "Politique", is_premium: false, views: 1650, read_time: 3, days_ago: 33,
  },
  {
    title: "Partis politiques : vers une loi restreignant les formations sans représentation",
    slug: "partis-politiques-loi-restriction-formations",
    content: "<p>Un projet de loi visant à réduire le nombre de partis politiques au Cameroun — actuellement supérieur à 300 — est en cours d'examen au ministère de l'Administration Territoriale. Le texte prévoit des seuils minimaux de représentation et de financement pour qu'un parti puisse être légalement reconnu. Les petites formations s'y opposent vigoureusement.</p>",
    excerpt: "Plus de 300 partis politiques au Cameroun : le gouvernement envisage une loi pour en réduire le nombre. Les petites formations crient à la restriction des libertés.",
    image: "https://picsum.photos/seed/pol009/800/450",
    category: "Politique", is_premium: true, views: 3890, read_time: 4, days_ago: 40,
  },
  {
    title: "Sénat : Cavayé Yéguié Djibril élu président pour un troisième mandat consécutif",
    slug: "senat-cavaye-yeguie-djibril-troisieme-mandat",
    content: "<p>Cavayé Yéguié Djibril a été réélu à la présidence du Sénat camerounais pour un troisième mandat consécutif de trois ans. Cette réélection confirme la mainmise du RDPC sur les deux chambres du Parlement. L'opposition, qui détient moins de 10 % des sièges sénatoriaux, a présenté un candidat symbolique sans espoir de l'emporter.</p>",
    excerpt: "Cavayé Yéguié Djibril reconduit pour un 3e mandat à la tête du Sénat. L'opposition symbolique illustre la domination totale du RDPC sur les deux chambres.",
    image: "https://picsum.photos/seed/pol010/800/450",
    category: "Politique", is_premium: false, views: 2100, read_time: 3, days_ago: 48,
  },
  {
    title: "Relations Cameroun-UE : signature d'un accord de partenariat économique renforcé",
    slug: "cameroun-ue-accord-partenariat-economique",
    content: "<p>Le Cameroun et l'Union Européenne ont signé un accord de partenariat économique révisé qui élargit les conditions d'accès des produits agricoles camerounais au marché européen. Cet accord, négocié sur trois ans, suscite des réactions contrastées : espoir pour les exportateurs de cacao et de café, inquiétude pour les industries locales face à la concurrence des produits européens.</p>",
    excerpt: "Le Cameroun signe un APE révisé avec l'UE. Cacao et café gagnent un meilleur accès au marché européen, mais les industriels locaux redoutent la concurrence.",
    image: "https://picsum.photos/seed/pol011/800/450",
    category: "Politique", is_premium: false, views: 3240, read_time: 4, days_ago: 55,
  },
  {
    title: "Cour Suprême : annulation de résultats dans cinq circonscriptions législatives",
    slug: "cour-supreme-annulation-resultats-circonscriptions",
    content: "<p>La Cour Suprême a prononcé l'annulation des résultats des dernières élections législatives dans cinq circonscriptions, dont deux dans la région de l'Ouest et une à Douala. Ces décisions, fondées sur des irrégularités documentées dans les procès-verbaux, imposent l'organisation d'élections partielles dans les circonscriptions concernées.</p>",
    excerpt: "La Cour Suprême annule les législatives dans cinq circonscriptions pour irrégularités. Des élections partielles devront être organisées, un test pour la CÉNI.",
    image: "https://picsum.photos/seed/pol012/800/450",
    category: "Politique", is_premium: true, views: 4780, read_time: 4, days_ago: 62,
  },
  {
    title: "Yaoundé : manifestation anti-corruption devant le siège du CONAC",
    slug: "yaounde-manifestation-anti-corruption-conac",
    content: "<p>Plusieurs centaines de citoyens se sont rassemblés devant le siège de la Commission Nationale Anti-Corruption (CONAC) à Yaoundé pour dénoncer l'impunité des cadres impliqués dans des détournements de fonds publics. Les manifestants réclament la publication d'un registre des condamnations et la restitution des biens mal acquis.</p>",
    excerpt: "Des centaines de Camerounais manifestent contre l'impunité devant le CONAC. Ils réclament un registre public des condamnations pour corruption et la restitution des biens.",
    image: "https://picsum.photos/seed/pol013/800/450",
    category: "Politique", is_premium: false, views: 5670, read_time: 3, days_ago: 68,
  },
  {
    title: "Presse : le gouvernement retire l'accréditation à trois médias étrangers",
    slug: "presse-retrait-accreditation-medias-etrangers",
    content: "<p>Le ministère de la Communication a notifié le retrait d'accréditation à trois organes de presse étrangers couvrant la crise anglophone, invoquant des violations du code de déontologie journalistique et la diffusion d'informations jugées « de nature à troubler l'ordre public ». Cette décision a été vivement condamnée par Reporters Sans Frontières et plusieurs organisations de défense de la liberté de la presse.</p>",
    excerpt: "Trois médias étrangers perdent leur accréditation au Cameroun. Le gouvernement invoque des violations déontologiques ; RSF dénonce une attaque contre la liberté de la presse.",
    image: "https://picsum.photos/seed/pol014/800/450",
    category: "Politique", is_premium: false, views: 6120, read_time: 4, days_ago: 75,
  },
  {
    title: "Opération Épervier : deux anciens ministres condamnés à douze ans de prison",
    slug: "operation-epervier-anciens-ministres-condamnes",
    content: "<p>Le Tribunal Criminel Spécial (TCS) a condamné deux anciens ministres à douze ans de réclusion criminelle pour détournement de fonds publics dans le cadre de marchés de travaux publics. Les prévenus ont annoncé faire appel. L'opération Épervier, lancée en 2006, a permis de condamner plusieurs dizaines de hauts fonctionnaires depuis son lancement.</p>",
    excerpt: "Deux anciens ministres écopent de 12 ans de prison pour détournement de fonds. L'opération Épervier poursuit son bilan après deux décennies d'existence.",
    image: "https://picsum.photos/seed/pol015/800/450",
    category: "Politique", is_premium: false, views: 7890, read_time: 4, days_ago: 82,
  },
  {
    title: "Diplomatie : le Cameroun renforce ses liens avec la Chine lors d'une visite d'État",
    slug: "diplomatie-cameroun-chine-visite-etat",
    content: "<p>Une délégation gouvernementale camerounaise a effectué une visite d'État à Pékin, aboutissant à la signature de sept accords de coopération couvrant les secteurs des infrastructures, de l'agriculture et de la formation professionnelle. La Chine reste le premier partenaire bilatéral du Cameroun en matière d'investissements directs depuis 2018.</p>",
    excerpt: "Yaoundé et Pékin signent sept accords de coopération lors d'une visite d'État. La Chine confirme son statut de premier investisseur bilatéral au Cameroun.",
    image: "https://picsum.photos/seed/pol016/800/450",
    category: "Politique", is_premium: false, views: 3450, read_time: 4, days_ago: 88,
  },
  {
    title: "Nord-Ouest : le préfet de Bamenda lève l'état d'urgence dans trois subdivisions",
    slug: "nord-ouest-bamenda-levee-etat-urgence",
    content: "<p>Le préfet du département de la Mezam a annoncé la levée de l'état d'urgence dans trois subdivisions de l'arrondissement de Bamenda, signalant une amélioration significative de la situation sécuritaire. Cette décision marque une étape dans la stabilisation progressive de certaines zones du Nord-Ouest, bien que des incidents sporadiques continuent d'être signalés.</p>",
    excerpt: "L'état d'urgence levé dans trois subdivisions de Bamenda : signe de normalisation dans le Nord-Ouest. Mais la vigilance reste de mise selon les autorités locales.",
    image: "https://picsum.photos/seed/pol017/800/450",
    category: "Politique", is_premium: false, views: 2890, read_time: 3, days_ago: 94,
  },
  {
    title: "RDPC : le congrès ordinaire confirme les instances dirigeantes du parti",
    slug: "rdpc-congres-ordinaire-instances-dirigeantes",
    content: "<p>Le Rassemblement Démocratique du Peuple Camerounais (RDPC) a tenu son congrès ordinaire à Yaoundé, confirmant les instances dirigeantes du parti présidentiel et adoptant un programme politique orienté vers les élections de 2026. Paul Biya, président du parti depuis sa fondation, a adressé un message vidéo depuis l'étranger.</p>",
    excerpt: "Le RDPC tient son congrès ordinaire et confirme ses structures dirigeantes pour 2026. Paul Biya adresse un message vidéo depuis l'étranger, alimentant les spéculations.",
    image: "https://picsum.photos/seed/pol018/800/450",
    category: "Politique", is_premium: false, views: 3120, read_time: 3, days_ago: 98,
  },
  {
    title: "Liberté d'expression : le blogueur Dieudonné Essomba libéré après six mois de détention",
    slug: "blogueur-essomba-libere-detention-provisoire",
    content: "<p>Dieudonné Essomba, blogueur et critique du régime camerounais, a été libéré après six mois de détention provisoire. Arrêté pour « diffusion de fausses nouvelles » après avoir publié des articles sur la gestion de la crise anglophone, sa libération intervient après une campagne internationale menée par des organisations de défense des droits numériques.</p>",
    excerpt: "Le blogueur Dieudonné Essomba libéré après 6 mois de détention. Sa campagne internationale illustre les pressions sur la liberté d'expression en ligne au Cameroun.",
    image: "https://picsum.photos/seed/pol019/800/450",
    category: "Politique", is_premium: false, views: 8920, read_time: 4, days_ago: 103,
  },
  {
    title: "Bilingualisme : le gouvernement annonce 500 nouveaux enseignants bilingues",
    slug: "bilingualisme-gouvernement-500-enseignants",
    content: "<p>Dans le cadre du Grand Dialogue National dont les résolutions tardent à être mises en oeuvre, le gouvernement annonce le recrutement de 500 enseignants bilingues pour renforcer l'enseignement en anglais dans les régions francophones et vice-versa. Cette mesure vise à promouvoir le bilinguisme effectif dans le système éducatif camerounais.</p>",
    excerpt: "500 enseignants bilingues seront recrutés pour renforcer le bilinguisme effectif dans les écoles. Une réponse partielle aux résolutions du Grand Dialogue National.",
    image: "https://picsum.photos/seed/pol020/800/450",
    category: "Politique", is_premium: false, views: 2340, read_time: 3, days_ago: 108,
  },

  // ── SOCIAL (15) ─────────────────────────────────────────────────────────────
  {
    title: "Hausse du prix du carburant : les transporteurs en grève à Douala et Yaoundé",
    slug: "hausse-carburant-greve-transporteurs",
    content: "<p>Suite à la révision à la hausse des prix à la pompe annoncée par le gouvernement, les syndicats de transporteurs ont déclenché une grève de 48 heures à Douala et Yaoundé. Le prix du litre de super est passé de 730 à 790 francs CFA, une augmentation jugée insupportable par les professionnels du secteur.</p>",
    excerpt: "Les transporteurs paralysent Douala et Yaoundé après la hausse des prix du carburant. 60 FCFA de plus par litre : une augmentation qui frappe d'abord les plus fragiles.",
    image: "https://picsum.photos/seed/soc001/800/450",
    category: "Social", is_premium: false, views: 6540, read_time: 4, days_ago: 3,
  },
  {
    title: "Santé : pénurie de médicaments essentiels dans les hôpitaux publics du Centre",
    slug: "penurie-medicaments-hopitaux-region-centre",
    content: "<p>Une enquête de l'association Transparence Médicale Cameroun révèle une pénurie critique de médicaments essentiels dans plusieurs hôpitaux de district de la région du Centre. Paracétamol, sérum physiologique, antibiotiques de base : les ruptures de stock touchent des produits indispensables à la prise en charge des malades.</p>",
    excerpt: "Manque criant de médicaments essentiels dans les hôpitaux du Centre. Une enquête pointe les défaillances criantes de la chaîne d'approvisionnement publique.",
    image: "https://picsum.photos/seed/soc002/800/450",
    category: "Social", is_premium: false, views: 4320, read_time: 4, days_ago: 7,
  },
  {
    title: "Éducation : grève des enseignants du secondaire pour le paiement des primes impayées",
    slug: "greve-enseignants-secondaire-primes-impayees",
    content: "<p>Les syndicats d'enseignants du secondaire ont observé une grève de trois jours dans plusieurs régions du pays pour exiger le paiement de primes d'incitation à la résidence impayées depuis plus de dix-huit mois. Des milliers d'élèves ont été privés de cours, notamment en terminale à quelques semaines des examens officiels.</p>",
    excerpt: "Les enseignants du secondaire croisent les bras pour 18 mois de primes impayées. Des milliers d'élèves de terminale impactés à quelques semaines du baccalauréat.",
    image: "https://picsum.photos/seed/soc003/800/450",
    category: "Social", is_premium: false, views: 3870, read_time: 3, days_ago: 11,
  },
  {
    title: "Inondations dans l'Adamaoua : 2 000 familles déplacées, l'urgence humanitaire déclarée",
    slug: "inondations-adamaoua-familles-deplacees",
    content: "<p>Des pluies diluviennes ont provoqué des inondations dévastatrices dans plusieurs arrondissements de l'Adamaoua, forçant plus de 2 000 familles à quitter leurs habitations. Le gouverneur a déclaré l'état d'urgence humanitaire et sollicité l'aide de la Croix-Rouge et du PAM pour l'acheminement de vivres.</p>",
    excerpt: "2 000 familles déplacées dans l'Adamaoua après des inondations dévastatrices. L'urgence humanitaire est déclarée, les secours s'organisent.",
    image: "https://picsum.photos/seed/soc004/800/450",
    category: "Social", is_premium: false, views: 2890, read_time: 3, days_ago: 14,
  },
  {
    title: "Chômage des jeunes : 65 % des 18-35 ans en situation précaire selon une étude INS",
    slug: "chomage-jeunes-65-pourcent-etude-ins",
    content: "<p>Une étude de l'Institut National de la Statistique (INS) révèle que 65 % des Camerounais âgés de 18 à 35 ans se trouvent dans une situation d'emploi précaire ou de chômage. Ce chiffre alarmant interpelle les pouvoirs publics alors que le gouvernement a lancé plusieurs programmes d'insertion professionnelle aux résultats jugés insuffisants.</p>",
    excerpt: "65 % des jeunes camerounais dans la précarité selon l'INS. Les programmes gouvernementaux d'insertion peinent à répondre à l'ampleur du phénomène.",
    image: "https://picsum.photos/seed/soc005/800/450",
    category: "Social", is_premium: true, views: 5670, read_time: 5, days_ago: 18,
  },
  {
    title: "Violences conjugales : une campagne nationale pour briser le silence dans les familles",
    slug: "violences-conjugales-campagne-nationale",
    content: "<p>Le ministère de la Femme et de la Famille, en partenariat avec ONU Femmes, lance une campagne nationale de sensibilisation contre les violences conjugales. Intitulée « Briser le Silence », cette campagne vise à encourager les victimes à porter plainte et à sensibiliser les communautés.</p>",
    excerpt: "Lancement de la campagne nationale contre les violences conjugales. ONU Femmes et le gouvernement s'allient pour inciter les victimes à parler.",
    image: "https://picsum.photos/seed/soc006/800/450",
    category: "Social", is_premium: false, views: 2140, read_time: 3, days_ago: 23,
  },
  {
    title: "Université de Yaoundé I : les étudiants protestent contre la surpopulation des amphithéâtres",
    slug: "universite-yaounde-i-surpopulation-amphitheatres",
    content: "<p>Des centaines d'étudiants de l'Université de Yaoundé I ont manifesté pacifiquement pour dénoncer la surpopulation chronique des amphithéâtres et le manque d'enseignants dans plusieurs facultés. Certains cours regroupent plus de 800 étudiants dans des salles conçues pour en accueillir 300.</p>",
    excerpt: "Les étudiants de Yaoundé I dans la rue contre la surpopulation. Des amphis à 800 élèves pour 300 places : le cri d'alarme d'une université en crise.",
    image: "https://picsum.photos/seed/soc007/800/450",
    category: "Social", is_premium: false, views: 3210, read_time: 3, days_ago: 28,
  },
  {
    title: "Accès à l'eau potable : moins de 50 % des ménages ruraux équipés selon la CDE",
    slug: "acces-eau-potable-menages-ruraux-cde",
    content: "<p>La Camerounaise des Eaux (CDE) publie son rapport semestriel sur l'accès à l'eau potable. Moins de 50 % des ménages ruraux disposent d'un accès à l'eau courante. Dans les zones les plus enclavées du Nord et de l'Adamaoua, ce taux descend sous les 30 %.</p>",
    excerpt: "La CDE confirme : moins de 50 % des ruraux ont accès à l'eau potable. Dans le Nord et l'Adamaoua, le taux descend sous 30 %. Un droit fondamental bafoué.",
    image: "https://picsum.photos/seed/soc008/800/450",
    category: "Social", is_premium: false, views: 2450, read_time: 4, days_ago: 33,
  },
  {
    title: "Hausse des loyers à Douala : les locataires étranglés par la flambée des prix",
    slug: "hausse-loyers-douala-locataires-etrangles",
    content: "<p>En deux ans, les loyers dans les quartiers populaires de Douala ont augmenté de 30 à 45 % selon une enquête du collectif Droits au Logement. Cette flambée des prix, alimentée par la spéculation immobilière et l'afflux de populations déplacées, pousse de nombreuses familles vers les périphéries.</p>",
    excerpt: "Les loyers ont bondi de 40 % en deux ans à Douala. Les familles modestes quittent les quartiers centraux, chassées par la spéculation immobilière.",
    image: "https://picsum.photos/seed/soc009/800/450",
    category: "Social", is_premium: false, views: 4120, read_time: 4, days_ago: 38,
  },
  {
    title: "Santé mentale : premier centre psychiatrique communautaire ouvre ses portes à Bafoussam",
    slug: "sante-mentale-centre-psychiatrique-bafoussam",
    content: "<p>Le premier centre psychiatrique communautaire de la région de l'Ouest vient d'ouvrir ses portes à Bafoussam. Financé en partie par l'Union Européenne, cet établissement propose une prise en charge ambulatoire et un accompagnement psychosocial pour les personnes souffrant de troubles mentaux.</p>",
    excerpt: "Un premier centre psychiatrique communautaire ouvre à Bafoussam. Soutenu par l'UE, il veut déstigmatiser la maladie mentale dans une région qui en a besoin.",
    image: "https://picsum.photos/seed/soc010/800/450",
    category: "Social", is_premium: false, views: 1780, read_time: 3, days_ago: 44,
  },
  {
    title: "Travail des enfants : 800 000 mineurs encore au travail selon l'OIT Cameroun",
    slug: "travail-enfants-800000-mineurs-oit",
    content: "<p>Le bureau camerounais de l'Organisation Internationale du Travail (OIT) estime à 800 000 le nombre d'enfants de moins de 15 ans impliqués dans des formes de travail considérées comme dangereuses. La situation est particulièrement préoccupante dans les zones de culture du cacao et du café dans le Littoral et le Centre.</p>",
    excerpt: "800 000 enfants au travail selon l'OIT. Les plantations de cacao et café restent les premiers employeurs de mineurs au Cameroun. Un fléau difficile à enrayer.",
    image: "https://picsum.photos/seed/soc011/800/450",
    category: "Social", is_premium: true, views: 3450, read_time: 4, days_ago: 50,
  },
  {
    title: "Douala 5e : des habitants sans logement après la démolition de constructions illicites",
    slug: "douala-5e-demolition-constructions-illicites",
    content: "<p>Les opérations de démolition de constructions illicites dans l'arrondissement de Douala 5ème ont laissé plusieurs centaines de familles sans abri. Les habitants, pour la plupart des déplacés internes, dénoncent l'absence de solutions de relogement proposées par les autorités locales avant le début des opérations.</p>",
    excerpt: "Douala 5ème : des centaines de familles à la rue après les démolitions. Les déplacés internes ont été expulsés sans aucune solution de relogement.",
    image: "https://picsum.photos/seed/soc012/800/450",
    category: "Social", is_premium: false, views: 2890, read_time: 3, days_ago: 57,
  },
  {
    title: "Genre : le Cameroun adopte une loi sur les quotas féminins dans les fonctions électives",
    slug: "cameroun-loi-quotas-feminins-fonctions-electives",
    content: "<p>L'Assemblée nationale a adopté en deuxième lecture une loi imposant un quota minimum de 30 % de femmes sur les listes électorales pour les prochaines élections législatives et municipales. Cette avancée législative est toutefois jugée insuffisante par celles qui militent pour la parité complète.</p>",
    excerpt: "Le Cameroun adopte des quotas féminins à 30 % pour les élections. Un progrès pour les unes, une demi-mesure pour les autres qui réclament la parité intégrale.",
    image: "https://picsum.photos/seed/soc013/800/450",
    category: "Social", is_premium: false, views: 2120, read_time: 3, days_ago: 63,
  },
  {
    title: "Crise alimentaire dans l'Extrême-Nord : le PAM alerte sur une situation critique",
    slug: "crise-alimentaire-extreme-nord-pam-alerte",
    content: "<p>Le Programme Alimentaire Mondial (PAM) a tiré la sonnette d'alarme sur la situation alimentaire dans l'Extrême-Nord du Cameroun, où plus de 400 000 personnes se trouveraient en situation d'insécurité alimentaire sévère. La combinaison des effets des changements climatiques et des déplacements liés à l'insécurité aggrave une situation déjà précaire.</p>",
    excerpt: "Le PAM alerte : 400 000 personnes en insécurité alimentaire sévère dans l'Extrême-Nord. Sécheresse et insécurité Boko Haram forment un cocktail explosif.",
    image: "https://picsum.photos/seed/soc014/800/450",
    category: "Social", is_premium: true, views: 3670, read_time: 4, days_ago: 70,
  },
  {
    title: "Internet mobile : le Cameroun parmi les pays africains avec le débit le plus faible",
    slug: "internet-mobile-cameroun-debit-faible-afrique",
    content: "<p>Selon le classement Speedtest de janvier 2026, le Cameroun figure parmi les dix pays africains affichant les débits moyens de connexion mobile les plus faibles du continent. Avec une vitesse de téléchargement moyenne de 8,7 Mbit/s, le pays est loin derrière ses voisins comme le Nigeria (31 Mbit/s).</p>",
    excerpt: "Le Cameroun dans le bas du classement africain pour la vitesse d'internet mobile. 8,7 Mbit/s en moyenne contre 31 Mbit/s pour le Nigeria voisin.",
    image: "https://picsum.photos/seed/soc015/800/450",
    category: "Social", is_premium: false, views: 2340, read_time: 3, days_ago: 78,
  },

  // ── ÉCONOMIE (8) ────────────────────────────────────────────────────────────
  {
    title: "Franc CFA : le débat sur la souveraineté monétaire refait surface",
    slug: "franc-cfa-debat-souverainete-monetaire",
    content: "<p>Le débat sur le franc CFA et la souveraineté monétaire des pays d'Afrique centrale et de l'Ouest a été relancé par plusieurs économistes lors d'un colloque à Yaoundé. La question de la réforme ou de l'abandon de cette monnaie héritée de la colonisation française est de plus en plus présente dans le débat public camerounais.</p>",
    excerpt: "Le franc CFA au coeur d'un colloque à Yaoundé. Économistes et politiques débattent de souveraineté monétaire à l'heure où l'Afrique centrale cherche ses propres voies.",
    image: "https://picsum.photos/seed/eco001/800/450",
    category: "Économie", is_premium: true, views: 4560, read_time: 5, days_ago: 9,
  },
  {
    title: "Hydrocarbures : la SNH annonce la découverte d'un nouveau gisement offshore",
    slug: "snh-nouveau-gisement-offshore-hydrocarbures",
    content: "<p>La Société Nationale des Hydrocarbures (SNH) a annoncé la découverte d'un nouveau gisement pétrolier offshore dans le bassin du Rio del Rey, évalué à plusieurs centaines de millions de barils. Cette découverte pourrait prolonger la durée de vie de la production pétrolière camerounaise au-delà de 2040.</p>",
    excerpt: "La SNH découvre un nouveau gisement offshore dans le bassin du Rio del Rey. Une annonce qui prolonge les espoirs pétroliers du Cameroun au-delà de 2040.",
    image: "https://picsum.photos/seed/eco002/800/450",
    category: "Économie", is_premium: false, views: 5230, read_time: 4, days_ago: 20,
  },
  {
    title: "Budget 2026 : les investissements dans les PME quadruplent sur papier",
    slug: "budget-2026-investissements-pme-quadruplent",
    content: "<p>Le budget 2026 prévoit une enveloppe de 45 milliards de francs CFA destinée à soutenir les petites et moyennes entreprises camerounaises, soit quatre fois plus que l'année précédente. Les organisations patronales restent sceptiques sur la capacité des mécanismes de distribution à atteindre les véritables bénéficiaires.</p>",
    excerpt: "45 milliards pour les PME dans le budget 2026, soit 4 fois plus qu'en 2025. Le patronat salue l'annonce mais s'interroge sur les mécanismes de distribution.",
    image: "https://picsum.photos/seed/eco003/800/450",
    category: "Économie", is_premium: false, views: 1870, read_time: 3, days_ago: 32,
  },
  {
    title: "Kribi : le port en eau profonde dépasse le cap du million de conteneurs",
    slug: "kribi-port-eau-profonde-million-conteneurs",
    content: "<p>Le port autonome de Kribi a franchi pour la première fois le cap symbolique du million de conteneurs traités en une année. Cette performance marque une étape importante dans le positionnement de Kribi comme hub logistique régional pour l'Afrique centrale.</p>",
    excerpt: "Kribi franchit le cap du million de conteneurs. Une étape symbolique pour le hub logistique régional qui ambitionne de devancer Douala à l'horizon 2030.",
    image: "https://picsum.photos/seed/eco004/800/450",
    category: "Économie", is_premium: false, views: 2870, read_time: 3, days_ago: 47,
  },
  {
    title: "Inflation : le taux annuel atteint 7,2 % en janvier 2026, les ménages sous pression",
    slug: "inflation-taux-annuel-7-pourcent-2026",
    content: "<p>L'Institut National de la Statistique (INS) a publié les données d'inflation pour janvier 2026, faisant état d'un taux annuel de 7,2 %, principalement tiré par les produits alimentaires et l'énergie. Ce niveau, le plus élevé depuis 2009, érode significativement le pouvoir d'achat des ménages à revenu fixe.</p>",
    excerpt: "7,2 % d'inflation en janvier 2026 : le plus haut niveau depuis 2009. Les fonctionnaires et les salariés à revenu fixe sont les premières victimes de cette flambée.",
    image: "https://picsum.photos/seed/eco005/800/450",
    category: "Économie", is_premium: true, views: 3890, read_time: 4, days_ago: 55,
  },
  {
    title: "Startups camerounaises : levée de fonds record de 12 millions USD en 2025",
    slug: "startups-camerounaises-levee-fonds-record-2025",
    content: "<p>L'écosystème startup camerounais a enregistré une levée de fonds cumulée record de 12 millions de dollars américains en 2025, soit le double de l'année précédente. Les secteurs de la fintech, de l'agritech et de la healthtech concentrent la majorité des investissements.</p>",
    excerpt: "Les startups camerounaises ont levé 12 millions USD en 2025, un record. Fintech, agritech et healthtech tirent la croissance d'un écosystème en plein essor.",
    image: "https://picsum.photos/seed/eco006/800/450",
    category: "Économie", is_premium: false, views: 4560, read_time: 4, days_ago: 67,
  },
  {
    title: "BEAC : hausse du taux directeur pour contrer l'inflation en zone CEMAC",
    slug: "beac-hausse-taux-directeur-inflation-cemac",
    content: "<p>La Banque des États de l'Afrique Centrale (BEAC) a relevé son taux directeur de 50 points de base, le portant à 5,25 %, dans le but de contenir les pressions inflationnistes persistantes dans la zone CEMAC. Cette décision, bien qu'attendue, risque de renchérir le coût du crédit pour les entreprises et les ménages.</p>",
    excerpt: "La BEAC remonte son taux directeur à 5,25 % pour lutter contre l'inflation. Une décision qui va renchérir le crédit au Cameroun et dans la zone CEMAC.",
    image: "https://picsum.photos/seed/eco007/800/450",
    category: "Économie", is_premium: true, views: 2340, read_time: 4, days_ago: 79,
  },
  {
    title: "Cacao : le Cameroun vise le cap des 400 000 tonnes pour la campagne 2025-2026",
    slug: "cacao-cameroun-400000-tonnes-campagne-2026",
    content: "<p>Le Conseil Interprofessionnel du Cacao et du Café (CICC) a fixé un objectif ambitieux de 400 000 tonnes pour la campagne cacaoyère 2025-2026, contre 370 000 tonnes la saison précédente. Cette hausse repose sur l'extension des surfaces cultivées dans la région du Centre et le recours accru à des variétés hybrides à haut rendement.</p>",
    excerpt: "Le Cameroun vise 400 000 tonnes de cacao pour 2025-2026. Un objectif ambitieux qui repose sur de nouvelles surfaces et des variétés hybrides à haut rendement.",
    image: "https://picsum.photos/seed/eco008/800/450",
    category: "Économie", is_premium: false, views: 3120, read_time: 3, days_ago: 92,
  },

  // ── CULTURE (6) ─────────────────────────────────────────────────────────────
  {
    title: "CHAN 2025 : le Cameroun sort en quarts de finale, déception nationale",
    slug: "chan-2025-cameroun-quarts-finale-deception",
    content: "<p>L'équipe nationale du Cameroun a été éliminée en quarts de finale du Championnat d'Afrique des Nations 2025, s'inclinant face au Maroc aux tirs au but. Cette élimination prématurée a suscité une vive déception dans le pays et relancé le débat sur la formation des joueurs évoluant dans le championnat national.</p>",
    excerpt: "Le Cameroun éliminé en quarts au CHAN 2025 par le Maroc aux tirs au but. Une déception qui relance le débat sur le niveau du championnat national.",
    image: "https://picsum.photos/seed/cul001/800/450",
    category: "Culture", is_premium: false, views: 9870, read_time: 3, days_ago: 6,
  },
  {
    title: "Leonora Miano remporte le Grand Prix du Roman de l'Académie française",
    slug: "leonora-miano-grand-prix-roman-academie-francaise",
    content: "<p>Leonora Miano, romancière camerounaise installée en France, a remporté le Grand Prix du Roman de l'Académie française pour son dernier ouvrage. Une consécration internationale pour l'une des voix les plus singulières de la littérature africaine contemporaine.</p>",
    excerpt: "Leonora Miano couronnée par l'Académie française. La romancière camerounaise confirme son statut de grande voix de la littérature africaine contemporaine.",
    image: "https://picsum.photos/seed/cul002/800/450",
    category: "Culture", is_premium: false, views: 2780, read_time: 3, days_ago: 21,
  },
  {
    title: "Cinéma camerounais : « Les Fils de la Terre » sélectionné au festival de Cannes 2026",
    slug: "cinema-camerounais-fils-terre-cannes-2026",
    content: "<p>Le film « Les Fils de la Terre » du réalisateur camerounais Thierry Ntamack a été sélectionné dans la section Un Certain Regard du festival de Cannes 2026. Cette sélection marque une étape majeure pour le septième art camerounais, encore peu présent sur les grands circuits internationaux.</p>",
    excerpt: "« Les Fils de la Terre » en sélection à Cannes : une première pour le cinéma camerounais. Le réalisateur Thierry Ntamack porte la bannière du pays sur la Croisette.",
    image: "https://picsum.photos/seed/cul003/800/450",
    category: "Culture", is_premium: false, views: 4230, read_time: 3, days_ago: 36,
  },
  {
    title: "FESPAM 2026 : le Cameroun sélectionné pour accueillir le festival panafricain de musique",
    slug: "fespam-2026-cameroun-accueillera-festival",
    content: "<p>Le Cameroun a été officiellement désigné pour accueillir la prochaine édition du Festival Panafricain de Musique (FESPAM), en remplacement de Brazzaville qui a renoncé à l'organisation. Yaoundé et Douala partageront les festivités en juillet 2026, avec la participation attendue d'artistes de plus de 40 pays africains.</p>",
    excerpt: "Le Cameroun accueillera le FESPAM 2026. Yaoundé et Douala partagent le podium d'un festival panafricain qui rassemblera 40 pays en juillet.",
    image: "https://picsum.photos/seed/cul004/800/450",
    category: "Culture", is_premium: false, views: 2100, read_time: 3, days_ago: 53,
  },
  {
    title: "Samuel Eto'o : la FECAFOOT présente son bilan à mi-mandat",
    slug: "samuel-etoo-fecafoot-bilan-mi-mandat",
    content: "<p>Samuel Eto'o, président de la Fédération Camerounaise de Football (FECAFOOT) depuis 2021, a présenté un bilan à mi-mandat. Entre les ambitions affichées et les réalisations concrètes, l'écart reste important selon les observateurs du football camerounais, mais certains chantiers ont indéniablement progressé.</p>",
    excerpt: "Eto'o à mi-mandat : promesses tenues ou bilan mitigé ? Le président de la FECAFOOT présente son rapport d'étape face à un football camerounais en attente de renouveau.",
    image: "https://picsum.photos/seed/cul005/800/450",
    category: "Culture", is_premium: false, views: 6780, read_time: 4, days_ago: 74,
  },
  {
    title: "Ngondo 2025 : le festival traditionnel sawa réunit 50 000 participants à Douala",
    slug: "ngondo-2025-festival-sawa-50000-participants",
    content: "<p>Le Ngondo, festival traditionnel des peuples Sawa du littoral camerounais, a rassemblé plus de 50 000 participants sur les rives du Wouri à Douala. Cette édition 2025, placée sous le signe de la préservation de l'environnement aquatique, a donné lieu à des rituels ancestraux et des compétitions sportives traditionnelles.</p>",
    excerpt: "50 000 participants au Ngondo 2025 à Douala. Le festival des peuples Sawa porte cette année un message fort pour la préservation du fleuve Wouri.",
    image: "https://picsum.photos/seed/cul006/800/450",
    category: "Culture", is_premium: false, views: 3450, read_time: 3, days_ago: 90,
  },

  // ── GÉOPOLITIQUE (5) ────────────────────────────────────────────────────────
  {
    title: "Cameroun-Nigeria : la Commission mixte confirme l'avancement de la démarcation frontalière",
    slug: "cameroun-nigeria-commission-demarcation-frontaliere",
    content: "<p>La Commission Mixte Cameroun-Nigeria de la frontière terrestre a tenu sa session ordinaire à Abuja, confirmant l'avancement des travaux de démarcation physique de la frontière issue de l'arrêt de la Cour Internationale de Justice de 2002. Plus de 80 % de la frontière terrestre a désormais été balisée.</p>",
    excerpt: "La frontière Cameroun-Nigeria avance dans sa démarcation. 80 % du tracé terrestre est désormais balisé, 23 ans après l'arrêt historique de la CIJ.",
    image: "https://picsum.photos/seed/geo001/800/450",
    category: "Géopolitique", is_premium: false, views: 2340, read_time: 4, days_ago: 16,
  },
  {
    title: "CEMAC : sommet extraordinaire sur la stabilité financière régionale à Malabo",
    slug: "cemac-sommet-extraordinaire-stabilite-financiere-malabo",
    content: "<p>Les chefs d'État de la Communauté Économique et Monétaire de l'Afrique Centrale (CEMAC) ont tenu un sommet extraordinaire à Malabo pour examiner la situation de la réserve de change commune, dont le niveau est descendu en dessous du seuil minimal de trois mois d'importations. Des mesures d'urgence ont été adoptées pour stabiliser le franc CFA.</p>",
    excerpt: "Sommet CEMAC d'urgence à Malabo : les réserves de change sont au plus bas. Des mesures ont été adoptées pour éviter une crise monétaire en Afrique centrale.",
    image: "https://picsum.photos/seed/geo002/800/450",
    category: "Géopolitique", is_premium: true, views: 3780, read_time: 5, days_ago: 30,
  },
  {
    title: "Sahel : le Cameroun renforce ses frontières face aux flux migratoires et terroristes",
    slug: "cameroun-renforce-frontieres-sahel-migration",
    content: "<p>Face à la dégradation de la situation sécuritaire au Sahel et aux flux migratoires croissants en provenance des pays voisins, le Cameroun a annoncé le déploiement de 3 000 soldats supplémentaires dans la région de l'Extrême-Nord. Des postes de contrôle mixtes armée-gendarmerie ont été installés aux principaux points de passage.</p>",
    excerpt: "Le Cameroun renforce son dispositif militaire à l'Extrême-Nord face aux menaces sahéliennes. 3 000 soldats supplémentaires déployés aux frontières avec le Nigeria et le Tchad.",
    image: "https://picsum.photos/seed/geo003/800/450",
    category: "Géopolitique", is_premium: false, views: 4120, read_time: 4, days_ago: 43,
  },
  {
    title: "Présence française en Afrique : le Cameroun reconsidère-t-il sa relation avec Paris ?",
    slug: "cameroun-france-relation-reconfiguration",
    content: "<p>Dans un contexte de remise en question généralisée de la présence militaire et diplomatique française en Afrique subsaharienne, le Cameroun observe une position délicate entre maintien de ses partenariats historiques et aspiration à une plus grande autonomie stratégique.</p>",
    excerpt: "Le Cameroun entre Paris et l'autonomie : comment Yaoundé navigue dans un contexte de reconfiguration des partenariats franco-africains. Décryptage.",
    image: "https://picsum.photos/seed/geo004/800/450",
    category: "Géopolitique", is_premium: true, views: 5670, read_time: 6, days_ago: 61,
  },
  {
    title: "UA : le Cameroun élu au Conseil de Paix et de Sécurité pour un mandat de deux ans",
    slug: "cameroun-elu-conseil-paix-securite-ua",
    content: "<p>Le Cameroun a été élu membre du Conseil de Paix et de Sécurité de l'Union Africaine pour un mandat de deux ans. Cette élection confère au pays un rôle accru dans la gestion des crises sur le continent africain, notamment en Afrique centrale où plusieurs foyers de tension persistent.</p>",
    excerpt: "Le Cameroun rejoint le Conseil de Paix et de Sécurité de l'UA. Un mandat de deux ans qui renforce son rôle dans la gestion des crises en Afrique centrale.",
    image: "https://picsum.photos/seed/geo005/800/450",
    category: "Géopolitique", is_premium: false, views: 1870, read_time: 3, days_ago: 76,
  },
];

// ─── Insert logic ─────────────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert seed author
    await client.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ('redaction', 'redaction@solitiquo.com',
              '$2b$10$dummyhashforseeding000000000000000000000000000000000',
              'writer', true)
      ON CONFLICT (email) DO NOTHING
    `);

    const { rows } = await client.query(
      `SELECT id FROM users WHERE email = 'redaction@solitiquo.com'`
    );
    const authorId = rows[0].id;

    let inserted = 0;
    for (const a of articles) {
      const publishedAt = new Date(Date.now() - a.days_ago * 86400 * 1000);
      await client.query(
        `INSERT INTO articles
           (title, slug, content, excerpt, featured_image, author_id,
            category, status, language, is_premium, views_count, read_time, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'published','fr',$8,$9,$10,$11)
         ON CONFLICT (slug) DO NOTHING`,
        [
          a.title, a.slug, a.content, a.excerpt, a.image, authorId,
          a.category, a.is_premium, a.views, a.read_time, publishedAt,
        ]
      );
      inserted++;
    }

    await client.query('COMMIT');

    // Summary
    const summary = await pool.query(`
      SELECT category, COUNT(*) AS nb
      FROM articles WHERE status = 'published'
      GROUP BY category ORDER BY nb DESC
    `);
    console.log('\n✅ Seed terminé — Articles publiés par catégorie :');
    console.table(summary.rows);
    console.log(`\n   ${inserted} articles traités (ON CONFLICT DO NOTHING pour les slugs existants)\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur seed :', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
