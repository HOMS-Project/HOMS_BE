const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload a single buffer to Cloudinary via streaming
const uploadBuffer = (fileBuffer, originalName, folder = "staff-evidence") => {
  return new Promise((resolve, reject) => {
    const safeName = originalName ? originalName.replace(/\s+/g, "_") : "file";
    const publicId = `${folder}/${Date.now()}_${safeName}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "auto",
        folder,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      },
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// Upload multiple files concurrently and return secure URLs
const uploadImages = async (files = [], folder = "staff-evidence") => {
  if (!Array.isArray(files) || !files.length) return [];
  const uploads = files.map((file) =>
    uploadBuffer(file.buffer, file.originalname, folder),
  );
  return Promise.all(uploads);
};

module.exports = {
  uploadImages,
};
