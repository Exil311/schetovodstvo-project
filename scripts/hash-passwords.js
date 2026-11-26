#!/usr/bin/env node
/**
 * One-time / maintenance script to hash plaintext user passwords with bcrypt
 * or set a new strong password for a specific user.
 *
 * Usage:
 *   node scripts/hash-passwords.js                     # hashes all plaintext passwords in `users`
 *   node scripts/hash-passwords.js --set admin NewPass # sets & hashes password for `admin`
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;
const SALT_ROUNDS = 12;

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL is not set in .env');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        const args = process.argv.slice(2);
        if (args[0] === '--set') {
            const [, username, newPassword] = args;
            if (!username || !newPassword || newPassword.length < 10) {
                console.error('Usage: node scripts/hash-passwords.js --set <username> <password (min 10 chars)>');
                process.exit(1);
            }
            const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            const res = await pool.query('UPDATE users SET password = $1 WHERE username = $2 RETURNING id, username, role', [hash, username]);
            if (res.rowCount === 0) {
                console.error(`User "${username}" not found.`);
                process.exit(1);
            }
            console.log(`Updated password hash for user "${res.rows[0].username}" (role: ${res.rows[0].role}).`);
            return;
        }

        const res = await pool.query('SELECT id, username, password FROM users');
        let migrated = 0;
        for (const user of res.rows) {
            if (!BCRYPT_RE.test(user.password || '')) {
                const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, user.id]);
                console.log(`Hashed password for user "${user.username}".`);
                migrated++;
            } else {
                console.log(`User "${user.username}" already has a bcrypt hash.`);
            }
        }
        console.log(`Done. Migrated ${migrated} user(s).`);
    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});
