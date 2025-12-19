
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Load env
let envContent;
try {
  envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
} catch (e) {
    try {
        envContent = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    } catch(e2) {
        console.log('No env file');
        process.exit(1);
    }
}
const apiKey = envContent.match(/GEMINI_API_KEY=(.*)/)?.[1]?.trim();

const genAI = new GoogleGenAI({ apiKey });

console.log('genAI.models methods:', Object.keys(genAI.models));
// console.log('genAI.models prototype:', Object.getPrototypeOf(genAI.models));

async function testImagenFast() {
    console.log('Testing imagen-4.0-fast-generate-001...');
    try {
        const prompt = "A fusion of a cat and a dog";
        // Try generateContent first
        try {
             // This model is listed as (predict) but let's see if generateContent maps to it
             const res = await genAI.models.generateContent({
                 model: 'imagen-4.0-fast-generate-001',
                 contents: [{ text: prompt }]
             });
             console.log('generateContent Success:', res);
        } catch(e) {
            console.log('generateContent Failed:', e.message);
        }

        // List models
        const listResp = await genAI.models.list();
        console.log('List Response:', JSON.stringify(listResp, null, 2));
        
        if (listResp && listResp.models) {
             listResp.models.forEach(m => {
                console.log(`- ${m.name} (${m.supportedGenerationMethods?.join(', ')})`);
            });
        }

    } catch (e) {
        console.error('Test Error:', e);
    }
}

testImagenFast();
