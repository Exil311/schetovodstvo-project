import win32print
import win32ui
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

#PRINTER_NAME = win32print.GetDefaultPrinter()
PRINTER_NAME = ""
EXCHANGE_RATE = 1.95583


def print_text_windows(printer_name, text_lines):
    hDC = win32ui.CreateDC()
    hDC.CreatePrinterDC(printer_name)

    hDC.StartDoc("Receipt")
    hDC.StartPage()

    font = win32ui.CreateFont({
        "name": "Courier New",
        "height": 22,
        "weight": 400,
    })
    hDC.SelectObject(font)

    x = 100
    y = 100
    line_height = 28

    for line in text_lines:
        hDC.TextOut(x, y, line)
        y += line_height

    hDC.EndPage()
    hDC.EndDoc()
    hDC.DeleteDC()


@app.route("/print-receipt", methods=["POST"])
def print_receipt(): 
    try:
        data = request.json
        print("Received JSON:", data)

        if "amount_euro" not in data or data.get("amount_euro") is None:
            return jsonify({"success": False, "error": "Missing amount_euro"}), 400

        amount_euro = float(data["amount_euro"])
        amount_bg = round(amount_euro * EXCHANGE_RATE, 2)

        receipt = [
            "НПГ по КСТ ПРАВЕЦ при ТУ-СОФИЯ",
            "ПРАВЕЦ, ул. Перуша 4",
            "",
            f"Дата: {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}",
            f"Касиер: {data.get('cashier', '')}",
            "",
            f"Студент: {data.get('student_name', '')}",
            f"ЕГН: {data.get('egn', '')}",
            f"Клас: {data.get('class_num', '')}",
            f"Блок: {data.get('block', '')}  Стая: {data.get('room', '')}",
            "",
            f"Месеци: {data.get('months', '')}",
            "",
            f"Сума EUR: {amount_euro:.2f}",
            f"Сума BGN: {amount_bg:.2f}",
            f"Курс: 1 EUR = {EXCHANGE_RATE}",
            "",
            "Метод на плащане:",
            "В БРОЙ" if data.get("method") == "cash" else "ПО БАНКОВ ПЪТ",
            "",
            f"Фактура №: {data.get('invoice_num')}",
            "",
            "------------------------------",
            "БЛАГОДАРИМ ВИ!",
        ]

        print("Using printer:", PRINTER_NAME)
        print_text_windows(PRINTER_NAME, receipt)

        return jsonify({"success": True}), 200

    except Exception as e:
        print("PRINT ERROR:", e)
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("Using printer:", PRINTER_NAME)
    app.run(port=5001)
