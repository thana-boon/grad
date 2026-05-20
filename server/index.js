const express = require('express');
const cors = require('cors');
require('dotenv').config({ override: true });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Routes (จะเพิ่มทีละ route)
app.use('/api/auth', require('./routes/auth'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
