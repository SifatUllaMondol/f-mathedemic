const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // This is the new, important part
    required: true,
  },
  completed: { type: Boolean, default: false },
});

const Test = mongoose.model('Test', testSchema);
module.exports = Test;