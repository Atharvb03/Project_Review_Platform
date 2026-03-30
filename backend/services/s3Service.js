const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/s3");

const BUCKET = process.env.S3_BUCKET_NAME;
const EXPIRES_IN = 300; // 5 minutes

/**
 * Generate a pre-signed PUT URL for direct S3 upload.
 * Key structure: mentee-uploads/{userId}/{projectId}/{fileName}
 *
 * @param {string} fileName  - Original file name
 * @param {string} fileType  - MIME type (e.g. "application/pdf")
 * @param {string} userId    - Mentee email or ID
 * @param {string} projectId - Assignment/project ID
 * @returns {{ uploadUrl: string, key: string }}
 */
async function generateUploadUrl(fileName, fileType, userId, projectId) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `mentee-uploads/${userId}/${projectId}/${safeFileName}`;

  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });
  return { uploadUrl, key };
}

/**
 * Generate a pre-signed GET URL for secure file access.
 *
 * @param {string} key - S3 object key
 * @returns {string} Signed URL valid for 5 minutes
 */
async function generateDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key,
  });

  return getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });
}

module.exports = { generateUploadUrl, generateDownloadUrl };
