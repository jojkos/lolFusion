
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Load env
let envContent;
try {
  envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
} catch (e) {
  try {
    envContent = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  } catch (e2) {
    console.error('No .env or .env.local found');
    process.exit(1);
  }
}
const apiKey = envContent.match(/GEMINI_API_KEY=(.*)/)?.[1]?.trim();

if (!apiKey) {
  console.error('No GEMINI_API_KEY found in .env.local');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    // This uses the SDK's listModels if available, or we fetch manually if needed, 
    // but the SDK usually exposes it on the manager.
    // Actually SDK doesn't have a top-level listModels in all versions.
    // Let's rely on REST if SDK fails, but try to find it first.
    // The SDK separates it usually. 
    // Let's just use strict REST to be sure.
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
        console.log('Available Models:');
        data.models.forEach(m => {
            console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
        });
    } else {
        console.error('No models found or error:', data);
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
