require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cookieSession = require('cookie-session');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shchetovodstvo',
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('DB Connection Error:', err.message);
    else console.log('DB Connected Successfully');
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

const sessionKey = Math.random().toString(36).substring(2) + Date.now().toString(36);

app.use(cookieSession({
    name: 'session',
    keys: [sessionKey],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

app.use(express.static(path.join(__dirname, 'public')));

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        console.warn(`[requireLogin] Denied access to ${req.url} - No userId in session.`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && (password === user.password)) {
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

app.get('/api/family-statuses', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM family_statuses ORDER BY status_name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/family-statuses/:id', requireLogin, async (req, res) => {
    const { discount_percentage } = req.body;
    try {
        await pool.query(
            'UPDATE family_statuses SET discount_percentage = $1 WHERE id = $2', 
            [discount_percentage, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Update Family Status Error:', err.message);
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/rooms/:id', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        console.error('Update Room Error:', err.message);
        res.status(500).json({ error: err.message });
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
        console.error('Fetch Students Error:', err.message);
        res.status(500).json({ error: err.message });
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

        const query = `
            INSERT INTO students (
                first_name, middle_name, last_name, egn, class_number, from_address, 
                phone, parent_phone, email, sex, family_status_id, 
                punishments, block, room_id, fee, payment_method, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_DATE)
            RETURNING id
        `;
        const values = [
            first_name, middle_name, last_name, egn, class_number, from_address,
            phone, parent_phone, email, sex, family_status_id,
            punishments || 0, block, room_id, calculatedFee, payment_method, notes
        ];
        const result = await pool.query(query, values);
        const newStudentId = result.rows[0].id;
        await pool.query(
            "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, 'assigned', CURRENT_TIMESTAMP)",
            [newStudentId]
        );
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
        const query = `
            SELECT s.*, 
                   (SELECT action_date FROM student_assignments sa WHERE sa.student_id = s.id ORDER BY sa.id DESC LIMIT 1) as last_status_date
            FROM students s 
            WHERE s.id = $1
        `;
        const result = await pool.query(query, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Ученикът не е намерен.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        console.error('Update Notes Error:', err.message);
        res.status(500).json({ error: err.message });
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
        await pool.query(
            "INSERT INTO student_assignments (student_id, action, action_date) VALUES ($1, $2, CURRENT_TIMESTAMP)",
            [studentId, action]
        );

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
        console.error('[Search] ERROR:', err.message);
        res.status(500).json({ error: err.message });
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
            'SELECT * FROM student_assignments WHERE student_id = $1 ORDER BY action_date ASC',
            [studentId]
        );
        const assignments = assignmentsRes.rows;
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
        const createdAt = student.created_at ? new Date(student.created_at) : new Date();
        const creationMonthStart = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
        const status = [];
        academicConfig.forEach(cfg => {
            const mData = monthsMap[cfg.name];
            if (!mData) return;

            const actualYear = selectedYear + cfg.offset;
            const monthDate = new Date(actualYear, cfg.monthIndex, 1);
            const isBeforeCreation = monthDate < creationMonthStart;
            const isCreationMonth = monthDate.getTime() === creationMonthStart.getTime();
            const isFuture = monthDate > now;
            
            // Filter all payments for this specific month/year
            const monthPayments = payments.filter(p => p.month_id === mData.id && p.year === actualYear);
            const totalAmountPaid = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0);
            const totalDaysPaid = monthPayments.reduce((sum, p) => sum + parseFloat(p.days_paid || 0), 0);
            
            let finalDays = parseFloat(mData.fee_multiplier || 0);

            let activeDays = 0;
            const actualDaysInMonth = new Date(actualYear, cfg.monthIndex + 1, 0).getDate();
            const createdAtStart = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
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

                if (dayEnd < createdAtStart) {
                    isFullyAssigned = false;
                    continue;
                }
                const eventsSoFar = assignments.filter(a => new Date(a.action_date) <= dayEnd);
                const lastEvent = eventsSoFar.length > 0 ? eventsSoFar[eventsSoFar.length - 1] : null;

                if (lastEvent) {
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
                } else {
                    activeDays++;
                }
            }
            if (isBeforeCreation && !isCreationMonth) {
                finalDays = 0;
            } else if (isFullyAssigned && !isCreationMonth) {
                finalDays = parseFloat(mData.fee_multiplier || 30);
            } else {
                finalDays = activeDays;
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
        console.error(err);
        res.status(500).json({ error: err.message });
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
                VALUES ($1, $2, $3, $4, true, timezone('Europe/Sofia', NOW()), $5, $6, $7) 
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
        console.error('Transaction Error:', err.message);
        res.status(500).json({ success: false, error: 'Грешка при запис: ' + err.message });
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
                VALUES ($1, $2, $3, $4, true, timezone('Europe/Sofia', NOW()), $5, $6, $7, $8)
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
        console.error('Additional Payment Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/reports/daily-payments', requireLogin, async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.payment_date, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, s.block, 
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
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/period-payments', requireLogin, async (req, res) => {
    const { from, to } = req.query;
    try {
        const query = `
            SELECT 
                sp.payment_date, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, s.block,
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
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports/status-period', requireLogin, async (req, res) => {
    const { periods, block } = req.body;
    if (!periods || periods.length === 0) return res.json([]);

    try {
        let studentsQuery = `
            SELECT s.id, s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, s.block, s.is_assigned, r.room_number, fs.status_name as family_status, fs.discount_percentage, s.fee
            FROM students s
            LEFT JOIN rooms r ON s.room_id = r.id
            LEFT JOIN family_statuses fs ON s.family_status_id = fs.id
        `;
        const queryParams = [];
        if (block) {
            studentsQuery += ` WHERE s.block = $1`;
            queryParams.push(block);
        }
        studentsQuery += ` ORDER BY s.block, r.room_number, s.first_name`;

        const studentsRes = await pool.query(studentsQuery, queryParams);
        const students = studentsRes.rows;
        
        const monthsRes = await pool.query('SELECT id, fee_multiplier FROM months');
        const monthsMap = {};
        monthsRes.rows.forEach(m => monthsMap[m.id] = parseFloat(m.fee_multiplier || 30));

        const periodConditions = periods.map(p => `(month_id = ${p.month_id} AND year = ${p.year})`).join(' OR ');
        const paymentsQuery = `SELECT student_id, month_id, year, is_paid, amount_paid FROM student_payments WHERE ${periodConditions || '1=0'}`;
        const paymentsRes = await pool.query(paymentsQuery);
        const payments = paymentsRes.rows;
        const results = [];
        students.forEach(s => {
            periods.forEach(p => {
                const payment = payments.find(pay => pay.student_id === s.id && pay.month_id === p.month_id && pay.year === p.year);
                const isPaid = payment && payment.is_paid;
                
                const multiplier = monthsMap[p.month_id] || 30;
                const discount = s.discount_percentage ? parseFloat(s.discount_percentage) : 0;
                const discountedDailyFee = parseFloat(s.fee || 0) * ((100 - discount) / 100);
                const totalDue = discountedDailyFee * multiplier;
                const amountPaid = payment ? parseFloat(payment.amount_paid || 0) : 0;
                let owedAmount = isPaid ? 0 : Math.max(0, totalDue - amountPaid);

                results.push({
                    block: s.block || '1',
                    room: s.room_number || '-',
                    egn: s.egn || '-',
                    name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`,
                    class_number: s.class_number,
                    is_assigned: s.is_assigned,
                    family_status: s.family_status,
                    year: p.year,
                    month: p.month_name.toUpperCase(),
                    suma: owedAmount.toFixed(2),
                    rent_paid: isPaid ? 'ПЛАТЕНО' : 'НЕПЛАТЕНО',
                    cons_paid: 'НЕ'
                });
            });
        });

        res.json(results);
    } catch (err) {
        console.error('Грешка при справката за период:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/months', requireLogin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM months ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/months/:id', requireLogin, async (req, res) => {
    const { fee_multiplier } = req.body;
    try {
        await pool.query('UPDATE months SET fee_multiplier = $1 WHERE id = $2', [fee_multiplier, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/fees', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT key, value FROM settings WHERE key IN ('small_room_fee', 'large_room_fee')");
        let fees = { small_room_fee: '11.00', large_room_fee: '10.00' };
        result.rows.forEach(row => { fees[row.key] = row.value; });
        res.json(fees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/fees', requireLogin, async (req, res) => {
    const { small_room_fee, large_room_fee, update_all } = req.body;
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
        console.error('Update Fees Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/template', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'report_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/template', requireLogin, async (req, res) => {
    const { template_id } = req.body;
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('report_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/template-footer', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'report_footer_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/template-footer', requireLogin, async (req, res) => {
    const { template_id } = req.body;
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('report_footer_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/template-assignment', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'assignment_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/template-assignment', requireLogin, async (req, res) => {
    const { template_id } = req.body;
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('assignment_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/template-clearance', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'clearance_template_id'");
        res.json({ template_id: result.rows.length > 0 ? result.rows[0].value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/template-clearance', requireLogin, async (req, res) => {
    const { template_id } = req.body;
    try {
        await pool.query(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('clearance_template_id', $1, NOW()) 
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [template_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function createBackup() {
    return new Promise((resolve, reject) => {
        const date = new Date();
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
        const backupFileName = `backup_${dateString}.sql`;
        const archivesDir = path.join(__dirname, 'archives');
        if (!fs.existsSync(archivesDir)) {
            fs.mkdirSync(archivesDir, { recursive: true });
        }
        const backupFilePath = path.join(archivesDir, backupFileName);
        
        const dumpCommand = `"${process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe'}" --dbname="${process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shchetovodstvo'}" --clean --if-exists -f "${backupFilePath}"`;
        
        exec(dumpCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Backup error: ${error.message}`);
                return reject(error);
            }
            console.log(`Backup created successfully at ${backupFilePath}`);
            resolve(backupFileName);
        });
    });
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
    const archivesDir = path.join(__dirname, 'archives');
    const filePath = path.join(archivesDir, filename);
    if (!fs.existsSync(filePath)) return false;

    const content = fs.readFileSync(filePath, 'utf8');
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
        console.error('GOOGLE_SCRIPT_URL is not defined in environment variables.');
        return false;
    }

    try {
        console.log(`Uploading ${filename} to Google Drive...`);
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                isBackup: true,
                filename: filename,
                content: content
            })
        });
        const data = await response.json();
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

app.post('/api/backup', requireLogin, async (req, res) => {
    try {
        const filename = await createBackup();
        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/backup/list', requireLogin, async (req, res) => {
    try {
        const archivesDir = path.join(__dirname, 'archives');
        if (!fs.existsSync(archivesDir)) {
            return res.json({ success: true, files: [] });
        }
        const files = fs.readdirSync(archivesDir)
            .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
            .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/backup/restore', requireLogin, async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ success: false, error: 'No filename provided' });

    const archivesDir = path.join(__dirname, 'archives');
    const backupFilePath = path.join(archivesDir, filename);

    if (!fs.existsSync(backupFilePath)) {
        return res.status(404).json({ success: false, error: 'Backup file not found' });
    }

    try {
        // Construct psql path based on pg_dump path
        const pgDumpPath = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
        const psqlPath = pgDumpPath.replace('pg_dump.exe', 'psql.exe');
        
        const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shchetovodstvo';
        // Command to clear the database first (essential for plain SQL backups without --clean)
        const clearCommand = `"${psqlPath}" --dbname="${dbUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
        const restoreCommand = `"${psqlPath}" --dbname="${dbUrl}" -f "${backupFilePath}"`;

        // Run clear and then restore
        exec(`${clearCommand} && ${restoreCommand}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Restore error: ${error.message}`);
                return res.status(500).json({ success: false, error: error.message });
            }
            console.log(`Database restored successfully from ${filename}`);
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.get('/api/backup/stats', requireLogin, async (req, res) => {
    try {
        const archivesDir = path.join(__dirname, 'archives');
        if (!fs.existsSync(archivesDir)) return res.json({ success: false, error: 'No backups found' });

        const files = fs.readdirSync(archivesDir)
            .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
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
        res.status(500).json({ success: false, error: err.message });
    }
});
app.get('/api/backup/drive/list', requireLogin, async (req, res) => {
    const baseScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!baseScriptUrl) {
        return res.status(500).json({ success: false, error: 'GOOGLE_SCRIPT_URL is not configured.' });
    }
    const scriptUrl = `${baseScriptUrl}?listBackups=1`;
    try {
        const response = await fetch(scriptUrl);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});