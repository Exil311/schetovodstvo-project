require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
const cron = require('node-cron');
const { execFile } = require('child_process');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('FATAL: DATABASE_URL environment variable is required.');
    process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
    console.error('FATAL: SESSION_SECRET environment variable must be set and at least 32 characters long.');
    process.exit(1);
}

const GOOGLE_SCRIPT_BASE_URL = (process.env.GOOGLE_SCRIPT_URL || '').trim();
const GOOGLE_SCRIPT_TOKEN = (process.env.GOOGLE_SCRIPT_TOKEN || '').trim();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('DB Connection Error:', err.message);
    else console.log('DB Connected Successfully');
});

pool.query(`
    CREATE TABLE IF NOT EXISTS student_assignment_orders (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        school_year VARCHAR(20) NOT NULL,
        order_number INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, school_year),
        UNIQUE (school_year, order_number)
    );
`).catch(err => console.error('Error ensuring student_assignment_orders table:', err.message));

pool.query(`
    ALTER TABLE settings ALTER COLUMN value TYPE TEXT;
`).catch(() => {});

function getSchoolYear(d = new Date()) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return (month > 9 || (month === 9 && day >= 15)) ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getStartOfSchoolYearDate(d = new Date()) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const startYear = (month >= 9) ? year : year - 1;
    return `${startYear}-09-15 08:00:00`;
}

async function getOrAssignOrderNumber(studentId) {
    const schoolYear = getSchoolYear();
    const existing = await pool.query(
        'SELECT order_number FROM student_assignment_orders WHERE student_id = $1 AND school_year = $2',
        [studentId, schoolYear]
    );
    if (existing.rows.length > 0) {
        return existing.rows[0].order_number;
    }

    const insertRes = await pool.query(`
        INSERT INTO student_assignment_orders (student_id, school_year, order_number)
        VALUES (
            $1,
            $2::VARCHAR,
            COALESCE((SELECT MAX(order_number) FROM student_assignment_orders WHERE school_year = $2::VARCHAR), 0) + 1
        )
        ON CONFLICT (student_id, school_year) DO UPDATE SET student_id = EXCLUDED.student_id
        RETURNING order_number
    `, [studentId, schoolYear]);

    return insertRes.rows[0].order_number;
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://translate.google.com", "https://translate.googleapis.com", "https://translate-pa.googleapis.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://translate.googleapis.com", "https://www.gstatic.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https://www.gstatic.com", "https://translate.googleapis.com", "https://www.google.com"],
            connectSrc: ["'self'", "http://127.0.0.1:5001", "http://localhost:5001", "https://translate.googleapis.com", "https://translate-pa.googleapis.com"],
            frameSrc: ["'self'", "https://translate.google.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Твърде много заявки. Моля, опитайте отново след малко.' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Твърде много неуспешни опити за вход. Моля, опитайте отново след 15 минути.' }
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Health check DB error:', err.message);
        res.status(503).json({ status: 'error' });
    }
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeTemplateHtml(html) {
    return sanitizeHtml(html, {
        allowedTags: [
            'div', 'span', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'strong', 'b', 'em', 'i', 'u', 'small', 'sub', 'sup',
            'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
            'img'
        ],
        allowedAttributes: {
            '*': ['style', 'class'],
            'img': ['src', 'alt', 'width', 'height', 'style', 'class'],
            'td': ['colspan', 'rowspan', 'style', 'class', 'align'],
            'th': ['colspan', 'rowspan', 'style', 'class', 'align']
        },
        allowedSchemes: ['http', 'https', 'data'],
        allowProtocolRelative: false
    });
}

function sendServerError(res, context, err, extra = {}) {
    console.error(`${context}:`, err && err.message ? err.message : err);
    return res.status(500).json({ ...extra, error: 'Възникна системна грешка.' });
}

app.use(cookieSession({
    name: 'dormsmaster.sid',
    keys: [sessionSecret],
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax'
}));

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        console.warn(`[requireLogin] Denied access to ${req.url} - No userId in session.`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.session.role)) {
        console.warn(`[requireRole] Denied access to ${req.url} for role "${req.session.role}"`);
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

function safeEqualStrings(a, b) {
    const bufA = Buffer.from(String(a), 'utf8');
    const bufB = Buffer.from(String(b), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }
    try {
        const result = await pool.query('SELECT id, username, password, role FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows[0];

        let passwordValid = false;
        if (user && typeof user.password === 'string') {
            if (isBcryptHash(user.password)) {
                passwordValid = await bcrypt.compare(password, user.password);
            } else if (!isProduction && safeEqualStrings(password, user.password)) {
                // One-time transparent upgrade for legacy plaintext passwords outside production
                passwordValid = true;
                const hashed = await bcrypt.hash(password, 12);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
                console.warn(`[Auth] Upgraded legacy plaintext password to bcrypt for user "${user.username}".`);
            }
        }

        if (user && passwordValid) {
            req.session.userId = user.id;
            req.session.role = user.role;
            res.json({ success: true, role: user.role });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, role: req.session.role });
    } else {
        res.json({ authenticated: false });
    }
});

app.get('/api/docs/google-account', requireLogin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const email = (process.env.GOOGLE_ACCOUNT_EMAIL || '').trim();
    const password = (process.env.GOOGLE_ACCOUNT_PASSWORD || '').trim();
    if (!email && !password) {
        return res.json({ configured: false });
    }
    res.json({ configured: true, email, password });
});

app.get('/api/family-statuses', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM family_statuses ORDER BY status_name');
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Fetch Family Statuses Error', err);
    }
});

app.post('/api/family-statuses/:id', requireRole('owner'), async (req, res) => {
    const discount = Number.parseInt(req.body && req.body.discount_percentage, 10);
    if (!Number.isInteger(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({ error: 'Невалиден процент отстъпка (0-100).' });
    }
    try {
        await pool.query(
            'UPDATE family_statuses SET discount_percentage = $1 WHERE id = $2', 
            [discount, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Update Family Status Error', err);
    }
});

app.get('/api/rooms', requireLogin, async (req, res) => {
    try {
        const query = `
            SELECT r.*, 
            COUNT(s.id)::int as current_occupancy,
            STRING_AGG(DISTINCT s.class_number, ', ') as class_numbers
            FROM rooms r 
            LEFT JOIN students s ON r.id = s.room_id AND s.is_assigned = TRUE
            GROUP BY r.id 
            ORDER BY r.room_number
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Rooms Query Error', err);
    }
});

app.get('/api/rooms/:id', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
        res.json(result.rows[0]);
    } catch (err) {
        return sendServerError(res, 'Get Room Error', err);
    }
});

app.post('/api/rooms/:id', requireLogin, async (req, res) => {
    const { capacity, is_in_use, has_problem, problem_details } = req.body;
    try {
        const query = `
            UPDATE rooms SET 
                capacity = $1, 
                is_in_use = $2, 
                has_problem = $3, 
                problem_details = $4
            WHERE id = $5
        `;
        await pool.query(query, [capacity, is_in_use, has_problem, problem_details, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Update Room Error', err);
    }
});

app.get('/api/students', requireLogin, async (req, res) => {
    try {
        const query = `
            SELECT 
                s.*, 
                CASE WHEN s.is_assigned = TRUE THEN r.room_number ELSE NULL END as room_number, 
                CASE WHEN s.is_assigned = TRUE THEN r.capacity ELSE NULL END as room_capacity,
                CASE WHEN s.is_assigned = TRUE THEN s.block ELSE NULL END as block,
                fs.status_name, 
                fs.discount_percentage
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
            LEFT JOIN family_statuses fs ON s.family_status_id = fs.id
            ORDER BY s.last_name, s.first_name
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Fetch Students Error', err);
    }
});

app.post('/api/students', requireLogin, async (req, res) => {
    const {
        first_name, middle_name, last_name, egn, class_number, from_address,
        phone, parent_phone, email, sex, family_status_id,
        punishments, block, room_id, payment_method, notes
    } = req.body;

    try {
        const roomCheck = await pool.query(
            'SELECT capacity, (SELECT COUNT(*) FROM students WHERE room_id = $1 AND is_assigned = TRUE)::int as count FROM rooms WHERE id = $1',
            [room_id]
        );

        if (roomCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Избраната стая е невалидна или не съществува.' });
        }

        const { capacity, count } = roomCheck.rows[0];
        if (count >= capacity) {
            return res.status(400).json({ error: 'Тази стая вече е запълнена до максималния си капацитет.' });
        }

        // Determine fee based on capacity
        const feeKey = capacity === 2 ? 'small_room_fee' : 'large_room_fee';
        const feeSettingsRes = await pool.query("SELECT value FROM settings WHERE key = $1", [feeKey]);
        const calculatedFee = feeSettingsRes.rows.length > 0 ? feeSettingsRes.rows[0].value : (capacity === 2 ? '11.00' : '10.00');

        const isStartOfYear = (req.body.is_start_of_year === true || req.body.is_start_of_year === 'true' || req.body.is_start_of_year === 'on');
        const startOfYearDate = isStartOfYear ? getStartOfSchoolYearDate() : null;

        const query = `
            INSERT INTO students (
                first_name, middle_name, last_name, egn, class_number, from_address, 
                phone, parent_phone, email, sex, family_status_id, 
                punishments, block, room_id, fee, payment_method, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, ${isStartOfYear ? '$18::timestamp' : 'CURRENT_DATE'})
            RETURNING id
        `;
        const values = [
            first_name, middle_name, last_name, egn, class_number, from_address,
            phone, parent_phone, email, sex, family_status_id,
            punishments || 0, block, room_id, calculatedFee, payment_method, notes
        ];
        if (isStartOfYear) {
            values.push(startOfYearDate);
        }
        const result = await pool.query(query, values);
        const newStudentId = result.rows[0].id;
        if (isStartOfYear) {
            await pool.query(
                "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', $2::timestamp)",
                [newStudentId, startOfYearDate]
            );
        } else {
            await pool.query(
                "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', CURRENT_TIMESTAMP)",
                [newStudentId]
            );
        }
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Add Student Error:', err.message);
        let errorMsg = 'Възникна системна грешка при запазване на данните.';
        if (err.message.includes('unique constraint')) {
            errorMsg = 'Вече съществува запис с тези уникални данни (напр. ЕГН).';
        }
        res.status(500).json({ error: errorMsg });
    }
});

app.get('/api/students/:id', requireLogin, async (req, res) => {
    try {
        const schoolYear = getSchoolYear();
        const query = `
            SELECT s.*, 
                   r.room_number,
                   r.capacity as room_capacity,
                   (SELECT action_date FROM student_assignments sa WHERE sa.student_id = s.id ORDER BY sa.id DESC LIMIT 1) as last_status_date,
                   (SELECT order_number FROM student_assignment_orders sao WHERE sao.student_id = s.id AND sao.school_year = $2) as assignment_order_number
            FROM students s 
            LEFT JOIN rooms r ON s.room_id = r.id
            WHERE s.id = $1
        `;
        const result = await pool.query(query, [req.params.id, schoolYear]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Ученикът не е намерен.' });
        res.json(result.rows[0]);
    } catch (err) {
        return sendServerError(res, 'Get Student Error', err);
    }
});

app.get('/api/students/:id/assignment-order-number', requireLogin, async (req, res) => {
    try {
        const orderNumber = await getOrAssignOrderNumber(req.params.id);
        const schoolYear = getSchoolYear();
        res.json({ success: true, order_number: orderNumber, school_year: schoolYear });
    } catch (err) {
        return sendServerError(res, 'Assignment Order Number Error', err, { success: false });
    }
});

app.post('/api/students/:id', requireLogin, async (req, res) => {
    const {
        first_name, middle_name, last_name, egn, class_number, from_address,
        phone, parent_phone, email, sex, family_status_id,
        punishments, block, room_id, payment_method, notes
    } = req.body;

    try {
        const roomCheck = await pool.query(
            'SELECT capacity, (SELECT COUNT(*) FROM students WHERE room_id = $1 AND id != $2 AND is_assigned = TRUE)::int as count FROM rooms WHERE id = $1',
            [room_id, req.params.id]
        );

        if (roomCheck.rows.length === 0) return res.status(400).json({ error: 'Избраната стая е невалидна или не съществува.' });
        const { capacity, count } = roomCheck.rows[0];

        if (count >= capacity) return res.status(400).json({ error: 'Тази стая вече е запълнена до максималния си капацитет.' });

        // Determine fee based on capacity
        const feeKey = capacity === 2 ? 'small_room_fee' : 'large_room_fee';
        const feeSettingsRes = await pool.query("SELECT value FROM settings WHERE key = $1", [feeKey]);
        const calculatedFee = feeSettingsRes.rows.length > 0 ? feeSettingsRes.rows[0].value : (capacity === 2 ? '11.00' : '10.00');

        const query = `
            UPDATE students SET 
                first_name = $1, middle_name = $2, last_name = $3, egn = $4, class_number = $5, 
                from_address = $6, phone = $7, parent_phone = $8, email = $9, 
                sex = $10, family_status_id = $11, punishments = $12, 
                block = $13, room_id = $14, payment_method = $15, notes = $16, fee = $17
            WHERE id = $18
        `;
        const values = [
            first_name, middle_name, last_name, egn, class_number, from_address,
            phone, parent_phone, email, sex, family_status_id,
            punishments || 0, block, room_id, payment_method, notes, calculatedFee, req.params.id
        ];
        await pool.query(query, values);

        if (req.body.is_start_of_year !== undefined) {
            const isStartOfYear = req.body.is_start_of_year === true || req.body.is_start_of_year === 'true' || req.body.is_start_of_year === 'on';
            if (isStartOfYear) {
                const startOfYearDate = getStartOfSchoolYearDate();
                await pool.query(
                    "UPDATE students SET is_assigned = true, created_at = CASE WHEN created_at IS NULL OR created_at > $1::timestamp THEN $1::timestamp ELSE created_at END WHERE id = $2",
                    [startOfYearDate, req.params.id]
                );
                // Clean up any conflicting records within this school year to avoid inversion
                await pool.query(
                    "DELETE FROM student_assignments WHERE student_id = $1 AND action_date >= $2::timestamp",
                    [req.params.id, startOfYearDate]
                );
                await pool.query(
                    "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', $2::timestamp)",
                    [req.params.id, startOfYearDate]
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Update Student Error:', err.message);
        let errorMsg = 'Възникна системна грешка при обновяване на данните.';
        if (err.message.includes('unique constraint')) {
            errorMsg = 'Вече съществува запис с тези уникални данни (напр. ЕГН).';
        }
        res.status(500).json({ error: errorMsg });
    }
});

app.post('/api/students/:id/notes', requireLogin, async (req, res) => {
    const { notes } = req.body;
    try {
        const query = `UPDATE students SET notes = $1 WHERE id = $2`;
        await pool.query(query, [notes, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Update Notes Error', err);
    }
});

app.post('/api/students/:id/assignment', requireLogin, async (req, res) => {
    const { is_assigned, room_id } = req.body;
    const studentId = req.params.id;

    try {
        let targetRoomId = room_id;
        if (is_assigned) {
            if (!targetRoomId) {
                const studentRes = await pool.query('SELECT room_id FROM students WHERE id = $1', [studentId]);
                if (studentRes.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Ученикът не е намерен.' });
                }
                targetRoomId = studentRes.rows[0].room_id;
            }

            const roomRes = await pool.query(`
                SELECT capacity, 
                    (SELECT COUNT(*) FROM students WHERE room_id = $1 AND is_assigned = true) as current_occupancy
                FROM rooms WHERE id = $1
            `, [targetRoomId]);

            if (roomRes.rows.length > 0) {
                const { capacity, current_occupancy } = roomRes.rows[0];
                if (parseInt(current_occupancy) >= parseInt(capacity)) {
                    return res.status(400).json({ success: false, error: 'Тази стая вече е запълнена до максималния си капацитет.' });
                }
            }
        }
        if (is_assigned && targetRoomId) {
            // Updated fee based on room when assigning
            const roomRes = await pool.query('SELECT capacity FROM rooms WHERE id = $1', [targetRoomId]);
            const capacity = roomRes.rows.length > 0 ? roomRes.rows[0].capacity : 2;
            const feeKey = capacity === 2 ? 'small_room_fee' : 'large_room_fee';
            const feeSettingsRes = await pool.query("SELECT value FROM settings WHERE key = $1", [feeKey]);
            const calculatedFee = feeSettingsRes.rows.length > 0 ? feeSettingsRes.rows[0].value : (capacity === 2 ? '11.00' : '10.00');

            await pool.query('UPDATE students SET is_assigned = $1, room_id = $2, fee = $3 WHERE id = $4', [is_assigned, targetRoomId, calculatedFee, studentId]);
        } else {
            await pool.query('UPDATE students SET is_assigned = $1 WHERE id = $2', [is_assigned, studentId]);
        }

        const action = is_assigned ? 'assigned' : 'unassigned';
        const isStartOfYear = is_assigned && (req.body.is_start_of_year === true || req.body.is_start_of_year === 'true' || req.body.is_start_of_year === 'on');

        if (is_assigned) {
            if (isStartOfYear) {
                const startOfYearDate = getStartOfSchoolYearDate();
                await pool.query(
                    "UPDATE students SET created_at = CASE WHEN created_at IS NULL OR created_at > $1::timestamp THEN $1::timestamp ELSE created_at END WHERE id = $2",
                    [startOfYearDate, studentId]
                );
                // Clean up any conflicting records in the current school year
                await pool.query(
                    "DELETE FROM student_assignments WHERE student_id = $1 AND action_date >= $2::timestamp",
                    [studentId, startOfYearDate]
                );
                await pool.query(
                    "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', $2::timestamp)",
                    [studentId, startOfYearDate]
                );
            } else {
                await pool.query(
                    "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', CURRENT_TIMESTAMP)",
                    [studentId]
                );
            }
        } else {
            await pool.query(
                "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'unassigned', CURRENT_TIMESTAMP)",
                [studentId]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Грешка при промяна на статус:', err.message);
        res.status(500).json({ success: false, error: 'Сървърна грешка.' });
    }
});

app.get('/api/students/search', requireLogin, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    try {
        const query = `
            SELECT s.id, s.first_name, s.last_name, s.egn, s.class_number, s.is_assigned, r.room_number 
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
            WHERE s.egn::text ILIKE $1 OR s.class_number::text ILIKE $1
            LIMIT 10
        `;
        const result = await pool.query(query, [`%${q}%`]);
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Student Search Error', err);
    }
});

app.get('/api/students/:id/payment-status', requireLogin, async (req, res) => {
    try {
        const studentId = req.params.id;
        const selectedYear = parseInt(req.query.year) || new Date().getFullYear();
        const studentRes = await pool.query(`
            SELECT s.*, 
            CASE WHEN s.is_assigned = TRUE THEN r.room_number ELSE NULL END as room_number,
            CASE WHEN s.is_assigned = TRUE THEN r.capacity ELSE NULL END as capacity
            FROM students s 
            LEFT JOIN rooms r ON s.room_id = r.id 
            WHERE s.id = $1
        `, [studentId]);

        if (studentRes.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
        const student = studentRes.rows[0];
        const settingsRes = await pool.query("SELECT key, value FROM settings WHERE key IN ('small_room_fee', 'large_room_fee')");
        let globalFees = { small_room_fee: '11.00', large_room_fee: '10.00' };
        settingsRes.rows.forEach(r => { globalFees[r.key] = r.value; });
        let dynamicFee = student.fee;
        if (student.capacity == 2) dynamicFee = globalFees.small_room_fee;
        else if (student.capacity == 3) dynamicFee = globalFees.large_room_fee;
        const globalBaseFee = dynamicFee;
        const monthsRes = await pool.query('SELECT * FROM months ORDER BY id');
        const monthsMap = {};
        monthsRes.rows.forEach(m => monthsMap[m.month_name] = m);
        const paymentsRes = await pool.query(`
            SELECT sp.*, r.room_number as historical_room 
            FROM student_payments sp 
            LEFT JOIN rooms r ON sp.room_id = r.id 
            WHERE sp.student_id = $1`, [studentId]);
        const payments = paymentsRes.rows;

        const assignmentsRes = await pool.query(
            'SELECT * FROM student_assignments WHERE student_id = $1 ORDER BY action_date ASC, id ASC',
            [studentId]
        );
        const assignments = assignmentsRes.rows;
        const latestAssignmentEvent = assignments.length > 0
            ? [...assignments].sort((a, b) => b.id - a.id)[0]
            : null;
        const academicConfig = [
            { name: 'Септември', offset: 0, monthIndex: 8 },
            { name: 'Октомври', offset: 0, monthIndex: 9 },
            { name: 'Ноември', offset: 0, monthIndex: 10 },
            { name: 'Декември', offset: 0, monthIndex: 11 },
            { name: 'Януари', offset: 1, monthIndex: 0 },
            { name: 'Февруари', offset: 1, monthIndex: 1 },
            { name: 'Март', offset: 1, monthIndex: 2 },
            { name: 'Април', offset: 1, monthIndex: 3 },
            { name: 'Май', offset: 1, monthIndex: 4 },
            { name: 'Юни', offset: 1, monthIndex: 5 }
        ];

        const now = new Date();
        const firstAssignment = assignments.length > 0 ? assignments[0] : null;
        let effectiveStartDate = student.created_at ? new Date(student.created_at) : new Date();
        if (firstAssignment && new Date(firstAssignment.action_date) < effectiveStartDate) {
            effectiveStartDate = new Date(firstAssignment.action_date);
        }
        const effectiveStartMonth = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth(), 1);
        const effectiveStartDateOnly = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth(), effectiveStartDate.getDate());
        const status = [];
        academicConfig.forEach(cfg => {
            const mData = monthsMap[cfg.name];
            if (!mData) return;

            const actualYear = selectedYear + cfg.offset;
            const monthDate = new Date(actualYear, cfg.monthIndex, 1);
            const isBeforeCreation = monthDate < effectiveStartMonth;
            const isCreationMonth = monthDate.getTime() === effectiveStartMonth.getTime();
            const isFuture = monthDate > now;
            
            // Filter all payments for this specific month/year
            const monthPayments = payments.filter(p => p.month_id === mData.id && p.year === actualYear);
            const totalAmountPaid = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0);
            const totalDaysPaid = monthPayments.reduce((sum, p) => sum + parseFloat(p.days_paid || 0), 0);
            
            let finalDays = parseFloat(mData.fee_multiplier || 0);

            let activeDays = 0;
            const actualDaysInMonth = new Date(actualYear, cfg.monthIndex + 1, 0).getDate();
            let isFullyAssigned = true;
            for (let d = 1; d <= 30; d++) {
                let actualDayToUse = d;
                if (actualDayToUse > actualDaysInMonth) {
                    actualDayToUse = actualDaysInMonth;
                }

                const dayStart = new Date(actualYear, cfg.monthIndex, actualDayToUse, 0, 0, 0);
                let dayEnd = new Date(actualYear, cfg.monthIndex, actualDayToUse, 23, 59, 59);
                if (d === 30 && actualDaysInMonth === 31) {
                    dayEnd = new Date(actualYear, cfg.monthIndex, 31, 23, 59, 59);
                }

                if (dayEnd < effectiveStartDateOnly) {
                    isFullyAssigned = false;
                    continue;
                }
                const eventsSoFar = assignments.filter(a => new Date(a.action_date) <= dayEnd);
                const lastEvent = eventsSoFar.length > 0 ? eventsSoFar[eventsSoFar.length - 1] : null;

                if (student.is_assigned && latestAssignmentEvent && latestAssignmentEvent.action === 'assigned' && dayEnd >= new Date(latestAssignmentEvent.action_date)) {
                    activeDays++;
                } else if (lastEvent) {
                    if (lastEvent.action === 'assigned') {
                        activeDays++;
                    } else if (lastEvent.action === 'unassigned') {
                        const eventDate = new Date(lastEvent.action_date);
                        if (eventDate >= dayStart && eventDate <= dayEnd) {
                            activeDays++;
                        } else {
                            isFullyAssigned = false;
                        }
                    }
                } else if (student.is_assigned) {
                    activeDays++;
                } else {
                    isFullyAssigned = false;
                }
            }
            if (isBeforeCreation && !isCreationMonth) {
                finalDays = 0;
            } else if (isFullyAssigned && !isCreationMonth) {
                finalDays = parseFloat(mData.fee_multiplier || 30);
            } else {
                finalDays = activeDays;
            }

            if (cfg.name === 'Септември' && finalDays === 16) {
                finalDays = 15;
            }

            const baseToUse = isFuture ? globalBaseFee : dynamicFee;
            
            // A month is considered "Fully Paid" only if TotalDaysPaid >= finalDays
            const isPaid = (totalDaysPaid >= finalDays && finalDays > 0);
            const isPartiallyPaid = (totalDaysPaid > 0 && totalDaysPaid < finalDays);
            
            const remainingDays = Math.max(0, finalDays - totalDaysPaid);
            const amountDue = (parseFloat(baseToUse) * remainingDays).toFixed(2);

            status.push({
                month_id: mData.id,
                month_name: mData.month_name,
                year: actualYear,
                amount_due: amountDue, // This is now the "Remaining" amount
                total_amount_paid: totalAmountPaid.toFixed(2),
                is_paid: isPaid,
                is_partially_paid: isPartiallyPaid,
                is_before_creation: isBeforeCreation,
                monthly_base_fee: baseToUse,
                calculated_days: finalDays,
                total_days_paid: totalDaysPaid,
                remaining_days: remainingDays,
                historical_room: monthPayments.length > 0 ? monthPayments[monthPayments.length - 1].historical_room : null
            });
        });

        res.json({
            student: student,
            months: status,
            additional_payments: paymentsRes.rows.filter(p => p.date_from !== null)
        });

    } catch (err) {
        return sendServerError(res, 'Payment Status Error', err);
    }
});

app.post('/api/students/:id/process-payment', requireLogin, async (req, res) => {
    const client = await pool.connect();
    try {
        const studentId = req.params.id;
        const { payments, payment_method } = req.body;
        const paymentIds = [];

        if (!payments || !Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ success: false, error: "Няма избрани месеци." });
        }

        await client.query('BEGIN');

        const studentRoomRes = await client.query('SELECT room_id FROM students WHERE id = $1', [studentId]);
        const currentRoomId = studentRoomRes.rows.length > 0 ? studentRoomRes.rows[0].room_id : null;

        for (const p of payments) {
            const amount = parseFloat(p.amount_paid) || 0;

            const query = `
                INSERT INTO student_payments 
                (student_id, month_id, year, amount_paid, is_paid, payment_date, payment_method, room_id, days_paid)
                VALUES ($1, $2, $3, $4, true, NOW(), $5, $6, $7) 
                RETURNING id
            `;

            const result = await client.query(query, [
                studentId,    // $1
                p.month_id,   // $2
                p.year,       // $3
                amount,       // $4
                payment_method, // $5
                currentRoomId, // $6
                parseFloat(p.days) || 0 // $7
            ]);
            if (result.rows.length > 0) {
                paymentIds.push(result.rows[0].id);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, payment_id: paymentIds.length > 0 ? paymentIds[0] : null });
    } catch (err) {
        await client.query('ROLLBACK');
        return sendServerError(res, 'Payment Transaction Error', err, { success: false });
    } finally {
        client.release();
    }
});
app.post('/api/students/:id/process-additional-payment', requireLogin, async (req, res) => {
    const client = await pool.connect();
    try {
        const studentId = req.params.id;
        const { payments, payment_method } = req.body;
        const paymentIds = [];

        if (!payments || !Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ success: false, error: "Няма избрани плащания." });
        }

        await client.query('BEGIN');
        const studentRoomRes = await client.query('SELECT room_id FROM students WHERE id = $1', [studentId]);
        const currentRoomId = studentRoomRes.rows.length > 0 ? studentRoomRes.rows[0].room_id : null;

        for (const p of payments) {
            const check = await client.query(`
                SELECT id FROM student_payments 
                WHERE student_id = $1 AND month_id = $2 AND year = $3 AND is_paid = true
                  AND date_from IS NOT NULL AND date_to IS NOT NULL
                  AND date_from <= $4 AND date_to >= $5
            `, [studentId, p.month_id, p.year, p.date_to, p.date_from]);

            if (check.rows.length > 0) {
                 throw new Error(`Вече има плащане за застъпващ се период в месец ${p.month_id}`);
            }

            const amount = parseFloat(p.amount_paid) || 0;
            const query = `
                INSERT INTO student_payments
                (student_id, month_id, year, amount_paid, is_paid, payment_date, payment_method, room_id, date_from, date_to)
                VALUES ($1, $2, $3, $4, true, NOW(), $5, $6, $7, $8)
                RETURNING id
            `;

            const result = await client.query(query, [
                studentId, p.month_id, p.year, amount, payment_method, currentRoomId, p.date_from, p.date_to
            ]);
            paymentIds.push(result.rows[0].id);
        }

        await client.query('COMMIT');
        res.json({ success: true, payment_id: paymentIds.length > 0 ? paymentIds[0] : null });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err && err.message && err.message.startsWith('Вече има плащане')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        return sendServerError(res, 'Additional Payment Error', err, { success: false });
    } finally {
        client.release();
    }
});

app.get('/api/reports/daily-payments', requireLogin, async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.payment_date, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, COALESCE(r.block, s.block) as block,
                CASE WHEN sp.date_from IS NOT NULL AND sp.date_to IS NOT NULL THEN TO_CHAR(sp.date_from, 'DD.MM.YYYY') || ' - ' || TO_CHAR(sp.date_to, 'DD.MM.YYYY') ELSE m.month_name END as month_name, sp.year, sp.amount_paid as amount, sp.payment_method, r.room_number
            FROM student_payments sp
            JOIN students s ON sp.student_id = s.id
            JOIN months m ON sp.month_id = m.id
            LEFT JOIN rooms r ON sp.room_id = r.id
            WHERE DATE(sp.payment_date) = CURRENT_DATE
            AND sp.is_paid = true
            ORDER BY sp.payment_date DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Daily Payments Report Error', err);
    }
});

app.get('/api/reports/period-payments', requireLogin, async (req, res) => {
    const { from, to } = req.query;
    try {
        const query = `
            SELECT 
                sp.payment_date, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, COALESCE(r.block, s.block) as block,
                CASE WHEN sp.date_from IS NOT NULL AND sp.date_to IS NOT NULL THEN TO_CHAR(sp.date_from, 'DD.MM.YYYY') || ' - ' || TO_CHAR(sp.date_to, 'DD.MM.YYYY') ELSE m.month_name END as month_name, sp.year, sp.amount_paid as amount, sp.payment_method, r.room_number
            FROM student_payments sp
            JOIN students s ON sp.student_id = s.id
            JOIN months m ON sp.month_id = m.id
            LEFT JOIN rooms r ON sp.room_id = r.id
            WHERE DATE(sp.payment_date) >= $1::date 
            AND DATE(sp.payment_date) <= $2::date
            AND sp.is_paid = true
            ORDER BY sp.payment_date DESC
        `;
        const result = await pool.query(query, [from, to]);
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Period Payments Report Error', err);
    }
});

app.post('/api/reports/status-period', requireLogin, async (req, res) => {
    const { periods, block } = req.body || {};
    if (!Array.isArray(periods) || periods.length === 0) return res.json([]);

    const validPeriods = [];
    for (const p of periods) {
        const monthId = Number.parseInt(p && p.month_id, 10);
        const year = Number.parseInt(p && p.year, 10);
        if (!Number.isInteger(monthId) || !Number.isInteger(year) || monthId < 1 || monthId > 12 || year < 2000 || year > 2100) {
            return res.status(400).json({ error: 'Невалиден период.' });
        }
        validPeriods.push({
            month_id: monthId,
            year,
            month_name: typeof p.month_name === 'string' ? p.month_name : ''
        });
    }

    try {
        let studentsQuery = `
            SELECT s.id, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, s.block, s.is_assigned, r.room_number 
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
        `;
        const queryParams = [];
        if (block) {
            studentsQuery += ` WHERE s.block = $1`;
            queryParams.push(String(block));
        }
        studentsQuery += ` ORDER BY s.block, r.room_number, s.first_name`;

        const studentsRes = await pool.query(studentsQuery, queryParams);
        const students = studentsRes.rows;

        const paymentParams = [];
        const periodConditions = validPeriods.map(p => {
            const mIdx = paymentParams.push(p.month_id);
            const yIdx = paymentParams.push(p.year);
            return `(month_id = $${mIdx} AND year = $${yIdx})`;
        }).join(' OR ');

        const paymentsQuery = `SELECT student_id, month_id, year, is_paid FROM student_payments WHERE ${periodConditions}`;
        const paymentsRes = await pool.query(paymentsQuery, paymentParams);
        const payments = paymentsRes.rows;
        const results = [];
        students.forEach(s => {
            validPeriods.forEach(p => {
                const payment = payments.find(pay => pay.student_id === s.id && pay.month_id === p.month_id && pay.year === p.year);
                const isPaid = payment && payment.is_paid;

                results.push({
                    block: s.block || '1',
                    room: s.room_number || '-',
                    egn: s.egn || '-',
                    name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`,
                    class_number: s.class_number,
                    is_assigned: s.is_assigned,
                    year: p.year,
                    month: p.month_name.toUpperCase(),
                    rent_paid: isPaid ? 'ПЛАТЕНО' : 'НЕПЛАТЕНО',
                    cons_paid: 'НЕ'
                });
            });
        });

        res.json(results);
    } catch (err) {
        console.error('Грешка при справката за период:', err.message);
        res.status(500).json({ error: 'Възникна системна грешка.' });
    }
});

app.get('/api/months', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM months ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        return sendServerError(res, 'Get Months Error', err);
    }
});

app.post('/api/months/:id', requireRole('owner'), async (req, res) => {
    const multiplier = Number.parseFloat(req.body && req.body.fee_multiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 31) {
        return res.status(400).json({ error: 'Невалиден брой дни (0-31).' });
    }
    try {
        await pool.query('UPDATE months SET fee_multiplier = $1 WHERE id = $2', [multiplier, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Update Month Error', err);
    }
});

app.get('/api/settings/fees', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT key, value FROM settings WHERE key IN ('small_room_fee', 'large_room_fee')");
        let fees = { small_room_fee: '11.00', large_room_fee: '10.00' };
        result.rows.forEach(row => { fees[row.key] = row.value; });
        res.json(fees);
    } catch (err) {
        return sendServerError(res, 'Get Fees Error', err);
    }
});

app.post('/api/settings/fees', requireRole('owner'), async (req, res) => {
    const { small_room_fee, large_room_fee, update_all } = req.body || {};
    const smallFee = Number.parseFloat(small_room_fee);
    const largeFee = Number.parseFloat(large_room_fee);
    if (!Number.isFinite(smallFee) || smallFee < 0 || !Number.isFinite(largeFee) || largeFee < 0) {
        return res.status(400).json({ error: 'Невалидни стойности за такси.' });
    }
    try {
        await pool.query(`INSERT INTO settings (key, value, updated_at) VALUES ('small_room_fee', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [small_room_fee]);
        await pool.query(`INSERT INTO settings (key, value, updated_at) VALUES ('large_room_fee', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [large_room_fee]);
        if (update_all) {
            await pool.query(`
                UPDATE students 
                SET fee = CASE 
                    WHEN room_id IN (SELECT id FROM rooms WHERE capacity = 2) THEN $1
                    WHEN room_id IN (SELECT id FROM rooms WHERE capacity = 3) THEN $2
                    ELSE fee 
                END
            `, [small_room_fee, large_room_fee]);
        }
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Update Fees Error', err);
    }
});

app.get('/api/settings/template', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'report_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        return sendServerError(res, 'Get Template Error', err);
    }
});

app.post('/api/settings/template', requireRole('owner'), async (req, res) => {
    const { template_id } = req.body || {};
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('report_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Save Template Error', err);
    }
});

app.get('/api/settings/template-footer', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'report_footer_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        return sendServerError(res, 'Get Footer Template Error', err);
    }
});

app.post('/api/settings/template-footer', requireRole('owner'), async (req, res) => {
    const { template_id } = req.body || {};
    try {
        templateIdMemoryCache['report_footer_template_id'] = template_id;
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('report_footer_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Save Footer Template Error', err);
    }
});

const DEFAULT_LOCAL_TEMPLATES = {
    assignment: `<div style="display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0;">
    <img src="/img/logo.png" alt="Лого" style="height: 65px; width: 85px; object-fit: contain; flex-shrink: 0;">
    <div style="flex: 1; text-align: center; font-size: 13.5px; font-weight: 700; color: #0f172a; line-height: 1.35; white-space: pre-wrap;">НАЦИОНАЛНА ПРОФЕСИОНАЛНА ГИМНАЗИЯ ПО КОМПЮТЪРНИ ТЕХНОЛОГИИ И СИСТЕМИ – ГР. ПРАВЕЦ при ТУ – СОФИЯ</div>
    <div style="width: 85px; flex-shrink: 0;"></div>
</div>

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; white-space: pre-wrap;">
    <div style="font-weight: 700; font-size: 14px; color: #1e293b; white-space: pre-wrap;">№: $номер_заповед</div>
    <div style="font-size: 13px; color: #64748b; font-weight: 500; white-space: pre-wrap;">№: Д-551/14.09.2026г.</div>
</div>

<div style="text-align: center; margin-bottom: 28px; white-space: pre-wrap;">
    <h1 style="font-size: 24px; font-weight: 800; letter-spacing: 2px; margin: 0 0 6px 0; color: #0f172a; text-transform: uppercase; white-space: pre-wrap;">ЗАПОВЕД</h1>
    <h3 style="font-size: 15px; font-weight: 600; margin: 0; color: #475569; white-space: pre-wrap;">за настаняване в общежитие</h3>
</div>

<p style="text-align: justify; font-size: 13.5px; line-height: 1.6; margin-bottom: 24px; color: #334155; white-space: pre-wrap;">
    На основание чл. 258, ал. 1 от Закона за предучилищното и училищното образование, Правилника за устройството и дейността на ученическите общежития, Правилника за вътрешния ред.
</p>

<div style="margin-bottom: 28px; font-size: 14.5px;">
    <div style="font-weight: 600; color: #475569; margin-bottom: 12px; white-space: pre-wrap;">Настанява се ученикът/чката:</div>
    <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 5px 0; width: 200px; font-weight: 600; color: #475569; white-space: pre-wrap;">Име:</td><td style="padding: 5px 0; font-weight: 700; color: #0f172a; font-size: 15px; white-space: pre-wrap;">$име</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">ЕГН:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$егн</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Курс / Клас:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$курс</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Постоянен адрес:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$адрес</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Пол:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$пол</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Телефон на ученик:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$телефон</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Телефон на родител:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$телефон_родител</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Имейл:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$имейл</td></tr>
        <tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Метод на плащане:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$метод_плащане</td></tr>
    </table>
</div>

<div style="margin: 25px 0 35px 0; font-size: 14.5px; font-weight: normal; color: #1e293b; white-space: pre-wrap;">Да бъде настанен/а в: Блок: $блок, Стая: $стая</div>

<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 50px; font-size: 14.5px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
    <div style="white-space: pre-wrap;"><strong>Дата:</strong> $дата г.</div>
    <div style="text-align: right; white-space: pre-wrap;">
        <div><strong>Подпис: ....................................</strong></div>
        <div style="margin-top: 6px; font-size: 13.5px; color: #334155; font-weight: normal; white-space: pre-wrap;">Директор</div>
    </div>
</div>`,

    clearance: `<div style="display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0;">
    <img src="/img/logo.png" alt="Лого" style="height: 65px; width: 85px; object-fit: contain; flex-shrink: 0;">
    <div style="flex: 1; text-align: center; font-size: 13.5px; font-weight: 700; color: #0f172a; line-height: 1.35; white-space: pre-wrap;">НАЦИОНАЛНА ПРОФЕСИОНАЛНА ГИМНАЗИЯ ПО КОМПЮТЪРНИ ТЕХНОЛОГИИ И СИСТЕМИ – ГР. ПРАВЕЦ при ТУ – СОФИЯ</div>
    <div style="width: 85px; flex-shrink: 0;"></div>
</div>

<div style="text-align: center; margin-bottom: 28px; white-space: pre-wrap;">
    <h1 style="font-size: 22px; font-weight: 800; letter-spacing: 2px; margin: 0 0 6px 0; color: #0f172a; text-transform: uppercase; white-space: pre-wrap;">ОБХОДЕН ЛИСТ</h1>
    <div style="font-size: 13px; font-weight: 600; color: #64748b; letter-spacing: 0.5px; white-space: pre-wrap;">УЧЕНИЧЕСКО ОБЩЕЖИТИЕ</div>
</div>

<div style="margin-bottom: 28px;">
    <div style="display: flex; flex-direction: column; gap: 7px; font-size: 14.5px;">
        <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">Име: $име</div>
        <div style="color: #334155; white-space: pre-wrap;">ЕГН: $егн</div>
        <div style="color: #334155; white-space: pre-wrap;">Курс / Клас: $курс &nbsp;&nbsp;&nbsp;&nbsp; Блок: $блок &nbsp;&nbsp;&nbsp;&nbsp; Стая: $стая</div>
    </div>
</div>

<div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
    <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 11px 20px; font-weight: 700; font-size: 13px; color: #475569; display: flex; justify-content: space-between;">
        <span>ЗАВЕРЯВАЩ ОТДЕЛ</span>
        <span style="display: flex; gap: 60px;">
            <span>СТАТУС</span>
            <span style="margin-right: 40px;">ПОДПИС</span>
        </span>
    </div>
    <div style="padding: 4px 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #f1f5f9; font-size: 14.5px; white-space: pre-wrap;">
            <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">1. Счетоводство</div>
            <div style="display: flex; gap: 40px; align-items: center;">
                <span style="font-weight: 700; color: #15803d; white-space: pre-wrap;">НЕ ДЪЛЖИ</span>
                <span style="color: #94a3b8; font-size: 13px;">Подпис: ....................</span>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #f1f5f9; font-size: 14.5px; white-space: pre-wrap;">
            <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">2. Хранителен блок</div>
            <div style="display: flex; gap: 40px; align-items: center;">
                <span style="font-weight: 700; color: #15803d; white-space: pre-wrap;">НЕ ДЪЛЖИ</span>
                <span style="color: #94a3b8; font-size: 13px;">Подпис: ....................</span>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 13px 0; font-size: 14.5px; white-space: pre-wrap;">
            <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">3. Общежитие</div>
            <div style="display: flex; gap: 40px; align-items: center;">
                <span style="font-weight: 700; color: #15803d; white-space: pre-wrap;">НЕ ДЪЛЖИ</span>
                <span style="color: #94a3b8; font-size: 13px;">Подпис: ....................</span>
            </div>
        </div>
    </div>
</div>

<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 50px; font-size: 14.5px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
    <div style="white-space: pre-wrap;"><strong>Дата:</strong> $дата г.</div>
    <div style="text-align: right; white-space: pre-wrap;">
        <div><strong>Подпис: ....................................</strong></div>
    </div>
</div>`
};

function renderTemplateWithData(templateHtml, data) {
    let result = sanitizeTemplateHtml(templateHtml || '');
    const sortedKeys = Object.keys(data).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const rawVal = data[key] !== undefined && data[key] !== null ? String(data[key]) : '-';
        const safeVal = escapeHtml(rawVal);
        result = result.split('$' + key).join(safeVal);
    }
    return result;
}

function wrapDocumentForPrint(title, innerContent) {
    const safeTitle = escapeHtml(title || 'Документ');
    return `<!DOCTYPE html>
<html lang="bg">
<head>
    <meta charset="utf-8">
    <base href="/">
    <title>${safeTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4 portrait;
            margin: 15mm 20mm;
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 0;
            padding: 24px;
            background: #f8fafc;
            color: #1e293b;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .container {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
            padding: 50px 60px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            min-height: 250mm;
        }
        .no-print-bar {
            max-width: 820px;
            margin: 0 auto 20px auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            padding: 12px 22px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
        }
        .doc-tag {
            font-weight: 700;
            color: #0f172a;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .btn-group {
            display: flex;
            gap: 10px;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 18px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 13.5px;
            cursor: pointer;
            border: none;
            transition: all 0.15s ease-in-out;
            font-family: inherit;
        }
        .btn-print {
            background: #2563eb;
            color: #ffffff;
        }
        .btn-print:hover {
            background: #1d4ed8;
        }
        .btn-close {
            background: #ffffff;
            color: #475569;
            border: 1px solid #cbd5e1;
        }
        .btn-close:hover {
            background: #f8fafc;
            border-color: #94a3b8;
        }
        @media print {
            body {
                background: white !important;
                padding: 0 !important;
            }
            .no-print-bar {
                display: none !important;
            }
            .container {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                max-width: 100% !important;
                border-radius: 0 !important;
                min-height: auto !important;
            }
        }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <div class="doc-tag">${safeTitle}</div>
        <div class="btn-group">
            <button class="btn btn-print" onclick="window.print()">Принтирай отново</button>
            <button class="btn btn-close" onclick="window.close()">Затвори</button>
        </div>
    </div>
    <div class="container">
        ${innerContent}
    </div>
    <script>
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.print();
            }, 300);
        });
    </script>
</body>
</html>`;
}

// Local template endpoints
app.get('/api/settings/local-template/:type', requireLogin, async (req, res) => {
    const { type } = req.params;
    if (!DEFAULT_LOCAL_TEMPLATES[type]) {
        return res.status(400).json({ success: false, error: 'Невалиден тип шаблон.' });
    }
    try {
        const result = await pool.query("SELECT key, value FROM settings WHERE key IN ($1, $2)", [
            `local_template_${type}`,
            `local_template_${type}_sections`
        ]);
        let customValue = null;
        let sections = null;
        for (const row of result.rows) {
            if (row.key === `local_template_${type}`) customValue = row.value;
            if (row.key === `local_template_${type}_sections`) {
                try { sections = JSON.parse(row.value); } catch (e) {}
            }
        }
        res.json({
            success: true,
            type,
            template: customValue || DEFAULT_LOCAL_TEMPLATES[type],
            sections: sections,
            isCustom: !!customValue,
            defaultTemplate: DEFAULT_LOCAL_TEMPLATES[type]
        });
    } catch (err) {
        return sendServerError(res, 'Get Local Template Error', err, { success: false });
    }
});

app.post('/api/settings/local-template/:type', requireRole('owner'), async (req, res) => {
    const { type } = req.params;
    const { template, sections } = req.body || {};
    if (!DEFAULT_LOCAL_TEMPLATES[type]) {
        return res.status(400).json({ success: false, error: 'Невалиден тип шаблон.' });
    }
    if (typeof template !== 'string' || !template.trim()) {
        return res.status(400).json({ success: false, error: 'Шаблонът не може да бъде празен.' });
    }
    const cleanTemplate = sanitizeTemplateHtml(template.trim());
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ($1, $2, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `, [`local_template_${type}`, cleanTemplate]);

        if (sections) {
            const sectionsStr = typeof sections === 'string' ? sections : JSON.stringify(sections);
            await pool.query(`
                INSERT INTO settings (key, value, updated_at) 
                VALUES ($1, $2, NOW()) 
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
            `, [`local_template_${type}_sections`, sectionsStr]);
        }

        res.json({ success: true, message: 'Шаблонът беше запазен успешно.' });
    } catch (err) {
        return sendServerError(res, 'Save Local Template Error', err, { success: false });
    }
});

app.post('/api/settings/local-template/:type/reset', requireRole('owner'), async (req, res) => {
    const { type } = req.params;
    if (!DEFAULT_LOCAL_TEMPLATES[type]) {
        return res.status(400).json({ success: false, error: 'Невалиден тип шаблон.' });
    }
    try {
        await pool.query("DELETE FROM settings WHERE key IN ($1, $2)", [
            `local_template_${type}`,
            `local_template_${type}_sections`
        ]);
        res.json({
            success: true,
            template: DEFAULT_LOCAL_TEMPLATES[type],
            message: 'Стандартният шаблон беше възстановен.'
        });
    } catch (err) {
        return sendServerError(res, 'Reset Local Template Error', err, { success: false });
    }
});

app.get('/api/settings/template-assignment', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'assignment_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        return sendServerError(res, 'Get Assignment Template Error', err);
    }
});

app.post('/api/settings/template-assignment', requireRole('owner'), async (req, res) => {
    const { template_id } = req.body || {};
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('assignment_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Save Assignment Template Error', err);
    }
});

app.get('/api/settings/template-clearance', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'clearance_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        return sendServerError(res, 'Get Clearance Template Error', err);
    }
});

app.post('/api/settings/template-clearance', requireRole('owner'), async (req, res) => {
    const { template_id } = req.body || {};
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('clearance_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        return sendServerError(res, 'Save Clearance Template Error', err);
    }
});

app.post('/api/settings/reset-assignment-orders', requireRole('owner'), async (req, res) => {
    try {
        const schoolYear = getSchoolYear();
        await pool.query('DELETE FROM student_assignment_orders WHERE school_year = $1', [schoolYear]);
        res.json({ success: true, message: `Номерацията за учебна година ${schoolYear} беше нулирана.` });
    } catch (err) {
        return sendServerError(res, 'Reset Assignment Orders Error', err);
    }
});

const templateIdMemoryCache = {};

function buildGoogleScriptUrl(params = {}) {
    if (!GOOGLE_SCRIPT_BASE_URL) return null;
    const url = new URL(GOOGLE_SCRIPT_BASE_URL);
    if (GOOGLE_SCRIPT_TOKEN) {
        url.searchParams.set('token', GOOGLE_SCRIPT_TOKEN);
    }
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
            url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}

async function postToGoogleScript(payload, timeoutMs = 45000) {
    if (!GOOGLE_SCRIPT_BASE_URL) {
        throw new Error('Google Apps Script интеграцията не е конфигурирана (липсва GOOGLE_SCRIPT_URL).');
    }
    const bodyWithAuth = {
        ...payload,
        apiToken: GOOGLE_SCRIPT_TOKEN
    };
    const resp = await fetch(GOOGLE_SCRIPT_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyWithAuth),
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!resp.ok) {
        throw new Error(`Google Apps Script HTTP ${resp.status}`);
    }
    return resp.json();
}

// Fast non-blocking lookup: checks in-memory cache then DB (0ms, no network delay)
async function getFastCachedTemplateId(key) {
    if (templateIdMemoryCache[key]) {
        return templateIdMemoryCache[key];
    }
    try {
        const res = await pool.query("SELECT value FROM settings WHERE key = $1 AND value IS NOT NULL AND value != ''", [key]);
        if (res.rows.length > 0 && res.rows[0].value) {
            templateIdMemoryCache[key] = res.rows[0].value;
            return res.rows[0].value;
        }
    } catch (e) {}
    return null;
}

// Background warm-up and template fetch (runs asynchronously, never blocks users)
async function getCachedTemplateId(key, templateParam) {
    const cached = await getFastCachedTemplateId(key);
    if (cached) return cached;
    const url = buildGoogleScriptUrl({ template: templateParam, json: 1 });
    if (!url) return null;
    try {
        const resp = await fetch(url, {
            signal: AbortSignal.timeout(30000)
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.id) {
                templateIdMemoryCache[key] = data.id;
                await pool.query(`
                    INSERT INTO settings (key, value, updated_at) 
                    VALUES ($1, $2, NOW()) 
                    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
                `, [key, data.id]);
                console.log(`[Templates] Successfully cached ${key}:`, data.id);
                return data.id;
            }
        }
    } catch (e) {
        console.warn(`[Templates] Background template fetch note for ${key}:`, e.message);
    }
    return null;
}

// Background warm-up function: pre-warms Google Apps Script & caches template IDs
async function warmUpGoogleAppsScript() {
    if (!GOOGLE_SCRIPT_BASE_URL) {
        console.log('[GoogleDocs Warmup] GOOGLE_SCRIPT_URL not set; skipping warmup.');
        return;
    }
    try {
        console.log('[GoogleDocs Warmup] Pre-warming Google Apps Script and pre-fetching templates in background...');
        try {
            const pingUrl = buildGoogleScriptUrl({ ping: 1 });
            await fetch(pingUrl, { signal: AbortSignal.timeout(15000) });
        } catch (e) {}
        await getCachedTemplateId('report_template_id', 'header');
        await getCachedTemplateId('report_footer_template_id', 'footer');
        console.log('[GoogleDocs Warmup] Complete! Google Docs report export is hot and ready.');
    } catch (err) {
        console.warn('[GoogleDocs Warmup] Background warmup note:', err.message);
    }
}

// Authenticated proxy endpoints for Google Apps Script (keeps script URL & token server-side)
app.post('/api/google/export', requireLogin, async (req, res) => {
    const allowedExportTypes = new Set(['docs', 'excel', 'docs_short']);
    const payload = req.body || {};
    if (!allowedExportTypes.has(payload.exportType)) {
        return res.status(400).json({ success: false, error: 'Невалиден тип експорт.' });
    }
    try {
        const result = await postToGoogleScript(payload, 60000);
        res.json(result);
    } catch (err) {
        console.error('Google Export Proxy Error:', err.message);
        res.status(502).json({ success: false, error: 'Грешка при връзка с Google Docs услугата.' });
    }
});

app.get('/api/google/template-url/:type', requireLogin, async (req, res) => {
    const { type } = req.params;
    const allowedTypes = new Set(['header', 'footer', 'assignment', 'clearance']);
    if (!allowedTypes.has(type)) {
        return res.status(400).json({ success: false, error: 'Невалиден тип шаблон.' });
    }
    const url = buildGoogleScriptUrl({ template: type, json: 1 });
    if (!url) {
        return res.status(503).json({ success: false, error: 'Google Apps Script не е конфигуриран.' });
    }
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
        const data = await resp.json();
        if (data && data.success && data.url) {
            return res.json({ success: true, url: data.url, id: data.id });
        }
        res.status(502).json({ success: false, error: (data && data.error) || 'Неуспешно зареждане на шаблона.' });
    } catch (err) {
        console.error('Google Template URL Error:', err.message);
        res.status(502).json({ success: false, error: 'Грешка при връзка с Google Docs услугата.' });
    }
});

// Keep Google Apps Script container warm 24/7 so generation is always fast (2-4s)
cron.schedule('*/4 * * * *', async () => {
    const pingUrl = buildGoogleScriptUrl({ ping: 1 });
    if (!pingUrl) return;
    try {
        await fetch(pingUrl, {
            signal: AbortSignal.timeout(15000)
        });
    } catch (e) {
        // Silently ignore ping failures
    }
});

app.post('/api/documents/generate-assignment', requireLogin, async (req, res) => {
    const { studentId, is_start_of_year } = req.body;
    try {
        const studentRes = await pool.query(`
            SELECT s.*, 
                   r.room_number, r.capacity as room_capacity,
                   (SELECT action_date FROM student_assignments sa WHERE sa.student_id = s.id ORDER BY sa.id DESC LIMIT 1) as last_status_date
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
            WHERE s.id = $1
        `, [studentId]);

        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ученикът не е намерен.' });
        }
        const student = studentRes.rows[0];

        let orderNumber = '';
        try {
            const num = await getOrAssignOrderNumber(studentId);
            const schoolYear = getSchoolYear();
            orderNumber = `${schoolYear} - ${num}`;
        } catch (e) {
            console.warn('Could not determine order number:', e.message);
        }

        let roomNum = student.room_number || student.room_id || '-';
        if (roomNum !== '-' && student.room_capacity) {
            roomNum += (student.room_capacity === 3 ? 'G' : 'M');
        }

        let isStart = is_start_of_year;
        if (isStart === undefined || isStart === null) {
            if (student.last_status_date) {
                const lsd = new Date(student.last_status_date);
                isStart = (lsd.getMonth() === 8 && lsd.getDate() === 15);
            } else {
                isStart = false;
            }
        }

        const now = new Date();
        const startYear = (now.getMonth() + 1 >= 9) ? now.getFullYear() : now.getFullYear() - 1;
        const assignmentDate = isStart ? `15.09.${startYear}` : `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;

        const studentData = {
            номер_заповед: orderNumber,
            име: `${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.trim() || '-',
            егн: student.egn || '-',
            стая: roomNum,
            блок: student.block || '-',
            курс: student.class_number || '-',
            адрес: student.from_address || '-',
            телефон: student.phone || '-',
            телефон_родител: student.parent_phone || '-',
            имейл: student.email || '-',
            пол: student.sex === 'male' ? 'Мъж' : (student.sex === 'female' ? 'Жена' : '-'),
            метод_плащане: student.payment_method === 'cash' ? 'В брой' : (student.payment_method === 'card' ? 'Карта' : 'Банков път'),
            дата: assignmentDate
        };

        // Fetch custom template if exists, else default
        let templateHtml = DEFAULT_LOCAL_TEMPLATES.assignment;
        try {
            const tplRes = await pool.query("SELECT value FROM settings WHERE key = 'local_template_assignment'");
            if (tplRes.rows.length > 0 && tplRes.rows[0].value) {
                templateHtml = tplRes.rows[0].value;
            }
        } catch (e) {}

        const innerContent = renderTemplateWithData(templateHtml, studentData);
        const fullHtml = wrapDocumentForPrint('Заповед за настаняване - ' + studentData.име, innerContent);

        return res.json({
            success: true,
            html: fullHtml,
            studentData: studentData
        });
    } catch (err) {
        return sendServerError(res, 'Generate Assignment Error', err, { success: false });
    }
});

app.post('/api/documents/generate-clearance', requireLogin, async (req, res) => {
    const { studentId } = req.body;
    try {
        const studentRes = await pool.query(`
            SELECT s.*, 
                   r.room_number, r.capacity as room_capacity
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
            WHERE s.id = $1
        `, [studentId]);

        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ученикът не е намерен.' });
        }
        const student = studentRes.rows[0];

        let roomNum = student.room_number || student.room_id || '-';
        if (roomNum !== '-' && student.room_capacity) {
            roomNum += (student.room_capacity === 3 ? 'G' : 'M');
        }

        const clNow = new Date();
        const studentData = {
            име: `${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.trim() || '-',
            егн: student.egn || '-',
            стая: roomNum,
            блок: student.block || '-',
            курс: student.class_number || '-',
            дата: `${clNow.getDate()}.${clNow.getMonth() + 1}.${clNow.getFullYear()}`
        };

        // Fetch custom template if exists, else default
        let templateHtml = DEFAULT_LOCAL_TEMPLATES.clearance;
        try {
            const tplRes = await pool.query("SELECT value FROM settings WHERE key = 'local_template_clearance'");
            if (tplRes.rows.length > 0 && tplRes.rows[0].value) {
                templateHtml = tplRes.rows[0].value;
            }
        } catch (e) {}

        const innerContent = renderTemplateWithData(templateHtml, studentData);
        const fullHtml = wrapDocumentForPrint('Обходен лист - ' + studentData.име, innerContent);

        return res.json({
            success: true,
            html: fullHtml,
            studentData: studentData
        });
    } catch (err) {
        return sendServerError(res, 'Generate Clearance Error', err, { success: false });
    }
});

const SAFE_BACKUP_FILENAME_RE = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql$/;

function getPgBinary(name) {
    if (name === 'pg_dump' && process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
    if (name === 'psql' && process.env.PSQL_PATH) return process.env.PSQL_PATH;
    if (process.platform === 'win32') {
        const baseDump = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
        return name === 'pg_dump' ? baseDump : baseDump.replace(/pg_dump\.exe$/i, 'psql.exe');
    }
    return name; // Use system PATH on Linux/macOS
}

function getPgEnvFromUrl(dbUrl) {
    const parsed = new URL(dbUrl);
    const env = { ...process.env };
    if (parsed.hostname) env.PGHOST = parsed.hostname;
    if (parsed.port) env.PGPORT = parsed.port;
    if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
    if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
    const dbName = parsed.pathname.replace(/^\//, '');
    if (dbName) env.PGDATABASE = decodeURIComponent(dbName);
    return env;
}

function runExecFile(binary, args, env) {
    return new Promise((resolve, reject) => {
        execFile(binary, args, { env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve({ stdout, stderr });
        });
    });
}

async function createBackup() {
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
    const backupFileName = `backup_${dateString}.sql`;
    const archivesDir = path.join(__dirname, 'archives');
    if (!fs.existsSync(archivesDir)) {
        fs.mkdirSync(archivesDir, { recursive: true });
    }
    const backupFilePath = path.join(archivesDir, backupFileName);
    const pgDumpBin = getPgBinary('pg_dump');
    const pgEnv = getPgEnvFromUrl(DATABASE_URL);

    try {
        await runExecFile(pgDumpBin, ['--clean', '--if-exists', '-f', backupFilePath], pgEnv);
        console.log(`Backup created successfully at ${backupFilePath}`);
        return backupFileName;
    } catch (error) {
        console.error(`Backup error: ${error.message}`);
        throw error;
    }
}

function checkAndCreateDailyBackup() {
    const archivesDir = path.join(__dirname, 'archives');
    if (!fs.existsSync(archivesDir)) {
        fs.mkdirSync(archivesDir, { recursive: true });
    }
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const files = fs.readdirSync(archivesDir);
    const backupExistsToday = files.some(file => file.startsWith(`backup_${dateString}`));

    if (!backupExistsToday) {
        console.log(`No backup found for today (${dateString}). Creating one now...`);
        createBackup().then(filename => {
            // Check if it's the first day of the month for Drive backup
            if (date.getDate() === 1) {
                console.log(`First day of the month detected (${dateString}). Uploading monthly backup to Drive...`);
                uploadBackupToDrive(filename);
            }
        }).catch(err => console.error("Initial backup failed:", err));
    } else {
        console.log(`Backup for today (${dateString}) already exists. Skipping.`);
    }

    // Clean up local backups older than 14 days
    const now = Date.now();
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    files.forEach(file => {
        if (file.startsWith('backup_') && file.endsWith('.sql')) {
            const filePath = path.join(archivesDir, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > TWO_WEEKS_MS) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted old backup: ${file}`);
                }
            } catch (err) {
                console.error(`Error deleting old backup ${file}:`, err);
            }
        }
    });
}

async function uploadBackupToDrive(filename) {
    if (!GOOGLE_SCRIPT_BASE_URL) return false;
    if (!SAFE_BACKUP_FILENAME_RE.test(filename)) return false;
    const archivesDir = path.join(__dirname, 'archives');
    const filePath = path.join(archivesDir, filename);
    if (!fs.existsSync(filePath)) return false;

    const content = fs.readFileSync(filePath, 'utf8');

    try {
        console.log(`Uploading ${filename} to Google Drive...`);
        const data = await postToGoogleScript({
            isBackup: true,
            filename: filename,
            content: content
        }, 60000);
        if (data.success) {
            console.log(`Successfully uploaded to Drive: ${filename}`);
            return true;
        }
        console.error(`Drive Upload Failed: ${data.error}`);
        return false;
    } catch (err) {
        console.error('Drive Upload Error:', err.message);
        return false;
    }
}

// Monthly Drive Backup (1st of every month at 03:00 AM)
cron.schedule('0 3 1 * *', async () => {
    console.log('Running monthly automated Drive backup...');
    try {
        const filename = await createBackup();
        await uploadBackupToDrive(filename);
    } catch (err) {
        console.error('Monthly backup failed:', err.message);
    }
});

// Run backup only on first start of the day
checkAndCreateDailyBackup();

app.post('/api/backup', requireRole('owner'), async (req, res) => {
    try {
        const filename = await createBackup();
        res.json({ success: true, filename });
    } catch (err) {
        console.error('Manual backup failed:', err.message);
        res.status(500).json({ success: false, error: 'Неуспешно създаване на архив.' });
    }
});

app.get('/api/backup/list', requireRole('owner'), async (req, res) => {
    try {
        const archivesDir = path.join(__dirname, 'archives');
        if (!fs.existsSync(archivesDir)) {
            return res.json({ success: true, files: [] });
        }
        const files = fs.readdirSync(archivesDir)
            .filter(file => SAFE_BACKUP_FILENAME_RE.test(file))
            .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Грешка при зареждане на архивите.' });
    }
});

app.post('/api/backup/restore', requireRole('owner'), async (req, res) => {
    const { filename } = req.body || {};
    if (typeof filename !== 'string' || !SAFE_BACKUP_FILENAME_RE.test(filename)) {
        return res.status(400).json({ success: false, error: 'Невалидно име на архивен файл.' });
    }

    const archivesDir = path.resolve(__dirname, 'archives');
    const backupFilePath = path.resolve(archivesDir, filename);
    if (!backupFilePath.startsWith(archivesDir + path.sep)) {
        return res.status(400).json({ success: false, error: 'Невалиден път до архивен файл.' });
    }

    if (!fs.existsSync(backupFilePath)) {
        return res.status(404).json({ success: false, error: 'Архивният файл не е намерен.' });
    }

    try {
        const psqlBin = getPgBinary('psql');
        const pgEnv = getPgEnvFromUrl(DATABASE_URL);

        await runExecFile(psqlBin, ['-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], pgEnv);
        await runExecFile(psqlBin, ['-v', 'ON_ERROR_STOP=1', '-f', backupFilePath], pgEnv);

        console.log(`Database restored successfully from ${filename}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`Restore error: ${err.message}`);
        res.status(500).json({ success: false, error: 'Грешка при възстановяване на базата данни.' });
    }
});
app.get('/api/backup/stats', requireRole('owner'), async (req, res) => {
    try {
        const archivesDir = path.join(__dirname, 'archives');
        if (!fs.existsSync(archivesDir)) return res.json({ success: false, error: 'No backups found' });

        const files = fs.readdirSync(archivesDir)
            .filter(file => SAFE_BACKUP_FILENAME_RE.test(file))
            .sort((a, b) => b.localeCompare(a));
        
        if (files.length === 0) return res.json({ success: false, error: 'No backups found' });

        const latestFile = files[0];
        const filePath = path.join(archivesDir, latestFile);
        const stats = fs.statSync(filePath);

        // Core DB stats
        const studentsCount = await pool.query('SELECT COUNT(*)::int as count FROM students');
        const paymentsCount = await pool.query('SELECT COUNT(*)::int as count FROM student_payments');
        const roomsCount = await pool.query('SELECT COUNT(*)::int as count FROM rooms');

        res.json({
            success: true,
            latest: {
                filename: latestFile,
                size: (stats.size / 1024).toFixed(2) + ' KB',
                modified: stats.mtime
            },
            db_stats: {
                students: studentsCount.rows[0].count,
                payments: paymentsCount.rows[0].count,
                rooms: roomsCount.rows[0].count
            }
        });
    } catch (err) {
        console.error('Backup stats error:', err.message);
        res.status(500).json({ success: false, error: 'Грешка при зареждане на статистиката.' });
    }
});
app.get('/api/backup/drive/list', requireRole('owner'), async (req, res) => {
    const scriptUrl = buildGoogleScriptUrl({ listBackups: 1 });
    if (!scriptUrl) {
        return res.json({ success: false, files: [], error: 'Google Drive не е конфигуриран.' });
    }
    try {
        const response = await fetch(scriptUrl, { signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Drive backup list error:', err.message);
        res.status(500).json({ success: false, error: 'Грешка при връзка с Google Drive.' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    warmUpGoogleAppsScript();
});