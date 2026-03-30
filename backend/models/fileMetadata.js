const { MongoClient } = require('mongodb');

// This is a plain schema definition (used as documentation + validation reference).
// Actual inserts go through the native MongoDB client in server.js.
//
// Schema:
// {
//   file_name:    String   — original filename
//   file_url:     String   — S3 object key (NOT public URL)
//   file_type:    String   — mime type or extension
//   section:      String   — submission stage key (e.g. "progress1")
//   project_id:   String   — assignment _id
//   uploaded_by:  String   — mentee email
//   remark:       String   — mentor remark (default: "Pending Review")
//   createdAt:    Date
//   updatedAt:    Date
// }

module.exports = {
  COLLECTION: 'file_metadata',
  ALLOWED_EXTENSIONS: ['pdf', 'ppt', 'pptx', 'mp4', 'mkv', 'docs', 'docx', 'txt', 'zip'],
  MAX_SIZE_MB: 100,
  // MIME type map for pre-signed PUT Content-Type header
  MIME_MAP: {
    pdf:  'application/pdf',
    ppt:  'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp4:  'video/mp4',
    mkv:  'video/x-matroska',
    docs: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt:  'text/plain',
    zip:  'application/zip',
  },
};
