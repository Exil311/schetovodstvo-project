let allStudents = [];
let currentData = null;
let notesShownForStudent = null;
let familyStatusesList = [];
const pageStyles = `
<style>
    .modal-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); /* Тъмен фон */
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(2px); /* Лек блър на фона */
    }
    .modal-box {
        background: white;
        padding: 25px;
        border-radius: 8px;
        width: 400px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        animation: fadeIn 0.2s ease-out;
    }
    .modal-header {
        font-size: 1.2rem; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;
    }
    .modal-list {
        background: #f9f9f9; padding: 10px; border: 1px solid #eee; border-radius: 4px;
        max-height: 150px; overflow-y: auto; margin-bottom: 15px;
    }
    .modal-footer {
        display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;
    }
</style>
`;

async function renderPay(cont) {
    cont.innerHTML = pageStyles + `
        <h3>Плащане на такси</h3>
        <div class="search-container">
            <input type="text" id="studentSearch" placeholder="Търсене по ЕГН или Курсов №..." 
                autocomplete="off" oninput="handleSearch(this.value)">
            <div id="searchResults" style="display: none;"></div>
        </div>
        <div id="paymentDetails" style="margin-top: 20px;"></div>
    `;

    try {
        const [resp, fsResp] = await Promise.all([
            fetch('/api/students'),
            fetch('/api/family-statuses')
        ]);
        allStudents = await resp.json();
        familyStatusesList = await fsResp.json();
    } catch (e) {
        console.error(e);
    }

    // Auto-focus the search box
    setTimeout(() => {
        const searchInput = document.getElementById('studentSearch');
        if (searchInput) searchInput.focus();
    }, 100);
}

document.addEventListener('click', function (e) {
    const cont = document.querySelector('.search-container');
    const res = document.getElementById('searchResults');
    if (cont && !cont.contains(e.target) && res) {
        res.style.display = 'none';
    }
});

function handleSearch(q) {
    const resDiv = document.getElementById('searchResults');
    document.getElementById('paymentDetails').innerHTML = '';

    if (!q || q.trim().length < 2) {
        resDiv.style.display = 'none';
        return;
    }

    const searchTerms = q.toLowerCase().trim().split(/\s+/);

    const res = allStudents.filter(s => {
        const firstName = (s.first_name || '').toLowerCase();
        const middleName = (s.middle_name || '').toLowerCase();
        const lastName = (s.last_name || '').toLowerCase();
        const fullName = `${firstName} ${middleName} ${lastName}`.trim();
        const egn = (s.egn || '').toLowerCase();
        const classNum = String(s.class_number || '').toLowerCase();

        return searchTerms.every(term =>
            fullName.includes(term) ||
            egn.includes(term) ||
            classNum.includes(term)
        );
    }).slice(0, 10);

    if (res.length > 0) {
        resDiv.innerHTML = res.map(s => {
            const badge = s.is_assigned === false ? '<span style="color: red; font-size: 0.85em; margin-left:5px;">[Отписан]</span>' : '';
            const fullName = `${s.first_name} ${s.middle_name ? s.middle_name + ' ' : ''}${s.last_name}`;
            return `
            <div class="search-item" onclick="selStudent(${s.id})">
                <strong>${fullName}${badge}</strong><br>
                <small>ЕГН: ${s.egn} | Клас: ${s.class_number} | Стая: ${s.room_number || '-'}</small>
            </div>
        `}).join('');
        resDiv.style.display = 'block';

        const items = resDiv.getElementsByClassName('search-item');
        for (let i of items) {
            i.style.cursor = 'pointer';
            i.onmouseover = function () { this.style.textDecoration = 'underline'; };
            i.onmouseout = function () { this.style.textDecoration = 'none'; };
        }

    } else {
        resDiv.innerHTML = '<div>Няма намерени резултати</div>';
        resDiv.style.display = 'block';
    }
}

async function selStudent(id) {
    if (notesShownForStudent !== id) {
        notesShownForStudent = null;
    }
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('studentSearch').value = '';
    const detDiv = document.getElementById('paymentDetails');
    detDiv.innerHTML = '<p>Зареждане...</p>';

    try {
        const sResp = await fetch(`/api/students/${id}`);
        const student = await sResp.json();
        if (student.notes && student.notes.trim() !== '' && notesShownForStudent !== id) {
            showNotes(student.id, student.notes, student.notes_updated_at);
            notesShownForStudent = id;
        } else {
            const existingNotes = document.getElementById('draggableNotesBox');
            if (existingNotes) existingNotes.remove();
        }

        const regDate = new Date(student.created_at);
        let startYear = regDate.getFullYear();
        if (regDate.getMonth() < 6) startYear -= 1;

        const now = new Date();
        let currentAcadYear = now.getFullYear();
        if (now.getMonth() < 8) currentAcadYear -= 1;

        let yearsOptions = [];
        for (let y = startYear; y <= currentAcadYear; y++) {
            yearsOptions.push(y);
        }
        if (yearsOptions.length === 0) yearsOptions.push(currentAcadYear);
        const selectedYear = yearsOptions[yearsOptions.length - 1];

        console.log('selStudent - student object:', student);

        let roomNum = student.room_number || student.room || '-';
        if ((!student.room_number && !student.room) && (student.room_id || student.roomId)) {
            const roomId = student.room_id || student.roomId;
            try {
                const rResp = await fetch(`/api/rooms/${roomId}`);
                if (rResp.ok) {
                    const room = await rResp.json();
                    roomNum = room.room_number || room.room_no || room.number || room.name || room.room || room.roomNumber || '-';
                }
            } catch (err) {
                console.warn('Could not fetch room for id', roomId, err);
            }
        }
        student.room_display = roomNum;

        const statusObj = familyStatusesList.find(fs => fs.id == student.family_status_id);
        const statusText = statusObj ? statusObj.status_name : '-';

        let dateText = '';
        if (student.last_status_date) {
            const dateObj = new Date(student.last_status_date);
            const formattedDate = dateObj.toLocaleDateString('bg-BG');
            dateText = student.is_assigned === false
                ? ` (на ${formattedDate})`
                : `<span style="font-size: 0.5em; margin-left: 10px; vertical-align: middle; color: gray; display:inline-block; font-weight: normal; border: 1px solid #ccc; padding: 2px 6px; border-radius: 4px;">Настанен на: ${formattedDate}</span>`;
        }

        const badge = student.is_assigned === false
            ? `<span style="color: red; font-size: 0.5em; margin-left: 10px; vertical-align: middle; border: 1px solid red; padding: 2px 6px; border-radius: 4px; display:inline-block;">Отписан${dateText}</span>`
            : (dateText ? dateText : '');
        const payMethodsBg = {
            'cash': 'В брой',
            'card': 'Карта',
            'bank transfer': 'Банков път'
        };
        const prefPayMethod = payMethodsBg[student.payment_method] || 'В брой';

        detDiv.innerHTML = `
            <div style="background: #f8fafc; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h2 style="margin-top: 0; margin-bottom: 10px; display: flex; align-items: center;">${student.first_name} ${student.middle_name ? student.middle_name + ' ' : ''}${student.last_name} ${badge}</h2>
                    <div style="color: #555;">
                        <span style="margin-right: 15px;">Клас: <b>${student.class_number || '-'}</b></span>
                        <span style="margin-right: 15px;">Стая: <b>${roomNum}</b></span>
                        <span style="margin-right: 15px;">Сем. положение: <b>${statusText || '-'}</b></span>
                        <span style="margin-right: 15px;">Предпочитан метод на плащане: <b>${prefPayMethod}</b></span>
                        <span style="margin-right: 15px;">Дневна такса: <b id="displayDailyFee">Зареждане...</b></span>
                        <button class="btn btn-primary" onclick="renderStudentForm(document.getElementById('content'), 'edit', ${student.id}, 'pay')" style="cursor: pointer;">
                            Редактирай
                        </button>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                <label>Учебна година: </label>
                <select id="yearFilter" onchange="loadTableData(${student.id}, this.value, ${student.family_status_id || 8})">
                    ${yearsOptions.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y} / ${y + 1}</option>`).join('')}
                </select>
                
                <button class="btn btn-primary" onclick="openPayModal()">ПЛАТИ ИЗБРАНИТЕ</button>
                <button class="btn btn-secondary" onclick="openAdditionalPayModal()">ДОПЪЛНИТЕЛНИ ПЛАЩАНИЯ</button>
            </div>

            <div id="termsContainer"></div>
            
            <div style="text-align: right; margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                Общо избрано: <strong style="font-size: 2em;"><span id="selectionTotal">0.00</span> €</strong>
            </div>
        `;

        loadTableData(student.id, selectedYear, student.family_status_id || 8);

    } catch (e) {
        console.error(e);
        detDiv.innerHTML = `<p style="color:red">Грешка при зареждане на данните.</p>`;
    }
}

async function loadTableData(studentId, year, familyStatusId) {
    const container = document.getElementById('termsContainer');
    document.getElementById('selectionTotal').innerText = '0.00';

    try {
        const payResp = await fetch(`/api/students/${studentId}/payment-status?year=${year}`);
        if (!payResp.ok) throw new Error("Грешка при плащанията");
        currentData = await payResp.json();
        const statusObj = familyStatusesList.find(fs => fs.id == familyStatusId);
        const discount = statusObj && statusObj.discount_percentage ? parseFloat(statusObj.discount_percentage) : 0;
        const feeMultiplier = (100 - discount) / 100;
        if (currentData.months && currentData.months.length > 0) {
            const latestBaseFee = parseFloat(currentData.months[currentData.months.length - 1].monthly_base_fee) || 0;
            const currentDailyFee = (latestBaseFee * feeMultiplier).toFixed(5);
            const feeSpan = document.getElementById('displayDailyFee');
            if (feeSpan) feeSpan.innerText = currentDailyFee + ' €';
        }
        const term1Names = ["Септември", "Октомври", "Ноември", "Декември", "Януари"];
        const term2Names = ["Февруари", "Март", "Април", "Май", "Юни"];

        let additionalPaymentsHtml = '';
        if (currentData.additional_payments && currentData.additional_payments.length > 0) {
            additionalPaymentsHtml = `
                <div style="margin-top: 20px; width: 100%;">
                    <h3 style="font-family: sans-serif; margin-bottom: 10px;">Допълнителни плащания</h3>
                    <table class="data-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Период</th>
                                <th>Сума</th>
                                <th>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentData.additional_payments.map(p => {
                const dFrom = new Date(p.date_from).toLocaleDateString('bg-BG');
                const dTo = new Date(p.date_to).toLocaleDateString('bg-BG');
                return `
                                    <tr>
                                        <td>${dFrom} - ${dTo}</td>
                                        <td>${p.amount_paid} €</td>
                                        <td style="color: green; font-weight: bold;">ПЛАТЕНО</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; width: 100%;">
                <div style="width: 100%;">${renderTable("Първи срок", term1Names, currentData.months, feeMultiplier)}</div>
                <div style="width: 100%;">${renderTable("Втори срок", term2Names, currentData.months, feeMultiplier)}</div>
            </div>
            ${additionalPaymentsHtml}
        `;
    } catch (e) {
        container.innerHTML = `<p style="color:red; font-family: sans-serif;">Грешка: ${e.message}</p>`;
    }
}

function renderTable(title, monthNames, monthsData, feeMultiplier) {
    let rows = '';
    monthNames.forEach(name => {
        const m = monthsData.find(d => d.month_name === name);
        if (m) {
            const isPaid = m.is_paid;
            const isBefore = m.is_before_creation;
            const baseFeeForMonth = parseFloat(m.monthly_base_fee) || 0;
            const discountedDailyFee = baseFeeForMonth * feeMultiplier;
            const settingsDays = m.calculated_days !== undefined ? m.calculated_days : parseFloat(m.fee_multiplier || 30);
            const calculatedAmount = isPaid ? parseFloat(m.amount_due).toFixed(2) : (discountedDailyFee * settingsDays).toFixed(2);
            const mIdx = getMonthIndex(name);
            const uniqueOrder = m.year * 100 + (mIdx !== -1 ? mIdx : 0);
            let statusHtml = '', inputHtml = '', daysInputHtml = '';
            const isJan2026 = (name === "Януари" && m.year === 2026);

            if (isPaid) {
                const actualPaidDays = m.total_days_paid || settingsDays;
                const roomInfo = m.historical_room ? `<br><span style="font-size: 1.1em; color: #64748b; font-weight: normal;">(Стая: ${m.historical_room})</span>` : '';

                statusHtml = `<span style="color: #10b981; white-space: nowrap; font-size: 1em;">Платено (${m.total_amount_paid}€)${roomInfo}</span>`;
                inputHtml = `<input type="checkbox" checked disabled style="width:18px; height:18px;">`;
                daysInputHtml = `<span style="color:#10b981; font-size: 0.85em; border: 1px solid #10b981; border-radius: 4px; padding: 2px 6px; display: inline-block; min-width: 42px; text-align: center; background-color: #f0fdf4;">${actualPaidDays} дни</span>`;
            } else if (isBefore) {
                statusHtml = `<span style="color: #BFC4CB; font-style: italic; font-size: 1.1em; white-space: nowrap;">Няма задължение</span>`;
                inputHtml = `<input type="checkbox" disabled style="opacity: 0.3; width:18px; height:18px;">`;
            } else if (!isPaid && settingsDays === 0 && !m.is_partially_paid) {
                statusHtml = `<span style="color: #ef4444; font-weight: bold; font-size: 1.1em; white-space: nowrap;">Отписан</span>`;
                inputHtml = `<input type="checkbox" disabled style="opacity: 0.3; width:18px; height:18px;">`;
                daysInputHtml = `<span style="color:#ef4444; font-size: 0.85em; border: 1px solid #ef4444; border-radius: 4px; padding: 2px 6px; display: inline-block; min-width: 42px; text-align: center; background-color: #fef2f2;">0 дни</span>`;
            } else {
                const daysToPay = m.is_partially_paid ? m.remaining_days : settingsDays;
                const amountToPay = (discountedDailyFee * daysToPay).toFixed(2);

                const displayAmountText = isJan2026 ? "ИНДИВИДУАЛНО" : `${amountToPay} €`;
                statusHtml = `<strong id="price_text_${uniqueOrder}" style="color: #1e293b; white-space: nowrap; font-size: 1.35em;">${displayAmountText}</strong>`;

                if (m.is_partially_paid) {
                    statusHtml += `<br><span style="color: #64748b; font-size: 0.75em;">(Платено: ${m.total_amount_paid}€)</span>`;
                }

                const amountForData = isJan2026 ? 0 : amountToPay;

                inputHtml = `
                    <input type="checkbox" class="month-check" id="cb_${uniqueOrder}"
                        data-daily-fee="${discountedDailyFee}" data-amount="${amountForData}" 
                        data-id="${m.month_id}" data-year="${m.year}" data-name="${m.month_name}"
                        data-order="${uniqueOrder}" data-days="${daysToPay}"
                        onchange="validateSequence(this)" style="width:18px; height:18px; cursor:pointer;">
                `;

                daysInputHtml = `
                    <div style="display:flex; align-items:center; gap:4px; justify-content: flex-end;">
                        <input type="number" id="days_${uniqueOrder}" value="${daysToPay}" min="0" max="31"
                            style="width: 42px; padding: 2px; border: 1px solid #d1d5db; border-radius: 4px; text-align: center; font-size: 0.85em;"
                            oninput="recalcPrice(this, ${uniqueOrder})">
                        <span style="font-size: 0.75em; color: #64748b;">дни</span>
                    </div>
                `;
            }

            rows += `
                <tr style="border-bottom: 1px solid #f1f5f9; font-family: 'Segoe UI', sans-serif;">
                    <td style="padding: 10px 5px; width: 35px; text-align:center;">${inputHtml}</td>
                    <td style="padding: 10px 5px; font-weight: 500; color: #334155; font-size: 0.95em;">${m.month_name}</td>
                    <td style="padding: 10px 5px; text-align: right; width: 85px;">${daysInputHtml}</td>
                    <td style="padding: 10px 5px; text-align: right; width: 130px; font-family: monospace;">${statusHtml}</td>
                </tr>
            `;
        }
    });

    return `
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="background: #f8fafc; padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e293b; font-family: 'Segoe UI', sans-serif;">
                ${title}
            </div>
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function getMonthIndex(name) {
    const months = ["Септември", "Октомври", "Ноември", "Декември", "Януари", "Февруари", "Март", "Април", "Май", "Юни"];
    return months.indexOf(name);
}

function validateSequence(checkbox) {
    const allChecks = Array.from(document.querySelectorAll('.month-check:not([disabled])'));
    const currentIndex = allChecks.indexOf(checkbox);
    if (checkbox.checked) {
        for (let i = 0; i < currentIndex; i++) {
            allChecks[i].checked = true;
            const order = allChecks[i].dataset.order;
            const dayInput = document.getElementById(`days_${order}`);
            if (dayInput) recalcPrice(dayInput, order);
        }
    } else {
        for (let i = currentIndex + 1; i < allChecks.length; i++) {
            allChecks[i].checked = false;
        }
    }
    updateTotal();
}

function recalcPrice(inputElement, uniqueOrder) {
    let days = parseInt(inputElement.value);
    if (isNaN(days) || days < 0) days = 0;
    if (days > 31) days = 31;

    const checkbox = document.getElementById(`cb_${uniqueOrder}`);
    const dailyFee = parseFloat(checkbox.dataset.dailyFee);
    const newPrice = (dailyFee * days).toFixed(2);
    const isJan2026 = checkbox.dataset.name === 'Януари' && checkbox.dataset.year == 2026;

    if (isJan2026) {
        document.getElementById(`price_text_${uniqueOrder}`).innerText = "ИНДИВИДУАЛНО";
        checkbox.dataset.amount = 0;
    } else {
        document.getElementById(`price_text_${uniqueOrder}`).innerText = `${newPrice} €`;
        checkbox.dataset.amount = newPrice;
    }
    checkbox.dataset.days = days;
    if (checkbox.checked) updateTotal();
}

function updateTotal() {
    const checked = document.querySelectorAll('.month-check:checked:not([disabled])');
    let sum = 0;
    let hasIndividual = false;

    checked.forEach(c => {
        if (c.dataset.name === 'Януари' && c.dataset.year == 2026) {
            hasIndividual = true;
        } else {
            sum += parseFloat(c.dataset.amount);
        }
    });

    const totalEl = document.getElementById('selectionTotal');
    if (hasIndividual) {
        totalEl.innerText = sum > 0 ? `${sum.toFixed(2)} + ИНД.` : "ИНДИВИДУАЛНО";
    } else {
        totalEl.innerText = sum.toFixed(2);
    }
}

function openPayModal() {
    const checked = document.querySelectorAll('.month-check:checked:not([disabled])');
    if (checked.length === 0) {
        alert("Моля, изберете поне един месец.");
        return;
    }

    const hasJan2026 = Array.from(checked).some(c =>
        c.dataset.name === 'Януари' && c.dataset.year == 2026
    );

    let baseSum = 0;
    const details = [];
    checked.forEach(c => {
        baseSum += parseFloat(c.dataset.amount);
        let displayAmount = `${c.dataset.amount} €`;
        if (c.dataset.name === 'Януари' && c.dataset.year == 2026) {
            displayAmount = 'ИНДИВИДУАЛНО';
        }
        details.push(`<div style="display:flex; justify-content:space-between;"><span>${c.dataset.name} ${c.dataset.year}</span> <span>${displayAmount}</span></div>`);
    });

    const mdl = document.createElement('div');
    mdl.id = 'payModal';
    mdl.className = 'modal-overlay';

    mdl.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">Потвърждение на плащане</div>
            <div class="modal-list">${details.join('')}</div>

            ${hasJan2026 ? `
            <div style="margin: 15px 0; padding: 15px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px;">
                <label style="font-size: 0.85em; color: #166534; font-weight: bold; display: block; margin-bottom: 5px;">
                    Корекция (Януари 2026) - въведи сума в BGN:
                </label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="hidden" id="baseSumHidden" value="${baseSum.toFixed(2)}">
                    <input type="hidden" id="finalTotal" value="${baseSum.toFixed(2)}">
                    
                    <input type="number" id="bgnInput" placeholder="0.00 BGN" step="0.01" style="width: 100%; padding: 8px;" oninput="convertBgnToEur(this.value)">
                    <span>=</span>
                    <input type="number" id="janEurAmount" value="0.00" readonly style="width: 100%; padding: 8px; background: #e2e8f0; font-weight: bold;">
                    <span>EUR</span>
                </div>
            </div>` : `<input type="hidden" id="finalTotal" value="${baseSum.toFixed(2)}">`}
            
            <div style="text-align: right; margin-bottom: 15px; font-size: 1.1em;">
                Общо за плащане: <strong id="totalSum">${baseSum.toFixed(2)}</strong> €
            </div>

            <div style="margin-bottom: 10px;">
                <label style="display:block; margin-bottom: 5px; font-size: 0.9em; color:#666;">Получена сума:</label>
                <input type="number" id="receivedAmount" placeholder="0.00" step="0.01"
                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
                    oninput="updateChangeLogic()">            </div>
            <div style="margin-bottom: 15px; font-size: 1.1em;">
                Ресто: <strong id="changeAmount">0.00</strong> €
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display:block; margin-bottom: 5px; font-size: 0.9em; color:#666;">Метод на плащане:</label>
                <select id="payMethod" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    <option value="cash">В брой</option>
                    <option value="card">С Карта</option>
                    <option value="bank_transfer">Банков път</option>
                </select>
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closePayModal()">Отказ</button>
                <button id="btnConf" class="btn btn-primary">ЗАПИШИ ПЛАЩАНЕТО</button>
            </div>
        </div>
    `;
    document.body.appendChild(mdl);

    document.getElementById('btnConf').onclick = () => {
        const finalTotalField = document.getElementById('finalTotal');
        const finalTotalValue = parseFloat(finalTotalField.value);
        const receivedAmount = parseFloat(document.getElementById('receivedAmount').value);

        if (isNaN(receivedAmount) || receivedAmount < finalTotalValue) {
            alert("Грешка: Въведете валидна сума, която е равна или по-голяма от общата дължима сума!");
            return;
        }

        const pd = [];
        let extraForJan2026 = 0;
        if (hasJan2026) {
            extraForJan2026 = finalTotalValue - baseSum;
            if (extraForJan2026 < 0) extraForJan2026 = 0;
        }

        checked.forEach(c => {
            const order = c.dataset.order;
            const daysInput = document.getElementById(`days_${order}`);
            const actualDays = daysInput ? parseInt(daysInput.value) : (parseInt(c.dataset.days) || 0);

            let amt = 0;
            if (c.dataset.name === 'Януари' && c.dataset.year == 2026) {
                amt = extraForJan2026.toFixed(2);
            } else {
                amt = parseFloat(c.dataset.amount).toFixed(2);
            }

            pd.push({
                month_id: parseInt(c.dataset.id),
                year: parseInt(c.dataset.year),
                month_name: c.dataset.name,
                amount_paid: amt,
                days: actualDays
            });
        });
        confirmPay(pd);
    };
}

function closePayModal() {
    const mdl = document.getElementById('payModal');
    if (mdl) mdl.remove();
}

function confirmPay(paidMnths) {
    if (!paidMnths || paidMnths.length === 0) return;

    const student = currentData.student;
    const totalEuro = parseFloat(paidMnths.reduce((sum, m) => sum + (parseFloat(m.amount_paid) || 0), 0).toFixed(2));
    const payMethSelect = document.getElementById('payMethod');
    const payMeth = payMethSelect ? payMethSelect.value : 'cash';
    const btn = document.getElementById('btnConf');
    if (btn) { btn.innerText = "Записване..."; btn.disabled = true; }

    fetch(`/api/students/${student.id}/process-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: paidMnths, payment_method: payMeth })
    })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                // Принт логика (само за плащане в брой)
                if (payMeth === 'cash') {
                    fetch('http://127.0.0.1:5001/print-receipt', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            student_name: `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.replace(/\s+/g, ' ').trim(),
                            egn: student.egn,
                            class_num: student.class_number,
                            block: student.block || '-',
                            room: student.room_number || '-',
                            payments_list: paidMnths,
                            amount_euro: totalEuro,
                            method: payMeth,
                            received_amount: parseFloat(document.getElementById('receivedAmount').value) || 0,
                            invoice_num: String(d.payment_id || ''),
                            cashier: "ADMIN"
                        })
                    }).catch(e => console.log('Print error ignored:', e));
                }

                alert('Плащането е записано успешно!');
                closePayModal();
                selStudent(student.id);
            } else {
                alert('Грешка: ' + (d.error || 'Неизвестна'));
                if (btn) { btn.innerText = "ЗАПИШИ ПЛАЩАНЕТО"; btn.disabled = false; }
            }
        })
        .catch(err => {
            console.error(err);
            alert('Сървърна грешка.');
            if (btn) { btn.innerText = "ЗАПИШИ ПЛАЩАНЕТО"; btn.disabled = false; }
        });
}

function showNotes(studentId, notes, updatedAt) {
    const existing = document.getElementById('notesModalOverlay');
    if (existing) existing.remove();

    const currentNotes = notes || '';
    const lastUpdateHtml = updatedAt
        ? `<span style="font-size: 0.7em; color: #888; font-weight: normal; margin-left: 15px;"> (Последна промяна: ${new Date(updatedAt).toLocaleDateString('bg-BG')})</span>`
        : '';

    const overlay = document.createElement('div');
    overlay.id = 'notesModalOverlay';
    overlay.className = 'modal-overlay';
    overlay.dataset.originalNotes = currentNotes;
    overlay.innerHTML = `
        <div class="modal-box" style="width: 450px; max-width: 90vw;">
            <div class="modal-header" style="display: flex; align-items: baseline; margin-bottom: 15px;">
                <span>Бележки за ученика</span>
                ${lastUpdateHtml}
            </div>
            
            <div id="editableNotesBox" contenteditable="true" style="border: 1px solid #ccc; padding: 15px; font-size: 0.95em; color: black; line-height: 1.5; white-space: pre-wrap; max-height: 300px; overflow-y: auto; outline: none;">${currentNotes}</div>
            
            <div class="modal-footer" style="margin-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
                <button id="saveNotesBtn" class="btn btn-success" style="display: none;" onclick="saveNotesOnly(${studentId})">Запиши</button>
                <button class="btn btn-primary" onclick="document.getElementById('notesModalOverlay').remove()">Затвори</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const notesBox = document.getElementById('editableNotesBox');
    const saveBtn = document.getElementById('saveNotesBtn');

    notesBox.addEventListener('input', () => {
        const newText = notesBox.innerText.trim();
        const oldText = overlay.dataset.originalNotes.trim();
        if (newText !== oldText) {
            saveBtn.style.display = 'inline-block';
        } else {
            saveBtn.style.display = 'none';
        }
    });
}

async function saveNotesOnly(studentId) {
    const overlay = document.getElementById('notesModalOverlay');
    const notesBox = document.getElementById('editableNotesBox');
    const saveBtn = document.getElementById('saveNotesBtn');
    const newNotes = notesBox.innerText.trim();
    saveBtn.innerText = "Записване...";
    saveBtn.disabled = true;

    try {
        const response = await fetch(`/api/students/${studentId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: newNotes })
        });
        if (!response.ok) throw new Error('Грешка от сървъра');
        overlay.remove();

    } catch (e) {
        console.error(e);
        alert("Грешка при записване!");
        saveBtn.innerText = "Запиши";
        saveBtn.disabled = false;
    }
}

window.convertBgnToEur = function (bgnValue) {
    const rate = 1.95583;
    const janEurField = document.getElementById('janEurAmount');
    const grandTotalHidden = document.getElementById('finalTotal');
    const totalSumLabel = document.getElementById('totalSum');
    const baseSum = parseFloat(document.getElementById('baseSumHidden') ? document.getElementById('baseSumHidden').value : 0);

    if (bgnValue && parseFloat(bgnValue) > 0) {
        const janEur = parseFloat(bgnValue) / rate;
        if (janEurField) janEurField.value = janEur.toFixed(2);
        const newTotal = baseSum + janEur;
        if (grandTotalHidden) grandTotalHidden.value = newTotal.toFixed(2);
        if (totalSumLabel) totalSumLabel.innerText = newTotal.toFixed(2);
    } else {
        if (janEurField) janEurField.value = "0.00";
        if (grandTotalHidden) grandTotalHidden.value = baseSum.toFixed(2);
        if (totalSumLabel) totalSumLabel.innerText = baseSum.toFixed(2);
    }
    updateChangeLogic();
};

window.updateChangeLogic = function () {
    const total = parseFloat(document.getElementById('finalTotal').value) || 0;
    const received = parseFloat(document.getElementById('receivedAmount').value) || 0;
    const change = received - total;
    document.getElementById('changeAmount').innerText = change > 0 ? change.toFixed(2) : "0.00";
};
window.openAdditionalPayModal = async function () {
    let modal = document.getElementById('additionalPayModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'additionalPayModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width: 600px; width: 90%;">
                <div class="modal-header">Допълнителни плащания</div>
                <div id="additionalMonthsContainer" style="margin: 15px 0;">Зареждане...</div>
                
                <div style="margin-top: 20px;">
                    <div style="text-align: right; margin-bottom: 15px; font-size: 1.1em;">
                        Общо за плащане: <strong id="addTotalAmount">0.00</strong> €
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display:block; margin-bottom: 5px; font-size: 0.9em; color:#666;">Получена сума:</label>
                        <input type="number" step="0.01" id="addReceivedAmount" oninput="updateAddChange()" placeholder="0.00" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 15px; font-size: 1.1em;">
                        Ресто: <strong id="addChangeAmount">0.00</strong> €
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display:block; margin-bottom: 5px; font-size: 0.9em; color:#666;">Метод на плащане:</label>
                        <select id="addPayMethod" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            <option value="cash">В брой</option>
                            <option value="card">С Карта</option>
                            <option value="bank_transfer">Банков път</option>
                        </select>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeAdditionalPayModal()">Отказ</button>
                    <button class="btn btn-primary" onclick="submitAdditionalPayments()" id="addSubmitBtn">ЗАПИШИ ПЛАЩАНЕТО</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    const container = document.getElementById('additionalMonthsContainer');
    container.innerHTML = 'Зареждане на месеци...';

    try {
        const mResp = await fetch('/api/months');
        const months = await mResp.json();
        const disabledMonths = months.filter(m => parseFloat(m.fee_multiplier || 0) === 0);

        if (disabledMonths.length === 0) {
            container.innerHTML = '<p>Няма изключени месеци в настройките.</p>';
            return;
        }

        let html = '<p style="margin-bottom: 15px; color: #555;">Изберете период за съответния месец:</p>';

        const yearSelect = document.getElementById('yearFilter');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();

        disabledMonths.forEach(m => {
            const mId = parseInt(m.id);
            const actualYear = (mId >= 9 && mId <= 12) ? selectedYear : selectedYear + 1;

            const firstDay = new Date(actualYear, mId - 1, 1);
            const lastDay = new Date(actualYear, mId, 0); // 0 gets the last day of the previous month (which is mId)

            const minDateStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
            const maxDateStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

            html += `
                <div style="border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc;">
                    <label style="font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" class="add-month-check" value="${m.id}" onchange="toggleAddMonth(${m.id})" style="width: 18px; height: 18px;"> 
                        ${m.month_name} (${actualYear})
                    </label>
                    <div style="display:none; align-items: center; gap: 10px; flex-wrap: wrap; margin-left: 26px;" id="add-inputs-${m.id}">
                        <div>От: <input type="date" id="add-from-${m.id}" class="add-input" min="${minDateStr}" max="${maxDateStr}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;" onkeydown="return false;"></div>
                        <div>До: <input type="date" id="add-to-${m.id}" class="add-input" min="${minDateStr}" max="${maxDateStr}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;" onkeydown="return false;"></div>
                        <div>Сума: <input type="number" step="0.01" id="add-amount-${m.id}" class="add-input add-amount-val" style="width: 80px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;" placeholder="€" oninput="updateAddTotal()"></div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        document.getElementById('addTotalAmount').innerText = '0.00';
        document.getElementById('addReceivedAmount').value = '';
        document.getElementById('addChangeAmount').innerText = '0.00';

    } catch (e) {
        container.innerHTML = '<p style="color:red;">Грешка при зареждане на месеците.</p>';
    }
};

window.closeAdditionalPayModal = function () {
    const mdl = document.getElementById('additionalPayModal');
    if (mdl) mdl.remove();
};

window.toggleAddMonth = function (id) {
    const isChecked = document.querySelector(`.add-month-check[value="${id}"]`).checked;
    const inputs = document.getElementById(`add-inputs-${id}`);
    if (isChecked) {
        inputs.style.display = 'inline-flex';
        inputs.style.alignItems = 'center';
        inputs.style.gap = '10px';
    } else {
        inputs.style.display = 'none';
        document.getElementById(`add-from-${id}`).value = '';
        document.getElementById(`add-to-${id}`).value = '';
        document.getElementById(`add-amount-${id}`).value = '';
    }
    updateAddTotal();
};

window.updateAddTotal = function () {
    let total = 0;
    document.querySelectorAll('.add-amount-val').forEach(inp => {
        if (inp.closest('div[id^="add-inputs-"]').style.display !== 'none' && inp.value) {
            total += parseFloat(inp.value);
        }
    });
    document.getElementById('addTotalAmount').innerText = total.toFixed(2);
    updateAddChange();
};

window.updateAddChange = function () {
    const total = parseFloat(document.getElementById('addTotalAmount').innerText) || 0;
    const received = parseFloat(document.getElementById('addReceivedAmount').value) || 0;
    const change = received - total;
    document.getElementById('addChangeAmount').innerText = change > 0 ? change.toFixed(2) : "0.00";
};

window.submitAdditionalPayments = async function () {
    const checks = document.querySelectorAll('.add-month-check:checked');
    if (checks.length === 0) return alert("Моля, изберете поне един месец.");

    const yearSelect = document.getElementById('yearFilter');
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();

    const payments = [];
    for (const chk of checks) {
        const mid = chk.value;
        const fromDate = document.getElementById(`add-from-${mid}`).value;
        const toDate = document.getElementById(`add-to-${mid}`).value;
        const amount = document.getElementById(`add-amount-${mid}`).value;

        if (!fromDate || !toDate || !amount) {
            return alert("Моля, попълнете всички полета за избраните месеци (От дата, До дата, Сума).");
        }

        if (new Date(fromDate) > new Date(toDate)) {
            return alert("Началната дата не може да бъде след крайната дата.");
        }

        payments.push({
            month_id: mid,
            year: selectedYear,
            date_from: fromDate,
            date_to: toDate,
            amount_paid: amount
        });
    }

    const totalAmount = parseFloat(document.getElementById('addTotalAmount').innerText);
    const received = parseFloat(document.getElementById('addReceivedAmount').value) || 0;

    if (received > 0 && received < totalAmount) {
        if (!confirm("Въведената получена сума е по-малка от общата. Сигурни ли сте, че искате да продължите?")) {
            return;
        }
    }

    const method = document.getElementById('addPayMethod').value;
    const btn = document.getElementById('addSubmitBtn');
    btn.disabled = true;
    btn.innerText = "Записване...";

    try {
        const studentId = currentData.student.id;
        const resp = await fetch(`/api/students/${studentId}/process-additional-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payments,
                payment_method: method
            })
        });
        const data = await resp.json();
        if (data.success) {
            // Принт логика за допълнителни плащания (само за плащане в брой)
            if (method === 'cash') {
                const student = currentData.student;
                fetch('http://127.0.0.1:5001/print-receipt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        student_name: `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.replace(/\s+/g, ' ').trim(),
                        egn: student.egn,
                        class_num: student.class_number,
                        block: student.block || '-',
                        room: student.room_number || '-',
                        payments_list: payments.map(p => ({
                            month_name: `Доп. (${new Date(p.date_from).toLocaleDateString('bg-BG')} - ${new Date(p.date_to).toLocaleDateString('bg-BG')})`,
                            year: p.year,
                            amount_paid: p.amount_paid
                        })),
                        amount_euro: totalAmount,
                        method: method,
                        received_amount: parseFloat(document.getElementById('addReceivedAmount').value) || 0,
                        invoice_num: String(data.payment_id || ''),
                        cashier: "ADMIN"
                    })
                }).catch(e => console.log('Print error ignored:', e));
            }

            alert('Допълнителното плащане е записано успешно!');
            document.getElementById('additionalPayModal').style.display = 'none';
            loadTableData(studentId, selectedYear, currentData.student.family_status_id || 8);
        } else {
            alert('Грешка: ' + (data.error || 'Неизвестна'));
        }
    } catch (e) {
        alert('Сървърна грешка.');
    } finally {
        btn.disabled = false;
        btn.innerText = "ЗАПИШИ ПЛАЩАНЕТО";
    }
};
