const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const socketio = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('Failed to connect to MongoDB Atlas:', err));

const chatMessageSchema = new mongoose.Schema({
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const sessionMiddleware = session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: "http://localhost:3001/auth/github/callback"
}, function(accessToken, refreshToken, profile, done) {
  const username = profile.username;
  return done(null, { username: username });
}));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

app.get('/auth/github',
  passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/chat');
  });

app.use(express.static('public'));

app.get('/chat', (req, res) => {
  res.sendFile(__dirname + '/public/chat.html');
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', async (socket) => {
  console.log('A user connected');

  try {
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const messages = await ChatMessage.find({ timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: 1 }).exec();
    socket.emit('load messages', messages);
  } catch (error) {
    console.error('Error loading chat messages:', error.message);
    console.error(error.stack);
  }

  socket.on('chat message', async (data) => {
    try {
      if (socket.request.session.passport && socket.request.session.passport.user) {
        const username = socket.request.session.passport.user.username;
        const message = data.message;
        const newMessage = new ChatMessage({ username, message });
        await newMessage.save();
        io.emit('chat message', { username, message });
      } else {
        socket.emit('chat message', { username: 'System', message: 'You are not authenticated. Please authenticate to send messages.' });
      }
    } catch (error) {
      console.error('Error processing chat message:', error.message);
      console.error(error.stack);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
