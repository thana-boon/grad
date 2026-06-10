# 🎓 GradTrack

A full-stack web application for tracking student graduation records — built for Thai schools to manage university admission data with separate roles for admins and students.

> Currently deployed on an internal school server at Sukhon School.

---

## ✨ Features

### 👨‍💼 Admin
- Manage universities and university logos
- Import student data (bulk)
- View graduation statistics and summary reports
- Full dashboard with student record overview

### 👨‍🎓 Student
- Login with Student ID
- Record and update personal university admission information
- View own graduation record

### 🔐 Authentication
- JWT-based authentication
- Role-based access control (Admin / Student)
- Passwords hashed with bcrypt

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Styling | CSS |
| Backend | Node.js + Express |
| Database | MySQL |
| ORM / Query | Raw SQL via mysql2 |
| Auth | JWT + bcrypt |

---

## 📁 Project Structure

```
gradtrack/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── pages/       # Admin & student pages
│   │   ├── components/  # Reusable UI components
│   │   └── ...
│   └── package.json
├── server/          # Express API backend
│   ├── routes/      # API route handlers
│   ├── middleware/  # Auth middleware (JWT)
│   ├── db.js        # MySQL connection
│   └── index.js     # Entry point
└── .gitignore
```

---

## 🚀 Getting Started

### Requirements

- Node.js 18+
- MySQL 5.7+

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/thana-boon/gradtrack.git
   cd gradtrack
   ```

2. Setup the backend:
   ```bash
   cd server
   npm install
   ```

   Create a `.env` file in `/server`:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=yourpassword
   DB_NAME=gradtrack
   JWT_SECRET=your_jwt_secret
   PORT=5000
   ```

3. Setup the frontend:
   ```bash
   cd ../client
   npm install
   ```

   Create a `.env` file in `/client`:
   ```env
   VITE_API_URL=http://localhost:5000
   ```

4. Start both servers:
   ```bash
   # In /server
   npm start

   # In /client
   npm run dev
   ```

---

## 🌐 Deployment

This app is deployed on a Windows Server 2012 R2 running IIS + Node.js, accessible via internal school network.

---

## 📄 License

This project is for educational and internal school use.

---

## 👤 Author

**thana-boon** — Teacher & Developer at Sukhon School  
GitHub: [@thana-boon](https://github.com/thana-boon)
