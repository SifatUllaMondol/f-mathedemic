const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs/promises');

async function extractTextFromFile(filepath) {
    try {
        if (filepath.endsWith('.pdf')) {
            const dataBuffer = await fs.readFile(filepath);
            const data = await pdf(dataBuffer);
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
    if (!text) {
        return [];
    }

    // Updated regex to capture the difficulty level within curly braces {}
    // The pattern is: Question [tags]{difficulty} Ans: Answer
    const pattern = /([\s\S]+?)\s*\[([^\]]+)\]\s*\{([^}]+)\}\s*Ans:\s*([\s\S]*?)(?=(?:[\r\n]+[\s\S]*?\[[\s\S]*?\]\s*\{[\s\S]*?\}\s*Ans:|$))/g;
    const matches = [...text.matchAll(pattern)];

    if (matches.length === 0) {
        console.warn('No questions matched in text');
        return [];
    }

    const result = matches.map((match) => {
        const question = match[1] ? match[1].trim() : '';
        const tags = match[2] ? match[2].split(',').map(tag => tag.trim()) : [];
        const difficulty = match[3] ? match[3].trim() : '';
        const answer = match[4] ? match[4].trim() : '';
        // Return an array with all four elements
        return [question, tags, difficulty, answer];
    });

    return result;
}

module.exports = { extractTextFromFile, parseQuestions };