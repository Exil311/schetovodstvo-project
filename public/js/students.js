if (!window.allRoomsData) {
    window.allRoomsData = [];
}

async function renderStudentForm(container, mode, studentId = null, source = 'reports') {
    let student = {};
    if (mode === 'edit') {
        try {
            const resp = await fetch(`/api/students/${studentId}`);
            student = await resp.json();
        } catch (err) {
            console.error("Грешка при взимане на данни за ученик:", err);
        }
    }

    let cancelAction = "navigate('reports'); setTimeout(() => { const sel = document.getElementById('reportType'); if(sel) { sel.value = 'all'; handleReportTypeChange(); } }, 100);";
    if (source === 'pay' && studentId) {
        cancelAction = `renderPay(document.getElementById('content')).then(() => selStudent(${studentId}))`;
    }

    let isStartOfYearSelected = false;
    if (student && student.last_status_date) {
        const lsd = new Date(student.last_status_date);
        if (lsd.getMonth() === 8 && lsd.getDate() === 15) {
            isStartOfYearSelected = true;
        }
    }

    const lastUpdateHtml = (mode === 'edit' && student.notes_updated_at) 
        ? `<div style="font-size: 0.85em; color: #666; margin-top: 5px;">Последна промяна: <strong>${new Date(student.notes_updated_at).toLocaleDateString('bg-BG')}</strong></div>`
        : '';

    const statusDateHtml = (mode === 'edit' && student.last_status_date)
        ? `<div style="font-size: 0.85em; color: #666; margin-top: 5px;">${student.is_assigned !== false ? 'Настанен на' : 'Отписан на'}: <strong>${new Date(student.last_status_date).toLocaleDateString('bg-BG')}</strong></div>`
        : '';

    container.innerHTML = `
        <h3>${mode === 'edit' ? 'Редактирай ученик' : 'Настани нов ученик'}</h3>
        <div style="display: flex; gap: 20px;">
            <form id="studentForm" style="flex: 1;">
                <table>
                    <tr><td>Име:</td><td><input type="text" name="first_name" value="${student.first_name || ''}" required></td></tr>
                    <tr><td>Презиме:</td><td><input type="text" name="middle_name" value="${student.middle_name || ''}" required></td></tr>
                    <tr><td>Фамилия:</td><td><input type="text" name="last_name" value="${student.last_name || ''}" required></td></tr>
                    <tr><td>ЕГН:</td><td><input type="text" name="egn" maxlength="10" value="${student.egn || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" required></td></tr>
                    <tr><td>Курсов номер:</td><td><input type="text" name="class_number" maxlength="5" value="${student.class_number || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '')" required></td></tr>
                    <tr><td>Адрес:</td><td><textarea name="from_address" required>${student.from_address || ''}</textarea></td></tr>
                    <tr><td>Телефон:</td><td><input type="text" name="phone" value="${student.phone || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '')"></td></tr>
                    <tr><td>Телефон на родител:</td><td><input type="text" name="parent_phone" value="${student.parent_phone || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '')"></td></tr>
                    <tr><td>Email:</td><td><input type="email" name="email" value="${student.email || ''}"></td></tr>
                    <tr><td>Пол:</td><td><select name="sex" required>
                        <option value="male" ${student.sex === 'male' ? 'selected' : ''}>Мъж</option>
                        <option value="female" ${student.sex === 'female' ? 'selected' : ''}>Жена</option>
                    </select></td></tr>
                    <tr><td>Семейно положение:</td><td><select name="family_status_id" id="fsSelect" required><option>Зареждане...</option></select></td></tr>
                    <tr><td>Наказания:</td><td><input type="number" name="punishments" value="${student.punishments || '0'}"></td></tr>
                    <tr><td>Блок:</td><td><select name="block" id="blockSelect" required onchange="updateRoomsByBlock()">
                        <option value="1" ${student.block === '1' ? 'selected' : ''}>1</option>
                        <option value="2" ${student.block === '2' ? 'selected' : ''}>2</option>
                    </select></td></tr>
                    <tr><td>Стая:</td><td><select name="room_id" id="roomSelect" required><option>Зареждане...</option></select></td></tr>
                    <tr><td>Метод на плащане:</td><td><select name="payment_method" required>
                        <option value="cash" ${student.payment_method === 'cash' ? 'selected' : ''}>В брой</option>
                        <option value="card" ${student.payment_method === 'card' ? 'selected' : ''}>Карта</option>
                        <option value="bank transfer" ${student.payment_method === 'bank transfer' ? 'selected' : ''}>Банков път</option>
                    </select></td></tr>
                    <tr><td colspan="2" style="padding-top: 15px;">
                        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                            <button type="submit" style="color: #28a745;">Запази</button>
                            ${mode === 'edit' ? `<button type="button" onclick="${cancelAction}">Отказ</button>` : ''}
                            ${mode === 'edit' ? `<button type="button" style="color: ${student.is_assigned !== false ? '#dc3545' : '#28a745'};" onclick="toggleAssign(event, ${studentId}, ${student.is_assigned !== false}, '${source}')">${student.is_assigned !== false ? 'Отпиши' : 'Настани'}</button>` : ''}
                            ${mode === 'edit' && student.is_assigned !== false ? `<button type="button" onclick="window.generateAndOpenAssignment(${studentId})">Заповед за настаняване</button>` : ''}
                            ${mode === 'edit' ? `<button type="button" onclick="window.generateAndOpenClearance(${studentId})">Обходен лист</button>` : ''}
                        </div>
                        <div style="margin-top: 10px;">
                            <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; user-select: none;">
                                <input type="checkbox" id="startOfYearCheckbox" name="is_start_of_year" ${isStartOfYearSelected ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                                Маркирай за начало на годината (15.09)
                            </label>
                        </div>
                    </td></tr>
                </table>
            </form>
            <div style="flex: 0 0 300px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Бележки:</strong></label>
                <textarea name="notes" form="studentForm" style="width: 100%; height: 400px; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">${student.notes || ''}</textarea>
                ${lastUpdateHtml}
                ${statusDateHtml}
            </div>
        </div>
        <div id="status"></div>
    `;

    const fsSelect = document.getElementById('fsSelect');
    const form = document.getElementById('studentForm');

    try {
        const fsResp = await fetch('/api/family-statuses');
        const fsData = await fsResp.json();
    if (Array.isArray(fsData) && fsSelect) {
                fsSelect.innerHTML = fsData.map(fs => {
                    const isSelected = student.family_status_id 
                        ? (student.family_status_id == fs.id)
                        : fs.status_name.toLowerCase().includes('нормал');

                    return `<option value="${fs.id}" ${isSelected ? 'selected' : ''}>${fs.status_name} (${fs.discount_percentage}% отстъпка)</option>`;
                }).join('');
            }

        const roomResp = await fetch('/api/rooms');
        const roomData = await roomResp.json();

        if (Array.isArray(roomData)) {
            window.allRoomsData = roomData;
        } else {
            window.allRoomsData = [];
        }

        updateRoomsByBlock(student.room_id, student.is_assigned);
    } catch (err) {
        console.error('Грешка при зареждане на опциите:', err);
    }

    if (form) {
        form.onsubmit = (e) => handleStudentSubmit(e, mode, studentId, source);
    }
}

async function handleStudentSubmit(e, mode, studentId, source = 'students') {
    e.preventDefault();
    const isStartOfYear = document.getElementById('startOfYearCheckbox')?.checked || false;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.is_start_of_year = isStartOfYear;
    const statusDiv = document.getElementById('status');

    const url = mode === 'edit' ? `/api/students/${studentId}` : '/api/students';

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
    if (result.success) {
                if (statusDiv) statusDiv.innerHTML = `<span class="text-green">Успешно запазено!</span>`;
                
            if (mode === 'add') {
                e.target.reset();
                
                const docWindow = window.open('', '_blank');
                if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на заповед... Моля изчакайте.</div>");
                
                window.generateAndOpenAssignment(result.id, docWindow, isStartOfYear).then(() => {
                    navigate('reports');
                    setTimeout(() => { 
                        const sel = document.getElementById('reportType'); 
                        if(sel) { sel.value = 'all'; handleReportTypeChange(); } 
                    }, 100);
                });
            } else {
                    if (source === 'pay' && studentId) {
                        setTimeout(() => renderPay(document.getElementById('content')).then(() => selStudent(studentId)), 1000);
                    } else {
                        setTimeout(() => {
                            navigate('reports');
                            setTimeout(() => { 
                                const sel = document.getElementById('reportType'); 
                                if(sel) { sel.value = 'all'; handleReportTypeChange(); } 
                            }, 100);
                        }, 1000);
                    }
                }
            } else {
                if (statusDiv) statusDiv.innerHTML = `<span class="text-red">Грешка: ${result.error}</span>`;
            }
    } catch (err) {
        if (statusDiv) statusDiv.innerHTML = `<span class="text-red">Грешка при връзката: ${err.message}</span>`;
    }
}

function updateRoomsByBlock(preSelectedRoomId = null, isStudentAssigned = null) {
    const blockSelect = document.getElementById('blockSelect');
    const roomSelect = document.getElementById('roomSelect');

    if (!blockSelect || !roomSelect) return;

    const selectedBlock = blockSelect.value;
    if (!Array.isArray(window.allRoomsData)) {
        roomSelect.innerHTML = '<option value="">Няма налични стаи</option>';
        return;
    }

    const filteredRooms = window.allRoomsData.filter(r => r.block === selectedBlock);

    roomSelect.innerHTML = filteredRooms.map(r => {
        const freeSpaces = r.capacity - (r.current_occupancy || 0);
        const isSelected = preSelectedRoomId == r.id; 
        const isCurrentlyOccupying = isSelected && isStudentAssigned !== false;
        const isDisabled = (freeSpaces <= 0 && !isCurrentlyOccupying) ? 'disabled' : '';
        const roomType = r.capacity === 3 ? 'G' : 'M';
        
        return `<option value="${r.id}" ${isSelected ? 'selected' : ''} ${isDisabled}>Стая ${r.room_number}${roomType} (Свободни: ${freeSpaces} / ${r.capacity})</option>`;
    }).join('');
}

async function toggleAssign(e, studentId, isCurrentlyAssigned, source = 'reports') {
    e.preventDefault();
    const newStatus = !isCurrentlyAssigned;
    if (!confirm(`Сигурни ли сте, че искате да ${newStatus ? 'настаните' : 'отпишете'} ученика?`)) return;

    let docWindow = null;
    let isStartOfYear = false;
    if (newStatus) {
        docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на заповед... Моля изчакайте.</div>");
        isStartOfYear = document.getElementById('startOfYearCheckbox')?.checked || false;
    }

    let selectedRoomId = null;
    const roomSelect = document.getElementById('roomSelect');
    if (newStatus && roomSelect) {
        selectedRoomId = roomSelect.value;
    }

    try {
        const resp = await fetch(`/api/students/${studentId}/assignment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_assigned: newStatus, room_id: selectedRoomId, is_start_of_year: isStartOfYear })
        });
        const result = await resp.json();
        if (result.success) {
            await renderStudentForm(document.getElementById('content'), 'edit', studentId, source);
            const statusDiv = document.getElementById('status');
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="text-green">${newStatus ? 'Ученикът е настанен успешно!' : 'Ученикът е отписан успешно!'}</span>`;
            }
            if (newStatus) {
                await window.generateAndOpenAssignment(studentId, docWindow, isStartOfYear);
            }
        } else {
            if (docWindow) docWindow.close();
            alert('Грешка: ' + result.error);
        }
    } catch (err) {
        if (docWindow) docWindow.close();
        alert('Възникна грешка при промяна на статуса.');
    }
}

window.renderDocumentFallback = function(win, title, data, errorMsg, onRetryFnName, studentId) {
    if (!win) return;
    const isClearance = title.includes('Обходен');
    win.document.open();
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
                @page { size: A4; margin: 20mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 25px; background: #f8fafc; color: #1e293b; }
                .container { max-width: 750px; margin: 0 auto; background: white; padding: 40px 50px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
                .banner { background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; padding: 12px 16px; border-radius: 6px; margin-bottom: 25px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
                .action-btns { display: flex; gap: 10px; margin-bottom: 25px; }
                .btn { padding: 9px 18px; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; border: none; }
                .btn-primary { background: #2563eb; color: white; }
                .btn-primary:hover { background: #1d4ed8; }
                .btn-secondary { background: #f1f5f9; color: #334155; }
                .btn-secondary:hover { background: #e2e8f0; }
                .header-title { text-align: center; margin-bottom: 30px; }
                .header-title h2 { margin: 0 0 5px; font-size: 20px; font-weight: 700; letter-spacing: 1px; }
                .header-title h3 { margin: 0 0 5px; font-size: 15px; font-weight: 600; }
                .header-title p { margin: 0; font-size: 13px; color: #475569; }
                .doc-number { font-size: 14px; font-weight: 700; margin-bottom: 15px; }
                .doc-content p { font-size: 15px; line-height: 1.8; margin: 10px 0; }
                .doc-footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 15px; }
                @media print {
                    body { background: white; padding: 0; }
                    .container { box-shadow: none; padding: 0; max-width: 100%; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="no-print">
                    ${errorMsg ? `
                    <div class="banner">
                        <span>Google Docs връзката се забави. Документът е генериран локално и е готов за печат.</span>
                    </div>` : ''}
                    <div class="action-btns">
                        <button class="btn btn-primary" onclick="window.print()">Принтирай веднага</button>
                        <button class="btn btn-secondary" onclick="window.opener && window.opener.${onRetryFnName} ? window.opener.${onRetryFnName}(${studentId}, window) : window.location.reload()">Опитай отново в Google Docs</button>
                        <button class="btn btn-secondary" onclick="window.close()">Затвори</button>
                    </div>
                </div>

                ${isClearance ? `
                    <div class="header-title">
                        <h2>О Б Х О Д Е Н   Л И С Т</h2>
                    </div>
                    <div class="doc-content">
                        <p><strong>Име:</strong> ${data?.име || '-'}</p>
                        <p><strong>ЕГН:</strong> ${data?.егн || '-'}</p>
                        <p><strong>Курс/Клас:</strong> ${data?.курс || '-'} &nbsp;&nbsp; <strong>Блок:</strong> ${data?.блок || '-'} &nbsp;&nbsp; <strong>Стая:</strong> ${data?.стая || '-'}</p>
                        <br>
                        <p>1. Счетоводство: НЕ ДЪЛЖИ</p>
                        <p>2. Хранителен блок: НЕ ДЪЛЖИ</p>
                        <p>3. Общежитие: НЕ ДЪЛЖИ</p>
                    </div>
                    <div class="doc-footer">
                        <div><strong>Дата:</strong> ${data?.дата || new Date().toLocaleDateString('bg-BG')}</div>
                        <div><strong>Подпис:</strong> ....................................</div>
                    </div>
                ` : `
                    ${data?.номер_заповед ? `<div class="doc-number">№ ${data.номер_заповед}</div>` : ''}
                    <div class="header-title">
                        <h2>З А П О В Е Д</h2>
                        <h3>за настаняване в общежитие</h3>
                    </div>
                    <div class="doc-content">
                        <p style="text-align: justify; font-size: 13.5px; color: #334155; margin-bottom: 25px;">
                            На основание чл. 258, ал. 1 от Закона за предучилищното и училищното образование, Правилника за устройството и дейността на ученическите общежития, Правилника за вътрешния ред.
                        </p>
                        <p><strong>Настанява се ученикът/ученичката:</strong> ${data?.име || '-'}</p>
                        <p><strong>ЕГН:</strong> ${data?.егн || '-'}</p>
                        <p><strong>Курс/Клас:</strong> ${data?.курс || '-'}</p>
                        <p><strong>Адрес:</strong> ${data?.адрес || '-'}</p>
                        <p><strong>Пол:</strong> ${data?.пол || '-'}</p>
                        <p><strong>Телефон:</strong> ${data?.телефон || '-'}</p>
                        <p><strong>Телефон на родител:</strong> ${data?.телефон_родител || '-'}</p>
                        <p><strong>Имейл:</strong> ${data?.имейл || '-'}</p>
                        <br>
                        <p><strong>Да бъде настанен/а в:</strong> Блок: <b>${data?.блок || '-'}</b>, Стая: <b>${data?.стая || '-'}</b></p>
                    </div>
                    <div class="doc-footer">
                        <div><strong>Дата:</strong> ${data?.дата || new Date().toLocaleDateString('bg-BG')}</div>
                        <div><strong>Подпис:</strong> ....................................</div>
                    </div>
                `}
            </div>
        </body>
        </html>
    `);
    win.document.close();
};

window.openImmediateFallback = async function(win, title, studentId) {
    if (!win) return;
    try {
        const resp = await fetch(`/api/students/${studentId}`);
        const student = await resp.json();
        let roomNum = student.room_number || student.room_id || '-';
        if (roomNum !== '-' && student.room_capacity) {
            roomNum += (student.room_capacity === 3 ? 'G' : 'M');
        }
        let orderNumber = student.assignment_order_number ? `${student.assignment_order_number}` : '';
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
            дата: new Date().toLocaleDateString('bg-BG')
        };
        window.renderDocumentFallback(win, title, studentData, null, title.includes('Обходен') ? 'generateAndOpenClearance' : 'generateAndOpenAssignment', studentId);
    } catch (e) {
        window.renderDocumentFallback(win, title, null, null, title.includes('Обходен') ? 'generateAndOpenClearance' : 'generateAndOpenAssignment', studentId);
    }
};

window.generateAndOpenAssignment = async function(studentId, docWindow = null, isStartOfYear = null) {
    if (!docWindow) {
        docWindow = window.open('', '_blank');
    }
    if (docWindow) {
        docWindow.document.open();
        docWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Заповед за настаняване...</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; }
                    .spinner { border: 4px solid #e2e8f0; border-top: 4px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    h3 { margin: 0 0 6px; font-size: 18px; }
                    p { margin: 0; color: #64748b; font-size: 13.5px; }
                </style>
            </head>
            <body>
                <div class="spinner"></div>
                <h3>Подготовка на заповедта за печат...</h3>
                <p>Зареждане на локалния шаблон...</p>
            </body>
            </html>
        `);
        docWindow.document.close();
    }

    if (isStartOfYear === null) {
        const cb = document.getElementById('startOfYearCheckbox');
        if (cb) isStartOfYear = cb.checked;
    }

    try {
        const resp = await fetch('/api/documents/generate-assignment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, is_start_of_year: isStartOfYear })
        });
        const result = await resp.json();
        if (result.success && result.html) {
            if (docWindow) {
                docWindow.document.open();
                docWindow.document.write(result.html);
                docWindow.document.close();
            } else {
                const win = window.open('', '_blank');
                win.document.open();
                win.document.write(result.html);
                win.document.close();
            }
        } else {
            const errMsg = result.error || 'Възникна грешка при създаване на заповедта.';
            if (docWindow) {
                docWindow.document.body.innerHTML = `<div style="padding: 40px; text-align: center; color: #dc2626;"><h3>Грешка</h3><p>${errMsg}</p><button onclick="window.close()" style="margin-top: 15px; padding: 8px 16px;">Затвори</button></div>`;
            } else {
                alert('Грешка: ' + errMsg);
            }
        }
    } catch (err) {
        console.error('Error generating assignment document:', err);
        if (docWindow) {
            docWindow.document.body.innerHTML = `<div style="padding: 40px; text-align: center; color: #dc2626;"><h3>Грешка при връзката</h3><p>${err.message}</p><button onclick="window.close()" style="margin-top: 15px; padding: 8px 16px;">Затвори</button></div>`;
        } else {
            alert('Грешка при връзка със сървъра: ' + err.message);
        }
    }
};

window.generateAndOpenClearance = async function(studentId, docWindow = null) {
    if (!docWindow) {
        docWindow = window.open('', '_blank');
    }
    if (docWindow) {
        docWindow.document.open();
        docWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Обходен лист...</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; }
                    .spinner { border: 4px solid #e2e8f0; border-top: 4px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    h3 { margin: 0 0 6px; font-size: 18px; }
                    p { margin: 0; color: #64748b; font-size: 13.5px; }
                </style>
            </head>
            <body>
                <div class="spinner"></div>
                <h3>Подготовка на обходния лист за печат...</h3>
                <p>Зареждане на локалния шаблон...</p>
            </body>
            </html>
        `);
        docWindow.document.close();
    }

    try {
        const resp = await fetch('/api/documents/generate-clearance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId })
        });
        const result = await resp.json();
        if (result.success && result.html) {
            if (docWindow) {
                docWindow.document.open();
                docWindow.document.write(result.html);
                docWindow.document.close();
            } else {
                const win = window.open('', '_blank');
                win.document.open();
                win.document.write(result.html);
                win.document.close();
            }
        } else {
            const errMsg = result.error || 'Възникна грешка при създаване на обходния лист.';
            if (docWindow) {
                docWindow.document.body.innerHTML = `<div style="padding: 40px; text-align: center; color: #dc2626;"><h3>Грешка</h3><p>${errMsg}</p><button onclick="window.close()" style="margin-top: 15px; padding: 8px 16px;">Затвори</button></div>`;
            } else {
                alert('Грешка: ' + errMsg);
            }
        }
    } catch (err) {
        console.error('Error generating clearance document:', err);
        if (docWindow) {
            docWindow.document.body.innerHTML = `<div style="padding: 40px; text-align: center; color: #dc2626;"><h3>Грешка при връзката</h3><p>${err.message}</p><button onclick="window.close()" style="margin-top: 15px; padding: 8px 16px;">Затвори</button></div>`;
        } else {
            alert('Грешка при връзка със сървъра: ' + err.message);
        }
    }
};

function renderStudentTable(data) {
    const outputDiv = document.getElementById('reportResult');
    if (!outputDiv) return;

    if (!data || data.length === 0) {
        outputDiv.innerHTML = '<p>Няма намерени студенти.</p>';
        return;
    }

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Блок</th>
                    <th>Стая</th>
                    <th>Име</th>
                    <th>ЕГН</th>
                    <th>Курсов №</th>
                    <th>Действие</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(s => {
        const isUnassigned = (s.is_assigned == false || s.is_assigned === '0' || s.is_assigned === null);
        const rowStyle = isUnassigned ? 'style="opacity: 0.6; background-color: #f8f9fa;"' : '';
        const badge = isUnassigned ? '<span style="color: red; font-size: 0.85em; margin-left:5px;">[Отписан]</span>' : '';
        
        const blockVal = s.block || '-';
        let roomVal = s.room_number || s.room || '-';
        if (roomVal !== '-' && s.room_capacity) {
            roomVal += (s.room_capacity === 3 ? 'G' : 'M');
        }
        const nameVal = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');

        html += `
            <tr ${rowStyle}>
                <td>${blockVal}</td>
                <td>${roomVal}</td>
                <td>${nameVal}${badge}</td>
                <td>${s.egn || '-'}</td>
                <td>${s.class_number || '-'}</td>
                <td><button onclick="renderStudentForm(document.getElementById('content'), 'edit', ${s.id}, 'reports')">Редактирай</button></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;
    outputDiv.innerHTML = html;
}