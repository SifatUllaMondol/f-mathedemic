const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    contact: { type: String, default: null },
    age: { type: Number, required: true },
    usertype: { type: Number, default: 1 },
    type_accuracy: { type: Number, default: null },
    registration_date: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
