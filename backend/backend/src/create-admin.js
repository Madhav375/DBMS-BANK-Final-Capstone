import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './db.js';

async function createAdmin() {
  try {
    const name = process.env.ADMIN_NAME || 'Bank Administrator';
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD missing');
    }

    const [existing] = await pool.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (existing.length) {
      console.log('Admin account already exists.');
      return;
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', 1)`,
      [name, email.toLowerCase(), hash]
    );

    console.log('Admin account created successfully!');
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

createAdmin();