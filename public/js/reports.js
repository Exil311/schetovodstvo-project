window.allStudentsData = window.allStudentsData || [];
window.allRoomsData = window.allRoomsData || [];
window.statusGlobalData = window.statusGlobalData || [];
window.statusGlobalPeriods = window.statusGlobalPeriods || [];

async function renderReports(container) {
    container.innerHTML = `
        <h3>Справки</h3>
        <div style="margin-bottom: 20px; display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
            <select id="reportType" onchange="handleReportTypeChange()" class="input-field" style="padding: 6px; min-width: 200px;">
                <option value="all">Всички ученици</option>
                <option value="status_period">Справка по блокове за период</option>
                <option value="rooms">Справка по стаи</option>
                <option value="daily">Дневни плащания</option>
                <option value="period_payments">Плащания по период</option>
            </select>
            <input type="text" id="tableSearch" placeholder="Търсене..." oninput="filterTable()" class="input-field active" style="padding: 6px; width: 250px;">
            <select id="blockFilter" onchange="filterTable()" class="input-field" style="padding: 6px; display: none;">
                <option value="">Всички блокове</option>
                <option value="1">Блок 1</option>
                <option value="2">Блок 2</option>
            </select>
            <label id="freeRoomsLabel" style="display:none; align-items:center; cursor: pointer;">
                <input type="checkbox" id="freeRoomsOnly" onchange="filterTable()" style="margin-right: 5px;"> Само свободни стаи
            </label>
            <label id="hideUnassignedLabel" style="display:inline-flex; align-items:center; cursor: pointer;">
                <input type="checkbox" id="hideUnassigned" onchange="filterTable()" style="margin-right: 5px;"> Скрий отписаните ученици
            </label>
        </div>
        <div id="reportResult"></div>
    `;
    await handleReportTypeChange();
}

window.handleReportTypeChange = async function () {
    const type = document.getElementById('reportType').value;
    const resultDiv = document.getElementById('reportResult');
    const searchInput = document.getElementById('tableSearch');
    const freeRoomsLabel = document.getElementById('freeRoomsLabel');
    const hideUnassignedLabel = document.getElementById('hideUnassignedLabel');
    const exportBtn = document.getElementById('exportBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportDocsShortBtn = document.getElementById('exportDocsShortBtn');
    if (exportBtn) exportBtn.style.display = type ? 'inline-block' : 'none';
    if (exportExcelBtn) exportExcelBtn.style.display = type === 'status_period' ? 'inline-block' : 'none';
    if (exportDocsShortBtn) exportDocsShortBtn.style.display = type === 'period_payments' ? 'inline-block' : 'none';

    if (type === 'daily' || type === 'period_payments') {
        searchInput.style.display = 'none';
    } else {
        searchInput.style.display = 'inline-block';
        searchInput.value = '';
    }

    if (searchInput) {
        searchInput.value = '';
    }

    const blockFilter = document.getElementById('blockFilter');

    if (freeRoomsLabel) freeRoomsLabel.style.display = 'none';
    if (hideUnassignedLabel) hideUnassignedLabel.style.display = 'none';
    if (blockFilter) {
        blockFilter.style.display = 'none';
        blockFilter.value = ""; // Reset block filter when hidden to prevent interference with other reports
    }

    if (type === 'all') {
        searchInput.classList.add('active');
        if (hideUnassignedLabel) hideUnassignedLabel.style.display = 'inline-flex';
        resultDiv.innerHTML = '<p>Зареждане...</p>';
        try {
            const resp = await fetch('/api/students');
            if (!resp.ok) {
                resultDiv.innerHTML = `<span class="text-red">Грешка ${resp.status}: ${resp.statusText}</span>`;
                return;
            }
            allStudentsData = await resp.json();
            if (!Array.isArray(allStudentsData)) {
                resultDiv.innerHTML = '<span class="text-red">Грешка: Невалидни данни от сървър</span>';
                return;
            }
            filterTable();
        } catch (err) {
            resultDiv.innerHTML = `<span class="text-red">Грешка: ${err.message}</span>`;
        }

    } else if (type === 'rooms') {
        searchInput.classList.add('active');
        resultDiv.innerHTML = '<p>Зареждане на стаи...</p>';
        if (freeRoomsLabel) freeRoomsLabel.style.display = 'inline-flex';
        if (blockFilter) blockFilter.style.display = 'inline-block';

        resultDiv.innerHTML = '<p>Зареждане на стаи...</p>';

        try {
            const resp = await fetch('/api/rooms');
            if (!resp.ok) {
                resultDiv.innerHTML = `<span class="text-red">Грешка ${resp.status}: ${resp.statusText}</span>`;
                return;
            }
            allRoomsData = await resp.json();
            if (!Array.isArray(allRoomsData)) {
                resultDiv.innerHTML = '<span class="text-red">Грешка: Невалидни данни от сървър</span>';
                return;
            }
            filterTable();
        } catch (err) {
            resultDiv.innerHTML = `<span class="text-red">Грешка: ${err.message}</span>`;
        }

    } else if (type === 'daily') {
        searchInput.classList.add('active');
        searchInput.value = '';
        resultDiv.innerHTML = '<p>Зареждане...</p>';
        try {
            const resp = await fetch('/api/reports/daily-payments');
            if (!resp.ok) {
                resultDiv.innerHTML = `<span class="text-red">Грешка ${resp.status}: ${resp.statusText}</span>`;
                return;
            }
            const data = await resp.json();
            if (!Array.isArray(data)) {
                resultDiv.innerHTML = '<span class="text-red">Грешка: Невалидни данни от сървър</span>';
                return;
            }
            dailyPaymentsData = data;
            renderDailyPay(data);
        } catch (err) {
            resultDiv.innerHTML = `<span class="text-red">Грешка при зареждане: ${err.message}</span>`;
        }
    } else if (type === 'period_payments') {
        searchInput.classList.add('active');
        searchInput.value = '';
        resultDiv.innerHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 5px; border: 1px solid #ddd;">
                    <h4 style="margin-top:0">Справка плащания по период</h4>
                    <div style="display: flex; gap: 10px; align-items: flex-end;">
                        <label>От: <br><input type="date" id="payStartDate" class="input-field"></label>
                        <label>До: <br><input type="date" id="payEndDate" class="input-field"></label>
                        <button class="btn-primary" onclick="fetchPeriodPayments()" style="height: fit-content; padding: 8px 15px;">Генерирай</button>
                    </div>
                </div>
                <div id="periodPayOutput"></div>
            `;
    } else if (type === 'status_period') {
        searchInput.classList.add('active');
        resultDiv.innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 5px; border: 1px solid #ddd;">
                <h4 style="margin-top:0">Справка по блокове за период</h4>
                <div style="display: flex; gap: 10px; align-items: flex-end;">
                    <label>От: <br><input type="date" id="statusStart" class="input-field" onclick="this.showPicker()"></label>
                    <label>До: <br><input type="date" id="statusEnd" class="input-field" onclick="this.showPicker()"></label>
                    <label>Блок: <br>
                        <select id="statusBlock" class="input-field" style="width: 80px;">
                            <option value="">Всички</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                        </select>
                    </label>
                    <button class="btn-primary" onclick="generateStatusReport()" style="height: fit-content; padding: 8px 15px;">Генерирай</button>
                    <label id="hideUnassignedLabelStatus" style="display: flex; align-items: center; margin-left: 15px; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="hideUnassignedStatus" onchange="filterTable()" style="transform: scale(1.2); margin-right: 5px;"> 
                        Не показвай отписани ученици
                    </label>
                </div>
            </div>
            <div id="statusReportOutput"></div>
        `;
    } else {
        searchInput.classList.remove('active');
        resultDiv.innerHTML = '';
    }
}

function renderDailyPay(data) {
    const resultDiv = document.getElementById('reportResult');

    if (!Array.isArray(data)) {
        resultDiv.innerHTML = '<p>Грешка при зареждане на плащания.</p>';
        return;
    }

    if (!data || data.length === 0) {
        resultDiv.innerHTML = '<p>Няма плащания за днес</p>';
        return;
    }

    const cashPayments = data.filter(p => p.payment_method === 'cash');
    const cardPayments = data.filter(p => p.payment_method === 'card');
    const bankPayments = data.filter(p => p.payment_method === 'bank_transfer');
    const totalCash = cashPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalCard = cardPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBank = bankPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalAll = totalCash + totalCard + totalBank;

    resultDiv.innerHTML = `
        <div style="margin-bottom: 10px;">
            <button class="tab-btn active" onclick="switchReportTab('cash')">В брой</button>
            <button class="tab-btn" onclick="switchReportTab('card')">Карта</button>
            <button class="tab-btn" onclick="switchReportTab('bank')">Банка</button>
            <button class="tab-btn" onclick="switchReportTab('total')">Общо за деня</button>
        </div>
        
        <div id="cashSection" class="report-tab-content">
            ${generateTableHtml(cashPayments, "Общо в брой:", totalCash, false)}
        </div>
        
        <div id="cardSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(cardPayments, "Общо карта:", totalCard, false)}
        </div>
        
        <div id="bankSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(bankPayments, "Общо банка:", totalBank, false)}
        </div>

        <div id="totalSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(data, "ОБЩО ЗА ДЕНЯ:", totalAll, true)}
        </div>
    `;
}

function generateTableHtml(payments, label, totalSum, showMethod) {
    if (payments.length === 0) return '<p>Няма записи.</p>';

    let table = '<table class="data-table"><thead><tr>';
    table += '<th>Дата/Час</th><th>Студент</th><th>ЕГН</th><th>Курсов №</th><th>Месец</th>';
    if (showMethod) table += '<th>Метод</th>';
    table += '<th>Сума (€)</th></tr></thead><tbody>';

    payments.forEach(p => {
        const meth = p.payment_method === 'cash' ? 'В брой' : p.payment_method === 'card' ? 'Карта' : 'Банка';

        table += '<tr>';
        table += `<td>${new Date(p.payment_date).toLocaleString()}</td>`;
        const fullName = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
        table += `<td>${fullName}</td>`;
        table += `<td>${p.egn}</td>`;
        table += `<td>${p.class_number || '-'}</td>`;
        table += `<td>${p.month_name} ${p.year}</td>`;
        if (showMethod) table += `<td>${meth}</td>`;
        table += `<td>${parseFloat(p.amount).toFixed(2)}</td>`;
        table += '</tr>';
    });

    table += '</tbody>';

    const colSpan = showMethod ? 6 : 5;
    table += `<tfoot>
        <tr style="font-weight: bold; background-color: #eee;">
            <td colspan="${colSpan}" style="text-align: right;">${label}</td>
            <td>${totalSum.toFixed(2)} €</td>
        </tr>
    </tfoot>`;

    table += '</table>';
    return table;
}

function switchReportTab(type) {
    document.querySelectorAll('.report-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const btns = document.querySelectorAll('.tab-btn');
    if (type === 'cash') {
        document.getElementById('cashSection').style.display = 'block';
        if (btns[0]) btns[0].classList.add('active');
    } else if (type === 'card') {
        document.getElementById('cardSection').style.display = 'block';
        if (btns[1]) btns[1].classList.add('active');
    } else if (type === 'bank') {
        document.getElementById('bankSection').style.display = 'block';
        if (btns[2]) btns[2].classList.add('active');
    } else if (type === 'total') {
        document.getElementById('totalSection').style.display = 'block';
        if (btns[3]) btns[3].classList.add('active');
    }
}

window.filterTable = function () {
    const searchInput = document.getElementById('tableSearch');
    if (!searchInput) return;
    const query = document.getElementById('tableSearch').value.trim();
    const lowQuery = query.toLowerCase();
    const searchTerms = lowQuery.split(/\s+/).filter(t => t.length > 0);
    const noSpaceQuery = lowQuery.replace(/\s+/g, '');
    const type = document.getElementById('reportType').value;
    const isRoomSearch = noSpaceQuery.startsWith('стая') || noSpaceQuery.startsWith('staya') || noSpaceQuery.startsWith('staia') || noSpaceQuery.startsWith('staq');
    const roomTarget = isRoomSearch ? noSpaceQuery.replace(/[^0-9]/g, '') : '';
    const isPureNumeric = /^\d+$/.test(query);
    const len = query.length;

    const sortByClassNumber = (a, b) => {
        const numA = parseInt(a.class_number || a.class_numbers, 10) || 999999;
        const numB = parseInt(b.class_number || b.class_numbers, 10) || 999999;
        return numA - numB;
    };

    const sortByRoom = (a, b) => {
        const blockA = parseInt(a.block) || 0;
        const blockB = parseInt(b.block) || 0;
        if (blockA !== blockB) return blockA - blockB;
        return (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0);
    };

    const blockFilterVal = document.getElementById('blockFilter') ? document.getElementById('blockFilter').value : '';

    if (type === 'all') {
        if (!Array.isArray(allStudentsData)) return;
        const hideUnassignedBtn = document.getElementById('hideUnassigned');
        const shouldHide = hideUnassignedBtn ? hideUnassignedBtn.checked : false;
        const filtered = allStudentsData.filter(s => {
            const isUnassigned = (s.is_assigned == false || s.is_assigned === '0' || s.is_assigned === null);
            if (shouldHide && isUnassigned) return false;

            // Block filter check
            if (blockFilterVal && s.block && s.block.toString() !== blockFilterVal) return false;

            if (isRoomSearch && roomTarget) {
                return s.room_number && s.room_number.toString() === roomTarget;
            }
            if (isPureNumeric) {
                if (len === 1) return s.block && s.block.toString() === query;
                if (len === 3) return s.class_number && s.class_number.toString().startsWith(query);
                if (len === 5) return s.class_number && s.class_number.toString() === query;
                if (len > 5) return s.egn && s.egn.toString().includes(query);
            }
            const combined = [s.first_name, s.middle_name, s.last_name, s.egn, s.class_number, s.room_number].join(' ').toLowerCase();
            return searchTerms.every(term => combined.includes(term));
        });
        filtered.sort(sortByClassNumber);
        renderStudentTable(filtered);
    }

    else if (type === 'status_period') {
        if (!Array.isArray(statusGlobalData)) return;
        const hideUnassignedStatusBtn = document.getElementById('hideUnassignedStatus');
        const shouldHide = hideUnassignedStatusBtn ? hideUnassignedStatusBtn.checked : false;
        const filtered = statusGlobalData.filter(row => {
            const isUnassigned = (row.is_assigned == false || row.is_assigned === '0' || row.is_assigned === null);
            if (shouldHide && isUnassigned) return false;

            // Block filter check
            if (blockFilterVal && row.block && row.block.toString() !== blockFilterVal) return false;

            if (isRoomSearch && roomTarget) {
                return row.room && row.room.toString() === roomTarget;
            }

            if (isPureNumeric) {
                if (len === 1) return row.block && row.block.toString() === query;
                if (len === 3) return row.class_number && row.class_number.toString().startsWith(query);
                if (len === 5) return row.class_number && row.class_number.toString() === query;
                if (len > 5) return row.egn && row.egn.toString().includes(query);
            }

            const combined = [row.name, row.egn, row.class_number, row.room, row.block].join(' ').toLowerCase();
            return searchTerms.every(term => combined.includes(term));
        });
        filtered.sort(sortByClassNumber);
        renderStatusTable(filtered, statusGlobalPeriods, statusGlobalBlock);
    }

    else if (type === 'rooms') {
        if (!Array.isArray(allRoomsData)) return;
        const showFreeOnly = document.getElementById('freeRoomsOnly') && document.getElementById('freeRoomsOnly').checked;
        const filtered = allRoomsData.filter(r => {
            const occupied = parseInt(r.current_occupancy) || 0;
            const capacity = parseInt(r.capacity) || 0;
            const isFull = occupied >= capacity;

            if (blockFilterVal && r.block && r.block.toString() !== blockFilterVal) return false;

            if (showFreeOnly && isFull) return false;
            if (isRoomSearch && roomTarget) {
                return r.room_number && r.room_number.toString() === roomTarget;
            }
            if (isPureNumeric) {
                if (len === 1) return r.block && r.block.toString() === query;
                if (len === 3) return r.class_numbers && r.class_numbers.toString().includes(query);
            }
            if (lowQuery === 'м' || lowQuery === 'm') return r.capacity && r.capacity.toString() === '2';
            if (lowQuery === 'г' || lowQuery === 'g') return r.capacity && r.capacity.toString() === '3';
            const combined = [r.room_number, r.capacity, r.block, r.problem_details || '', r.class_numbers || ''].join(' ').toLowerCase();
            return searchTerms.every(term => combined.includes(term));
        });
        filtered.sort(sortByRoom);
        renderRoomTable(filtered);
    }

    else if (type === 'daily' || type === 'period_payments') {
        const targetData = type === 'daily' ? dailyPaymentsData : periodPaymentsData;
        if (!Array.isArray(targetData)) return;
        const filtered = targetData.filter(p => {
            if (isPureNumeric) {
                if (len === 3) return p.class_number && p.class_number.toString().startsWith(query);
                if (len === 4) return p.egn && p.egn.toString().startsWith(query);
                if (len >= 5) return p.class_number && p.class_number.toString() === query;
            }
            const combined = [p.first_name, p.last_name, p.egn, p.class_number, p.month_name, p.year].join(' ').toLowerCase();
            return searchTerms.every(term => combined.includes(term));
        });
        filtered.sort(sortByClassNumber);
        if (type === 'daily') renderDailyPay(filtered);
        else renderPeriodPayTable(filtered, 'periodPayOutput');
    }
}

async function fetchPeriodPayments() {
    const from = document.getElementById('payStartDate').value;
    const to = document.getElementById('payEndDate').value;
    const outputDiv = document.getElementById('periodPayOutput');

    if (!from || !to) return alert("Моля, изберете начална и крайна дата!");
    outputDiv.innerHTML = '<p>Зареждане на данни...</p>';

    try {
        const resp = await fetch(`/api/reports/period-payments?from=${from}&to=${to}`);
        if (!resp.ok) throw new Error(`Грешка при сървъра: ${resp.status}`);

        const data = await resp.json();

        if (!Array.isArray(data) || data.length === 0) {
            outputDiv.innerHTML = '<p>Няма намерени плащания за този период.</p>';
            return;
        }
        periodPaymentsData = data;
        renderPeriodPayTable(data, 'periodPayOutput');
    } catch (err) {
        outputDiv.innerHTML = `<span class="text-red">Грешка: ${err.message}</span>`;
    }
}

function renderPeriodPayTable(data, targetId) {
    const resultDiv = document.getElementById(targetId);
    const cashPayments = data.filter(p => p.payment_method === 'cash');
    const cardPayments = data.filter(p => p.payment_method === 'card');
    const bankPayments = data.filter(p => p.payment_method === 'bank_transfer');
    const totalCash = cashPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalCard = cardPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBank = bankPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalAll = totalCash + totalCard + totalBank;

    resultDiv.innerHTML = `
        <div style="margin-bottom: 15px;">
            <button class="tab-btn active" onclick="switchReportTab('cash')">В брой</button>
            <button class="tab-btn" onclick="switchReportTab('card')">Карта</button>
            <button class="tab-btn" onclick="switchReportTab('bank')">Банка</button>
            <button class="tab-btn" onclick="switchReportTab('total')">Общо за периода</button>
        </div>
        
        <div id="cashSection" class="report-tab-content">
            ${generateTableHtml(cashPayments, "Общо в брой:", totalCash, false)}
        </div>
        
        <div id="cardSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(cardPayments, "Общо с карта:", totalCard, false)}
        </div>

        <div id="bankSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(bankPayments, "Общо по банка:", totalBank, false)}
        </div>

        <div id="totalSection" class="report-tab-content" style="display:none;">
            ${generateTableHtml(data, "ОБЩО ЗА ПЕРИОДА:", totalAll, true)}
        </div>
    `;
}

async function generateStatusReport() {
    const startStr = document.getElementById('statusStart').value;
    const endStr = document.getElementById('statusEnd').value;
    const block = document.getElementById('statusBlock').value.trim();
    const outputDiv = document.getElementById('statusReportOutput');

    if (!startStr || !endStr) return alert("Моля, изберете начален и краен месец!");
    outputDiv.innerHTML = '<p>Зареждане на данни...</p>';

    try {
        if (!window.allRoomsData || window.allRoomsData.length === 0) {
            try {
                const rResp = await fetch('/api/rooms');
                if (rResp.ok) window.allRoomsData = await rResp.json();
            } catch (e) { }
        }
        const monthsResp = await fetch('/api/months');
        const dbMonths = await monthsResp.json();
        const periods = [];
        let currentDate = new Date(startStr);
        currentDate.setDate(1);
        const endDate = new Date(endStr);

        while (currentDate <= endDate) {
            const year = currentDate.getFullYear();
            const monthNameBg = currentDate.toLocaleString('bg-BG', { month: 'long' });
            const match = dbMonths.find(m => m.month_name.toLowerCase() === monthNameBg.toLowerCase());

            if (match) {
                periods.push({ month_id: match.id, year: year, month_name: match.month_name });
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        if (periods.length === 0) return outputDiv.innerHTML = '<p>Грешка: Неуспешно изчисляване на периодите.</p>';
        const resp = await fetch('/api/reports/status-period', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periods, block })
        });
        if (!resp.ok) throw new Error('Грешка от сървъра');
        const data = await resp.json();
        statusGlobalData = data;
        statusGlobalPeriods = periods;
        statusGlobalBlock = block;
        filterTable();

    } catch (err) {
        outputDiv.innerHTML = `<span class="text-red">Грешка: ${err.message}</span>`;
    }
}

function renderStatusTable(data, periods, block) {
    const outputDiv = document.getElementById('statusReportOutput');
    if (data.length === 0) {
        outputDiv.innerHTML = '<p>Няма намерени данни.</p>';
        return;
    }
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    let html = `
        <table id="statusTable" class="data-table">
            <thead>
            <tr style="display:none;">
                    <th colspan="10">Блок: ${block || 'Всички'} | От: ${firstPeriod.month_name} ${firstPeriod.year} | До: ${lastPeriod.month_name} ${lastPeriod.year}</th>
                </tr>
                <tr>
                    <th>Блок</th>
                    <th>Стая</th>
                    <th>ЕГН</th>
                    <th>Име</th>
                    <th>Курсов №</th> <th>Година</th>
                    <th>Месец</th>
                    <th>Сума</th>
                    <th>Наем</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(row => {
        const rowStyle = row.is_assigned === false ? 'style="opacity: 0.6; background-color: #f8f9fa;"' : '';
        let badge = row.is_assigned === false ? '<span style="color: red; font-size: 0.85em; margin-left:5px;">[Отписан]</span>' : '';
        if (row.family_status && row.family_status !== 'нормален') {
            badge += `<span style="color: #6366f1; font-size: 0.85em; margin-left:5px;"> [${row.family_status}]</span>`;
        }
        const rentColor = row.rent_paid === 'ПЛАТЕНО' ? '#10b981' : '#ef4444';
        const rentStyle = `style="color: ${rentColor}; font-weight: bold;"`;

        let capacity = row.room_capacity;
        if (!capacity && window.allRoomsData && window.allRoomsData.length > 0) {
            const roomMatch = window.allRoomsData.find(r => r.block == row.block && r.room_number == row.room);
            if (roomMatch) capacity = roomMatch.capacity;
        }
        const roomSuffix = capacity ? (capacity === 3 ? 'G' : 'M') : '';

        html += `
            <tr ${rowStyle}>
                <td>${row.block}</td>
                <td>${row.room}${roomSuffix}</td>
                <td>${row.egn}</td>
                <td>${row.name}${badge}</td>
                <td>${row.class_number || '-'}</td> <td>${row.year}</td>
                <td>${row.month}</td>
                <td>${row.suma !== undefined ? row.suma + ' €' : '-'}</td>
                <td ${rentStyle}>${row.rent_paid}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;
    outputDiv.innerHTML = html;
}

async function exportToGoogleDocs() {
    const { rows, reportName, metadata } = getReportDataForExport();
    if (!rows) return;

    const url = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';

    try {
        const btn = document.querySelector('button[onclick="exportToGoogleDocs()"]');
        const originalText = btn ? btn.textContent : 'Експортирай в Google Docs';
        if (btn) {
            btn.textContent = 'Експортиране...';
            btn.disabled = true;
        }

        const docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на справка... Моля изчакайте.</div>");

        let templateId = null;
        let footerTemplateId = null;
        try {
            const [templateResp, footerResp] = await Promise.all([
                fetch('/api/settings/template'),
                fetch('/api/settings/template-footer')
            ]);
            if (templateResp.ok) {
                const templateData = await templateResp.json();
                templateId = templateData.template_id;
            }
            if (footerResp.ok) {
                const footerData = await footerResp.json();
                footerTemplateId = footerData.template_id;
            }
        } catch (e) {
            console.warn('Could not fetch template IDs', e);
        }

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                exportType: 'docs',
                title: reportName,
                rows,
                templateId,
                footerTemplateId,
                reportName: reportName,
                ...metadata
            })
        });

        const result = await resp.json();
        if (result.success) {
            if (docWindow) docWindow.location.href = result.url;
            else window.open(result.url, '_blank');
        } else {
            alert('Грешка при експорт: ' + result.error);
            if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка при създаване: " + result.error + "</span>");
        }

        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Export Error:', err);
        alert('Възникна грешка при експорт.');
    }
}

async function exportToExcel() {
    const { rows, reportName, metadata } = getReportDataForExport();
    if (!rows) return;

    const url = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';

    try {
        const btn = document.getElementById('exportExcelBtn');
        const originalText = btn ? btn.textContent : 'Експортирай в Excel';
        if (btn) {
            btn.textContent = 'Експортиране...';
            btn.disabled = true;
        }

        const docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на Excel справка... Моля изчакайте.</div>");

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                exportType: 'excel',
                title: reportName,
                rows,
                reportName: reportName,
                ...metadata
            })
        });

        const result = await resp.json();
        if (result.success) {
            if (docWindow) docWindow.location.href = result.url;
            else window.open(result.url, '_blank');
        } else {
            alert('Грешка при експорт: ' + result.error);
            if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка при създаване: " + result.error + "</span>");
        }

        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Export Error:', err);
        alert('Възникна грешка при експорт към Excel.');
    }
}

function getReportDataForExport() {
    let table = null;
    let paymentType = '';
    const reportType = document.getElementById('reportType') ? document.getElementById('reportType').value : '';

    if (reportType === 'daily' || reportType === 'period_payments') {
        const sections = document.querySelectorAll('.report-tab-content');
        for (const sec of sections) {
            if (sec.style.display !== 'none') {
                table = sec.querySelector('table');
                if (sec.id === 'cashSection') paymentType = 'В брой';
                else if (sec.id === 'cardSection') paymentType = 'С карта';
                else if (sec.id === 'bankSection') paymentType = 'По банка';
                else if (sec.id === 'totalSection') paymentType = 'Общо';
                break;
            }
        }
    }

    if (!table) table = document.querySelector('#reportResult table, #statusReportOutput table, #periodPayOutput table');

    if (!table) {
        alert('Няма таблица за експортиране!');
        return {};
    }

    const rows = [];
    const headerCells = table.querySelectorAll('thead tr:last-child th');
    const headerData = [];

    headerCells.forEach(cell => {
        const text = cell.textContent.trim();
        if (text !== 'Действие') headerData.push(text);
    });
    rows.push(headerData);

    const bodyRows = table.querySelectorAll('tbody tr, tfoot tr');
    bodyRows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('td');

        // Track virtual column position to handle colspans (common in footer totals)
        let virtualIdx = 0;

        cells.forEach((cell) => {
            const colspan = parseInt(cell.getAttribute('colspan') || 1);
            const headerText = headerCells[virtualIdx] ? headerCells[virtualIdx].textContent.trim() : '';

            if (headerText !== 'Действие') {
                rowData.push(cell.innerText.replace('[Отписан]', '').trim());

                // If this cell spans multiple columns, pad the rowData with empty strings
                // for the other virtual columns it covers (except if they are 'Действие')
                for (let i = 1; i < colspan; i++) {
                    const nextVirtualIdx = virtualIdx + i;
                    const nextHeaderText = headerCells[nextVirtualIdx] ? headerCells[nextVirtualIdx].textContent.trim() : '';
                    if (nextHeaderText !== 'Действие') {
                        rowData.push("");
                    }
                }
            }

            virtualIdx += colspan;
        });

        if (rowData.length > 0) rows.push(rowData);
    });

    const titles = {
        'all': 'Списък на учениците',
        'rooms': 'Справка за стаи',
        'daily': 'Дневен отчет за събрани суми',
        'status_period': 'Справка за блокове',
        'period_payments': 'Плащания за период'
    };
    const reportName = titles[reportType] || 'Експорт';

    const blockInput = document.getElementById('blockSelect') || document.getElementById('blockFilter') || document.getElementById('statusBlock');
    const metadata = {
        block: blockInput ? blockInput.value : 'всички',
        fromMonth: '-',
        fromYear: '-',
        toMonth: '-',
        toYear: '-',
        date: new Date().toLocaleDateString('bg-BG'),
        paymentType: paymentType
    };

    const bgMonths = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];

    const startInput = document.getElementById('payStartDate') || document.getElementById('statusStart');
    const endInput = document.getElementById('payEndDate') || document.getElementById('statusEnd');

    if (startInput && startInput.value) {
        const d = new Date(startInput.value);
        metadata.fromMonth = bgMonths[d.getMonth()];
        metadata.fromYear = d.getFullYear();
    }
    if (endInput && endInput.value) {
        const d = new Date(endInput.value);
        metadata.toMonth = bgMonths[d.getMonth()];
        metadata.toYear = d.getFullYear();
    }

    return { rows, reportName, metadata };
}

async function exportToGoogleDocsShort() {
    let paymentType = 'Общо';
    const sections = document.querySelectorAll('.report-tab-content');
    let activeMethod = null;
    for (const sec of sections) {
        if (sec.style.display !== 'none') {
            if (sec.id === 'cashSection') { paymentType = 'В брой'; activeMethod = 'cash'; }
            else if (sec.id === 'cardSection') { paymentType = 'С карта'; activeMethod = 'card'; }
            else if (sec.id === 'bankSection') { paymentType = 'По банка'; activeMethod = 'bank_transfer'; }
            else if (sec.id === 'totalSection') { paymentType = 'Общо'; activeMethod = null; }
            break;
        }
    }

    if (!window.periodPaymentsData || window.periodPaymentsData.length === 0) {
        alert('Няма данни за плащания!');
        return;
    }

    let items = window.periodPaymentsData;
    if (activeMethod) {
        items = items.filter(p => p.payment_method === activeMethod);
    }

    const blocks = {};
    let totalAll = 0;

    items.forEach(p => {
        const block = p.block || 'Без блок';
        const amount = parseFloat(p.amount) || 0;
        if (!blocks[block]) blocks[block] = 0;
        blocks[block] += amount;
        totalAll += amount;
    });

    const rows = [];
    rows.push(['Блок', 'Сума (€)']);

    // Sort blocks logically (e.g., 1, 2, 'Без блок')
    const blockKeys = Object.keys(blocks).sort();
    for (const b of blockKeys) {
        rows.push([b, blocks[b].toFixed(2)]);
    }

    rows.push(['ОБЩО:', totalAll.toFixed(2)]);

    const metadata = {
        block: 'всички',
        fromMonth: '-',
        fromYear: '-',
        toMonth: '-',
        toYear: '-',
        date: new Date().toLocaleDateString('bg-BG'),
        paymentType: paymentType
    };

    const startInput = document.getElementById('payStartDate');
    const endInput = document.getElementById('payEndDate');

    // Use exact date format: DD.MM.YYYY
    const formatDate = (dateValue) => {
        const d = new Date(dateValue);
        return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    };

    if (startInput && startInput.value) {
        metadata.fromMonth = formatDate(startInput.value);
        metadata.fromYear = ''; // clear year so it doesn't show up after the slash
        metadata.isExactDate = true;
    }
    if (endInput && endInput.value) {
        metadata.toMonth = formatDate(endInput.value);
        metadata.toYear = '';
    }

    const url = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';

    try {
        const btn = document.getElementById('exportDocsShortBtn');
        const originalText = btn ? btn.textContent : 'Експортирай в Docs (Съкратено)';
        if (btn) {
            btn.textContent = 'Експортиране...';
            btn.disabled = true;
        }

        const docWindow = window.open('', '_blank');
        if (docWindow) docWindow.document.write("<div style='font-family:sans-serif; padding:50px; text-align:center;'>Създаване на кратка справка... Моля изчакайте.</div>");

        let templateId = null;
        let footerTemplateId = null;
        try {
            const [templateResp, footerResp] = await Promise.all([
                fetch('/api/settings/template'),
                fetch('/api/settings/template-footer')
            ]);
            if (templateResp.ok) templateId = (await templateResp.json()).template_id;
            if (footerResp.ok) footerTemplateId = (await footerResp.json()).template_id;
        } catch (e) { }

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                exportType: 'docs_short',
                title: 'Плащания по период - Съкратен',
                rows,
                templateId,
                footerTemplateId,
                reportName: 'Плащания по период (Съкратен)',
                ...metadata
            })
        });

        const result = await resp.json();
        if (result.success) {
            if (docWindow) docWindow.location.href = result.url;
            else window.open(result.url, '_blank');
        } else {
            alert('Грешка при експорт: ' + result.error);
            if (docWindow) docWindow.document.write("<br><span style='color:red;'>Грешка при създаване: " + result.error + "</span>");
        }

        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Export Error:', err);
        alert('Възникна грешка при експорт.');
    }
}
