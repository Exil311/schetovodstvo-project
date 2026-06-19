function renderRoomTable(data) {
    const resultDiv = document.getElementById('reportResult');
    
    if (!Array.isArray(data)) {
        resultDiv.innerHTML = '<p>Грешка при зареждане на данни.</p>';
        return;
    }
    
    if (!data || data.length === 0) {
        resultDiv.innerHTML = '<p>Няма намерени стаи.</p>';
        return;
    }

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Блок</th>
                    <th>Стая №</th>
                    <th>Заетост</th>
                    <th>Настанени Ученици</th>
                    <th>Статус</th>
                    <th>Действие</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(r => {
        const occupancy = r.current_occupancy || 0;
        const free = r.capacity - occupancy;

        html += `
            <tr>
                <td>${r.block}</td>
                <td>${r.room_number}${r.capacity === 3 ? 'G' : 'M'}</td>
                <td>
                    ${occupancy} / ${r.capacity}<br>
                </td>
                <td>${r.class_numbers || '-'}</td>
                <td>${!r.is_in_use ? 'Не се използва' : (r.has_problem ? 'Проблем: ' + r.problem_details : 'OK')}</td>
                <td><button onclick="renderRoomForm(document.getElementById('content'), ${r.id})">Редактирай</button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    resultDiv.innerHTML = html;
}

async function renderRoomForm(container, roomId) {
    let room = {};
    try {
        const resp = await fetch(`/api/rooms/${roomId}`);
        room = await resp.json();
    } catch (err) {
        container.innerHTML = `<span class="text-red">Грешка при зареждане на стая: ${err.message}</span>`;
        return;
    }

    container.innerHTML = `
        <h3>Редактирай Стая ${room.room_number}${room.capacity === 3 ? 'G' : 'M'}</h3>
        <form id="roomForm">
            <table>
                <tr>
                    <td>Блок:</td>
                    <td>
                        <select name="block" required>
                            <option value="1" ${room.block === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${room.block === '2' ? 'selected' : ''}>2</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>Капацитет:</td>
                    <td>
                        <select name="capacity" required>
                            <option value="2" ${room.capacity === 2 ? 'selected' : ''}>2</option>
                            <option value="3" ${room.capacity === 3 ? 'selected' : ''}>3</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>Има ли проблем?</td>
                    <td>
                        <input type="checkbox" name="has_problem" id="hasProblemCheck" ${room.has_problem ? 'checked' : ''} onchange="toggleProblemDetails()">
                    </td>
                </tr>
                <tr id="problemDetailsRow" class="${room.has_problem ? '' : 'hidden'}">
                    <td>Детайли за проблема:</td>
                    <td><textarea name="problem_details">${room.problem_details || ''}</textarea></td>
                </tr>
                <tr>
                    <td>Активна (Използва се):</td>
                    <td><input type="checkbox" name="is_in_use" ${room.is_in_use ? 'checked' : ''}></td>
                </tr>
                <tr>
                    <td colspan="2">
                        <button type="submit">Запази</button>
                        <button type="button" onclick="navigate('reports'); document.getElementById('reportType').value='rooms'; handleReportTypeChange();">Отказ</button>
                    </td>
                </tr>
            </table>
        </form>
        <div id="status"></div>
    `;

    document.getElementById('roomForm').onsubmit = (e) => handleRoomSubmit(e, roomId);
}

function toggleProblemDetails() {
    const isChecked = document.getElementById('hasProblemCheck').checked;
    const row = document.getElementById('problemDetailsRow');
    if (isChecked) row.classList.remove('hidden');
    else row.classList.add('hidden');
}

async function handleRoomSubmit(e, roomId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        block: formData.get('block'),
        capacity: parseInt(formData.get('capacity')),
        is_in_use: formData.get('is_in_use') === 'on',
        has_problem: formData.get('has_problem') === 'on',
        problem_details: formData.get('problem_details')
    };

    const statusDiv = document.getElementById('status');

    try {
        const resp = await fetch(`/api/rooms/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.success) {
            statusDiv.innerHTML = `<span class="text-green">Успешно обновена стая!</span>`;
            setTimeout(() => {
                navigate('reports');
                setTimeout(() => {
                    document.getElementById('reportType').value = 'rooms';
                    handleReportTypeChange();
                }, 100);
            }, 1000);
        } else {
            statusDiv.innerHTML = `<span class="text-red">Грешка: ${result.error}</span>`;
        }
    } catch (err) {
        statusDiv.innerHTML = `<span class="text-red">Грешка при връзката: ${err.message}</span>`;
    }
}
