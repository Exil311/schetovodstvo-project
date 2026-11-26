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
                            Промени заглавие на справка
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
                            Промени долен текст на справка
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Това ще отвори Google Doc шаблон, където можете да промените долния колонтитул на справката.<br>
                            Можете да ползвате променливи: <b>$справка_име</b>, <b>$тип_плащане</b>, <b>$блок</b>, <b>$учащи</b>, <b>$от_месец</b>, <b>$от_година</b>, <b>$до_месец</b>, <b>$до_година</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageAssignmentTemplate()" style="font-weight: 600;">
                            Редактирай шаблон за Настанителна Заповед (Локален)
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Отваря вградения локален редактор за настанителна заповед с директен А4 печат.<br>
                            Можете да ползвате променливи на ученика: <b>$номер_заповед</b>, <b>$име</b>, <b>$егн</b>, <b>$стая</b>, <b>$блок</b>, <b>$курс</b>, <b>$адрес</b>, <b>$пол</b>, <b>$телефон</b>, <b>$телефон_родител</b>, <b>$имейл</b>, <b>$метод_плащане</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px;">
                        <button onclick="manageClearanceTemplate()" style="font-weight: 600;">
                            Редактирай шаблон за Обходен лист (Локален)
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Отваря вградения локален редактор за обходен лист с директен А4 печат.<br>
                            Можете да ползвате променливи: <b>$име</b>, <b>$егн</b>, <b>$стая</b>, <b>$блок</b>, <b>$курс</b>, <b>$дата</b>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 20px; background: #fff5f5; border-top: 1px solid #ffdcdc;">
                        <button onclick="resetOrderNumberCount()" style="background-color: #dc3545; color: white;">
                            Нулирай номерацията на заповедите (връща на № 1)
                        </button>
                        <p style="font-size: 0.85em; color: #666; margin-top: 10px;">
                            Изчиства текущите поредни номера на заповедите за настаняване за тази учебна година.<br>
                            Следващата издадена заповед ще започне отново от <b>1</b>.
                        </p>
                    </td>
                </tr>
            </tbody>
        </table>
        <div id="gdStatus" style="margin-top: 15px; font-weight: bold;"></div>
    `;
}

window.resetOrderNumberCount = async function () {
    if (!confirm('Сигурни ли сте, че искате да нулирате номерацията на заповедите за текущата учебна година? Следващата издадена заповед ще започне отново от № 1.')) return;
    try {
        const resp = await fetch('/api/settings/reset-assignment-orders', { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            alert('Номерацията на заповедите беше нулирана успешно! Следващата заповед ще бъде с № 1.');
        } else {
            alert('Грешка: ' + (data.error || 'Неуспешно нулиране'));
        }
    } catch (e) {
        alert('Грешка при връзка със сървъра.');
    }
};

async function openGoogleTemplate(type) {
    const statusDiv = document.getElementById('gdStatus');
    if (statusDiv) statusDiv.innerHTML = '<span style="color: blue;">Зареждане на шаблона... моля, изчакайте.</span>';
    const docWindow = window.open('', '_blank');
    try {
        const resp = await fetch(`/api/google/template-url/${encodeURIComponent(type)}`);
        const data = await resp.json();
        if (data.success && data.url) {
            if (docWindow) docWindow.location.href = data.url;
            else window.open(data.url, '_blank');
            if (statusDiv) statusDiv.innerHTML = '';
        } else {
            if (docWindow) docWindow.close();
            if (statusDiv) statusDiv.textContent = 'Грешка: ' + (data.error || 'Неуспешно зареждане.');
        }
    } catch (err) {
        if (docWindow) docWindow.close();
        if (statusDiv) statusDiv.textContent = 'Грешка при връзка със сървъра.';
    }
}

window.manageReportTemplate = function () {
    openGoogleTemplate('header');
};

window.manageFooterTemplate = function () {
    openGoogleTemplate('footer');
};

const DEFAULT_ASSIGNMENT_SECTIONS = {
    showHeader: true,
    logoUrl: '/img/logo.png',
    headerText: 'НАЦИОНАЛНА ПРОФЕСИОНАЛНА ГИМНАЗИЯ ПО КОМПЮТЪРНИ ТЕХНОЛОГИИ И СИСТЕМИ – ГР. ПРАВЕЦ при ТУ – СОФИЯ',
    orderPrefix: '№: $номер_заповед',
    title: 'ЗАПОВЕД',
    subtitle: 'за настаняване в общежитие',
    internalDocNum: '№: Д-551/14.09.2026г.',
    legalBasis: 'На основание чл. 258, ал. 1 от Закона за предучилищното и училищното образование, Правилника за устройството и дейността на ученическите общежития, Правилника за вътрешния ред.',
    studentLabel: 'Настанява се ученикът/чката:',
    showName: true,
    showEgn: true,
    showClass: true,
    showAddress: true,
    showSex: true,
    showPhone: true,
    showParentPhone: true,
    showEmail: true,
    showPaymentMethod: true,
    roomText: 'Да бъде настанен/а в: Блок: $блок, Стая: $стая',
    dateText: 'Дата: $дата г.',
    signatureText: 'Подпис: ....................................',
    signerText: 'Директор'
};

const DEFAULT_CLEARANCE_SECTIONS = {
    showHeader: true,
    logoUrl: '/img/logo.png',
    headerText: 'НАЦИОНАЛНА ПРОФЕСИОНАЛНА ГИМНАЗИЯ ПО КОМПЮТЪРНИ ТЕХНОЛОГИИ И СИСТЕМИ – ГР. ПРАВЕЦ при ТУ – СОФИЯ',
    title: 'ОБХОДЕН ЛИСТ',
    subtitle: 'УЧЕНИЧЕСКО ОБЩЕЖИТИЕ',
    nameLabel: 'Име: $име',
    egnLabel: 'ЕГН: $егн',
    classRoomLabel: 'Курс / Клас: $курс &nbsp;&nbsp;&nbsp;&nbsp; Блок: $блок &nbsp;&nbsp;&nbsp;&nbsp; Стая: $стая',
    points: [
        '1. Счетоводство: НЕ ДЪЛЖИ',
        '2. Хранителен блок: НЕ ДЪЛЖИ',
        '3. Общежитие: НЕ ДЪЛЖИ'
    ],
    dateText: 'Дата: $дата г.',
    signatureText: 'Подпис: ....................................',
    signerText: ''
};

const sampleNow = new Date();
const sampleDateStr = `${sampleNow.getDate()}.${sampleNow.getMonth() + 1}.${sampleNow.getFullYear()}`;

const SAMPLE_STUDENT_DATA = {
    assignment: {
        номер_заповед: '2026-2027 - 1',
        име: 'Иван Георгиев Иванов',
        егн: '0845123456',
        стая: '204M',
        блок: '2',
        курс: '10',
        адрес: 'гр. София, ул. Васил Левски 15',
        пол: 'Мъж',
        телефон: '0888123456',
        телефон_родител: '0887654321',
        имейл: 'ivan.ivanov@example.com',
        метод_плащане: 'В брой',
        дата: sampleDateStr
    },
    clearance: {
        име: 'Иван Георгиев Иванов',
        егн: '0845123456',
        стая: '204M',
        блок: '2',
        курс: '10',
        дата: sampleDateStr
    }
};

function compileHeaderSection(s) {
    if (s.showHeader === false) return '';
    const logoImg = s.logoUrl ? `<img src="${s.logoUrl}" alt="Лого" style="height: 65px; width: 85px; object-fit: contain; flex-shrink: 0;">` : '';
    const spacer = s.logoUrl ? `<div style="width: 85px; flex-shrink: 0;"></div>` : '';
    const headerText = s.headerText ? `<div style="flex: 1; text-align: center; font-size: 13.5px; font-weight: 700; color: #0f172a; line-height: 1.35; white-space: pre-wrap;">${s.headerText}</div>` : '';
    if (!logoImg && !headerText) return '';
    return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0;">
    ${logoImg}
    ${headerText}
    ${spacer}
</div>\n\n`;
}

function compileAssignmentSections(s) {
    const headerHtml = compileHeaderSection(s);
    const roomText = s.roomText || (s.roomPrefix ? `${s.roomPrefix} ${s.roomFormat || ''}` : 'Да бъде настанен/а в: Блок: $блок, Стая: $стая');
    return `${headerHtml}<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; white-space: pre-wrap;">
    <div style="font-weight: 700; font-size: 14px; color: #1e293b; white-space: pre-wrap;">${s.orderPrefix || ''}</div>
    ${s.internalDocNum ? `<div style="font-size: 13px; color: #64748b; font-weight: 500; white-space: pre-wrap;">${s.internalDocNum}</div>` : ''}
</div>

<div style="text-align: center; margin-bottom: 28px; white-space: pre-wrap;">
    <h1 style="font-size: 24px; font-weight: 800; letter-spacing: 2px; margin: 0 0 6px 0; color: #0f172a; text-transform: uppercase; white-space: pre-wrap;">${s.title || ''}</h1>
    ${s.subtitle ? `<h3 style="font-size: 15px; font-weight: 600; margin: 0; color: #475569; white-space: pre-wrap;">${s.subtitle}</h3>` : ''}
</div>

${s.legalBasis ? `<p style="text-align: justify; font-size: 13.5px; line-height: 1.6; margin-bottom: 24px; color: #334155; white-space: pre-wrap;">${s.legalBasis}</p>` : ''}

<div style="margin-bottom: 28px; font-size: 14.5px;">
    ${s.studentLabel ? `<div style="font-weight: 600; color: #475569; margin-bottom: 12px; white-space: pre-wrap;">${s.studentLabel}</div>` : ''}
    <table style="width: 100%; border-collapse: collapse;">
        ${s.showName !== false ? `<tr><td style="padding: 5px 0; width: 200px; font-weight: 600; color: #475569; white-space: pre-wrap;">Име:</td><td style="padding: 5px 0; font-weight: 700; color: #0f172a; font-size: 15px; white-space: pre-wrap;">$име</td></tr>` : ''}
        ${s.showEgn ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">ЕГН:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$егн</td></tr>` : ''}
        ${s.showClass ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Курс / Клас:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$курс</td></tr>` : ''}
        ${s.showAddress ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Постоянен адрес:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$адрес</td></tr>` : ''}
        ${s.showSex ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Пол:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$пол</td></tr>` : ''}
        ${s.showPhone ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Телефон на ученик:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$телефон</td></tr>` : ''}
        ${s.showParentPhone ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Телефон на родител:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$телефон_родител</td></tr>` : ''}
        ${s.showEmail ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Имейл:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$имейл</td></tr>` : ''}
        ${s.showPaymentMethod ? `<tr><td style="padding: 5px 0; font-weight: 600; color: #475569; white-space: pre-wrap;">Метод на плащане:</td><td style="padding: 5px 0; color: #1e293b; white-space: pre-wrap;">$метод_плащане</td></tr>` : ''}
    </table>
</div>

<div style="margin: 25px 0 35px 0; font-size: 14.5px; font-weight: normal; color: #1e293b; white-space: pre-wrap;">${roomText}</div>

<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 50px; font-size: 14.5px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
    <div style="white-space: pre-wrap;"><strong>${s.dateText || 'Дата: $дата г.'}</strong></div>
    <div style="text-align: right; white-space: pre-wrap;">
        <div><strong>${s.signatureText || 'Подпис: ....................................'}</strong></div>
        ${s.signerText ? `<div style="margin-top: 6px; font-size: 13.5px; color: #334155; font-weight: normal; white-space: pre-wrap;">${s.signerText}</div>` : ''}
    </div>
</div>`;
}

function compileClearanceSections(s) {
    const headerHtml = compileHeaderSection(s);
    const pointsList = Array.isArray(s.points) ? s.points : [];
    const pointsHtml = pointsList.map((p, idx) => {
        const isLast = (idx === pointsList.length - 1);
        const colonIdx = p.indexOf(':');
        if (colonIdx !== -1) {
            const dept = p.substring(0, colonIdx).trim();
            const status = p.substring(colonIdx + 1).trim();
            return `        <div style="display: flex; justify-content: space-between; align-items: center; padding: 13px 0; ${isLast ? '' : 'border-bottom: 1px solid #f1f5f9;'} font-size: 14.5px; white-space: pre-wrap;">
            <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">${dept}</div>
            <div style="display: flex; gap: 40px; align-items: center;">
                <span style="font-weight: 700; color: #15803d; white-space: pre-wrap;">${status}</span>
                <span style="color: #94a3b8; font-size: 13px;">Подпис: ....................</span>
            </div>
        </div>`;
        } else {
            return `        <div style="display: flex; justify-content: space-between; align-items: center; padding: 13px 0; ${isLast ? '' : 'border-bottom: 1px solid #f1f5f9;'} font-size: 14.5px; white-space: pre-wrap;">
            <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">${p}</div>
            <div style="color: #94a3b8; font-size: 13px;">Подпис: ....................</div>
        </div>`;
        }
    }).join('\n');

    return `${headerHtml}<div style="text-align: center; margin-bottom: 28px; white-space: pre-wrap;">
    <h1 style="font-size: 22px; font-weight: 800; letter-spacing: 2px; margin: 0 0 6px 0; color: #0f172a; text-transform: uppercase; white-space: pre-wrap;">${s.title || 'ОБХОДЕН ЛИСТ'}</h1>
    ${s.subtitle ? `<div style="font-size: 13px; font-weight: 600; color: #64748b; letter-spacing: 0.5px; white-space: pre-wrap;">${s.subtitle}</div>` : ''}
</div>

<div style="margin-bottom: 28px;">
    <div style="display: flex; flex-direction: column; gap: 7px; font-size: 14.5px;">
        <div style="font-weight: 600; color: #1e293b; white-space: pre-wrap;">${s.nameLabel || 'Име: $име'}</div>
        <div style="color: #334155; white-space: pre-wrap;">${s.egnLabel || 'ЕГН: $егн'}</div>
        <div style="color: #334155; white-space: pre-wrap;">${s.classRoomLabel || 'Курс / Клас: $курс &nbsp;&nbsp;&nbsp;&nbsp; Блок: $блок &nbsp;&nbsp;&nbsp;&nbsp; Стая: $стая'}</div>
    </div>
</div>

<div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
    <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 11px 20px; font-weight: 700; font-size: 13px; color: #475569; display: flex; justify-content: space-between;">
        <span>ЗАВЕРЯВАЩ ОТДЕЛ</span>
        <span style="display: flex; gap: 60px;">
            <span>СТАТУС</span>
            <span style="margin-right: 40px;">ПОДПИС</span>
        </span>
    </div>
    <div style="padding: 4px 20px;">
${pointsHtml}
    </div>
</div>

<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 50px; font-size: 14.5px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
    <div style="white-space: pre-wrap;"><strong>${s.dateText || 'Дата: $дата г.'}</strong></div>
    <div style="text-align: right; white-space: pre-wrap;">
        <div><strong>${s.signatureText || 'Подпис: ....................................'}</strong></div>
        ${s.signerText ? `<div style="margin-top: 6px; font-size: 13.5px; color: #334155; font-weight: normal; white-space: pre-wrap;">${s.signerText}</div>` : ''}
    </div>
</div>`;
}

function getSectionsDataFromMask(type) {
    if (type === 'assignment') {
        return {
            showHeader: document.getElementById('as_showHeader') ? document.getElementById('as_showHeader').checked : true,
            logoUrl: document.getElementById('as_logoUrl')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.logoUrl,
            headerText: document.getElementById('as_headerText')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.headerText,
            orderPrefix: document.getElementById('as_orderPrefix')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.orderPrefix,
            title: document.getElementById('as_title')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.title,
            subtitle: document.getElementById('as_subtitle')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.subtitle,
            internalDocNum: document.getElementById('as_internalDocNum')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.internalDocNum,
            legalBasis: document.getElementById('as_legalBasis')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.legalBasis,
            studentLabel: document.getElementById('as_studentLabel')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.studentLabel,
            showName: document.getElementById('as_showName')?.checked ?? true,
            showEgn: document.getElementById('as_showEgn')?.checked ?? true,
            showClass: document.getElementById('as_showClass')?.checked ?? true,
            showAddress: document.getElementById('as_showAddress')?.checked ?? true,
            showSex: document.getElementById('as_showSex')?.checked ?? true,
            showPhone: document.getElementById('as_showPhone')?.checked ?? true,
            showParentPhone: document.getElementById('as_showParentPhone')?.checked ?? true,
            showEmail: document.getElementById('as_showEmail')?.checked ?? true,
            showPaymentMethod: document.getElementById('as_showPaymentMethod')?.checked ?? true,
            roomText: document.getElementById('as_roomText')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.roomText,
            dateText: document.getElementById('as_dateText')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.dateText,
            signatureText: document.getElementById('as_signatureText')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.signatureText,
            signerText: document.getElementById('as_signerText')?.value ?? DEFAULT_ASSIGNMENT_SECTIONS.signerText
        };
    } else {
        const pointInputs = document.querySelectorAll('.cl-point-input');
        const points = [];
        pointInputs.forEach(inp => {
            if (inp.value && inp.value.trim()) points.push(inp.value.trim());
        });
        return {
            showHeader: document.getElementById('cl_showHeader') ? document.getElementById('cl_showHeader').checked : true,
            logoUrl: document.getElementById('cl_logoUrl')?.value ?? DEFAULT_CLEARANCE_SECTIONS.logoUrl,
            headerText: document.getElementById('cl_headerText')?.value ?? DEFAULT_CLEARANCE_SECTIONS.headerText,
            title: document.getElementById('cl_title')?.value ?? DEFAULT_CLEARANCE_SECTIONS.title,
            subtitle: document.getElementById('cl_subtitle')?.value ?? DEFAULT_CLEARANCE_SECTIONS.subtitle,
            nameLabel: document.getElementById('cl_nameLabel')?.value ?? DEFAULT_CLEARANCE_SECTIONS.nameLabel,
            egnLabel: document.getElementById('cl_egnLabel')?.value ?? DEFAULT_CLEARANCE_SECTIONS.egnLabel,
            classRoomLabel: document.getElementById('cl_classRoomLabel')?.value ?? DEFAULT_CLEARANCE_SECTIONS.classRoomLabel,
            points: points.length > 0 ? points : DEFAULT_CLEARANCE_SECTIONS.points,
            dateText: document.getElementById('cl_dateText')?.value ?? DEFAULT_CLEARANCE_SECTIONS.dateText,
            signatureText: document.getElementById('cl_signatureText')?.value ?? DEFAULT_CLEARANCE_SECTIONS.signatureText,
            signerText: document.getElementById('cl_signerText')?.value ?? DEFAULT_CLEARANCE_SECTIONS.signerText
        };
    }
}


function getCompiledHtmlFromMask(type) {
    const s = getSectionsDataFromMask(type);
    return type === 'assignment' ? compileAssignmentSections(s) : compileClearanceSections(s);
}

window.openLocalTemplateEditor = async function(type) {
    const isAssignment = (type === 'assignment');
    const docTitle = isAssignment ? 'Заповед за настаняване' : 'Обходен лист';

    const content = document.getElementById('content');
    if (!content) return;

    window.currentTemplateEditorMode = 'mask';

    content.innerHTML = `
        <div style="margin-bottom: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0;">Редактиране на шаблон: ${docTitle}</h3>
                <button type="button" onclick="renderSettings(document.getElementById('content')).then(() => switchSettingsTab('googleDocs'))">
                    Назад към настройки
                </button>
            </div>
            <p style="color: #666; font-size: 0.9em; margin: 0 0 15px 0;">
                Редактирайте полетата по секции по-долу. Документът вдясно се обновява автоматично в реално време.
                <span id="tplStatusBadge" style="margin-left: 10px; font-weight: bold; color: #2563eb;">[Зареждане...]</span>
            </p>

            <div style="margin-bottom: 15px; display: flex; gap: 8px;">
                <button type="button" id="btnModeMask" onclick="switchTemplateEditorMode('mask', '${type}')" style="font-weight: bold; background: white; padding: 6px 14px; border: 1px solid #ccc; cursor: pointer;">
                    Форма по секции (Препоръчително)
                </button>
                <button type="button" id="btnModeRaw" onclick="switchTemplateEditorMode('raw', '${type}')" style="font-weight: normal; background: #f0f0f0; padding: 6px 14px; border: 1px solid #ccc; cursor: pointer;">
                    Разширен HTML код
                </button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start;">
                <!-- Left Pane: Mask or Raw -->
                <div>
                    <!-- Mask Mode Form -->
                    <div id="sectionMaskContainer" style="display: flex; flex-direction: column; gap: 16px;">
                        ${isAssignment ? `
                            <!-- Assignment Section 1: Header / Logo -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</span>
                                        Секция 1: Заглавна шапка (Лого и Институция)
                                    </div>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; cursor: pointer;">
                                        <input type="checkbox" id="as_showHeader" style="width: 16px !important; height: 16px !important; accent-color: #2563eb; margin: 0;" onchange="updateTemplatePreviewFromMask('assignment')">
                                        Включи в документа
                                    </label>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Път към лого изображение:</label>
                                        <input type="text" id="as_logoUrl" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст на институцията / училището:</label>
                                        <textarea id="as_headerText" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13.5px; line-height: 1.45; box-sizing: border-box; resize: vertical; text-align: center;" oninput="updateTemplatePreviewFromMask('assignment')"></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Assignment Section 2 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">2</span>
                                    Секция 2: Заглавие и Номерация
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Номер на заповед (горе вляво):</label>
                                        <input type="text" id="as_orderPrefix" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Основно заглавие:</label>
                                            <input type="text" id="as_title" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                        </div>
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Подзаглавие:</label>
                                            <input type="text" id="as_subtitle" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Номер и дата на генерална заповед на директора:</label>
                                        <input type="text" id="as_internalDocNum" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                    </div>
                                </div>
                            </div>

                            <!-- Assignment Section 3 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</span>
                                    Секция 3: Правно основание
                                </div>
                                <div>
                                    <textarea id="as_legalBasis" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13px; line-height: 1.45; box-sizing: border-box; resize: vertical;" oninput="updateTemplatePreviewFromMask('assignment')"></textarea>
                                </div>
                            </div>

                            <!-- Assignment Section 4 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">4</span>
                                    Секция 4: Данни за ученика
                                </div>
                                <div style="margin-bottom: 14px;">
                                    <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Въвеждащ текст преди данните:</label>
                                    <input type="text" id="as_studentLabel" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                </div>
                                <div style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">Включени редове с данни (отбележете нужните):</div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showName" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Име на ученик</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$име</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showEgn" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">ЕГН</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$егн</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showClass" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Курс / Клас</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$курс</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showAddress" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Постоянен адрес</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$адрес</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showSex" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Пол</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$пол</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showPhone" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Телефон на ученик</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$телефон</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showParentPhone" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Телефон родител</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$телефон_родител</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showEmail" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Имейл</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$имейл</code>
                                    </label>
                                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;">
                                        <div style="display: flex; align-items: center; gap: 9px;">
                                            <input type="checkbox" id="as_showPaymentMethod" style="width: 16px !important; height: 16px !important; margin: 0; accent-color: #2563eb; cursor: pointer;" onchange="updateTemplatePreviewFromMask('assignment')">
                                            <span style="font-size: 13.5px; font-weight: 500; color: #1e293b;">Метод на плащане</span>
                                        </div>
                                        <code style="font-size: 11px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">$метод_плащане</code>
                                    </label>
                                </div>
                            </div>

                            <!-- Assignment Section 5 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">5</span>
                                    Секция 5: Настаняване (Стая и Блок)
                                </div>
                                <div>
                                    <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст за настаняване:</label>
                                    <textarea id="as_roomText" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13.5px; line-height: 1.45; box-sizing: border-box; resize: vertical;" oninput="updateTemplatePreviewFromMask('assignment')"></textarea>
                                </div>
                            </div>

                            <!-- Assignment Section 6 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">6</span>
                                    Секция 6: Дата и Подписи
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст за дата:</label>
                                            <input type="text" id="as_dateText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                        </div>
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст за подпис:</label>
                                            <input type="text" id="as_signatureText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст под подписа (кой подписва):</label>
                                        <input type="text" id="as_signerText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('assignment')">
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <!-- Clearance Section 1: Header / Logo -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</span>
                                        Секция 1: Заглавна шапка (Лого и Институция)
                                    </div>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; cursor: pointer;">
                                        <input type="checkbox" id="cl_showHeader" style="width: 16px !important; height: 16px !important; accent-color: #2563eb; margin: 0;" onchange="updateTemplatePreviewFromMask('clearance')">
                                        Включи в документа
                                    </label>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Път към лого изображение:</label>
                                        <input type="text" id="cl_logoUrl" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст на институцията / училището:</label>
                                        <textarea id="cl_headerText" rows="2" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13.5px; line-height: 1.45; box-sizing: border-box; resize: vertical; text-align: center;" oninput="updateTemplatePreviewFromMask('clearance')"></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Clearance Section 2 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">2</span>
                                    Секция 2: Заглавие
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Основно заглавие:</label>
                                        <input type="text" id="cl_title" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Подзаглавие / Институция (по избор):</label>
                                        <input type="text" id="cl_subtitle" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                </div>
                            </div>

                            <!-- Clearance Section 3 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</span>
                                    Секция 3: Данни за ученика
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ред за име:</label>
                                        <input type="text" id="cl_nameLabel" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ред за ЕГН:</label>
                                        <input type="text" id="cl_egnLabel" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ред за курс, блок и стая:</label>
                                        <input type="text" id="cl_classRoomLabel" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                </div>
                            </div>

                            <!-- Clearance Section 4 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">
                                    <div style="font-weight: 600; font-size: 15px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                        <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">4</span>
                                        Секция 4: Заверяващи отдели (Точки за отчитане)
                                    </div>
                                    <button type="button" onclick="addClearancePoint()" style="font-size: 12.5px; font-weight: 600; padding: 4px 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 5px; cursor: pointer;">
                                        + Добави отдел
                                    </button>
                                </div>
                                <div id="cl_points_list" style="display: flex; flex-direction: column; gap: 8px;">
                                    <!-- Points are populated dynamically -->
                                </div>
                            </div>

                            <!-- Clearance Section 5 -->
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="font-weight: 600; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #eff6ff; color: #2563eb; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">5</span>
                                    Секция 5: Дата и Подписи
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст за дата:</label>
                                            <input type="text" id="cl_dateText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                        </div>
                                        <div>
                                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст за подпис:</label>
                                            <input type="text" id="cl_signatureText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Текст под подписа (кой подписва - по избор):</label>
                                        <input type="text" id="cl_signerText" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>

                    <!-- Raw HTML Mode Editor (Initially hidden) -->
                    <div id="rawEditorContainer" style="display: none;">
                        <div style="font-weight: bold; margin-bottom: 8px;">Директен HTML / Текст:</div>
                        <textarea id="localTemplateTextarea" spellcheck="false" 
                            style="width: 100%; height: 550px; font-family: 'Consolas', 'Courier New', monospace; font-size: 13px; line-height: 1.5; padding: 12px; border: 1px solid #ddd; box-sizing: border-box; resize: vertical;"
                            oninput="updateTemplatePreviewFromRaw('${type}')"></textarea>
                    </div>
                </div>

                <!-- Right Pane: Live Print Preview -->
                <div>
                    <div style="font-weight: bold; margin-bottom: 8px;">Преглед на печат (пример с примерни данни):</div>
                    <div style="border: 1px solid #ddd; background: white; padding: 30px; min-height: 550px; max-height: 650px; overflow-y: auto; box-sizing: border-box; box-shadow: inset 0 0 4px rgba(0,0,0,0.05); font-family: 'Segoe UI', Arial, sans-serif;">
                        <div id="localTemplateLivePreview"></div>
                    </div>
                </div>
            </div>

            <!-- Footer Actions -->
            <div style="margin-top: 20px; padding: 15px 0; border-top: 2px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div id="localTemplateSaveStatus" style="font-size: 0.95em; font-weight: bold;"></div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" onclick="resetLocalTemplateToDefault('${type}')" style="background-color: #fff0f0; border: 1px solid #ffcccc; color: #cc0000; padding: 6px 14px; cursor: pointer;">
                        Възстанови стандартния вид
                    </button>
                    <button type="button" onclick="renderSettings(document.getElementById('content')).then(() => switchSettingsTab('googleDocs'))" style="padding: 6px 14px; cursor: pointer;">
                        Назад към настройки
                    </button>
                    <button type="button" id="btnSaveLocalTemplate" onclick="saveLocalTemplate('${type}')" style="font-weight: bold; padding: 6px 18px; cursor: pointer;">
                        Запази шаблона
                    </button>
                </div>
            </div>
        </div>
    `;

    try {
        const resp = await fetch(`/api/settings/local-template/${type}`);
        const data = await resp.json();
        if (data.success) {
            const rawTextarea = document.getElementById('localTemplateTextarea');
            if (rawTextarea) rawTextarea.value = data.template || '';

            if (isAssignment) {
                const s = data.sections || DEFAULT_ASSIGNMENT_SECTIONS;
                if (document.getElementById('as_showHeader')) document.getElementById('as_showHeader').checked = s.showHeader !== false;
                if (document.getElementById('as_logoUrl')) document.getElementById('as_logoUrl').value = s.logoUrl ?? DEFAULT_ASSIGNMENT_SECTIONS.logoUrl;
                if (document.getElementById('as_headerText')) document.getElementById('as_headerText').value = s.headerText ?? DEFAULT_ASSIGNMENT_SECTIONS.headerText;
                if (document.getElementById('as_orderPrefix')) document.getElementById('as_orderPrefix').value = s.orderPrefix ?? DEFAULT_ASSIGNMENT_SECTIONS.orderPrefix;
                if (document.getElementById('as_title')) document.getElementById('as_title').value = s.title ?? DEFAULT_ASSIGNMENT_SECTIONS.title;
                if (document.getElementById('as_subtitle')) document.getElementById('as_subtitle').value = s.subtitle ?? DEFAULT_ASSIGNMENT_SECTIONS.subtitle;
                if (document.getElementById('as_internalDocNum')) document.getElementById('as_internalDocNum').value = s.internalDocNum ?? DEFAULT_ASSIGNMENT_SECTIONS.internalDocNum;
                if (document.getElementById('as_legalBasis')) document.getElementById('as_legalBasis').value = s.legalBasis ?? DEFAULT_ASSIGNMENT_SECTIONS.legalBasis;
                if (document.getElementById('as_studentLabel')) document.getElementById('as_studentLabel').value = s.studentLabel ?? DEFAULT_ASSIGNMENT_SECTIONS.studentLabel;
                if (document.getElementById('as_showName')) document.getElementById('as_showName').checked = s.showName !== false;
                if (document.getElementById('as_showEgn')) document.getElementById('as_showEgn').checked = s.showEgn !== false;
                if (document.getElementById('as_showClass')) document.getElementById('as_showClass').checked = s.showClass !== false;
                if (document.getElementById('as_showAddress')) document.getElementById('as_showAddress').checked = s.showAddress !== false;
                if (document.getElementById('as_showSex')) document.getElementById('as_showSex').checked = s.showSex !== false;
                if (document.getElementById('as_showPhone')) document.getElementById('as_showPhone').checked = s.showPhone !== false;
                if (document.getElementById('as_showParentPhone')) document.getElementById('as_showParentPhone').checked = s.showParentPhone !== false;
                if (document.getElementById('as_showEmail')) document.getElementById('as_showEmail').checked = s.showEmail !== false;
                if (document.getElementById('as_showPaymentMethod')) document.getElementById('as_showPaymentMethod').checked = s.showPaymentMethod !== false;
                if (document.getElementById('as_roomText')) document.getElementById('as_roomText').value = s.roomText ?? (s.roomPrefix ? `${s.roomPrefix} ${s.roomFormat || ''}` : DEFAULT_ASSIGNMENT_SECTIONS.roomText);
                if (document.getElementById('as_dateText')) document.getElementById('as_dateText').value = s.dateText ?? DEFAULT_ASSIGNMENT_SECTIONS.dateText;
                if (document.getElementById('as_signatureText')) document.getElementById('as_signatureText').value = s.signatureText ?? DEFAULT_ASSIGNMENT_SECTIONS.signatureText;
                if (document.getElementById('as_signerText')) document.getElementById('as_signerText').value = s.signerText ?? DEFAULT_ASSIGNMENT_SECTIONS.signerText;
                updateTemplatePreviewFromMask('assignment');
            } else {
                const s = data.sections || DEFAULT_CLEARANCE_SECTIONS;
                if (document.getElementById('cl_showHeader')) document.getElementById('cl_showHeader').checked = s.showHeader !== false;
                if (document.getElementById('cl_logoUrl')) document.getElementById('cl_logoUrl').value = s.logoUrl ?? DEFAULT_CLEARANCE_SECTIONS.logoUrl;
                if (document.getElementById('cl_headerText')) document.getElementById('cl_headerText').value = s.headerText ?? DEFAULT_CLEARANCE_SECTIONS.headerText;
                if (document.getElementById('cl_title')) document.getElementById('cl_title').value = s.title ?? DEFAULT_CLEARANCE_SECTIONS.title;
                if (document.getElementById('cl_subtitle')) document.getElementById('cl_subtitle').value = s.subtitle ?? DEFAULT_CLEARANCE_SECTIONS.subtitle;
                if (document.getElementById('cl_nameLabel')) document.getElementById('cl_nameLabel').value = s.nameLabel ?? DEFAULT_CLEARANCE_SECTIONS.nameLabel;
                if (document.getElementById('cl_egnLabel')) document.getElementById('cl_egnLabel').value = s.egnLabel ?? DEFAULT_CLEARANCE_SECTIONS.egnLabel;
                if (document.getElementById('cl_classRoomLabel')) document.getElementById('cl_classRoomLabel').value = s.classRoomLabel ?? DEFAULT_CLEARANCE_SECTIONS.classRoomLabel;
                if (document.getElementById('cl_dateText')) document.getElementById('cl_dateText').value = s.dateText ?? DEFAULT_CLEARANCE_SECTIONS.dateText;
                if (document.getElementById('cl_signatureText')) document.getElementById('cl_signatureText').value = s.signatureText ?? DEFAULT_CLEARANCE_SECTIONS.signatureText;
                if (document.getElementById('cl_signerText')) document.getElementById('cl_signerText').value = s.signerText ?? DEFAULT_CLEARANCE_SECTIONS.signerText;

                renderClearancePointsList(s.points || DEFAULT_CLEARANCE_SECTIONS.points);
                updateTemplatePreviewFromMask('clearance');
            }

            const badge = document.getElementById('tplStatusBadge');
            if (badge) {
                badge.textContent = data.isCustom ? '[Персонализиран шаблон]' : '[Стандартен шаблон]';
                badge.style.color = data.isCustom ? '#15803d' : '#2563eb';
            }
        }
    } catch (e) {
        alert('Грешка при зареждане на шаблона: ' + e.message);
    }
};

function renderClearancePointsList(points) {
    const list = document.getElementById('cl_points_list');
    if (!list) return;
    list.innerHTML = '';
    const arr = Array.isArray(points) ? points : DEFAULT_CLEARANCE_SECTIONS.points;
    arr.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 10px; align-items: center;';
        row.innerHTML = `
            <input type="text" class="cl-point-input" value="${p}" style="flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
            <button type="button" onclick="this.parentElement.remove(); updateTemplatePreviewFromMask('clearance');" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 6px; padding: 7px 12px; font-size: 13px; font-weight: 500; cursor: pointer;">Премахни</button>
        `;
        list.appendChild(row);
    });
}

window.addClearancePoint = function() {
    const list = document.getElementById('cl_points_list');
    if (!list) return;
    const count = list.children.length + 1;
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 10px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="cl-point-input" value="${count}. Нов отдел: НЕ ДЪЛЖИ" style="flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13.5px; box-sizing: border-box;" oninput="updateTemplatePreviewFromMask('clearance')">
        <button type="button" onclick="this.parentElement.remove(); updateTemplatePreviewFromMask('clearance');" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 6px; padding: 7px 12px; font-size: 13px; font-weight: 500; cursor: pointer;">Премахни</button>
    `;
    list.appendChild(row);
    updateTemplatePreviewFromMask('clearance');
};

window.switchTemplateEditorMode = function(mode, type) {
    window.currentTemplateEditorMode = mode;
    const maskDiv = document.getElementById('sectionMaskContainer');
    const rawDiv = document.getElementById('rawEditorContainer');
    const btnMask = document.getElementById('btnModeMask');
    const btnRaw = document.getElementById('btnModeRaw');

    if (mode === 'mask') {
        if (maskDiv) maskDiv.style.display = 'flex';
        if (rawDiv) rawDiv.style.display = 'none';
        if (btnMask) { btnMask.style.fontWeight = 'bold'; btnMask.style.background = 'white'; }
        if (btnRaw) { btnRaw.style.fontWeight = 'normal'; btnRaw.style.background = '#f0f0f0'; }
        updateTemplatePreviewFromMask(type);
    } else {
        const compiled = getCompiledHtmlFromMask(type);
        const textarea = document.getElementById('localTemplateTextarea');
        if (textarea) textarea.value = compiled;
        if (maskDiv) maskDiv.style.display = 'none';
        if (rawDiv) rawDiv.style.display = 'block';
        if (btnMask) { btnMask.style.fontWeight = 'normal'; btnMask.style.background = '#f0f0f0'; }
        if (btnRaw) { btnRaw.style.fontWeight = 'bold'; btnRaw.style.background = 'white'; }
        updateTemplatePreviewFromRaw(type);
    }
};

window.updateTemplatePreviewFromMask = function(type) {
    const preview = document.getElementById('localTemplateLivePreview');
    if (!preview) return;

    let content = getCompiledHtmlFromMask(type);
    const sample = SAMPLE_STUDENT_DATA[type] || SAMPLE_STUDENT_DATA.assignment;
    const sortedKeys = Object.keys(sample).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        content = content.split('$' + key).join(sample[key]);
    }
    preview.innerHTML = content;
};

window.updateTemplatePreviewFromRaw = function(type) {
    const textarea = document.getElementById('localTemplateTextarea');
    const preview = document.getElementById('localTemplateLivePreview');
    if (!textarea || !preview) return;

    let content = textarea.value;
    const sample = SAMPLE_STUDENT_DATA[type] || SAMPLE_STUDENT_DATA.assignment;
    const sortedKeys = Object.keys(sample).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        content = content.split('$' + key).join(sample[key]);
    }
    preview.innerHTML = content;
};

window.saveLocalTemplate = async function(type) {
    const statusDiv = document.getElementById('localTemplateSaveStatus');
    const btn = document.getElementById('btnSaveLocalTemplate');
    if (btn) btn.disabled = true;
    if (statusDiv) {
        statusDiv.style.color = '#2563eb';
        statusDiv.textContent = 'Записване...';
    }

    let templateHtml = '';
    let sections = null;

    if (window.currentTemplateEditorMode === 'raw') {
        const textarea = document.getElementById('localTemplateTextarea');
        templateHtml = textarea ? textarea.value : '';
    } else {
        sections = getSectionsDataFromMask(type);
        templateHtml = getCompiledHtmlFromMask(type);
    }

    try {
        const resp = await fetch(`/api/settings/local-template/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: templateHtml, sections: sections })
        });
        const res = await resp.json();
        if (res.success) {
            if (statusDiv) {
                statusDiv.style.color = '#15803d';
                statusDiv.textContent = 'Шаблонът беше запазен успешно!';
            }
            const badge = document.getElementById('tplStatusBadge');
            if (badge) {
                badge.textContent = '[Персонализиран шаблон]';
                badge.style.color = '#15803d';
            }
            setTimeout(() => {
                if (statusDiv && statusDiv.textContent.includes('успешно')) {
                    statusDiv.textContent = '';
                }
            }, 3000);
        } else {
            if (statusDiv) {
                statusDiv.style.color = '#cc0000';
                statusDiv.textContent = 'Грешка: ' + (res.error || 'Неуспешен запис');
            }
        }
    } catch (e) {
        if (statusDiv) {
            statusDiv.style.color = '#cc0000';
            statusDiv.textContent = 'Грешка при връзката със сървъра.';
        }
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.resetLocalTemplateToDefault = async function(type) {
    if (!confirm('Сигурни ли сте, че искате да възстановите стандартния шаблон по подразбиране? Всички ваши промени по него ще бъдат изтрити.')) {
        return;
    }
    const statusDiv = document.getElementById('localTemplateSaveStatus');
    try {
        const resp = await fetch(`/api/settings/local-template/${type}/reset`, { method: 'POST' });
        const res = await resp.json();
        if (res.success) {
            if (type === 'assignment') {
                const s = DEFAULT_ASSIGNMENT_SECTIONS;
                if (document.getElementById('as_showHeader')) document.getElementById('as_showHeader').checked = true;
                if (document.getElementById('as_logoUrl')) document.getElementById('as_logoUrl').value = s.logoUrl;
                if (document.getElementById('as_headerText')) document.getElementById('as_headerText').value = s.headerText;
                if (document.getElementById('as_orderPrefix')) document.getElementById('as_orderPrefix').value = s.orderPrefix;
                if (document.getElementById('as_title')) document.getElementById('as_title').value = s.title;
                if (document.getElementById('as_subtitle')) document.getElementById('as_subtitle').value = s.subtitle;
                if (document.getElementById('as_internalDocNum')) document.getElementById('as_internalDocNum').value = s.internalDocNum;
                if (document.getElementById('as_legalBasis')) document.getElementById('as_legalBasis').value = s.legalBasis;
                if (document.getElementById('as_studentLabel')) document.getElementById('as_studentLabel').value = s.studentLabel;
                if (document.getElementById('as_showName')) document.getElementById('as_showName').checked = true;
                if (document.getElementById('as_showEgn')) document.getElementById('as_showEgn').checked = true;
                if (document.getElementById('as_showClass')) document.getElementById('as_showClass').checked = true;
                if (document.getElementById('as_showAddress')) document.getElementById('as_showAddress').checked = true;
                if (document.getElementById('as_showSex')) document.getElementById('as_showSex').checked = true;
                if (document.getElementById('as_showPhone')) document.getElementById('as_showPhone').checked = true;
                if (document.getElementById('as_showParentPhone')) document.getElementById('as_showParentPhone').checked = true;
                if (document.getElementById('as_showEmail')) document.getElementById('as_showEmail').checked = true;
                if (document.getElementById('as_showPaymentMethod')) document.getElementById('as_showPaymentMethod').checked = true;
                if (document.getElementById('as_roomText')) document.getElementById('as_roomText').value = s.roomText;
                if (document.getElementById('as_dateText')) document.getElementById('as_dateText').value = s.dateText;
                if (document.getElementById('as_signatureText')) document.getElementById('as_signatureText').value = s.signatureText;
                if (document.getElementById('as_signerText')) document.getElementById('as_signerText').value = s.signerText;
            } else {
                const s = DEFAULT_CLEARANCE_SECTIONS;
                if (document.getElementById('cl_showHeader')) document.getElementById('cl_showHeader').checked = true;
                if (document.getElementById('cl_logoUrl')) document.getElementById('cl_logoUrl').value = s.logoUrl;
                if (document.getElementById('cl_headerText')) document.getElementById('cl_headerText').value = s.headerText;
                if (document.getElementById('cl_title')) document.getElementById('cl_title').value = s.title;
                if (document.getElementById('cl_subtitle')) document.getElementById('cl_subtitle').value = s.subtitle;
                if (document.getElementById('cl_nameLabel')) document.getElementById('cl_nameLabel').value = s.nameLabel;
                if (document.getElementById('cl_egnLabel')) document.getElementById('cl_egnLabel').value = s.egnLabel;
                if (document.getElementById('cl_classRoomLabel')) document.getElementById('cl_classRoomLabel').value = s.classRoomLabel;
                if (document.getElementById('cl_dateText')) document.getElementById('cl_dateText').value = s.dateText;
                if (document.getElementById('cl_signatureText')) document.getElementById('cl_signatureText').value = s.signatureText;
                if (document.getElementById('cl_signerText')) document.getElementById('cl_signerText').value = s.signerText;
                renderClearancePointsList(DEFAULT_CLEARANCE_SECTIONS.points);
            }

            const rawTextarea = document.getElementById('localTemplateTextarea');
            if (rawTextarea) rawTextarea.value = res.template || '';

            updateTemplatePreviewFromMask(type);

            const badge = document.getElementById('tplStatusBadge');
            if (badge) {
                badge.textContent = '[Стандартен шаблон]';
                badge.style.color = '#2563eb';
            }
            if (statusDiv) {
                statusDiv.style.color = '#15803d';
                statusDiv.textContent = 'Стандартният шаблон беше възстановен успешно!';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            }
        }
    } catch (e) {
        alert('Грешка при възстановяване на шаблона: ' + e.message);
    }
};

window.manageAssignmentTemplate = function () {
    window.openLocalTemplateEditor('assignment');
};

window.manageClearanceTemplate = function () {
    window.openLocalTemplateEditor('clearance');
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
    return openGoogleTemplate('header');
}

async function manageFooterTemplate() {
    return openGoogleTemplate('footer');
}