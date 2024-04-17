const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const socketio = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Use express-session middleware
const sessionMiddleware = session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

// Initialize Passport and session middleware
app.use(passport.initialize());
app.use(passport.session());

// Configure GitHub authentication strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: "http://localhost:3001/auth/github/callback"
}, function(accessToken, refreshToken, profile, done) {
  // Retrieve GitHub username from profile
  const username = profile.username;
  return done(null, { username: username });
}));

// Serialize user object to session
passport.serializeUser(function(user, done) {
  done(null, user);
});

// Deserialize user object from session
passport.deserializeUser(function(user, done) {
  done(null, user);
});

// Routes for authentication
app.get('/auth/github',
  passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect to chat page
    res.redirect('/chat');
  });

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Define a route for /chat to serve chat.html
app.get('/chat', (req, res) => {
  res.sendFile(__dirname + '/public/chat.html');
});

// Socket.IO connection handler
io.use((socket, next) => {
  // Wrap the express session middleware and execute it
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle incoming chat messages
  socket.on('chat message', (data) => {
    try {
      // Check if user is authenticated
      if (socket.request.session.passport && socket.request.session.passport.user) {
        // Retrieve username from session
        const username = socket.request.session.passport.user.username;
        // Log the received message
        console.log('Received message from', username, ':', data);
        // Broadcast the message to all connected clients
        io.emit('chat message', { username: username, message: data.message });
      } else {
        // User is not authenticated, inform them to authenticate
        socket.emit('chat message', { username: 'System', message: 'You are not authenticated. Please authenticate to send messages.' });
      }
    } catch (error) {
      // Log the error with details
      console.error('Error processing chat message:', error.message);
      console.error(error.stack); // Print stack trace for detailed error information
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start the server
server.listen(3001, () => {
  console.log('Server is running on port 3001');
});

