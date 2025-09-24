// scripts/sampleQS.js
require('dotenv').config();              // ← load .env before anything else
const mongoose = require('mongoose');
const QA       = require('../models/QA'); // adjust path if needed

async function seed() {
  // Now MONGODB_URI will be defined
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser:    true,
    useUnifiedTopology: true
  });

  // Insert some sample questions for the "arrays" tag
  const docs = [
    {
      type:       1,
      question:   'What is an array?',
      answer:     'Ans: An array is a collection of items stored at contiguous memory locations.',
      tags:       ['arrays'],
      difficulty: 'easy'
    },
    {
      type:       1,
      question:   'How do you access the third element of an array in JavaScript?',
      answer:     'Ans: By using array[2], since indexing is zero-based.',
      tags:       ['arrays'],
      difficulty: 'medium'
    },
    {
      type:       1,
      question:   'How would you loop through every element in a JavaScript array?',
      answer:     'Ans: Using for/for…of/map/forEach, e.g. for (const el of array) { … }.',
      tags:       ['arrays'],
      difficulty: 'medium'
    }
  ];

  const res = await QA.insertMany(docs);
  console.log(`Seeded ${res.length} questions for tag "arrays".`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
