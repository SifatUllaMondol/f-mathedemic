const mongoose = require('mongoose');

const qaSchema = new mongoose.Schema({
  doc_type_num: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedDocument' },
  type: { type: Number, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  tags: { type: [String], default: null }, // Store tags as an array of strings

  // NEW difficulty field
  difficulty: {
    type: String,
    enum: ['easy','medium','hard'],
    default: 'medium'
  },
}, {
  collection: 'qas',   // <— explicitly bind to the “qnas” collection
  strict:     false
});
// 
const QA = mongoose.model('QA', qaSchema);
module.exports = QA;