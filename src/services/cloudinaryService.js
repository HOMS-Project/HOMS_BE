const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a single file buffer to Cloudinary via stream.
 * @param {Buffer} fileBuffer - The file buffer in memory
 * @param {string} originalName - Original file name
 * @param {string} folder - Destination folder on Cloudinary (e.g., 'survey-media')
 * @returns {Promise<Object>} - Resolves with { url, publicId, resourceType }
 */
const uploadStreamToCloudinary = (fileBuffer, originalName, folder = 'survey-media') => {
  return new Promise((resolve, reject) => {
    // Sanitize string for public_id
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const publicId = `${folder}/${Date.now()}_${safeName}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "auto", // Automatically detects image vs video
        folder: folder,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
        });
      }
    );

    // Pipe the in-memory buffer into the Cloudinary stream
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Uploads an array of files to Cloudinary concurrently.
 * @param {Array} files - Array of multer file objects
 * @param {string} folder - Destination folder 
 * @returns {Promise<Array>} - Resolves with an array of result objects
 */
const uploadMultipleFiles = async (files = [], folder = 'survey-media') => {
  if (!files.length) return [];

  const uploadPromises = files.map((file) =>
    uploadStreamToCloudinary(file.buffer, file.originalname, folder)
  );

  return Promise.all(uploadPromises);
};

module.exports = {
  uploadStreamToCloudinary,
  uploadMultipleFiles
};
