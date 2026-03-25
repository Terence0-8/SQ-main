/**
 * Configuration Multer sécurisée
 * Fix #4 - Validation des fichiers uploadés
 */
const multer = require('multer');

// Types MIME autorisés (STRICT)
const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp']; // Removed gif as per request? User said "que image/jpeg..." but usually implies standard images. User listed: jpeg, png, webp. I will stick to this list.
const ALLOWED_AUDIO = ['audio/mpeg']; // User said audio/mpeg. Usually covers mp3.

const ALLOWED_ALL = [...ALLOWED_IMAGES, ...ALLOWED_AUDIO];

// Tailles maximales
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  // 5MB pour images
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB pour audio

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Préfixe selon le type de fichier
        const prefix = ALLOWED_AUDIO.includes(file.mimetype) ? 'audio-' : 'img-';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

        // Fix #SECURITY: Force extension based on MIME type instead of original name
        const MIME_TO_EXT = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'audio/mpeg': '.mp3'
        };
        const ext = MIME_TO_EXT[file.mimetype] || '.bin'; // Fallback safe

        cb(null, prefix + uniqueSuffix + ext);
    }
});

// Filtre de fichiers
const fileFilter = (allowedTypes) => (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Type de fichier non autorisé. Types acceptés: ${allowedTypes.join(', ')}`), false);
    }
};

// Export des configurations prêtes à l'emploi
module.exports = {
    // Pour les images uniquement
    imageUpload: multer({
        storage,
        limits: { fileSize: MAX_IMAGE_SIZE },
        fileFilter: fileFilter(ALLOWED_IMAGES)
    }),

    // Pour l'audio uniquement
    audioUpload: multer({
        storage,
        limits: { fileSize: MAX_AUDIO_SIZE },
        fileFilter: fileFilter(ALLOWED_AUDIO)
    }),

    // Pour images + audio (podcasts, partis)
    mixedUpload: multer({
        storage,
        limits: { fileSize: MAX_AUDIO_SIZE }, // Limite audio (plus grande)
        fileFilter: fileFilter(ALLOWED_ALL)
    }),

    // Constantes exportées pour réutilisation
    ALLOWED_IMAGES,
    ALLOWED_AUDIO,
    ALLOWED_ALL
};
