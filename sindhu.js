const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// File Parsers
const Tesseract = require('tesseract.js'); // For Images (OCR)
const pdfParse = require('pdf-parse');    // For PDFs
const mammoth = require('mammoth');        // For .docx files

const app = express();
const upload = multer({ dest: 'uploads/' }); // Temporary storage for uploaded files

app.use(cors());
app.use(express.json());

// --- Helper: Fraud Analysis Logic ---
// In a production app, you might call an AI API (like Gemini or OpenAI) here.
function analyzeText(text) {
    const textLower = text.toLowerCase();
    let score = 0;
    let type = "None Detected";

    const patterns = {
        "Lottery/Prize": ["won", "lottery", "crore", "prize", "claim", "lucky draw"],
        "Banking/KYC": ["kyc", "bank", "blocked", "update", "verify", "customer care"],
        "Job Fraud": ["part-time", "salary", "work from home", "telegram", "investment"],
        "UPI/Payment": ["upi", "pin", "request", "scanner", "payment fail"]
    };

    for (const [fraudType, keywords] of Object.entries(patterns)) {
        const matches = keywords.filter(word => textLower.includes(word));
        if (matches.length > 0) {
            score += matches.length * 20;
            type = fraudType;
        }
    }

    return {
        score: Math.min(score, 100),
        type: score > 0 ? type : "Safe/Informational"
    };
}

// --- Route 1: Analyze Plain Text ---
app.post('/api/analyze', (req, res) => {
    const { message } = req.body;
    const result = analyzeText(message);
    res.json(result);
});

// --- Route 2: Analyze Files (Images, PDF, Docx) ---
app.post('/api/analyze-file', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    let extractedText = "";

    try {
        // 1. Handle Images (OCR)
        if (mimeType.startsWith('image/')) {
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng+hin+tel');
            extractedText = text;
        } 
        // 2. Handle PDFs
        else if (mimeType === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            extractedText = data.text;
        } 
        // 3. Handle Word Docs (.docx)
        else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
        } 
        // 4. Handle Plain Text files
        else if (mimeType === 'text/plain') {
            extractedText = fs.readFileSync(filePath, 'utf8');
        } else {
            return res.status(400).json({ error: "File type not supported" });
        }

        // Run analysis on the extracted text
        const analysis = analyzeText(extractedText);

        // Clean up: Delete the file from the server after processing
        fs.unlinkSync(filePath);

        res.json({
            extractedText: extractedText.substring(0, 500), // Return first 500 chars for UI
            ...analysis
        });

    } catch (error) {
        console.error("Processing Error:", error);
        res.status(500).json({ error: "Failed to read file" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`SurakshAI Backend running on http://localhost:${PORT}`);
});