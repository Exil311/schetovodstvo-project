async function navigate(page) {
    const content = document.getElementById('content');
    if (page === 'students') {
        renderStudentForm(content, 'add');
    } else if (page === 'reports') {
        content.innerHTML = `
            <h3>Справки</h3>
            <div class="report-controls">
                <select id="reportType" onchange="handleReportTypeChange()">
                    <option value="">Изберете справка...</option>
                    <option value="all">Всички ученици</option>
                    <option value="rooms">Стаи</option>
                    <option value="daily">Дневни плащания</option>
                    <option value="status_period">Справка за блокове</option>
                    <option value="period_payments">Справка по период</option>
                </select>
                <input type="text" id="tableSearch" class="search-input" placeholder="Търсене..." oninput="filterTable()">
                <select id="blockFilter" onchange="filterTable()" class="input-field">
                    <option value="">Всички блокове</option>
                    <option value="1">Блок 1</option>
                    <option value="2">Блок 2</option>
                </select>
                <label id="freeRoomsLabel" style="display: none; margin-left: 15px; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="freeRoomsOnly" onchange="filterTable()" style="transform: scale(1.2); margin-right: 5px;"> 
                    Само свободни места
                </label>
                <label id="hideUnassignedLabel" style="display: none; margin-left: 15px; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="hideUnassigned" onchange="filterTable()" style="transform: scale(1.2); margin-right: 5px;"> 
                    Не показвай отписани ученици
                </label>
                <button id="exportBtn" onclick="exportToGoogleDocs()" style="display: none; margin-left: 20px;">Експортирай в Google Docs</button>
                <button id="exportDocsShortBtn" onclick="exportToGoogleDocsShort()" style="display: none; margin-left: 10px;">Експортирай в Docs (Съкратено)</button>
                <button id="exportExcelBtn" onclick="exportToExcel()" style="display: none; margin-left: 10px;">Експортирай в Excel</button>
            </div>
            <div id="reportResult"></div>
        `;
    } else if (page === 'settings') {
        renderSettings(content);
    } else if (page === 'docs') {
        content.innerHTML = `
            <h3>Документация</h3>
            <div class="docs-container" style="padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); line-height: 1.6;">
                <h4 style="margin-top: 0; color: #2563eb;">Настаняване:</h4>
                <ul style="margin-bottom: 20px;">
                    <li>Полета, които не са задължителни: Телефон на родител, телефон на ученик и емайл.</li>
                    <li>Може да се променя процента за отстъпка при семейно положение в настройки.</li>
                </ul>

                <h4 style="color: #2563eb;">Плащане:</h4>
                <ul style="margin-bottom: 20px;">
                    <li>Търсачката работи по ЕГН, Курсов номер, Име</li>
                    <li>Записване/Отписване/Редактиране на даден ученик от бутона редактирай.</li>
                    <li>Няма бележка при плащане по банков път, но отчита в приложението, че е платено.</li>
                    <li>Плащане с карта е заготовка за бъдеще, но няма такова плащане реално. (Да не се избира)</li>
                    <li>Януари 2026 година: сумата за плащане се въвежда в левове, автоматично го прехвърля в евро по официалния курс.</li>
                </ul>

                <h4 style="color: #2563eb;">Справки:</h4>
                <div style="margin-left: 20px; margin-bottom: 20px;">
                    <strong>Всички ученици:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Търсачката работи с ЕГН, Име, Курсов номер, Блок.</li>
                        <li>Редактирай бутона - настройки на избрания ученик.</li>
                    </ul>
                    <strong>Стаи:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Търсачката работи с Номер на стая (Примерно търсене: стая101, staq101, staya101), Блок, Курсов номер, Капацитет (Г - голяма стая(3 легла); М- малка стая(2 легла)).</li>
                        <li>Редактирай бутона - настройки на избраната стая.</li>
                    </ul>
                    <strong>По блок:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Търсачката работи с курсови номера.</li>
                        <li>Подредена е по курсови номера.</li>
                    </ul>
                </div>

                <h4 style="color: #2563eb;">Настройки:</h4>
                <div style="margin-left: 20px;">
                    <strong>Системни настройки:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Обнови цената и за отминали неплатени месеци -> Ако не е избрано, няма да се промени таксата за минали месеци за всички ученици. Ако е избрано, ще се промени таксата за минали месеци на всички ученици.</li>
                        <li>Невалиден месец -> не избрано поле на конкретен месец. Но се появява при допълни плащания.</li>
                    </ul>
                    <strong>Семейни положение:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Променя процентите отстъпка за съответния статус (100% -> НЕ плаща, 0% -> плаща цялата заложена сума).</li>
                    </ul>
                    <strong>Текст за справки:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Промяна на шаблоните на горен/долен текст на всички справки.</li>
                        <li>Промяна на шаблона за настанителна заповед.</li>
                        <li>Промяна на шаблона за обходен лист.</li>
                        <li>При въвеждане на данни за ученика, с бутон запис се генерира автоматично Настанителна заповед. Всяка справка/настанителна заповед се трият от уеб автоматично след 5 минути. При искане на редакция, трябва да се изтегли локално на компютъра и да се редактира ръчно.</li>
                    </ul>
                </div>
                <h4 style="color: #2563eb;">Акаунти и пароли:</h4>
                <div style="margin-left: 20px;">
                    <strong>Google account:</strong>
                    <ul style="margin-top: 5px;">
                        <li>Имейл: schetovodstvo@uktc-bg.com</li>
                        <li>Парола: admin_431</li>
                    </ul>
                </div>
            </div>
        `;
    } else if (page === 'pay') {
        renderPay(content);
    } else if (page === 'pos') {
        renderPOS(content);
    } else if (page === 'backup') {
        renderBackup(content);
    } else {
        content.innerHTML = `<h3>${page}</h3><p>В процес на разработка...</p>`;
    }
}

function renderPOS(content) {
    content.innerHTML = `
        <h3>Фискален принтер и отчети</h3>
        <div class="pos-container" style="padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-top: 20px;">
            <p>Управление на фискалния принтер и отчети.</p>
            <div style="display: flex; gap: 20px; margin-top: 20px;">
                <button onclick="triggerZReport()">
                    Z-ОТЧЕТ (с нулиране) - дневен
                </button>
                <button onclick="triggerSyncTime()">
                    Сверяване на часовника
                </button>
            </div>
            <div id="posStatus" style="margin-top: 20px; padding: 15px; border-radius: 4px; display: none;"></div>
        </div>
    `;
}

async function triggerZReport() {
    if (!confirm('Сигурни ли сте, че искате да пуснете Z-ОТЧЕТ? Това ще нулира дневните обороти в принтера!')) {
        return;
    }

    const statusDiv = document.getElementById('posStatus');
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = '#fef3c7';
    statusDiv.style.color = '#92400e';
    statusDiv.innerText = 'Изпълнява се Z-ОТЧЕТ... Моля изчакайте.';

    try {
        const response = await fetch('http://127.0.0.1:5001/z-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            statusDiv.style.backgroundColor = '#d1fae5';
            statusDiv.style.color = '#065f46';
            statusDiv.innerText = 'Z-ОТЧЕТ е успешно изпълнен и отпечатан.';
        } else {
            throw new Error(data.error || 'Грешка при изпълнение на Z-ОТЧЕТ');
        }
    } catch (err) {
        console.error(err);
        statusDiv.style.backgroundColor = '#fee2e2';
        statusDiv.style.color = '#991b1b';
        statusDiv.innerText = 'Грешка: ' + err.message;
    }
}

async function triggerSyncTime() {
    const statusDiv = document.getElementById('posStatus');
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = '#fef3c7';
    statusDiv.style.color = '#92400e';
    statusDiv.innerText = 'Сверяване на часовника... Моля изчакайте.';

    try {
        const response = await fetch('http://127.0.0.1:5001/sync-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            statusDiv.style.backgroundColor = '#d1fae5';
            statusDiv.style.color = '#065f46';
            statusDiv.innerText = 'Часовникът е успешно сверен.';
        } else {
            throw new Error(data.error || 'Грешка при сверяване на часовника');
        }
    } catch (err) {
        console.error(err);
        statusDiv.style.backgroundColor = '#fee2e2';
        statusDiv.style.color = '#991b1b';
        statusDiv.innerText = 'Грешка: ' + err.message;
    }
}

function renderBackup(content) {
    content.innerHTML = `
        <h3>Архиви</h3>
        <div class="pos-container" style="padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-top: 20px;">
            <p>Тук можете ръчно да създадете локално копие (backup) на базата данни. Автоматичен архив се прави веднъж на ден при първото стартиране на програмата.</p>
            <p>Като се трие на всеки 14 дни най-старото копие.</p>

            <div style="display: flex; gap: 20px; margin-top: 20px;">
                <button onclick="triggerBackup()">
                    НАПРАВИ АРХИВ СЕГА
                </button>
            </div>
            <div id="backupStatus" style="margin-top: 20px; padding: 15px; border-radius: 4px; display: none;"></div>

            <hr style="margin-top: 30px; margin-bottom: 20px; border-top: 1px solid #e5e7eb;">
            <h4>Възстановяване от архив</h4>
            <div style="display: flex; gap: 20px; margin-top: 20px; align-items: center;">
                <select id="backupSelector" style="padding: 10px; border-radius: 6px; border: 1px solid #ccc; flex-grow: 1;">
                    <option value="">Зареждане на архиви...</option>
                </select>
                <button onclick="triggerRestore()">
                    ВЪЗСТАНОВИ БАЗАТА
                </button>
            </div>
            <div id="restoreStatus" style="margin-top: 20px; padding: 15px; border-radius: 4px; display: none;"></div>

            <hr style="margin-top: 30px; margin-bottom: 20px; border-top: 1px solid #e5e7eb;">
            <h4>Статистика на последния архив</h4>
            <div id="backupStatsContainer" style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 6px; border: 1px solid #f3f4f6;">
                Зареждане на статистика...
            </div>

            <hr style="margin-top: 30px; margin-bottom: 20px; border-top: 1px solid #e5e7eb;">
            <h4>Архиви в Google Drive</h4>
            <p>Архив на базата бива качен и в google drive всеки месец на първо число.</p>
            <p>Като се трие на всеки 6 месеца най-старото копие.</p>
            <div id="driveBackupsContainer" style="margin-top: 15px; padding: 15px; background: #f0f7ff; border-radius: 6px; border: 1px solid #d0e7ff;">
                Зареждане на архиви от Drive...
            </div>
        </div>
    `;

    if (typeof loadBackups === 'function') {
        loadBackups();
    }
}
