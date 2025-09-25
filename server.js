const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const bcrypt = require('bcryptjs'); // Import bcryptjs for password hashing
const QA = require('./models/QA');
const UploadedDocument = require('./models/UploadedDocument');
const Tag = require('./models/Tag');
const StudentTagPerformance = require('./models/StudentTagPerformance');
const Test = require('./models/Test');
const TestQuestion = require('./models/TestQuestion');
const User = require('./models/user'); 
const { extractTextFromFile, parseQuestions } = require('./utils');
const fs = require('fs/promises');
const ChatHistory = require('./models/ChatHistory');

const { getPracticeByTag, getExplanationForQuestion, chatWithTutor } = require('./services/smythos');

const app = express();
require('dotenv').config();

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static('public'));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Database Connection
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));


/*
------------------------------------------------------------------------------------------------------------------------
*/

/**
 * @route   POST /api/create-user
 * @desc    Adds a new user to the database with a hashed password.
 * @access  Public
 */
router.post('/create-user', async (req, res) => {
    try {
        const { username, email, contact, age, type, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }

        // Hash the password with a salt
        const salt = await bcrypt.genSalt(10); // Generate a salt
        const hashedPassword = await bcrypt.hash(password, salt); // Hash the password

        // Create a new User document
        const newUser = new User({
            username,
            email,
            contact,
            age,
            type,
            password: hashedPassword // Store the hashed password
        });

        await newUser.save();
        res.status(201).json({ message: 'User added successfully!', user: newUser });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user.', details: error.message });
    }
});

/**
/**
 * @route   POST /api/upload-document
 * @desc    Uploads a document, extracts Q&A, and saves to the database.
 * @access  Public (or authenticated if needed)
 */
router.post('/upload-document', upload.single('file'), async (req, res) => {
  try {
    const { type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    // Save the uploaded document metadata
    const document = new UploadedDocument({
      file: file.path,
      type: type ? parseInt(type) : null,
    });
    await document.save();

    // Extract text and parse questions
    const text = await extractTextFromFile(file.path);
    if (!text) {
      await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
      return res.status(400).json({ error: 'No text extracted from file.' });
    }

    const qas = parseQuestions(text);
    if (qas.length === 0) {
      await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
      return res.status(400).json({ error: 'No valid questions found in file.' });
    }


    // Prepare tags and Q&A for bulk insert
    const tagsToInsert = new Set();
    const qasToInsert = [];

    for (const [question, tags, difficulty_level, answer] of qas) {
      // Validate question and answer
      if (!question || typeof question !== 'string' || !answer || typeof answer !== 'string') {
        console.warn('Skipping invalid Q&A:', { question, tags, answer });
        continue;
      }

      // Ensure tags is an array
      const tagsArray = Array.isArray(tags) ? tags : [];
      tagsArray.forEach(t => tagsToInsert.add(t));

      qasToInsert.push({
        question: question.trim(),
        answer: answer.trim(),
        tags: tagsArray,
        doc_type_num: document._id,
        type: document.type,
        difficulty: difficulty_level
      });
    }

    if (qasToInsert.length === 0) {
      await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
      return res.status(400).json({ error: 'No valid Q&As to insert.' });
    }

    // Save tags and Q&A to the database
    const tagPromises = Array.from(tagsToInsert).map(name =>
      Tag.findOneAndUpdate(
        { name },
        { name },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );
    await Promise.all(tagPromises);

    const savedQAs = await QA.insertMany(qasToInsert);

    // Clean up the uploaded file
    await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));

    res.status(201).json({
      message: 'File uploaded and processed successfully!',
      questions: savedQAs,
    });
  } catch (error) {
    console.error('Error processing document:', error.message);
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => console.error('Error deleting file:', err));
    }
    res.status(500).json({ error: 'Failed to upload document.', details: error.message });
  }
});

/*
------------------------------------------------------------------------------------------------------------------------
*/
/**
 * @route GET /api/tags
 * @desc Retrieves all unique tags from the database.
 * @access Public
 */
router.get('/tags', async (req, res) => {
  try {
    const tags = await Tag.find({}).lean(); // .lean() returns plain JS objects, which is faster
    if (tags.length === 0) {
      return res.status(404).json({ message: 'No tags found.' });
    }
    const tagNames = tags.map(tag => tag.name);
    res.status(200).json({ tags: tagNames });
  } catch (err) {
    console.error('Error in GET /api/tags:', err);
    res.status(500).json({ error: 'Failed to fetch tags.', details: err.message });
  }
});

/**
 * @route POST /api/login
 * @desc Authenticate a user by email and password, then return a JWT.
 * @access Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Compare the submitted password with the stored hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials.' });
        }

        // Create and sign a JSON Web Token
        const token = jwt.sign(
            { userId: user._id, usertype: user.usertype },
            process.env.JWT_SECRET,
            { expiresIn: '10h' } // Token expires in 1 hour
        );

        res.status(200).json({message: 'Login successful.', token, userId: user._id, usertype: user.usertype});
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to log in.', details: error.message });
    }
});

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Get the token from "Bearer TOKEN"

    if (token == null) {
        return res.status(401).json({ error: 'Authentication token required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user; // Attach user payload to the request
        next();
    });
};

/**
 * @route   GET /api/test
 * @desc    Generates and returns 5 random questions for a test for a specific user.
 * @access  Authenticated (protected by middleware)
 */
router.get('/test', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user; // Get userId from the authenticated token payload
    const questionType = 1; // This would be dynamic based on your logic

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required to start a test.' });
    }

    // Get a random sample of 5 questions of a specific type
    const questions = await QA.aggregate([
      { $match: { type: questionType } },
      { $sample: { size: 5 } },
    ]);

    if (questions.length === 0) {
      return res.status(404).json({ message: 'No questions found for this type.' });
    }

    // Create a new Test document
    const test = new Test({
      student: userId,
      completed: false,
    });
    await test.save();

    // Create TestQuestion documents for each selected question
    const testQuestions = questions.map(q => ({
      test: test._id,
      question: q._id,
    }));
    await TestQuestion.insertMany(testQuestions);

    // Return the questions to the client
    res.status(200).json({
      testId: test._id,
      questions: questions.map(q => ({
        _id: q._id,
        question: q.question,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve test questions.' });
    }
});

/*
------------------------------------------------------------------------------------------------------------------------
*/
/*
------------------------------------------------------------------------------------------------------------------------
*/

/**
 * @route   POST /api/submit-test/:testId
 * @desc    Receives student answers, checks correctness, and updates performance.
 * @access  Public (or authenticated)
 */
router.post('/submit-test/:testId', async (req, res) => {
  try {
    const { testId } = req.params;
    const { answers, userId } = req.body; // `answers` is an array, get userId from body

    if (!answers || !userId) {
      return res.status(400).json({ error: 'Answers and User ID are required.' });
    }

    const test = await Test.findById(testId);
    if (!test || test.student.toString() !== userId.toString()) {
      return res.status(404).json({ error: 'Test not found or does not belong to user.' });
    }

    const results = [];
    const performanceUpdates = {}; // A plain object to aggregate updates

    for (const answer of answers) {
      const { questionId, studentAnswer } = answer;
      const question = await QA.findById(questionId);

      if (!question) continue;

      // Clean the correct answer to remove the "Ans: " prefix
      const cleanedCorrectAnswer = question.answer.replace(/^Ans:\s*/, '');
      
      const isCorrect = studentAnswer.trim().toLowerCase() === cleanedCorrectAnswer.trim().toLowerCase();
      results.push({
        question: question.question,
        correct_answer: question.answer,
        student_answer: studentAnswer,
        is_correct: isCorrect,
      });

      // Update TestQuestion model
      await TestQuestion.findOneAndUpdate(
        { test: testId, question: questionId },
        { student_answer: studentAnswer, is_correct: isCorrect }
      );

      // Aggregate performance updates in our local object
      if (question.tags && Array.isArray(question.tags)) {
        for (const tagName of question.tags) {
          if (!performanceUpdates[tagName]) {
            performanceUpdates[tagName] = { total: 0, correct: 0 };
          }
          performanceUpdates[tagName].total += 1;
          if (isCorrect) {
            performanceUpdates[tagName].correct += 1;
          }
        }
      }
    }
    

    // Find or create the student's performance document
        const performanceDoc = await StudentTagPerformance.findOneAndUpdate(
            { student: userId },
            { $setOnInsert: { student: userId } },
            { upsert: true, new: true }
        );

        // Manually update the Map fields
        for (const tagName in performanceUpdates) {
            const update = performanceUpdates[tagName];
            
            const currentTotal = performanceDoc.tags_performed.get(tagName) || 0;
            const newTotal = currentTotal + update.total;
            performanceDoc.tags_performed.set(tagName, newTotal);

            const currentCorrect = performanceDoc.corrected.get(tagName) || 0;
            const newCorrect = currentCorrect + update.correct;
            performanceDoc.corrected.set(tagName, newCorrect);
        }

        // Mark the maps as modified for Mongoose to save changes
        performanceDoc.markModified('tags_performed');
        performanceDoc.markModified('corrected');
        performanceDoc.last_updated = new Date();
        await performanceDoc.save();

    // Mark test as completed
    test.completed = true;
    await test.save();

    // Serialize the results object to a JSON string
    const resultsJson = JSON.stringify(results);

    // URI-encode the JSON string to safely pass it in a URL
    const encodedResults = encodeURIComponent(resultsJson);

    // Redirect the user to the results page with the encoded data in the URL
    res.status(200).json({ results });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit test results.' });
  }
});

/*
------------------------------------------------------------------------------------------------------------------------
*/

/**
 * @route   GET /api/practice/:tag
 * @desc    Return a practice set for a given tag, powered by SmythOS
 * @access  Authenticated
 */
router.get('/practice/:tag', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { tag } = req.params;
    const desiredCount = parseInt(req.query.count, 10) || 5;

    const rawAuth = req.headers['authorization'];
    const authToken = rawAuth && rawAuth.split(' ')[1];

    // 1) Query your SmythOS agent
    const { questions: aiQs = [] } = await getPracticeByTag({
      userId, tag, desiredCount, authToken
    });

    console.log('AI questions received:', aiQs.length);
    console.log('AI questions sample:', aiQs[0]);

    // Normalize AI questions to match fallback format
    const normalizedAiQs = aiQs.map(q => ({
      _id: q._id,
      question: q.question,
      answer: q.answer,
      tags: q.tags
    }));

    // 2) Fallback only if we got FEWER than desired questions from AI
    let questions = normalizedAiQs;
    if (normalizedAiQs.length == 0) {
      const remaining = desiredCount - normalizedAiQs.length;
      // In your fallback section, replace the aggregate with:
      const fallback = await QA.aggregate([
        { $match: { tags: tag } },
        { $sample: { size: remaining * 2 } } // Get more than needed
      ])
      .project({ _id: 1, question: 1, tags: 1, answer: 1 });

      // Deduplicate
      const uniqueFallback = [];
      const seen = new Set();
      fallback.forEach(q => {
        const key = q.question?.trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          uniqueFallback.push(q);
        }
      });

      // Take only what we need
      questions = [...normalizedAiQs, ...uniqueFallback.slice(0, remaining)];
    }

    res.status(200).json({
      questions,
      source: normalizedAiQs.length > 0 ? 'ai' : 'fallback',
      aiCount: normalizedAiQs.length,
      fallbackCount: questions.length - normalizedAiQs.length
    });
  } catch (error) {
    console.error('Practice route error:', error);
    res.status(500).json({ error: 'Failed to fetch practice questions.' });
  }
});

/*
------------------------------------------------------------------------------------------------------------------------
*/

/**
 * @route   POST /api/submit-practice
 * @desc    Submit practice answers and update performance
 * @access  Authenticated
 */
router.post('/submit-practice', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { answers, tag } = req.body; // `answers` is an array of {questionId, studentAnswer}

    if (!answers || !tag) {
      return res.status(400).json({ error: 'Answers and tag are required.' });
    }

    const results = [];
    const performanceUpdates = {};

    for (const answer of answers) {
      const { questionId, studentAnswer } = answer;
      const question = await QA.findById(questionId);

      if (!question) continue;

      // Clean the correct answer to remove any prefix
      const cleanedCorrectAnswer = question.answer.replace(/^Ans:\s*/, '');
      
      const isCorrect = studentAnswer.trim().toLowerCase() === cleanedCorrectAnswer.trim().toLowerCase();
      
      results.push({
        question: question.question,
        correct_answer: question.answer,
        student_answer: studentAnswer,
        is_correct: isCorrect,
      });

      // Aggregate performance updates
      if (question.tags && Array.isArray(question.tags)) {
        for (const tagName of question.tags) {
          if (!performanceUpdates[tagName]) {
            performanceUpdates[tagName] = { total: 0, correct: 0 };
          }
          performanceUpdates[tagName].total += 1;
          if (isCorrect) {
            performanceUpdates[tagName].correct += 1;
          }
        }
      }
    }

    // Update student performance
    const performanceDoc = await StudentTagPerformance.findOneAndUpdate(
      { student: userId },
      { $setOnInsert: { student: userId } },
      { upsert: true, new: true }
    );

    // Update the Map fields
    for (const tagName in performanceUpdates) {
      const update = performanceUpdates[tagName];
      
      const currentTotal = performanceDoc.tags_performed.get(tagName) || 0;
      const newTotal = currentTotal + update.total;
      performanceDoc.tags_performed.set(tagName, newTotal);

      const currentCorrect = performanceDoc.corrected.get(tagName) || 0;
      const newCorrect = currentCorrect + update.correct;
      performanceDoc.corrected.set(tagName, newCorrect);
    }

    // Mark the maps as modified for Mongoose to save changes
    performanceDoc.markModified('tags_performed');
    performanceDoc.markModified('corrected');
    performanceDoc.last_updated = new Date();
    await performanceDoc.save();

    res.status(200).json({ 
      message: 'Practice submitted successfully!',
      results,
      tag,
      totalQuestions: answers.length,
      correctAnswers: results.filter(r => r.is_correct).length,
      performanceUpdated: true
    });

  } catch (error) {
    console.error('Practice submission error:', error);
    res.status(500).json({ error: 'Failed to submit practice results.' });
  }
});

/*
------------------------------------------------------------------------------------------------------------------------
*/


/*
Get questions by tag and difficulty
*/
router.get(
  '/questions',
  authenticateToken,
  async (req, res) => {
    try {
      const { tag, difficulties, limit } = req.query;

      if (!tag || !difficulties) {
        return res
          .status(400)
          .json({ error: 'Both tag and difficulties are required in query.' });
      }

      // Parse CSV difficulties → ['easy','medium']
      const diffArray = String(difficulties)
        .split(',')
        .map(d => d.trim())
        .filter(Boolean);

      // Ensure limit is a positive integer
      const max = Math.max(parseInt(limit, 10) || 10, 1);

      // Query the qnas collection via your QA model
      const questions = await QA.find({
        tags:       tag,
        difficulty: { $in: diffArray }
      })
      .limit(max)
      .lean();

      return res.json({ questions });
    } catch (err) {
      console.error('GET /api/questions error:', err);
      return res
        .status(500)
        .json({ error: 'Failed to fetch questions.', details: err.message });
    }
  }
);

/**
 * @route   POST /api/get-explanation
 * @desc    Get explanation for a question the user got wrong
 * @access  Authenticated
 */
router.post('/get-explanation', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { question, userAnswer, correctAnswer } = req.body;

    if (!question || !userAnswer || !correctAnswer) {
      return res.status(400).json({ error: 'Question, userAnswer, and correctAnswer are required.' });
    }

    const rawAuth = req.headers['authorization'];
    const authToken = rawAuth && rawAuth.split(' ')[1];

    // No need to require again since it's already imported at the top
    const explanationData = await getExplanationForQuestion({
      userId,
      question,
      userAnswer,
      correctAnswer,
      authToken
    });

    res.status(200).json(explanationData);

  } catch (error) {
    console.error('Explanation route error:', error);
    res.status(500).json({ error: 'Failed to get explanation.' });
  }
});

/**
 * @route   GET /api/profile
 * @desc    Return current user info + tag-performance map
 * @access  Authenticated
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // 1) Fetch user (omit password)
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 2) Fetch performance doc for this student
    const perfDoc = await StudentTagPerformance.findOne({ student: userId });

    // 3) Build tag → stats map
    const performance = {};
    if (perfDoc) {
      for (const [tag, total] of perfDoc.tags_performed.entries()) {
        const correctCount = perfDoc.corrected.get(tag) || 0;
        performance[tag] = {
          total,
          correct: correctCount,
          percentage:
            total > 0
              ? Math.round((correctCount / total) * 100)
              : 0
        };
      }
    }

    // 4) Return JSON
    return res.status(200).json({ user, performance });
  } catch (err) {
    console.error('Error in GET /api/profile:', err);
    return res
      .status(500)
      .json({ error: 'Failed to fetch profile.', details: err.message });
  }
});

/**
 * @route   PUT /api/profile
 * @desc    Update user’s profile info
 * @access  Authenticated
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { username, password, age, contact } = req.body;
    const updates = {};

    if (username) updates.username = username;
    if (age)      updates.age      = age;
    if (contact)  updates.contact  = contact;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res
      .status(200)
      .json({ message: 'Profile updated.', user: updatedUser });
  } catch (err) {
    console.error('Error in PUT /api/profile:', err);
    return res
      .status(500)
      .json({ error: 'Failed to update profile.', details: err.message });
  }
});

/**
 * @route   POST /api/chatbot
 * @desc    Chat with AI tutor and save conversation history
 * @access  Authenticated
 */
router.post('/chatbot', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const rawAuth = req.headers['authorization'];
    const authToken = rawAuth && rawAuth.split(' ')[1];
    
    // Get or create chat history for user
    let chatHistory = await ChatHistory.findOne({ student: userId });
    
    if (!chatHistory) {
      chatHistory = new ChatHistory({
        student: userId,
        messages: []
      });
    }

    // Add user message to history
    chatHistory.messages.push({
      role: 'user',
      content: message.trim()
    });

    // Save user message first
    await chatHistory.save();

    // Get AI response
    const chatData = await chatWithTutor({
      userId,
      message: message.trim(),
      authToken
    });

    // Add AI response to history
    chatHistory.messages.push({
      role: 'assistant',
      content: chatData.response
    });

    chatHistory.last_updated = new Date();
    await chatHistory.save();

    res.status(200).json(chatData);

  } catch (error) {
    console.error('Chatbot route error:', error);
    res.status(500).json({ 
      response: "Sorry, I'm experiencing technical difficulties. Please try again.",
      suggestions: ["Wait a moment and try again", "Check your connection"],
      relatedTags: [],
      confidenceScore: 0,
      followUpQuestions: []
    });
  }
});

/**
 * @route   GET /api/chatbot/history
 * @desc    Get user's chat history
 * @access  Authenticated
 */
router.get('/chatbot/history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    const chatHistory = await ChatHistory.findOne({ student: userId })
      .sort({ last_updated: -1 });

    if (!chatHistory) {
      return res.status(200).json({ messages: [] });
    }

    res.status(200).json({
      messages: chatHistory.messages,
      sessionStart: chatHistory.session_start,
      lastUpdated: chatHistory.last_updated
    });

  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history.' });
  }
});

/**
 * @route   DELETE /api/chatbot/history
 * @desc    Clear user's chat history
 * @access  Authenticated
 */
router.delete('/chatbot/history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    await ChatHistory.findOneAndDelete({ student: userId });

    res.status(200).json({ message: 'Chat history cleared successfully.' });

  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({ error: 'Failed to clear chat history.' });
  }
});

// Mount all these routes under /api
app.use('/api', router);

// Your other root‐level routes (e.g., serving profile.html) can stay below
// app.get('/profile', authenticateToken, (req, res) => { … });

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

