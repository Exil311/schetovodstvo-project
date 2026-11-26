# DormsMaster — Complete Hosting & School PC Migration Guide

This guide covers every step required to move **DormsMaster** safely from the local school accounting PC (**счетоводство**) to secure HTTPS hosting, without risking any live student or payment data.

---

## Overview: What Runs Where

| Component | Where it runs | Who needs it |
|---|---|---|
| **Web App (Node.js + Express)** | Cloud / VPS hosting (`https://your-domain.bg`) | All authorized school staff via browser |
| **PostgreSQL Database** | Hosted / Managed PostgreSQL | Accessed only by the hosted Node.js server |
| **Google Apps Script** | Google Cloud (`script.google.com`) | Called only by the hosted Node.js server using `API_SECRET` |
| **Fiscal Printer Agent (`print-receipt.py`)** | **Local on the cashier's Windows PC (`127.0.0.1:5001`)** | **Only** the PC physically connected to the Datecs printer on `COM1` |

### User Accounts & Roles
Your database has two user accounts in the `users` table:
- **`admin`** (`role = 'admin'`): Daily work — students, rooms, payments, reports, documents, fiscal printer.
- **`owner`** (`role = 'owner'`): Full access — everything `admin` has **plus** Settings (room fees, discounts, months, templates, reset order numbers) and Backups/Restore.

---

## Step 1: Generate Secrets & Rotate Old Credentials (One-Time)

Run this on any machine with Node.js to generate three strong random tokens (save them in a password manager — **never** commit them to Git):

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('GOOGLE_SCRIPT_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('PRINT_AGENT_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))"
```

Then rotate the credentials that existed before the repo was hardened:
1. **School Google account:** Change the password and enable 2-Step Verification (2FA).
2. **Google Apps Script** (`https://script.google.com`):
   - Open your DormsMaster Apps Script project and paste the latest `google_docs_export_script.gs` from this repo.
   - Go to **Project Settings → Script Properties → Add script property**:
     - Property: `API_SECRET`
     - Value: the `GOOGLE_SCRIPT_TOKEN` you generated above.
   - Click **Deploy → New deployment** → Type: **Web app**:
     - Execute as: `Me`
     - Who has access: `Anyone` *(requests without `API_SECRET` are now rejected with `Unauthorized`)*
   - Copy the **new Web App URL** (`https://script.google.com/macros/s/.../exec`).

---

## Step 2: Set Up Hosting

### Option A: Managed PaaS (Render / Railway / Fly.io) — Easiest
1. Connect GitHub repository `Exil311/schetovodstvo-project` (branch `main`).
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
2. Create a **Managed PostgreSQL** database with automatic daily backups enabled.
3. Add these Environment Variables in your host's dashboard (see `.env.example`):
   ```env
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=<your-hosted-postgresql-url>
   DATABASE_SSL=true
   SESSION_SECRET=<generated-SESSION_SECRET>
   GOOGLE_SCRIPT_URL=<new-apps-script-web-app-url>
   GOOGLE_SCRIPT_TOKEN=<generated-GOOGLE_SCRIPT_TOKEN>
   GOOGLE_ACCOUNT_EMAIL=<school-google-email>
   GOOGLE_ACCOUNT_PASSWORD=<new-school-google-password>
   ```

### Option B: Linux VPS (Ubuntu + Caddy/Nginx + PostgreSQL)
1. **Firewall (`ufw`):** Allow only `22` (SSH), `80` (HTTP), and `443` (HTTPS). Keep PostgreSQL (`5432`) and Node.js (`3000`) bound to `127.0.0.1` only.
2. **PostgreSQL:** Create a dedicated non-superuser DB role and database `shchetovodstvo` with a strong password.
3. **Clone & install:**
   ```bash
   git clone https://github.com/Exil311/schetovodstvo-project.git /opt/dormsmaster
   cd /opt/dormsmaster
   npm ci --omit=dev
   cp .env.example .env
   chmod 600 .env
   # Edit .env with your real values (DATABASE_SSL=false for local PostgreSQL on the same VPS)
   ```
4. **Reverse Proxy with HTTPS (Caddy example — automatic Let's Encrypt SSL):**
   ```caddyfile
   dorms.your-domain.bg {
       reverse_proxy 127.0.0.1:3000
   }
   ```
   *(Optional extra security: restrict access to the school's static IP address or put the server behind Tailscale / Cloudflare Access.)*
5. **Process Manager:** Run `node server.js` via `systemd` or `pm2` under a dedicated non-root Linux user.

---

## Step 3: Safely Migrate the Live Database from the School PC

> **Golden Rule:** Do **NOT** delete or uninstall the old local DormsMaster folder or local PostgreSQL on the school PC. Keep it stopped as an instant rollback until the hosted version has run smoothly for 1–2 weeks.

1. **Freeze writes (5–10 minutes):** Close DormsMaster in the browser on the school PC and stop the local Node.js server (`taskkill /F /IM node.exe` or via Task Manager).
2. **Create a full backup of the live database** on the school PC:
   ```cmd
   "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --dbname="postgresql://postgres:<LOCAL_DB_PASSWORD>@localhost:5432/shchetovodstvo" --no-owner --no-acl -f "C:\Users\<USER>\Desktop\live_migration_backup.sql"
   ```
   Confirm the file is non-empty and keep a backup copy on a USB drive.
3. **Import into the hosted PostgreSQL database:**
   ```bash
   psql "$HOSTED_DATABASE_URL" -v ON_ERROR_STOP=1 -f live_migration_backup.sql
   ```
4. **Hash & rotate user passwords on the hosted server:**
   ```bash
   node scripts/hash-passwords.js
   node scripts/hash-passwords.js --set admin "<NEW_STRONG_ADMIN_PASSWORD>"
   node scripts/hash-passwords.js --set owner "<NEW_STRONG_OWNER_PASSWORD>"
   ```
5. **Verify 100% data match** by running this query on **both** the old local DB and the hosted DB:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM students) AS students,
     (SELECT COUNT(*) FROM student_payments) AS payments,
     (SELECT COUNT(*) FROM rooms) AS rooms,
     (SELECT COUNT(*) FROM student_assignment_orders) AS orders;
   ```
   Every count must match identically.
6. **Delete `live_migration_backup.sql`** from any temporary/shared location once verified.

---

## Step 4: Set Up the Local Fiscal Printer Agent on the School PC

Only the cashier's Windows PC (physically connected to the Datecs printer on `COM1`) needs this step:

1. Create a folder `C:\DormsPrintAgent\` and copy **only** `print-receipt.py` from this repo into it.
2. Create `C:\DormsPrintAgent\start-print-agent.bat` with:
   ```bat
   @echo off
   set PRINT_AGENT_ALLOWED_ORIGINS=https://dorms.your-domain.bg
   set PRINT_AGENT_TOKEN=<generated-PRINT_AGENT_TOKEN>
   set PRINT_AGENT_COM_PORT=COM1
   py C:\DormsPrintAgent\print-receipt.py
   ```
   *(Replace `https://dorms.your-domain.bg` with your exact hosted URL, without a trailing slash.)*
3. Run `start-print-agent.bat` (you can also add a shortcut to it in Windows Startup: `Win + R` → `shell:startup`).
4. Open `https://dorms.your-domain.bg` in Chrome/Edge on the cashier's PC, log in, and go to **Фискален принтер**:
   - Paste `<generated-PRINT_AGENT_TOKEN>` into **Токен за локален принтер** and click **Запази токен**.
   - Click **Провери връзката с принтера** → verify green success message.
   - Click **Сверяване на часовника** → verify the Datecs printer responds.

---

## Step 5: Final Go-Live Verification Checklist

Before announcing the new URL to school staff, test each item:
- [ ] `https://your-domain.bg/health` returns `{"status":"ok"}`.
- [ ] Login as `admin` works; trying to change fees or restore backup returns `403 Forbidden`.
- [ ] Login as `owner` works; Settings and Backups load properly.
- [ ] **Документация** tab displays the Google account email from `.env` with the **Покажи / Скрий** password toggle.
- [ ] Exporting a report to **Google Docs** and **Excel** opens a newly generated document.
- [ ] On the cashier's PC, **Провери връзката с принтера** and **Сверяване на часовника** succeed.
- [ ] Old local `start.bat` shortcut on the school PC is renamed (e.g., `DormsMaster (OLD BACKUP)`) and replaced with a browser bookmark to `https://your-domain.bg`.

---

## Step 6: Instant Rollback Plan (If Anything Goes Wrong)

If any problem appears during cutover:
1. Close the hosted browser tab.
2. Start the untouched old local DormsMaster on the school PC.
3. Local operations resume in under 30 seconds with zero data loss.
