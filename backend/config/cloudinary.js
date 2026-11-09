const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
} else {
    // Avertissement doux sans crasher l'application
    console.warn('⚠️  Configuration Cloudinary incomplète (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY ou CLOUDINARY_API_SECRET absent). Les uploads média échoueront si sollicités.');
}

module.exports = cloudinary;
