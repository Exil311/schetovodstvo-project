# Safe Hosting Deployment & School PC Migration Plan

This guide explains how to safely move **DormsMaster** from the local school accounting PC (**счетоводство**) to secure HTTPS hosting **without risking any live student or payment data**, and how to keep an instant rollback ready.

---

## Step 1: Rotate Previously Exposed Credentials (One-Time)

Because the old GitHub commits were public before history cleanup:
1. Change the password of the school Google account and enable 2FA.
2. In **Google Apps Script** (`https://script.google.com`):
   - Paste the updated `google_docs_export_script.gs`.
   - Open **Project Settings → Script Properties** and add:
     - Property: `API_SECRET`
     - Value: a 64-character random hex string (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - Click **Deploy → New deployment** (Web App → Execute as: `Me`, Who has access: `Anyone`). Copy the **new Web App URL**.

---

## Step 2: Prepare the Hosting Environment

### Option A: Managed PaaS (Render / Railway / Fly.io) — Easiest
1. Connect the GitHub repo `Exil311/schetovodstvo-project` (branch `main`).
2. Provision a **managed PostgreSQL** database (with automatic daily backups enabled).
3. Configure environment variables (from `.env.example`):
   - `NODE_ENV=production`
   - `DATABASE_URL=<managed-postgres-url>`
   - `DATABASE_SSL=true` (if required by provider)
   - `SESSION_SECRET=<64-char-random-hex>`
   - `GOOGLE_SCRIPT_URL=<new-apps-script-url>`
   - `GOOGLE_SCRIPT_TOKEN=<exact-API_SECRET-from-Step-1>`
   - `GOOGLE_ACCOUNT_EMAIL=<school-google-email>`
   - `GOOGLE_ACCOUNT_PASSWORD=<new-school-google-password>`

### Option B: Linux VPS (Ubuntu + Nginx/Caddy + PostgreSQL)
1. Enable firewall (`ufw`): allow only `22` (SSH), `80` (HTTP), `443` (HTTPS). Keep PostgreSQL (`5432`) and Node (`3000`) bound to `127.0.0.1` only.
2. Create a dedicated least-privilege PostgreSQL user & database (do not use `postgres` superuser).
3. Put **Caddy** or **Nginx + Certbot** in front of `127.0.0.1:3000` for automatic HTTPS.
   - *(Optional extra security)*: Restrict access in Nginx/Caddy to the school's static IP address or place the server behind **Tailscale / Cloudflare Access**.
4. Run Node.js under a non-root user via `systemd` or `pm2` with `.env` set to `chmod 600`.

---

## Step 3: Safe Database Migration from the School PC

> **Golden rule:** Do **NOT** delete or uninstall the old local DormsMaster folder or local PostgreSQL on the school PC. Keep it stopped as an instant rollback until the hosted version has run smoothly for at least 1–2 weeks.

1. **Freeze writes (5–10 minutes):** Close the DormsMaster browser tab on the school PC and stop the local Node.js process (`taskkill /F /IM node.exe` or stop via Task Manager).
2. **Take a verified backup of the live database** on the school PC:
   ```cmd
   "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --dbname="postgresql://postgres:<OLD_PASS>@localhost:5432/shchetovodstvo" --no-owner --no-acl -f "C:\Users\<USER>\Desktop\live_migration_backup.sql"
   ```
   Verify the file is non-empty and save an extra copy on a USB drive.
3. **Import into the hosted PostgreSQL database**:
   ```bash
   psql "$HOSTED_DATABASE_URL" -v ON_ERROR_STOP=1 -f live_migration_backup.sql
   ```
4. **Hash & rotate app user passwords** on the hosted server:
   ```bash
   node scripts/hash-passwords.js
   node scripts/hash-passwords.js --set admin "<NEW_STRONG_ADMIN_PASSWORD>"
   node scripts/hash-passwords.js --set owner "<NEW_STRONG_OWNER_PASSWORD>"
   ```
5. **Verify data integrity** — compare counts between old local DB and hosted DB:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM students) AS students,
     (SELECT COUNT(*) FROM student_payments) AS payments,
     (SELECT COUNT(*) FROM rooms) AS rooms,
     (SELECT COUNT(*) FROM student_assignment_orders) AS orders;
   ```
   All four numbers must match **100%**.
6. **Delete the temporary `live_migration_backup.sql`** from any shared/unencrypted location once verified.

---

## Step 4: Configure the Local Fiscal Printer Agent on the School PC

Because the Datecs fiscal printer is physically connected to `COM1` on the school PC, `print-receipt.py` stays running **locally** on the school PC while the web app runs on HTTPS hosting:

1. Copy only the updated `print-receipt.py` onto the school PC (e.g. `C:\DormsPrintAgent\print-receipt.py`).
2. Generate a random `PRINT_AGENT_TOKEN` (32+ chars).
3. Start `print-receipt.py` on the school PC with:
   ```bat
   @echo off
   set PRINT_AGENT_ALLOWED_ORIGINS=https://your-hosted-domain.bg
   set PRINT_AGENT_TOKEN=YOUR_RANDOM_PRINT_TOKEN
   set PRINT_AGENT_COM_PORT=COM1
   py C:\DormsPrintAgent\print-receipt.py
   ```
4. On the school PC's browser, open `https://your-hosted-domain.bg`, log in, go to **Фискален принтер**:
   - Paste `YOUR_RANDOM_PRINT_TOKEN` into **Токен за локален принтер** and click **Запази токен**.
   - Click **Провери връзката с принтера** → confirm it shows green success.
   - Test **Сверяване на часовника** to verify end-to-end communication with the Datecs printer.

---

## Step 5: Rollback Plan (If Anything Goes Wrong)

If any issue occurs during cutover:
1. Close the hosted browser tab.
2. Start the untouched local DormsMaster on the school PC via its existing desktop shortcut.
3. Because no data was modified locally during the test, the school accounting PC is back online in under 30 seconds.
