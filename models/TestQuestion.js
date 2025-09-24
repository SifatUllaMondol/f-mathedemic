const mongoose = require('mongoose');

const testQuestionSchema = new mongoose.Schema({
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'QA' },
  student_answer: { type: String, default: null },
  is_correct: { type: Boolean, default: false },
});

const TestQuestion = mongoose.model('TestQuestion', testQuestionSchema);
module.exports = TestQuestion;