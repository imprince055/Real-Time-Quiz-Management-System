const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Quiz = require('../models/Quiz');
const Answer = require('../models/Answer');
const { calculateScores } = require('../services/scoreService');

const teacherSockets = {};

function verifyTeacherToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret');
  } catch {
    return null;
  }
}

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

    socket.on('join_room', async ({ roomCode, token, displayName, rollNumber, section, course }) => {
      try {
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) {
          return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        }

        if (token) {
          const teacher = verifyTeacherToken(token);
          if (!teacher) {
            return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          }
          if (session.quizId.teacherId.toString() !== teacher.id) {
            return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          }
          socket.join(roomCode);
          socket.data.role = 'teacher';
          socket.data.roomCode = roomCode;
          teacherSockets[roomCode] = socket.id;
          socket.emit('session_state', {
            state: session.state,
            currentQuestionIndex: session.currentQuestionIndex,
            participants: session.participants,
          });
          return;
        }

        if (!displayName) {
          return socket.emit('error', { message: 'displayName required', code: 'INVALID_REQUEST' });
        }
        if (session.state === 'completed') {
          return socket.emit('error', { message: 'Session already ended', code: 'SESSION_COMPLETED' });
        }

        socket.join(roomCode);
        socket.data.role = 'student';
        socket.data.roomCode = roomCode;
        socket.data.displayName = displayName;

        const existing = session.participants.find((p) => p.displayName === displayName);
        if (existing) {
          existing.socketId = socket.id;
        } else {
          session.participants.push({ displayName, rollNumber: rollNumber || '', section: section || '', course: course || '', socketId: socket.id });
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
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

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
        await session.save();

        const q = session.quizId.questions[0];
        io.to(roomCode).emit('question_display', safeQuestion(q, 0, session.quizId.questions.length));
      } catch {
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

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
      } catch {
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

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
        await Answer.findOneAndUpdate(
          { sessionId: session._id, questionId, displayName: socket.data.displayName },
          { sessionId: session._id, questionId, displayName: socket.data.displayName, selectedOption, submittedAt: new Date() },
          { upsert: true, new: true }
        );
        socket.emit('answer_received');
      } catch {
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    socket.on('apply_penalty', ({ roomCode, targetDisplayName, seconds }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) return;
        const sockets = Array.from(io.sockets.sockets.values());
        const targetSocket = sockets.find(
          s => s.data.roomCode === roomCode && s.data.displayName === targetDisplayName && s.data.role === 'student'
        );
        if (targetSocket) {
          targetSocket.emit('penalty_applied', { seconds, by: 'teacher' });
        }
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
      } catch {
        // silent
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

        const results = await calculateScores(session._id);

        const sockets = await io.in(roomCode).fetchSockets();
        for (const s of sockets) {
          if (s.data.role === 'student') {
            const studentResult = results.find((r) => r.displayName === s.data.displayName);
            if (studentResult) {
              s.emit('quiz_results', { score: studentResult.score, total: studentResult.total });
            }
          }
        }

        socket.emit('all_results', { results });
        delete teacherSockets[roomCode];
      } catch {
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
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
      } catch {
       
      }
    });

  });
};
