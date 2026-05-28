/**
 * Seed script — สร้าง admin user เริ่มต้น
 * รัน: node seed.js
 */
require('dotenv').config({ override: true });
const db = require('./config/db');
const bcrypt = require('bcryptjs');

async function seed() {
  const username = 'admin';
  const password = 'admin1234';
  const role = 'admin';

  try {
    // สร้าง table ถ้ายังไม่มี
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(100) NOT NULL UNIQUE,
        password    VARCHAR(255) NOT NULL,
        role        ENUM('admin','student') NOT NULL DEFAULT 'student',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const hash = await bcrypt.hash(password, 10);

    // ถ้ามี username นี้อยู่แล้ว → อัปเดต password
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      await db.query('UPDATE users SET password = ?, role = ? WHERE username = ?', [hash, role, username]);
      console.log(`✅ อัปเดต password ของ "${username}" สำเร็จ`);
    } else {
      await db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role]);
      console.log(`✅ สร้าง user "${username}" สำเร็จ`);
    }

    console.log(`\n👤 username : ${username}`);
    console.log(`🔑 password : ${password}`);
    console.log(`\nเข้าสู่ระบบแล้วเปลี่ยน password ในหน้า Account ได้เลย`);
  } catch (err) {
    console.error('❌ Seed ล้มเหลว:', err.message);
  } finally {
    process.exit(0);
  }
}

seed();
