require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shchetovodstvo',
});

async function migrate() {
    try {
        await pool.query('DROP INDEX IF EXISTS unique_student_month_year;');
        console.log('Successfully dropped unique_student_month_year index');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
