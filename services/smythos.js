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

async function getExplanationForQuestion({ userId, question, userAnswer, correctAnswer, authToken }) {
  if (!AGENT_URL) {
    console.log('❌ No agent URL configured');
    return { 
      explanation: null,
      commonMistakes: [],
      concept: '',
      tips: []
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  // Use the correct endpoint for explanations
  const explanationUrl = AGENT_URL.replace('/practice-by-tag', '/getExplanationForQuestion');
  
  const payload = {
    userId: userId,
    question: question,
    userAnswer: userAnswer,
    correctAnswer: correctAnswer,
    authToken: authToken,
    requestType: "explanation"
  };

  console.log('=== SMYTHOS EXPLANATION REQUEST ===');
  console.log('URL:', explanationUrl);
  console.log('Payload:', payload);

  try {
    const response = await axios.post(
      explanationUrl, // Use the corrected URL
      payload,
      { headers, timeout: 15000 }
    );
    
    console.log('✅ Explanation response status:', response.status);
    console.log('🔍 FULL RESPONSE DATA:', JSON.stringify(response.data, null, 2));
    
    let explanationData = {
      explanation: null,
      commonMistakes: [],
      concept: '',
      tips: []
    };
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      // Try to find explanation in array response
      const apiOutput = response.data.find(item => item.name === 'APIOutput');
      if (apiOutput?.result?.Output) {
        explanationData = {
          explanation: apiOutput.result.Output.explanation || null,
          commonMistakes: apiOutput.result.Output.commonMistakes || [],
          concept: apiOutput.result.Output.concept || '',
          tips: apiOutput.result.Output.tips || []
        };
      } else {
        // Try to extract from first item in array
        const firstItem = response.data[0];
        explanationData = {
          explanation: firstItem.explanation || firstItem.result?.Output?.explanation || null,
          commonMistakes: firstItem.commonMistakes || firstItem.result?.Output?.commonMistakes || [],
          concept: firstItem.concept || firstItem.result?.Output?.concept || '',
          tips: firstItem.tips || firstItem.result?.Output?.tips || []
        };
      }
    } else if (typeof response.data === 'object' && response.data !== null) {
      // Handle object response
      explanationData = {
        explanation: response.data.explanation || response.data.result?.Output?.explanation || null,
        commonMistakes: response.data.commonMistakes || response.data.result?.Output?.commonMistakes || [],
        concept: response.data.concept || response.data.result?.Output?.concept || '',
        tips: response.data.tips || response.data.result?.Output?.tips || []
      };
    }
    
    console.log('✅ Final explanation data:', explanationData);
    return explanationData;
    
  } catch (err) {
    console.error('❌ Skill-Coach explanation error:');
    console.error('Error message:', err.message);
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    
    // Return a fallback explanation
    const fallbackExplanation = {
      explanation: `The correct answer is "${correctAnswer}" because ${question}. Your answer "${userAnswer}" was incorrect.`,
      commonMistakes: ["Calculation error", "Misunderstanding the operation"],
      concept: "Basic arithmetic",
      tips: ["Double-check your work", "Practice similar problems"]
    };
    
    return fallbackExplanation;
  }
}

module.exports = { getPracticeByTag, getExplanationForQuestion };
