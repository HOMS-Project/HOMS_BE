const uploadService = require('../services/uploadService');
const cloudinaryService = require('../services/cloudinaryService');

const getPresignUrl = async (req, res) => {
  try {
    const { filename, contentType } = req.query;
    if (!filename) return res.status(400).json({ success: false, message: 'filename is required' });
    const result = await uploadService.getPresignUrl(filename, contentType);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('getPresignUrl error', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

// Kick off processing to HLS. This may be long-running; we return the manifest URL when done.
const processToHLS = async (req, res) => {
  try {
    const { key, bucket, targetPrefix } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'key is required' });

    // Fire-and-forget: start processing but return 202 accepted with job info.
    // The service returns a Promise that resolves to { manifestUrl } when done.
    uploadService.processToHLS({ key, bucket, targetPrefix })
      .then(result => {
        console.log('HLS processing finished for', key, result);
      })
      .catch(err => {
        console.error('HLS processing failed for', key, err);
      });

    return res.status(202).json({ success: true, message: 'Processing started' });
  } catch (err) {
    console.error('processToHLS error', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

const uploadSurveyMedia = async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: ' [uploadController] No files provided for upload.' });
    }

    const uploadedObjects = await cloudinaryService.uploadMultipleFiles(files, 'survey-media');

    return res.status(200).json({ success: true, data: uploadedObjects });
  } catch (err) {
    console.error('uploadSurveyMedia error', err);
    return res.status(500).json({ success: false, message: err.message || ' [uploadController] Failed to upload media to Cloudinary.' });
  }
};

const uploadChatMedia = async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No files provided for upload.' });
    }

    const uploadedObjects = await cloudinaryService.uploadMultipleFiles(files, 'chat-media');

    return res.status(200).json({ success: true, data: uploadedObjects });
  } catch (err) {
    console.error('uploadChatMedia error', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to upload media to Cloudinary.' });
  }
};

module.exports = {
  getPresignUrl,
  processToHLS,
  uploadSurveyMedia,
  uploadChatMedia
};
