-- =============================================
-- GradTrack Database Schema
-- =============================================

-- ตาราง users (ใช้ทั้ง admin และ student)
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,           -- bcrypt hash
  name        VARCHAR(100) NOT NULL,
  role        ENUM('admin', 'student') NOT NULL DEFAULT 'student',
  email       VARCHAR(100) UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
