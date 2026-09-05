require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const passport = require('./config/passport');
const { Server: SocketIOServer } = require('socket.io');
const { connectDB } = require('./db');

const app = express();
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(passport.initialize());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/sessions', require('./routes/sessions'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

require('./socket/handlers')(io);

const PORT = Number(process.env.PORT) || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/realtime-quiz-portal';

connectDB(MONGO_URI)
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

module.exports = { app, httpServer, io };
