const mongoose = require('mongoose');

const studentTagPerformanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
    unique: true, // Ensures only one document per student
  },
  // Map to store total questions attempted for each tag
  tags_performed: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  // Map to store correct answers for each tag
  corrected: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  last_updated: { type: Date, default: Date.now },
});

const StudentTagPerformance = mongoose.model('StudentTagPerformance', studentTagPerformanceSchema);
module.exports = StudentTagPerformance;
