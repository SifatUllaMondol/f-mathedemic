const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatHistorySchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [chatMessageSchema],
  last_updated: {
    type: Date,
    default: Date.now
  },
  session_start: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create index for faster queries
chatHistorySchema.index({ student: 1, last_updated: -1 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);