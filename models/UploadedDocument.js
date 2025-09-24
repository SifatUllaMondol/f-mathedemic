const mongoose = require('mongoose');

const uploadedDocumentSchema = new mongoose.Schema({
  file: { type: String, required: true }, // The path to the uploaded file
  uploaded_at: { type: Date, default: Date.now },
  type: { type: Number, default: null },
});

const UploadedDocument = mongoose.model('UploadedDocument', uploadedDocumentSchema);
module.exports = UploadedDocument;