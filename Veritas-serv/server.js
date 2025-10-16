const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection (assuming connectDB is defined in ./config/db.js)
const connectDB = require('./config/db');
connectDB();

// Assignment Schema
const assignmentSchema = new mongoose.Schema({
  studentName: {
    type: String,
    required: true,
  },
  assignmentText: {
    type: String,
    required: true,
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

const Assignment = mongoose.model('Assignment', assignmentSchema);

// Routes

// POST: Submit an assignment
app.post('/api/assignments', async (req, res) => {
  try {
    const { studentName, assignmentText } = req.body;

    if (!studentName || !assignmentText) {
      return res.status(400).json({ message: 'Student name and assignment text are required' });
    }

    const assignment = new Assignment({
      studentName,
      assignmentText,
    });

    await assignment.save();
    res.status(201).json({ message: 'Assignment submitted successfully', assignment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve all assignments
app.get('/api/assignments', async (req, res) => {
  try {
    const assignments = await Assignment.find().sort({ submittedAt: -1 });
    res.status(200).json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve assignments by student name
app.get('/api/assignments/:studentName', async (req, res) => {
  try {
    const assignments = await Assignment.find({ studentName: req.params.studentName }).sort({ submittedAt: -1 });
    if (!assignments.length) {
      return res.status(404).json({ message: 'No assignments found for this student' });
    }
    res.status(200).json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});