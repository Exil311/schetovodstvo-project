async function renderSettings(cont) {
    cont.innerHTML = `
        <h3>Настройки на системата</h3>
        <div style="margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; display: flex; gap: 10px;">
            <button id="btnTabSystem" onclick="switchSettingsTab('system')" style="font-weight: bold;">Системни настройки</button>
            <button id="btnTabFamily" onclick="switchSettingsTab('family')">Семейни положения</button>
            <button id="btnTabGoogleDocs" onclick="switchSettingsTab('googleDocs')">Текст за справки</button>
        </div>
        <div id="settingsContent">
            <p>Зареждане на данни...</p>
        </div>
    `;
    await renderUnifiedSettings();
}

async function switchSettingsTab(tab) {
    const btnSystem = document.getElementById('btnTabSystem');
    const btnFamily = document.getElementById('btnTabFamily');
    const btnGoogleDocs = document.getElementById('btnTabGoogleDocs');
    const content = document.getElementById('settingsContent');
    content.innerHTML = '<p>Зареждане на данни...</p>';

    btnSystem.style.fontWeight = 'normal';
    btnFamily.style.fontWeight = 'normal';
    btnGoogleDocs.style.fontWeight = 'normal';

    if (tab === 'system') {
        btnSystem.style.fontWeight = 'bold';
        await renderUnifiedSettings();
    } else if (tab === 'family') {
        btnFamily.style.fontWeight = 'bold';
        await renderFamilyStatusesSettings();
    } else if (tab === 'googleDocs') {
        btnGoogleDocs.style.fontWeight = 'bold';
        await renderGoogleDocsSettings();
    }
}

async function renderFamilyStatusesSettings() {
    const container = document.getElementById('settingsContent');
    try {
        const resp = await fetch('/api/family-statuses');
        const statuses = await resp.json();
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Семейно положение</th>
                        <th width="150">Отстъпка (%)</th>
                        <th width="100">Действие</th>
                    </tr>
                </thead>
                <tbody>
                    ${statuses.map(fs => `
                        <tr>
                            <td>${fs.status_name}</td>
                            <td align="center">
                                <input type="number" id="fs-discount-${fs.id}" value="${fs.discount_percentage}" min="0" max="100" step="1" style="width: 80px; text-align: center;" oninput="if(this.value !== '' && this.value < 0) this.value = 0; if(this.value > 100) this.value = 100;">
                            </td>
                            <td align="center">
                                <button onclick="saveFamilyStatus(${fs.id})">Запази</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        container.innerHTML = "Грешка при зареждане на семейните положения.";
    }
}

async function saveFamilyStatus(id) {
    const inputField = document.getElementById(`fs-discount-${id}`);
    let discount = parseInt(inputField.value);

    if (isNaN(discount) || discount < 0) discount = 0;
    if (discount > 100) discount = 100;
    inputField.value = discount;

    try {
        const resp = await fetch(`/api/family-statuses/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discount_percentage: discount })
        });
        if (resp.ok) {
            alert('Процентът е запазен успешно!');
        } else {
            alert('Грешка при запис!');
        }
    } catch (err) {
        alert('Сървърна грешка');
    }
}

async function renderGoogleDocsSettings() {
    const container = document.getElementById('settingsContent');
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr><th>Текст за справки</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageReportTemplate()">
                            📄 Промени заглавие на справка
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Това ще отвори Google Doc шаблон, където можете да промените логото и заглавния текст.<br>
                            Можете да ползвате променливи: <b>$справка_име</b>, <b>$тип_плащане</b>, <b>$блок</b>, <b>$учащи</b>, <b>$от_месец</b>, <b>$от_година</b>, <b>$до_месец</b>, <b>$до_година</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageFooterTemplate()">
                            📄 Промени долен текст на справка
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Това ще отвори Google Doc шаблон, където можете да промените долния колонтитул на справката.<br>
                            Можете да ползвате променливи: <b>$справка_име</b>, <b>$тип_плащане</b>, <b>$блок</b>, <b>$учащи</b>, <b>$от_месец</b>, <b>$от_година</b>, <b>$до_месец</b>, <b>$до_година</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageAssignmentTemplate()">
                            📄 Промени шаблон за Настанителна Заповед
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Това ще отвори Google Doc шаблон за заповед при настаняване.<br>
                            Можете да ползвате променливи на ученика: <b>$име</b>, <b>$егн</b>, <b>$стая</b>, <b>$блок</b>, <b>$курс</b>, <b>$адрес</b>, <b>$пол</b>, <b>$телефон</b>, <b>$телефон_родител</b>, <b>$имейл</b>, <b>$метод_плащане</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageClearanceTemplate()">
                            📄 Промени шаблон за Обходен лист
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Това ще отвори Google Doc шаблон за обходен лист.<br>
                            Можете да ползвате променливи: <b>$име</b>, <b>$егн</b>, <b>$стая</b>, <b>$блок</b>, <b>$курс</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
            </tbody>
        </table>
        <div id="gdStatus" style="margin-top: 15px; font-weight: bold;"></div>
    `;
}

window.manageReportTemplate = function () {
    const statusDiv = document.getElementById('gdStatus');
    statusDiv.innerHTML = '<span style="color: blue;">Зареждане на шаблона... моля, изчакайте (може да изисква ауторизация).</span>';

    // Otworq direktno Google Script web app, koito she suzdade ili pregleda dokumenata
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';

    window.open(SCRIPT_URL, '_blank');
    statusDiv.innerHTML = '';
};

window.manageFooterTemplate = function () {
    const statusDiv = document.getElementById('gdStatus');
    statusDiv.innerHTML = '<span style="color: blue;">Зареждане на шаблона... моля, изчакайте.</span>';

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=footer';

    window.open(SCRIPT_URL, '_blank');
    statusDiv.innerHTML = '';
};

window.manageAssignmentTemplate = function () {
    const statusDiv = document.getElementById('gdStatus');
    statusDiv.innerHTML = '<span style="color: blue;">Зареждане на шаблона за заповед... моля, изчакайте.</span>';

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=assignment';

    window.open(SCRIPT_URL, '_blank');
    statusDiv.innerHTML = '';
};

window.manageClearanceTemplate = function () {
    const statusDiv = document.getElementById('gdStatus');
    statusDiv.innerHTML = '<span style="color: blue;">Зареждане на шаблона за обходен лист... моля, изчакайте.</span>';
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=clearance';
    window.open(SCRIPT_URL, '_blank');
    statusDiv.innerHTML = '';
};

async function renderUnifiedSettings() {
    const container = document.getElementById('settingsContent');
    try {
        const [feeResp, monthsResp] = await Promise.all([
            fetch('/api/settings/fees'),
            fetch('/api/months')
        ]);
        const feeData = await feeResp.json();
        const months = await monthsResp.json();

        months.sort((a, b) => a.id - b.id);

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th colspan="4">Глобални такси според стаята</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td><b>Малка стая - Дневна такса (€):</b></td>
                        <td><input type="number" step="0.000001" id="smallFeeInput" value="${feeData.small_room_fee || '11.00'}" style="width: 100px;"></td>
                        <td rowspan="2" align="center" style="vertical-align: middle;">
                            <input type="checkbox" id="updateAllStudents" checked> Обнови цената и за отминали неплатени месеци
                        </td>
                        <td rowspan="2" align="right" style="vertical-align: middle;">
                            <button onclick="saveDailyFees()">Запази таксите</button>
                        </td>
                    </tr>
                    <tr>
                        <td><b>Голяма стая - Дневна такса (€):</b></td>
                        <td><input type="number" step="0.000001" id="largeFeeInput" value="${feeData.large_room_fee || '10.00'}" style="width: 100px;"></td>
                    </tr>
                </tbody>
            </table>
            </table>
            <br>
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="50">Статус</th>
                        <th>Месец</th>
                        <th width="100">Работни дни</th>
                        <th width="80">Действие</th>
                    </tr>
                </thead>
                <tbody>
                    ${months.map(m => {
            const days = Math.round(m.fee_multiplier || 0);
            const isActive = days > 0;
            const displayValue = isActive ? days : 30;
            return `
                            <tr>
                                <td align="center">
                                    <input type="checkbox" id="check-${m.id}" ${isActive ? 'checked' : ''} onchange="toggleMonthRow(${m.id})">
                                </td>
                                <td>${m.month_name}</td>
                                <td>
                                <input type="number" id="days-${m.id}" value="${displayValue}" min="1" max="30" step="1"
                                    oninput="validateDays(this)" onblur="enforceLimits(this)" ${!isActive ? 'disabled' : ''} 
                                    style="width: 50px;">
                                </td>
                                <td align="center">
                                    <button onclick="saveSingleMonth(${m.id})">Запази</button>
                                </td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
                <tfoot class="table-footer-actions">
                    <tr>
                        <td colspan="4" class="footer-right">
                            <div class="footer-flex-container">
                                <span id="saveStatus"></span>
                                <button onclick="saveMonthDays()">
                                    Запази всички месеци
                                </button>
                            </div>
                        </td>
                    </tr>
                </tfoot>
            </table>
        `;
    } catch (err) {
        container.innerHTML = "Грешка при зареждане.";
    }
}

async function saveSingleMonth(id) {
    const isChecked = document.getElementById(`check-${id}`).checked;
    const inputField = document.getElementById(`days-${id}`);
    let days = isChecked ? parseInt(inputField.value) : 0;
    if (isChecked) {
        if (isNaN(days) || days < 1) days = 1;
        if (days > 30) days = 30;
        inputField.value = days;
    }

    try {
        const resp = await fetch(`/api/months/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fee_multiplier: days })
        });
        if (resp.ok) alert('Запазено');
    } catch (err) { alert('Грешка'); }
}

function toggleMonthRow(id) {
    const chk = document.getElementById(`check-${id}`);
    const inp = document.getElementById(`days-${id}`);
    inp.disabled = !chk.checked;
    if (chk.checked && (inp.value < 1 || inp.value > 30 || isNaN(inp.value))) {
        inp.value = 30;
    }
}

function validateDays(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
}

function enforceLimits(input) {
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) input.value = 1;
    if (val > 30) input.value = 30;
}

async function saveDailyFees() {
    const smallFee = document.getElementById('smallFeeInput').value;
    const largeFee = document.getElementById('largeFeeInput').value;
    const updateAll = document.getElementById('updateAllStudents').checked;
    if (!smallFee || !largeFee) return alert('Въведете и двете суми!');

    try {
        const r = await fetch('/api/settings/fees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                small_room_fee: smallFee,
                large_room_fee: largeFee,
                update_all: updateAll
            })
        });
        if (r.ok) alert('Дневните такси са запазени!');
        else alert('Грешка при запис на такси');
    } catch (err) {
        alert('Сървърна грешка');
    }
}

async function saveMonthDays() {
    const statusDiv = document.getElementById('saveStatus');
    statusDiv.innerHTML = "Записване на месеците...";

    try {
        const monthInputs = document.querySelectorAll('input[id^="days-"]');
        const promises = Array.from(monthInputs).map(input => {
            const id = input.id.split('-')[1];
            const isChecked = document.getElementById(`check-${id}`).checked;
            let days = isChecked ? parseInt(input.value) : 0;

            if (isChecked) {
                if (isNaN(days) || days < 1) days = 1;
                if (days > 30) days = 30;
                input.value = days;
            }

            return fetch(`/api/months/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fee_multiplier: days })
            });
        });

        await Promise.all(promises);
        statusDiv.innerHTML = "Дните са обновени успешно!";
        alert('Дните по месеци са запазени!');
    } catch (err) {
        statusDiv.innerHTML = "Грешка!";
        alert('Неуспешно обновяване на месеците');
    }
}

async function manageReportTemplate() {
    const GOOGLE_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec';
    window.open(GOOGLE_SCRIPT_WEB_APP_URL, '_blank');
}

async function manageFooterTemplate() {
    const GOOGLE_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=footer';
    window.open(GOOGLE_SCRIPT_WEB_APP_URL, '_blank');
}

async function manageAssignmentTemplate() {
    const GOOGLE_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=assignment';
    window.open(GOOGLE_SCRIPT_WEB_APP_URL, '_blank');
}

async function manageClearanceTemplate() {
    const GOOGLE_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxBgFuipuCatEXmRvRCK_Q4KMGecrXN4wXfhiBf5l_POmG7-kX6O9k2qWSjN57DGnPgYA/exec?template=clearance';
    window.open(GOOGLE_SCRIPT_WEB_APP_URL, '_blank');
}