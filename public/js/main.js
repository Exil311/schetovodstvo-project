let allStudentsData = [];

async function init() {
    const resp = await fetch('/api/check-auth');
    const data = await resp.json();

    if (!data.authenticated) {
        window.location.href = '/index.html';
    } else {
        document.getElementById('app').style.display = 'block';
        document.getElementById('userRole').textContent = `${data.role.toUpperCase()}`;
        navigate('students');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

document.addEventListener('DOMContentLoaded', init);

async function triggerBackup() {
    if (!confirm('Сигурни ли сте, че искате да направите локално копие (backup) на базата данни?')) return;
    
    const statusDiv = document.getElementById('backupStatus');
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#fef3c7';
        statusDiv.style.color = '#92400e';
        statusDiv.innerText = 'Създаване на архив... Моля изчакайте.';
    }

    try {
        const response = await fetch('/api/backup', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            if (statusDiv) {
                statusDiv.style.backgroundColor = '#d1fae5';
                statusDiv.style.color = '#065f46';
                statusDiv.innerText = 'Архивът е създаден успешно! Файл: ' + data.filename;
            } else {
                alert('Архивът е създаден успешно!\nФайл: ' + data.filename);
            }
            loadBackups(); // Reload the dropdown
        } else {
            throw new Error(data.error || 'Грешка при създаване на архив');
        }
    } catch (err) {
        console.error(err);
        if (statusDiv) {
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
            statusDiv.innerText = 'Грешка: ' + err.message;
        } else {
            alert('Грешка при свързване със сървъра: ' + err.message);
        }
    }
}

async function loadBackups() {
    try {
        const response = await fetch('/api/backup/list');
        const data = await response.json();
        const selector = document.getElementById('backupSelector');
        
        if (data.success && data.files && data.files.length > 0) {
            selector.innerHTML = '<option value="">Изберете архив за възстановяване...</option>';
            data.files.forEach(file => {
                selector.innerHTML += `<option value="${file}">${file}</option>`;
            });
        } else {
            if(selector) selector.innerHTML = '<option value="">Няма намерени архиви</option>';
        }
        loadBackupStats(); // Call stats here
        loadDriveBackups(); // Call Drive list here
    } catch (err) {
        console.error('Failed to load backups', err);
        const selector = document.getElementById('backupSelector');
        if (selector) selector.innerHTML = '<option value="">Грешка при зареждане</option>';
    }
}

async function triggerRestore() {
    const selector = document.getElementById('backupSelector');
    const filename = selector ? selector.value : null;
    if (!filename) {
        alert("Моля, изберете архив от списъка.");
        return;
    }

    if (!confirm('ВНИМАНИЕ! Сигурни ли сте, че искате да възстановите базата от този архив? ТОВА ЩЕ ИЗТРИЕ ТЕКУЩИТЕ ДАННИ И ЩЕ ВЪЗСТАНОВИ ТЕЗИ ОТ АРХИВА! Действието е необратимо!')) return;
    
    const statusDiv = document.getElementById('restoreStatus');
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#fef3c7';
        statusDiv.style.color = '#92400e';
        statusDiv.innerText = 'Възстановяване на базата... Моля изчакайте.';
    }

    try {
        const response = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await response.json();
        
        if (data.success) {
            if (statusDiv) {
                statusDiv.style.backgroundColor = '#d1fae5';
                statusDiv.style.color = '#065f46';
                statusDiv.innerText = 'Базата е възстановена успешно! Моля, презаредете страницата.';
            } else {
                alert('Базата е възстановена успешно!');
            }
        } else {
            throw new Error(data.error || 'Грешка при възстановяване на базата');
        }
    } catch (err) {
        console.error(err);
        if (statusDiv) {
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
            statusDiv.innerText = 'Грешка: ' + err.message;
        } else {
            alert('Грешка при възстановяване: ' + err.message);
        }
    }
}

async function loadBackupStats() {
    const container = document.getElementById('backupStatsContainer');
    if (!container) return;

    try {
        const response = await fetch('/api/backup/stats');
        const data = await response.json();

        if (data.success) {
            const dateStr = new Date(data.latest.modified).toLocaleString('bg-BG');
            container.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                    <div><strong>Файл:</strong> ${data.latest.filename}</div>
                    <div><strong>Дата:</strong> ${dateStr}</div>
                    <div><strong>Размер:</strong> ${data.latest.size}</div>
                    <div><strong>Ученици:</strong> ${data.db_stats.students}</div>
                    <div><strong>Плащания:</strong> ${data.db_stats.payments}</div>
                    <div><strong>Стаи:</strong> ${data.db_stats.rooms}</div>
                </div>
            `;
        } else {
            container.innerHTML = `<p style="color: #6b7280; font-style: italic;">${data.error || 'Няма данни за последния архив.'}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color: #ef4444;">Грешка при зареждане на статистиката.</p>`;
    }
}

async function loadDriveBackups() {
    const container = document.getElementById('driveBackupsContainer');
    if (!container) return;

    try {
        const response = await fetch('/api/backup/drive/list');
        const data = await response.json();

        if (data.success && data.files && data.files.length > 0) {
            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            data.files.forEach(file => {
                const dateStr = new Date(file.date).toLocaleString('bg-BG');
                const sizeStr = (file.size / 1024).toFixed(2) + ' KB';
                html += `
                    <li style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500;">${file.name}</div>
                            <div style="font-size: 12px; color: #6b7280;">${dateStr} • ${sizeStr}</div>
                        </div>
                        <a href="${file.url}" target="_blank" style="font-size: 12px; color: #3b82f6; text-decoration: none;">ВИЖ В DRIVE</a>
                    </li>
                `;
            });
            html += '</ul>';
            container.innerHTML = html;
        } else {
            container.innerHTML = `<p style="color: #6b7280; font-style: italic;">Няма намерени архиви в Google Drive.</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color: #ef4444;">Грешка при зареждане на архивите от Drive.</p>`;
    }
}
