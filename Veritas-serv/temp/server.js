const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer'); // npm install multer
const { PythonShell } = require('python-shell'); // npm install python-shell

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Multer for file uploads (store in memory for text processing)
const upload = multer({ storage: multer.memoryStorage() });

// MongoDB connection
const connectDB = require('./config/db');
connectDB();

// Team Schema
const teamSchema = new mongoose.Schema({
  teamId: { type: String, required: true, unique: true },
  docs: [{
    filename: { type: String, required: true },
    content: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }]
});

const Team = mongoose.model('Team', teamSchema);

// === ENDPOINT 1: Upload File to Team ===
app.post('/teams/:teamId/upload', upload.single('file'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text content (assume UTF-8 text file)
    const content = file.buffer.toString('utf-8');
    const filename = file.originalname;

    // Find or create team
    let team = await Team.findOne({ teamId });
    if (!team) {
      team = new Team({ teamId, docs: [] });
    }

    // Add doc (avoid duplicates by filename)
    const existingDoc = team.docs.find(d => d.filename === filename);
    if (existingDoc) {
      existingDoc.content = content; // Update
    } else {
      team.docs.push({ filename, content });
    }

    await team.save();

    res.json({ message: `File ${filename} uploaded to team ${teamId}\n`, docsCount: team.docs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === ENDPOINT 2: Plagcheck for Team ===
app.post('/teams/:teamId/plagcheck', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { threshold = 0.70, weights = '{"bert":0.5,"tfidf":0.2,"ngram":0.2,"lev":0.1}', mode = 'full' } = req.body;

    // Retrieve team docs
    const team = await Team.findOne({ teamId });
    if (!team || team.docs.length < 2) {
      return res.status(400).json({ error: 'Team not found or insufficient documents (need ≥2)' });
    }

    // Prepare JSON for Python: [{filename, content}]
    const docsJson = JSON.stringify(team.docs);

    // Run Python script with args: [docsJson, threshold, weights, mode]
    PythonShell.run('plag_check.py', {
      args: [docsJson, threshold.toString(), weights, mode],
      mode: 'json', // Expect JSON output
      pythonPath: 'python' // or 'python3' if needed
    }, (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Python execution failed', details: err });
      }

      // results is array of JSON strings; take last (output)
      const output = JSON.parse(results[results.length - 1]);
      res.json(output);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});