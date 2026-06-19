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

    const lastUpdateHtml = (mode === 'edit' && student.notes_updated_at) 
        ? `<div style="font-size: 0.85em; color: #666; margin-top: 5px;">Последна промяна: <strong>${new Date(student.notes_updated_at).toLocaleDateString('bg-BG')}</strong></div>`
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
                    <tr><td colspan="2" style="padding-top: 15px; display: flex; gap: 10px; align-items: center;">
                        <button type="submit" style="color: #28a745;">Запази</button>
                        ${mode === 'edit' ? `<button type="button" onclick="${cancelAction}">Отказ</button>` : ''}
                        ${mode === 'edit' ? `<button type="button" style="color: ${student.is_assigned !== false ? '#dc3545' : '#28a745'};" onclick="toggleAssign(event, ${studentId}, ${student.is_assigned !== false}, '${source}')">${student.is_assigned !== false ? 'Отпиши' : 'Настани'}</button>` : ''}
                        ${mode === 'edit' ? `<button type="button" onclick="window.generateAndOpenClearance(${studentId})">Обходен лист</button>` : ''}
                    </td></tr>
                </table>
            </form>
            <div style="flex: 0 0 300px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Бележки:</strong></label>
                <textarea name="notes" form="studentForm" style="width: 100%; height: 400px; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">${student.notes || ''}</textarea>
                ${lastUpdateHtml}
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
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
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
                
                window.generateAndOpenAssignment(result.id, docWindow).then(() => {
                    navigate('students');
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
    if (newStatus) {
        docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на заповед... Моля изчакайте.</div>");
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
            body: JSON.stringify({ is_assigned: newStatus, room_id: selectedRoomId })
        });
        const result = await resp.json();
        if (result.success) {
            renderStudentForm(document.getElementById('content'), 'edit', studentId, source);
            if (newStatus) {
                await window.generateAndOpenAssignment(studentId, docWindow);
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

window.generateAndOpenAssignment = async function(studentId, docWindow = null) {
    if (!docWindow) {
        docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на заповед... Моля изчакайте.</div>");
    }
    
    try {
        const studentResp = await fetch(`/api/students/${studentId}`);
        if (!studentResp.ok) throw new Error("Could not fetch student");
        const student = await studentResp.json();
        
        let assignmentTemplateId = null;
        try {
            const templateResp = await fetch('/api/settings/template-assignment');
            if (templateResp.ok) {
                const templateData = await templateResp.json();
                assignmentTemplateId = templateData.template_id;
            }
        } catch (e) {
            console.warn('Could not fetch assignment template ID.', e);
        }

        let roomNum = student.room_number || student.room || student.room_id || '-';
        if (roomNum !== '-' && student.room_capacity) {
            roomNum += (student.room_capacity === 3 ? 'G' : 'M');
        } else if ((!student.room_number && !student.room) && student.room_id) {
            try {
                const rResp = await fetch(`/api/rooms/${student.room_id}`);
                if (rResp.ok) {
                    const room = await rResp.json();
                    roomNum = room.room_number || '-';
                    if (roomNum !== '-' && room.capacity) {
                        roomNum += (room.capacity === 3 ? 'G' : 'M');
                    }
                }
            } catch (err) {}
        }
        
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';
        
        const resp = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                isAssignment: true,
                assignmentTemplateId: assignmentTemplateId,
                title: 'Заповед_Настаняване_' + student.egn,
                studentData: {
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
                }
            })
        });
        
        const result = await resp.json();
        if (result.success) {
            if (docWindow) {
                docWindow.location.href = result.url;
            } else {
                window.open(result.url, '_blank');
            }
            if (result.assignmentTemplateId && result.assignmentTemplateId !== assignmentTemplateId) {
                fetch('/api/settings/template-assignment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ template_id: result.assignmentTemplateId })
                });
            }
        } else {
            console.error('Document generation error:', result.error);
            if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка: " + result.error + "</span>");
        }
    } catch(err) {
        console.error('Error generating assignment document:', err);
        if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка при създаване: " + err.message + "</span>");
    }
}

window.generateAndOpenClearance = async function(studentId, docWindow = null) {
    if (!docWindow) {
        docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на обходен лист... Моля изчакайте.</div>");
    }
    
    try {
        const studentResp = await fetch(`/api/students/${studentId}`);
        if (!studentResp.ok) throw new Error("Could not fetch student");
        const student = await studentResp.json();
        
        let clearanceTemplateId = null;
        try {
            const templateResp = await fetch('/api/settings/template-clearance');
            if (templateResp.ok) {
                const templateData = await templateResp.json();
                clearanceTemplateId = templateData.template_id;
            }
        } catch (e) {
            console.warn('Could not fetch clearance template ID.', e);
        }

        let roomNum = student.room_number || student.room || student.room_id || '-';
        if (roomNum !== '-' && student.room_capacity) {
            roomNum += (student.room_capacity === 3 ? 'G' : 'M');
        } else if ((!student.room_number && !student.room) && student.room_id) {
            try {
                const rResp = await fetch(`/api/rooms/${student.room_id}`);
                if (rResp.ok) {
                    const room = await rResp.json();
                    roomNum = room.room_number || '-';
                    if (roomNum !== '-' && room.capacity) {
                        roomNum += (room.capacity === 3 ? 'G' : 'M');
                    }
                }
            } catch (err) {}
        }
        
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';
        
        const resp = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                isClearance: true,
                clearanceTemplateId: clearanceTemplateId,
                title: 'Обходен_Лист_' + student.egn,
                studentData: {
                    име: `${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.trim() || '-',
                    егн: student.egn || '-',
                    стая: roomNum,
                    блок: student.block || '-',
                    курс: student.class_number || '-',
                    дата: new Date().toLocaleDateString('bg-BG')
                }
            })
        });
        
        const result = await resp.json();
        if (result.success) {
            if (docWindow) {
                docWindow.location.href = result.url;
            } else {
                window.open(result.url, '_blank');
            }
            if (result.clearanceTemplateId && result.clearanceTemplateId !== clearanceTemplateId) {
                fetch('/api/settings/template-clearance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ template_id: result.clearanceTemplateId })
                });
            }
        } else {
            console.error('Document generation error:', result.error);
            if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка: " + result.error + "</span>");
        }
    } catch(err) {
        console.error('Error generating clearance document:', err);
        if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка при създаване: " + err.message + "</span>");
    }
}

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