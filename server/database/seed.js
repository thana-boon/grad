// รัน: node database/seed.js
// script นี้สร้าง user ทดสอบในฐานข้อมูล

require('dotenv').config({ override: true });
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const users = [
  {
    username: 'admin',
    password: 'admin1234',
    name: 'ผู้ดูแลระบบ',
    role: 'admin',
    email: 'admin@gradtrack.com',
  },
  {
    username: 'student01',
    password: 'student1234',
    name: 'นักเรียน ทดสอบ',
    role: 'student',
    email: 'student01@gradtrack.com',
  },
];

async function seed() {
  try {
    for (const user of users) {
      const hashed = await bcrypt.hash(user.password, 10);
      await db.query(
        `INSERT INTO users (username, password, name, role, email)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [user.username, hashed, user.name, user.role, user.email]
      );
      console.log(`✓ สร้าง user: ${user.username} (${user.role})`);
    }
    console.log('\nเสร็จแล้ว! ลองเข้าสู่ระบบด้วย:');
    console.log('  admin    / admin1234');
    console.log('  student01 / student1234');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit();
  }
}

seed();
