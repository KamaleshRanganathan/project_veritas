const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { PythonShell } = require('python-shell');  // npm install python-shell
const multer = require('multer');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

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
    teamCode: { type: String, required: true, unique: true }, // Added teamCode
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
    const { teamName, teacherId, teamCode } = req.body;
    if (!teamName || !teacherId || !teamCode) {
      return res.status(400).json({ message: 'Team name, teacher ID, and team code are required' });
    }

    // Check if teacher exists
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teamCode already exists for this teacher
    if (teacher.teams.some(team => team.teamCode === teamCode)) {
      return res.status(400).json({ message: 'Team code already exists for this teacher' });
    }

    // Add team to teacher's teams array, using teamCode as teamId
    teacher.teams.push({ teamId: teamCode, teamName, teamCode, registeredStudents: [] });
    await teacher.save();

    res.status(201).json({ message: 'Team created successfully', team: { teamId: teamCode, teamName, teamCode } });
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

// POST: Student joins a team using a team code
app.post('/api/students/:studentId/join-team', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { teamCode } = req.body;

    if (!teamCode) {
      return res.status(400).json({ message: 'Team code is required' });
    }

    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const teacher = await Teacher.findOne({ 'teams.teamCode': teamCode });
    if (!teacher) {
      return res.status(404).json({ message: 'Team not found with this code' });
    }

    const team = teacher.teams.find(t => t.teamCode === teamCode);
    if (!team) {
      return res.status(404).json({ message: 'Team not found with this code' });
    }

    // Check if student is already in the team
    if (student.enrolledTeams.includes(team.teamId)) {
      return res.status(400).json({ message: 'Student already enrolled in this team' });
    }

    // Add student to team's registeredStudents
    team.registeredStudents.push({ studentId: student.studentId, name: student.name });
    await teacher.save();

    // Add teamId to student's enrolledTeams
    student.enrolledTeams.push(team.teamId);
    await student.save();

    res.status(200).json({ message: 'Successfully joined team', teamName: team.teamName });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve all teams a student is enrolled in
app.get('/api/students/:studentId/teams', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Find all teams that the student is enrolled in
    const enrolledTeams = await Teacher.aggregate([
      { $unwind: '$teams' },
      { $match: { 'teams.teamId': { $in: student.enrolledTeams } } },
      { $project: { _id: 0, id: '$teams.teamId', name: '$teams.teamName', code: '$teams.teamCode' } }
    ]);

    res.status(200).json(enrolledTeams);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve all teams for a specific teacher
app.get('/api/teachers/:teacherId/teams', async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.status(200).json(teacher.teams);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// POST: Submit an assignment for a specific team and student
app.post('/api/works/:teamId/:studentId/doc_content', upload.single('docFile'), async (req, res) => {
  try {
    const { teamId, studentId } = req.params;
    const docContent = req.file.buffer.toString('utf-8');

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
app.get('/api/works/:teamId', async (req, res) => {
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
    const documents = assignments.map(assignment => ({
      filename: assignment.studentId.name,
      content: assignment.docContent
    }));

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

      // Attach combined scores to each assignment
      const enrichedAssignments = assignments.map((assignment) => {
        const studentName = assignment.studentId.name;
        const studentResult = result.per_file.find(r => r.file === studentName);
        return {
          ...assignment.toObject(),
          combined_score: studentResult ? studentResult.combined : 0,
        };
      });

      res.status(200).json({ assignments: enrichedAssignments, plagiarism: result });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET: Retrieve assignments for a specific student in a specific team
app.get('/api/works/:teamId/:studentId', async (req, res) => {
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

app.get('/api/assignments', async (req, res) => {
            try {
                // 1. Get the teamId from the request's query string
                const { teamId } = req.query; // This will be "spak"

                // 2. Build the query
                // If no teamId is provided, query will be {} (find all)
                // If teamId is provided, query will be { teamId: "spak" }
                const query = {};
                if (teamId) {
                    query.teamId = teamId;
                }

                // 3. Find the documents in MongoDB
                const assignments = await Assignment.find(query);

                // 4. Send the data back as a JSON response
                res.json(assignments);

            } catch (err) {
                console.error("Failed to fetch assignments:", err);
                res.status(500).json({ error: "Internal server error" });
            }
        });

const PDFDocument = require('pdfkit');



app.get('/api/plagiarism/report/:teamId', async (req, res) => {

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

    const documents = assignments.map(assignment => ({

      filename: assignment.studentId.name,

      content: assignment.docContent

    }));



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

        return res.status(500).json({ error: 'Plagiarism detection failed' });

      }



      const result = JSON.parse(results[0]);



      // Generate PDF

      const doc = new PDFDocument();

      res.setHeader('Content-Type', 'application/pdf');

      res.setHeader('Content-Disposition', `attachment; filename=plagiarism_report_${teamId}.pdf`);

      doc.pipe(res);



      doc.fontSize(25).text('Plagiarism Report', { align: 'center' });

      doc.fontSize(16).text(`Team: ${teamId}`, { align: 'center' });

      doc.moveDown();



      doc.fontSize(14).text('Overall Similarity Matrix', { underline: true });

      result.matrix.forEach(row => {

        doc.text(row.join(', '));

      });

      doc.moveDown();



      doc.fontSize(14).text('Per-File Results', { underline: true });

      result.per_file.forEach(fileResult => {

        doc.fontSize(12).text(`File: ${fileResult.file}`);

        doc.text(`Combined Score: ${fileResult.combined.toFixed(2)}`);

        doc.moveDown();

      });



      doc.end();

    });

  } catch (error) {

    console.error('Server error:', error);

    res.status(500).json({ message: 'Server error', error: error.message });

  }

});



// Start server

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);

});