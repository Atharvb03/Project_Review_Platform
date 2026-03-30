const { generateUploadUrl, generateDownloadUrl } = require("../services/s3Service");

/**
 * POST /api/upload-url
 * Body: { fileName, fileType, userId, projectId }
 * Returns a pre-signed PUT URL + the S3 key to store in DB
 */
async function getUploadUrl(req, res) {
  const { fileName, fileType, userId, projectId } = req.body;

  if (!fileName || !fileType || !userId || !projectId) {
    return res.status(400).json({
      success: false,
      message: "fileName, fileType, userId, and projectId are required",
    });
  }

  try {
    const { uploadUrl, key } = await generateUploadUrl(fileName, fileType, userId, projectId);
    res.json({ success: true, uploadUrl, key });
  } catch (err) {
    console.error("getUploadUrl error:", err);
    res.status(500).json({ success: false, message: "Failed to generate upload URL" });
  }
}

/**
 * POST /api/download-url
 * Body: { key }
 * Returns a pre-signed GET URL valid for 5 minutes
 */
async function getDownloadUrl(req, res) {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ success: false, message: "key is required" });
  }

  try {
    const downloadUrl = await generateDownloadUrl(key);
    res.json({ success: true, downloadUrl });
  } catch (err) {
    console.error("getDownloadUrl error:", err);
    res.status(500).json({ success: false, message: "Failed to generate download URL" });
  }
}

module.exports = { getUploadUrl, getDownloadUrl };
