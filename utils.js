// utils.js
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs/promises');

async function extractTextFromFile(filepath) {
    try {
        if (filepath.endsWith('.pdf')) {
            const dataBuffer = await fs.readFile(filepath);
            const data = await pdf(dataBuffer);
            console.log('PDF extracted text:', data.text); // Debug log
            return data.text;
        } else if (filepath.endsWith('.docx')) {
            const data = await fs.readFile(filepath);
            const result = await mammoth.extractRawText({ buffer: data });
            return result.value;
        }
        return '';
    } catch (error) {
        console.error('Error extracting text:', error);
        return '';
    }
}

function parseQuestions(text) {
    console.log('Text to parse:', JSON.stringify(text)); // Debug log with escaped characters
    if (!text) {
        console.warn('No text provided to parseQuestions');
        return [];
    }

    // New regex based on user request: from Q-number to [], and Ans: for the answer
    const pattern = /(Q\d+:\s*(?:.|\n)*?)\[([^\]]+)\]\s*Ans:\s*([\s\S]*?)(?=\n*(?:Q\d+:|$))/g;
    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0) {
        console.warn('No questions matched in text');
        return [];
    }

    const result = matches.map((match, index) => {
        console.log(`Match ${index}:`, match); // Debug each match
        const question = match[1] ? match[1].trim() : '';
        const tags = match[2] ? match[2].split(',').map(tag => tag.trim()) : [];
        const answer = match[3] ? match[3].trim() : '';
        return [question, tags, answer];
    });

    return result;
}

module.exports = { extractTextFromFile, parseQuestions };