const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { PythonShell } = require('python-shell');  // npm install python-shell

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
const connectDB = require('./config/db');
connectDB();

// Schemas
const teacherSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  teams: [{
    teamId: { type: String, required: true },
    teamName: { type: String, required: true },
    registeredStudents: [{
      studentId: { type: String, required: true },
      name: { type: String, required: true },
    }],
  }],
});

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  enrolledTeams: [{ type: String }], // Store teamId strings
});

const assignmentSchema = new mongoose.Schema({
  teamId: { type: String, required: true }, // Store teamId as string
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  docContent: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
});

const Teacher = mongoose.model('Teacher', teacherSchema);
const Student = mongoose.model('Student', studentSchema);
const Assignment = mongoose.model('Assignment', assignmentSchema);

// Routes

// POST: Create a teacher (for setup/testing)
app.post('/api/teachers', async (req, res) => {
  try {
    const { teacherId, name } = req.body;
    if (!teacherId || !name) {
      return res.status(400).json({ message: 'Teacher ID and name are required' });
    }

    const teacher = new Teacher({ teacherId, name, teams: [] });
    await teacher.save();
    res.status(201).json({ message: 'Teacher created successfully', teacher });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST: Create a team (embedded in teacher's document)
app.post('/api/teams', async (req, res) => {
  try {
    const { teamId, teamName, teacherId } = req.body;
    if (!teamId || !teamName || !teacherId) {
      return res.status(400).json({ message: 'Team ID, team name, and teacher ID are required' });
    }

    // Check if teacher exists
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teamId already exists in teacher's teams
    if (teacher.teams.some(team => team.teamId === teamId)) {
      return res.status(400).json({ message: 'Team ID already exists for this teacher' });
    }

    // Add team to teacher's teams array
    teacher.teams.push({ teamId, teamName, registeredStudents: [] });
    await teacher.save();

    res.status(201).json({ message: 'Team created successfully', team: { teamId, teamName } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST: Create a student and enroll in teams (updates teacher's registeredStudents)
app.post('/api/students', async (req, res) => {
  try {
    const { studentId, name, enrolledTeamIds } = req.body;
    if (!studentId || !name) {
      return res.status(400).json({ message: 'Student ID and name are required' });
    }

    // Find teachers with the specified teamIds
    const teachers = await Teacher.find({
      'teams.teamId': { $in: enrolledTeamIds || [] },
    });

    // Create student
    const student = new Student({
      studentId,
      name,
      enrolledTeams: enrolledTeamIds || [],
    });
    await student.save();

    // Update each teacher's registeredStudents for the specified teams
    for (const teacher of teachers) {
      for (const team of teacher.teams) {
        if (enrolledTeamIds.includes(team.teamId)) {
          team.registeredStudents.push({ studentId, name });
        }
      }
      await teacher.save();
    }

    res.status(201).json({ message: 'Student created successfully', student });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST: Submit an assignment for a specific team and student
app.post('/works/:teamId/:studentId/doc_content', async (req, res) => {
  try {
    const { teamId, studentId } = req.params;
    const { docContent } = req.body;

    if (!docContent) {
      return res.status(400).json({ message: 'Document content is required' });
    }

    // Check if team exists in any teacher's teams
    const teacher = await Teacher.findOne({ 'teams.teamId': teamId });
    if (!teacher) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student is enrolled in the team
    if (!student.enrolledTeams.includes(teamId)) {
      return res.status(403).json({ message: 'Student is not enrolled in this team' });
    }

    // Save assignment
    const assignment = new Assignment({
      teamId,
      studentId: student._id,
      docContent,
    });

    await assignment.save();
    res.status(201).json({ message: 'Assignment submitted successfully', assignment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve all assignments for a specific team (with plagiarism detection using all 4 algorithms)
app.get('/works/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;

    // Check if team exists
    const teacher = await Teacher.findOne({ 'teams.teamId': teamId });
    if (!teacher) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const assignments = await Assignment.find({ teamId })
      .populate('studentId', 'studentId name')
      .sort({ submittedAt: -1 });

    if (!assignments.length) {
      return res.status(404).json({ message: 'No assignments found for this team' });
    }

    // Extract docContents for plagiarism detection
    const documents = assignments.map(assignment => assignment.docContent);

    // Run Python script for plagiarism scores
    const options = {
      mode: 'text',
      pythonOptions: ['-u'],
      scriptPath: './',  // Ensure plagiarism_detector.py is in the same directory
      args: [JSON.stringify(documents)]
    };

    PythonShell.run('plagiarism_detector.py', options, (err, results) => {
      if (err) {
        console.error('Python script error:', err);
        return res.status(500).json({ error: 'Plagiarism detection failed', assignments });
      }

      const result = JSON.parse(results[0]);

      // Attach all scores to each assignment (index matches document order)
      const enrichedAssignments = assignments.map((assignment, index) => ({
        ...assignment.toObject(),
        bert_score: result.bert_scores[index],
        ngram_score: result.ngram_scores[index],
        levenshtein_score: result.levenshtein_scores[index],
        tfidf_score: result.tfidf_scores[index],
        combined_score: result.combined_scores[index]
      }));

      res.status(200).json({ assignments: enrichedAssignments });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve assignments for a specific student in a specific team
app.get('/works/:teamId/:studentId', async (req, res) => {
  try {
    const { teamId, studentId } = req.params;

    // Check if team exists
    const teacher = await Teacher.findOne({ 'teams.teamId': teamId });
    if (!teacher) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if student exists
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const assignments = await Assignment.find({
      teamId,
      studentId: student._id,
    }).sort({ submittedAt: -1 });

    if (!assignments.length) {
      return res.status(404).json({ message: 'No assignments found for this student in this team' });
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