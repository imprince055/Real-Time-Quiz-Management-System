const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Quiz = require('../models/Quiz');
const Answer = require('../models/Answer');
const { calculateScores, getLeaderboard } = require('../services/scoreService');

// Map roomCode → teacher's socket.id so we can push updates to the teacher directly
const teacherSockets = {};

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret');
  } catch {
    return null;
  }
}

/** Strip the correctAnswer field before sending a question to students. */
function safeQuestion(question, index, total) {
  return {
    questionId: question._id,
    text: question.text,
    options: question.options,
    index,
    total,
  };
}

module.exports = function registerHandlers(io) {
  io.on('connection', (socket) => {

    // ─────────────────────────────────────────────
    // JOIN ROOM
    //
    // Teacher join:  payload contains { roomCode, token }  (teacher JWT)
    // Student join:  payload contains { roomCode, displayName, rollNumber,
    //                                   section, course }
    //                and OPTIONALLY    { studentToken }  (student JWT)
    //
    // When a student provides a valid studentToken the backend resolves their
    // User._id and stores it as socket.data.studentId and in the participant
    // record.  This is the authoritative identity used for QuizAttempt upserts.
    // Students who join without a token (guests) fall back to displayName only.
    // ─────────────────────────────────────────────
    socket.on('join_room', async ({
      roomCode,
      token,          // teacher JWT
      studentToken,   // student JWT (optional, sent by registered students)
      displayName,
      rollNumber,
      section,
      course,
    }) => {
      try {
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) {
          return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        }

        // ── Teacher join ──────────────────────────
        if (token) {
          const teacher = verifyToken(token);
          if (!teacher) {
            return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          }
          if (session.quizId.teacherId.toString() !== teacher.id) {
            return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          }
          socket.join(roomCode);
          socket.data.role      = 'teacher';
          socket.data.roomCode  = roomCode;
          teacherSockets[roomCode] = socket.id;
          socket.emit('session_state', {
            state: session.state,
            currentQuestionIndex: session.currentQuestionIndex,
            participants: session.participants,
          });
          return;
        }

        // ── Student join ──────────────────────────
        if (!displayName) {
          return socket.emit('error', { message: 'displayName required', code: 'INVALID_REQUEST' });
        }
        if (session.state === 'completed') {
          return socket.emit('error', { message: 'Session already ended', code: 'SESSION_COMPLETED' });
        }

        // Resolve studentId from the studentToken if provided.
        // The token is verified server-side — the client cannot forge an id.
        let studentId = null;
        if (studentToken) {
          const studentPayload = verifyToken(studentToken);
          if (studentPayload && studentPayload.role === 'student') {
            studentId = studentPayload.id; // MongoDB User _id string
          }
          // If the token is invalid/expired we continue without studentId (guest mode)
        }

        socket.join(roomCode);
        socket.data.role        = 'student';
        socket.data.roomCode    = roomCode;
        socket.data.displayName = displayName;
        socket.data.studentId   = studentId;   // null for guests
        socket.data.sessionId   = session._id.toString();

        // Update or create the participant record
        const existing = session.participants.find((p) => p.displayName === displayName);
        if (existing) {
          existing.socketId  = socket.id;
          // Update studentId if we now have one (e.g. student rejoins with token)
          if (studentId) existing.studentId = studentId;
        } else {
          session.participants.push({
            displayName,
            rollNumber:  rollNumber  || '',
            section:     section     || '',
            course:      course      || '',
            socketId:    socket.id,
            studentId:   studentId,   // null for guests
          });
        }
        await session.save();

        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student_joined', {
            displayName,
            participantCount: session.participants.length,
          });
        }

        if (session.state === 'active') {
          const q = session.quizId.questions[session.currentQuestionIndex];
          socket.emit('question_display', safeQuestion(q, session.currentQuestionIndex, session.quizId.questions.length));
        } else {
          socket.emit('waiting');
        }
      } catch (err) {
        console.error('join_room error', err);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // START QUIZ  — records session.startedAt
    // ─────────────────────────────────────────────
    socket.on('start_quiz', async ({ roomCode }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        if (session.state !== 'waiting') {
          return socket.emit('error', { message: 'Quiz already started or completed', code: 'SESSION_WRONG_STATE' });
        }

        session.state = 'active';
        session.currentQuestionIndex = 0;
        session.startedAt = new Date(); // authoritative start time for timeTaken
        await session.save();

        const q = session.quizId.questions[0];
        io.to(roomCode).emit('question_display', safeQuestion(q, 0, session.quizId.questions.length));
      } catch (err) {
        console.error('start_quiz error', err);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // NEXT QUESTION
    // ─────────────────────────────────────────────
    socket.on('next_question', async ({ roomCode }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        if (session.state !== 'active') {
          return socket.emit('error', { message: 'Session not active', code: 'SESSION_WRONG_STATE' });
        }
        const total = session.quizId.questions.length;
        if (session.currentQuestionIndex >= total - 1) {
          return socket.emit('error', { message: 'Already at last question', code: 'SESSION_WRONG_STATE' });
        }
        session.currentQuestionIndex += 1;
        await session.save();

        const q = session.quizId.questions[session.currentQuestionIndex];
        io.to(roomCode).emit('question_display', safeQuestion(q, session.currentQuestionIndex, total));

        if (session.currentQuestionIndex === total - 1) {
          socket.emit('show_submit');
        }
      } catch (err) {
        console.error('next_question error', err);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // SUBMIT ANSWER  (individual question answer)
    // ─────────────────────────────────────────────
    socket.on('submit_answer', async ({ roomCode, questionId, selectedOption }) => {
      try {
        if (socket.data.role !== 'student') {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session || session.state !== 'active') {
          return socket.emit('error', { message: 'Session not active', code: 'SESSION_WRONG_STATE' });
        }
        const currentQ = session.quizId.questions[session.currentQuestionIndex];
        if (currentQ._id.toString() !== questionId) {
          return socket.emit('error', { message: 'Answer for wrong question', code: 'INVALID_QUESTION' });
        }
        // Upsert — idempotent; unique index on (sessionId, questionId, displayName)
        await Answer.findOneAndUpdate(
          { sessionId: session._id, questionId, displayName: socket.data.displayName },
          {
            sessionId: session._id,
            questionId,
            displayName: socket.data.displayName,
            selectedOption,
            submittedAt: new Date(),
          },
          { upsert: true, new: true }
        );
        socket.emit('answer_received');
      } catch (err) {
        console.error('submit_answer error', err);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

  
    socket.on('submit_quiz', async ({ roomCode }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        if (session.state !== 'active') {
          return socket.emit('error', { message: 'Session not active', code: 'SESSION_WRONG_STATE' });
        }

        session.state = 'completed';
        await session.save();

        const rankedLeaderboard = await calculateScores(session._id);
        const totalParticipants = rankedLeaderboard.length;

        const allSockets = await io.in(roomCode).fetchSockets();
        for (const s of allSockets) {
          if (s.data.role !== 'student') continue;

          const entry = s.data.studentId
            ? rankedLeaderboard.find((r) => r.studentId?.toString() === s.data.studentId?.toString())
            : rankedLeaderboard.find((r) => r.displayName === s.data.displayName);

          if (entry) {
            s.emit('quiz_results', {
            
              score: entry.correctAnswers,
              total: entry.totalQuestions,
              
              quizTitle:        session.quizId.title,
              sessionId:        session._id.toString(),
              correctAnswers:   entry.correctAnswers,
              incorrectAnswers: entry.incorrectAnswers,
              totalQuestions:   entry.totalQuestions,
              percentage:       entry.percentage,
              timeTaken:        entry.timeTaken,
              rank:             entry.rank,
              totalParticipants,
            });
          }
        }

        socket.emit('all_results', { results: rankedLeaderboard });
        delete teacherSockets[roomCode];
      } catch (err) {
        console.error('submit_quiz error', err);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });


    socket.on('apply_penalty', ({ roomCode, targetDisplayName, seconds }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) return;
        const sockets = Array.from(io.sockets.sockets.values());
        const targetSocket = sockets.find(
          (s) => s.data.roomCode === roomCode &&
                 s.data.displayName === targetDisplayName &&
                 s.data.role === 'student'
        );
        if (targetSocket) targetSocket.emit('penalty_applied', { seconds, by: 'teacher' });
      } catch { /* silent */ }
    });

    socket.on('tab_switch', async ({ roomCode, switchCount }) => {
      try {
        const { displayName } = socket.data;
        if (!displayName || socket.data.role !== 'student') return;
        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student_tab_switch', {
            displayName,
            switchCount,
            time: new Date().toISOString(),
          });
        }
      } catch { /* silent */ }
    });


    socket.on('disconnect', async () => {
      try {
        const { role, roomCode, displayName } = socket.data;
        if (!roomCode) return;

        if (role === 'teacher') {
          delete teacherSockets[roomCode];
          socket.to(roomCode).emit('teacher_disconnected');
        } else if (role === 'student') {
          await Session.updateOne(
            { roomCode, 'participants.displayName': displayName },
            { $set: { 'participants.$.socketId': null } }
          );
        }
      } catch { /* silent */ }
    });

  });
};
