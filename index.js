const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const connectDB = require('./config/database');
const User = require('./models/User');
require('dotenv').config();
const MongoStore = require('connect-mongo');

const app = express();
const PORT = 3000;

// Connect to MongoDB
connectDB();

// Static file serving setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        body: req.method === 'POST' ? req.body : undefined
    });
    next();
});

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key', // Secure secret loaded from .env
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/cmfp',
        ttl: 24 * 60 * 60 // Session TTL (1 day)
    }),
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Authentication middleware
app.use((req, res, next) => {
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico)$/) || req.path === '/logout') {
        return next();
    }

    if (req.session && req.session.authenticated) {
        if (req.path === '/login.html' || req.path === '/') {
            return res.redirect(`/${req.session.role}.html`);
        }
    }
    next();
});

// Test route to verify server is working
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working' });
});

// Test POST route
app.post('/test-post', (req, res) => {
    console.log('Test POST received:', {
        body: req.body,
        contentType: req.headers['content-type']
    });
    res.json({ 
        received: true,
        body: req.body
    });
});

// Registration route
app.post('/register', async (req, res) => {
    try {
        const { username, password, confirmPassword, role } = req.body;
        console.log('Registration request received:', {
            username,
            role,
            hasPassword: !!password,
            hasConfirmPassword: !!confirmPassword
        });

        // Basic validation
        if (!username || !password || !confirmPassword || !role) {
            console.log('Missing required fields:', {
                hasUsername: !!username,
                hasPassword: !!password,
                hasConfirmPassword: !!confirmPassword,
                hasRole: !!role
            });
            return res.redirect('/register.html');
        }

        if (password !== confirmPassword) {
            console.log('Passwords do not match');
            return res.redirect('/register.html');
        }

        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('Username already exists:', username);
            return res.redirect('/register.html');
        }

        // Remove password hashing
        const hashedPassword = password; // Store password as plaintext
        console.log('Password stored as plaintext for user during registration:', hashedPassword);
        console.log('Password stored successfully');

        // Create new user
        const userData = {
            username,
            password: hashedPassword,
            role,
            status: 'active'
        };
        console.log('Creating user with data:', { ...userData, password: '[HIDDEN]' });

        const user = new User(userData);

        // Save user
        const savedUser = await user.save();
        console.log('User saved successfully:', {
            id: savedUser._id,
            username: savedUser.username,
            role: savedUser.role,
            status: savedUser.status
        });

        // Verify user was saved
        const verifyUser = await User.findById(savedUser._id);
        console.log('Verified user exists:', {
            found: !!verifyUser,
            username: verifyUser?.username,
            role: verifyUser?.role
        });

        // Count total users
        const totalUsers = await User.countDocuments();
        console.log('Total users in database:', totalUsers);

        res.redirect('/login.html');
    } catch (error) {
        console.error('Registration error:', error);
        res.redirect('/register.html');
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        console.log('Login attempt received:', {
            body: req.body,
            contentType: req.headers['content-type']
        });

        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            console.error('Login failed: Missing credentials');
            return res.status(400).json({ error: 'Username and password are required' });
        }

        console.log('Attempting to log in user:', username);
        // Find user
        const user = await User.findOne({ username });
        console.log('User fetched from database:', user);
        console.log('Stored password from database:', user.password);
        if (!user) {
            console.error('Login failed: User not found -', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('Comparing password for user:', username);
        console.log('Provided password:', password);
        // Direct password comparison since passwords are stored as plaintext
        const isValidPassword = password === user.password;
        console.log('Password valid:', isValidPassword);
        if (!isValidPassword) {
            console.error('Login failed: Invalid password for user -', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
        req.session.user = user.username;
        req.session.role = user.role;
        req.session.authenticated = true;

        console.log('Login successful:', {
            username: user.username,
            role: user.role,
            sessionID: req.sessionID
        });

        // Send success response
        res.json({ 
            success: true, 
            redirect: `/${user.role}.html`
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Protected routes
app.get('/admin.html', async (req, res) => {
    if (!req.session.authenticated || req.session.role !== 'admin') {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'views/admin.html'));
});

app.get('/teacher.html', async (req, res) => {
    if (!req.session.authenticated || req.session.role !== 'teacher') {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'views/teacher.html'));
});

// Root route
app.get('/', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.redirect(`/${req.session.role}.html`);
    } else {
        res.redirect('/login.html');
    }
});

// API endpoint for checking admin authentication
app.get('/api/admin/data', (req, res) => {
    if (req.session && req.session.authenticated && req.session.role === 'admin') {
        res.json({ status: 'authenticated' });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Initialize admin user and start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});