const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ override: true });

const logger = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// HTTP request log ผ่าน morgan → winston
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// Static files (logo uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes (จะเพิ่มทีละ route)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/academic-years', require('./routes/academicYears'));
app.use('/api/students', require('./routes/students'));
app.use('/api/universities', require('./routes/universities'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', port: PORT });
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
