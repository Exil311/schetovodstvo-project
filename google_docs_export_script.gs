/**
 * RUN THIS TO AUTHORIZE Drive, Document, and Spreadsheet access.
 */
function authorizeMe() {
  DriveApp.getRootFolder();
  var ss = SpreadsheetApp.create("temp_auth_file");
  // Just rename it if we can't delete
  try { DriveApp.getFileById(ss.getId()).setTrashed(true); } 
  catch(e) { DriveApp.getFileById(ss.getId()).setName("DELETE_ME_" + new Date().getTime()); }
  console.log("Permissions granted!");
}

/**
 * RUN THIS TO RENAME ALL EXISTING TEMPLATES.
 * This forces the script to regenerate them with the newest Docs styles.
 */
function deleteOldTemplates() {
  const templateNames = [
    "Assignment_Template",
    "Clearance_Template",
    "Report_Header_Template_Doc",
    "Report_Footer_Template_Doc"
  ];

  let renamedCount = 0;

  for (let i = 0; i < templateNames.length; i++) {
    const files = DriveApp.searchFiles("title = '" + templateNames[i] + "' and trashed = false");
    while (files.hasNext()) {
      const file = files.next();
      file.setName("OLD_" + new Date().getTime() + "_" + file.getName());
      console.log("Renamed: " + file.getName());
      renamedCount++;
    }
  }

  console.log("Finished! Renamed " + renamedCount + " template file(s). Fresh ones will be created on your next request.");
}

/**
 * Creates a default template if none exists.
 * Returns the ID of the new/existing template.
 */
function getOrCreateTemplate(templateName, type = 'header_doc') {
  // Always search for GOOGLE_DOCS mimeType to avoid confusion with potential Spreadsheets
  const files = DriveApp.searchFiles("title = '" + templateName + "' and mimeType = 'application/vnd.google-apps.document' and trashed = false");
  let file;
  if (files.hasNext()) {
    file = files.next();
  } else {
    if (type === 'clearance') {
        const doc = DocumentApp.create(templateName);
        const body = doc.getBody();
        body.appendParagraph("О Б Х О Д Е Н   Л И С Т").setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("");
        body.appendParagraph("Име: $име");
        body.appendParagraph("ЕГН: $егн");
        body.appendParagraph("Курс: $курс  Блок ($блок) Стая: $стая");
        body.appendParagraph("");
        body.appendParagraph("1. Счетоводство: НЕ ДЪЛЖИ");
        body.appendParagraph("2. Хранителен блок: НЕ ДЪЛЖИ");
        body.appendParagraph("3. Общежитие: НЕ ДЪЛЖИ");
        body.appendParagraph("");
        body.appendParagraph("Дата: $дата");
        body.appendParagraph("Подпис: ........................").setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        doc.saveAndClose();
        file = DriveApp.getFileById(doc.getId());
    } else if (type === 'assignment') {
        const doc = DocumentApp.create(templateName);
        const body = doc.getBody();
        body.appendParagraph("З А П О В Е Д").setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("за настаняване в общежитие").setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("");
        body.appendParagraph("Настанява се ученикът/ученичката: $име");
        body.appendParagraph("ЕГН: $егн");
        body.appendParagraph("Курс/Клас: $курс");
        body.appendParagraph("Адрес: $адрес");
        body.appendParagraph("Пол: $пол");
        body.appendParagraph("Телефон: $телефон");
        body.appendParagraph("Телефон на родител: $телефон_родител");
        body.appendParagraph("Имейл: $имейл");
        body.appendParagraph("Метод на плащане: $метод_плащане");
        body.appendParagraph("");
        body.appendParagraph("Да бъде настанен/а в:");
        body.appendParagraph("Блок: $блок, Стая: $стая");
        body.appendParagraph("");
        body.appendParagraph("Дата: $дата");
        body.appendParagraph("Подпис: ........................").setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        doc.saveAndClose();
        file = DriveApp.getFileById(doc.getId());
    } else if (type === 'header_doc') {
        const doc = DocumentApp.create(templateName);
        const body = doc.getBody();
        body.appendParagraph("ТЕХНИЧЕСКИ УНИВЕРСИТЕТ - СОФИЯ").setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("ОТДЕЛ \"СТУДЕНТСКИ ОБЩЕЖИТИЯ И СТОЛОВЕ\"").setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("");
        body.appendParagraph("Справка за $справка_име").setHeading(DocumentApp.ParagraphHeading.HEADING3).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph("Тип плащане: $тип_плащане");
        body.appendParagraph("Блок: $блок");
        body.appendParagraph("Учащи: $учащи");
        body.appendParagraph("От Месец: $от_месец / $от_година");
        body.appendParagraph("До Месец: $до_месец / $до_година");
        doc.saveAndClose();
        file = DriveApp.getFileById(doc.getId());
    } else if (type === 'footer_doc') {
        const doc = DocumentApp.create(templateName);
        const body = doc.getBody();
        body.appendParagraph("");
        body.appendParagraph("Изготвил: ........................").setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        body.appendParagraph("Дата: $дата").setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        doc.saveAndClose();
        file = DriveApp.getFileById(doc.getId());
    }
  }
  return file.getId();
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // --- BACKUP MODE ---
    if (data.isBackup) {
      const folderName = "Dorms_Backups";
      let folder;
      const folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) { folder = folders.next(); } 
      else { folder = DriveApp.createFolder(folderName); }
      
      const fileName = data.filename || ("backup_" + new Date().toISOString() + ".sql");
      const file = folder.createFile(fileName, data.content, MimeType.PLAIN_TEXT);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, fileId: file.getId(), fileName: fileName })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- CLEARANCE MODE ---
    if (data.isClearance) {
      let clearanceTemplateId = data.clearanceTemplateId || getOrCreateTemplate("Clearance_Template", "clearance");
      let templateFile;
      try {
        templateFile = DriveApp.getFileById(clearanceTemplateId);
        if (templateFile.getMimeType() !== "application/vnd.google-apps.document") throw new Error();
      } catch (e) {
        clearanceTemplateId = getOrCreateTemplate("Clearance_Template", "clearance");
        templateFile = DriveApp.getFileById(clearanceTemplateId);
      }
      
      const newFile = templateFile.makeCopy("TEMP_" + (data.title || "Обходен_Лист"));
      const doc = DocumentApp.openById(newFile.getId());
      const body = doc.getBody();
      
      const studentData = data.studentData || {};
      const sortedKeys = Object.keys(studentData).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        body.replaceText("\\$" + key, studentData[key]);
      }
      
      doc.saveAndClose();
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        url: doc.getUrl(),
        clearanceTemplateId: clearanceTemplateId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ASSIGNMENT MODE ---
    if (data.isAssignment) {
      let assignmentTemplateId = data.assignmentTemplateId || getOrCreateTemplate("Assignment_Template", "assignment");
      let templateFile;
      try {
        templateFile = DriveApp.getFileById(assignmentTemplateId);
        if (templateFile.getMimeType() !== "application/vnd.google-apps.document") throw new Error();
      } catch (e) {
        assignmentTemplateId = getOrCreateTemplate("Assignment_Template", "assignment");
        templateFile = DriveApp.getFileById(assignmentTemplateId);
      }
      
      const newFile = templateFile.makeCopy("TEMP_" + (data.title || "Заповед_Настаняване"));
      const doc = DocumentApp.openById(newFile.getId());
      const body = doc.getBody();
      
      const studentData = data.studentData || {};
      const sortedKeys = Object.keys(studentData).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        body.replaceText("\\$" + key, studentData[key]);
      }
      
      doc.saveAndClose();
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        url: doc.getUrl(),
        assignmentTemplateId: assignmentTemplateId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- REPORT MODE ---

    // --- EXCEL EXPORT ---
    if (data.exportType === 'excel') {
      const ss = SpreadsheetApp.create("TEMP_" + (data.title || "Spravka_Excel"));
      const sheet = ss.getActiveSheet();

      // Add metadata header rows
      const blockLabel = data.block || 'Всички';
      const fromLabel = (data.fromMonth && data.fromMonth !== '-') ? (data.fromMonth + ' ' + (data.fromYear || '')) : 'Не се изисква';
      const toLabel = (data.toMonth && data.toMonth !== '-') ? (data.toMonth + ' ' + (data.toYear || '')) : 'Не се изисква';
      const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm:ss");

      sheet.appendRow([data.reportName || 'Справка']);
      sheet.appendRow(['Блок: ' + blockLabel, '', 'От: ' + fromLabel, '', 'До: ' + toLabel]);
      sheet.appendRow(['Дата: ' + dateStr]);
      sheet.appendRow(['']); // empty separator row

      // Bold the metadata rows
      sheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
      sheet.getRange(2, 1, 1, 5).setFontWeight('bold');
      sheet.getRange(3, 1).setFontWeight('bold');

      if (data.rows && data.rows.length > 0) {
        const stringRows = data.rows.map(row => row.map(cell => String(cell || '')));
        const startRow = sheet.getLastRow() + 1;

        for (let i = 0; i < stringRows.length; i++) {
          sheet.appendRow(stringRows[i]);
        }

        // Bold header row of the data table
        const headerRange = sheet.getRange(startRow, 1, 1, stringRows[0].length);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#d9e2f3');

        // Add borders to the data range
        const dataRange = sheet.getRange(startRow, 1, stringRows.length, stringRows[0].length);
        dataRange.setBorder(true, true, true, true, true, true);

        // Auto-resize columns
        for (let col = 1; col <= stringRows[0].length; col++) {
          sheet.autoResizeColumn(col);
        }

        // Make the first column (Блок) narrower
        sheet.setColumnWidth(1, 50);

        // Make the last columns wider
        const totalCols = stringRows[0].length;
        if (totalCols >= 9) {
          sheet.setColumnWidth(totalCols - 2, 100); // Месец
          sheet.setColumnWidth(totalCols - 1, 80);  // Сума
          sheet.setColumnWidth(totalCols, 120);     // Наем
        } else {
          sheet.setColumnWidth(totalCols - 1, 150); // Месец
          sheet.setColumnWidth(totalCols, 120);     // Наем
        }

        // Freeze the header row of data
        sheet.setFrozenRows(startRow);
      }

      const ssUrl = ss.getUrl();
      return ContentService.createTextOutput(JSON.stringify({ success: true, url: ssUrl })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- GOOGLE DOCS EXPORT ---
    let templateId = data.templateId || getOrCreateTemplate("Report_Header_Template_Doc", "header_doc");
    let footerTemplateId = data.footerTemplateId || getOrCreateTemplate("Report_Footer_Template_Doc", "footer_doc");
    
    const templateFile = DriveApp.getFileById(templateId);
    const newFile = templateFile.makeCopy("TEMP_" + (data.title || "Spravka"));
    const doc = DocumentApp.openById(newFile.getId());
    const body = doc.getBody();
    
    body.setMarginLeft(36);  
    body.setMarginRight(36);
    
    if (data.rows && data.rows.length > 0) {
      const stringRows = data.rows.map(row => row.map(cell => String(cell || '')));
      const table = body.appendTable(stringRows);
      
      // 1. Change text size and reduce cell padding (row height)
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          
          // Keep the font size at 9
          cell.editAsText().setFontSize(8);
          
          // NEW: Shrink the blank space above and below the text to 1 point
          cell.setPaddingTop(1); 
          cell.setPaddingBottom(1);
        }
      }

      // 2. Set specific column widths based on the number of columns
      const numCols = table.getRow(0).getNumCells();
      if (numCols >= 9) {
        // Block report: Блок, Стая, ЕГН, Име, Курсов №, Година, Месец, Сума, Наем
        table.setColumnWidth(0, 36);   // Блок
        table.setColumnWidth(1, 40);   // Стая
        table.setColumnWidth(2, 72);   // ЕГН
        table.setColumnWidth(3, 140);  // Име
        table.setColumnWidth(4, 50);   // Курсов №
        table.setColumnWidth(5, 43);   // Година
        table.setColumnWidth(6, 58);   // Месец
        table.setColumnWidth(7, 40);   // Сума
        table.setColumnWidth(8, 72);   // Наем
      } else if (numCols === 8) {
        // Legacy Block report: Блок, Стая, ЕГН, Име, Курсов №, Година, Месец, Наем
        table.setColumnWidth(0, 36);   // Блок
        table.setColumnWidth(1, 40);   // Стая
        table.setColumnWidth(2, 72);   // ЕГН
        table.setColumnWidth(3, 180);  // Име
        table.setColumnWidth(4, 50);   // Курсов №
        table.setColumnWidth(5, 43);   // Година
        table.setColumnWidth(6, 58);   // Месец
        table.setColumnWidth(7, 72);   // Наем
      } else if (numCols >= 7) {
        // Payment report (with method): Дата/Час, Студент, ЕГН, Курсов №, Месец, Метод, Сума (€)
        table.setColumnWidth(0, 95);   // Дата/Час
        table.setColumnWidth(1, 131);  // Студент
        table.setColumnWidth(2, 60);   // ЕГН
        table.setColumnWidth(3, 48);   // Курсов №
        table.setColumnWidth(4, 60);   // Месец
        table.setColumnWidth(5, 45);   // Метод
        table.setColumnWidth(6, 65);   // Сума (€)
      } else if (numCols === 6) {
        // Payment report (no method): Дата/Час, Студент, ЕГН, Курсов №, Месец, Сума (€)
        table.setColumnWidth(0, 105);  // Дата/Час
        table.setColumnWidth(1, 141);  // Студент
        table.setColumnWidth(2, 72);   // ЕГН
        table.setColumnWidth(3, 58);   // Курсов №
        table.setColumnWidth(4, 75);   // Месец
        table.setColumnWidth(5, 65);   // Сума (€)
      } else if (numCols >= 5) {
        // All students report: Блок, Стая, Име, ЕГН, Курсов №
        table.setColumnWidth(0, 36);   // Блок
        table.setColumnWidth(1, 40);   // Стая
        table.setColumnWidth(2, 230);  // Име
        table.setColumnWidth(3, 80);   // ЕГН
        table.setColumnWidth(4, 65);   // Курсов №
      } else if (numCols === 2) {
        // Short daily report: Блок, Сума
        table.setColumnWidth(0, 300);  // Блок
        table.setColumnWidth(1, 150);  // Сума
      }
    }

    if (footerTemplateId) {
        try {
            const footerDoc = DocumentApp.openById(footerTemplateId);
            const footerBody = footerDoc.getBody();
            for (let i = 0; i < footerBody.getNumChildren(); i++) {
                body.appendParagraph(footerBody.getChild(i).copy());
            }
        } catch (e) {}
    }

    if (data.isExactDate) {
      body.replaceText("От Месец: \\$от_месец / \\$от_година", "От дата: " + (data.fromMonth && data.fromMonth !== '-' ? data.fromMonth : "Не се изисква"));
      body.replaceText("До Месец: \\$до_месец / \\$до_година", "До дата: " + (data.toMonth && data.toMonth !== '-' ? data.toMonth : "Не се изисква"));
    }

    const replacers = {
      "\\$справка_име": data.reportName || "",
      "\\$тип_плащане": data.paymentType || "Не се изисква",
      "\\$блок": data.block || "",
      "\\$учащи": data.studentsStatus || "ДА",
      "\\$от_месец": (data.fromMonth && data.fromMonth !== '-') ? data.fromMonth : "Не се изисква",
      "\\$от_година": (data.fromYear && data.fromYear !== '-') ? data.fromYear : "Не се изисква",
      "\\$до_месец": (data.toMonth && data.toMonth !== '-') ? data.toMonth : "Не се изисква",
      "\\$до_година": (data.toYear && data.toYear !== '-') ? data.toYear : "Не се изисква",
      "\\$дата": Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm:ss")
    };

    for (const key in replacers) {
      body.replaceText(key, replacers[key]);
    }

    doc.saveAndClose();
    return ContentService.createTextOutput(JSON.stringify({ success: true, url: doc.getUrl() })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e.parameter.listBackups) {
    const folders = DriveApp.getFoldersByName("Dorms_Backups");
    const backups = [];
    if (folders.hasNext()) {
      const files = folders.next().getFiles();
      while (files.hasNext()) {
        const file = files.next();
        backups.push({ name: file.getName(), id: file.getId(), date: file.getDateCreated(), size: file.getSize(), url: file.getUrl() });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, files: backups })).setMimeType(ContentService.MimeType.JSON);
  }

  let templateName = "Report_Header_Template_Doc";
  let type = "header_doc";
  
  if (e.parameter.template === 'footer') { templateName = "Report_Footer_Template_Doc"; type = "footer_doc"; } 
  else if (e.parameter.template === 'assignment') { templateName = "Assignment_Template"; type = "assignment"; }
  else if (e.parameter.template === 'clearance') { templateName = "Clearance_Template"; type = "clearance"; }
  
  const id = getOrCreateTemplate(templateName, type);
  const url = DocumentApp.openById(id).getUrl();
  
  if (e.parameter.json) return ContentService.createTextOutput(JSON.stringify({ id: id, url: url })).setMimeType(ContentService.MimeType.JSON);
  
  const html = `<html><head><base target="_top"><script>window.location.replace("${url}");</script></head><body>Redirecting...</body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle("Template");
}