// services/smythos.js
require('dotenv').config();
const axios = require('axios');
const AGENT_URL = process.env.SMYTHOS_SKILLCOACH_URL;
const API_KEY   = process.env.SMYTHOS_API_KEY;

async function getPracticeByTag({ userId, tag, desiredCount = 5, authToken }) {
  if (!AGENT_URL) {
    console.log('❌ No agent URL configured');
    return { questions: [] };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  console.log('=== SMYTHOS AGENT REQUEST ===');
  console.log('URL:', AGENT_URL);
  console.log('Payload:', { userId, tag, desiredCount, authToken: authToken ? '***' : 'MISSING' });

  try {
    const response = await axios.post(
      AGENT_URL,
      { userId, tag, desiredCount, authToken },
      { headers, timeout: 10000 }
    );
    
    console.log('✅ Agent response status:', response.status);
    console.log('✅ Agent response data type:', Array.isArray(response.data) ? 'Array' : 'Object');
    
    // Extract questions from APIOutput only
    let questions = [];
    
    if (Array.isArray(response.data)) {
      // Find the APIOutput object in the array
      const apiOutput = response.data.find(item => item.name === 'APIOutput');
      questions = apiOutput?.result?.Output?.questions || [];
    } else {
      // Handle single object response (backward compatibility)
      questions = response.data?.result?.Output?.questions || [];
    }
    
    console.log('✅ Extracted questions count:', questions.length);
    console.log('✅ First question:', questions[0]);

    // Add this after extracting questions
    console.log('=== QUESTION CONTENT ANALYSIS ===');
    const questionTexts = questions.map(q => q.question?.trim().toLowerCase());
    const uniqueTexts = new Set(questionTexts);
    console.log(`Total questions: ${questions.length}, Unique questions: ${uniqueTexts.size}`);

    if (questions.length !== uniqueTexts.size) {
      console.log('⚠️  DUPLICATES FOUND IN AGENT RESPONSE');
      // Log duplicates
      const duplicates = questionTexts.filter((text, index) => questionTexts.indexOf(text) !== index);
      console.log('Duplicate questions:', duplicates);
    }
    
    return { questions };
    
  } catch (err) {
    console.error('❌ Skill-Coach agent error:');
    console.error('Error message:', err.message);
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    
    return { questions: [] };
  }
}

module.exports = { getPracticeByTag };
