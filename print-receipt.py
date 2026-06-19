import serial
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

COM_PORT = 'COM1'
BAUD_RATE = 115200
EXCHANGE_RATE = 1.95583
EXCHANGE_RATE_euro = 1

# Server Version: 1.3
current_seq = 0x20

def is_error_status(resp):
    """
    Check if the response status indicates an error.
    Standard Datecs SK1 Byte 0 Bit 0 is Error.
    """
    if not resp or len(resp) < 6:
        return False
    # STX(0), LEN(1), SEQ(2), CMD(3), [DATA], SEP(0x04)
    # Status Byte 0 is usually at the position after 0x04.
    try:
        idx_04 = resp.find(b'\x04')
        if idx_04 != -1 and len(resp) > idx_04 + 1:
            status_byte_0 = resp[idx_04 + 1]
            return (status_byte_0 & 0x01) != 0
    except:
        pass
    return False

def send_datecs_command(ser, command_hex, data_string=""):
    """
    Send command to Datecs printer - identical to blink_test.py but with
    ONE retry on failure using the SAME SEQ number (per the official protocol manual).
    """
    global current_seq

    data_bytes = data_string.encode('cp1251', errors='replace')
    length_val = 0x20 + 4 + len(data_bytes)

    # Build packet (identical to blink_test.py)
    packet_content = bytes([length_val, current_seq, command_hex]) + data_bytes + bytes([0x05])
    checksum = sum(packet_content)
    # The Datecs protocol expects HEX nibbles A-F to be mapped sequentially after '9' into ASCII 
    # ':' (0x3A), ';' (0x3B), '<' (0x3C), '=' (0x3D), '>' (0x3E), '?' (0x3F) instead of standard 'A'-'F'.
    cs_bytes = bytes([
        0x30 + ((checksum >> 12) & 0xF),
        0x30 + ((checksum >> 8) & 0xF),
        0x30 + ((checksum >> 4) & 0xF),
        0x30 + (checksum & 0xF)
    ])
    full_packet = bytes([0x01]) + packet_content + cs_bytes + bytes([0x03])

    print(f"OUT [Cmd {hex(command_hex)} | Seq {hex(current_seq)}]: {full_packet.hex().upper()}", flush=True)

    ser.write(full_packet)
    ser.flush()
    # time.sleep(0.05)  # Small delay to let the printer prepare its response

    # Wait for response (identical to blink_test.py: read_until with timeout=5)
    resp = ser.read_until(b'\x03')

    if resp:
        print(f"IN  [Cmd {hex(command_hex)}]: {resp.hex().upper()}", flush=True)
    else:
        # NO RESPONSE - retry ONCE with the SAME SEQ number
        # Per the protocol manual: "Host трябва да предаде съобщението отново 
        # със същия пореден номер и същата команда"
        print(f"IN  [Cmd {hex(command_hex)}]: NO RESPONSE - retrying same SEQ...", flush=True)
        
        # Drain any late/partial data that arrived after the timeout
        if ser.in_waiting > 0:
            stale = ser.read(ser.in_waiting)
            print(f"  [drained {len(stale)} stale bytes]", flush=True)
        
        # Resend same packet (same SEQ!)
        ser.write(full_packet)
        ser.flush()
        resp = ser.read_until(b'\x03')
        
        if resp:
            print(f"IN  [Cmd {hex(command_hex)}]: {resp.hex().upper()} (retry OK)", flush=True)
        else:
            print(f"IN  [Cmd {hex(command_hex)}]: NO RESPONSE after retry", flush=True)
            # Increment SEQ and return None to signal failure
            current_seq += 1
            if current_seq > 0x7F:
                current_seq = 0x20
            return None

    # NOW increment sequence for the next command (same as blink_test.py)
    current_seq += 1
    if current_seq > 0x7F:
        current_seq = 0x20

    # time.sleep(0.1)  # Give the printer enough time to process the command
    return resp


def print_to_datecs(data):
    """
    Print an official FISCAL receipt to Datecs printer.
    Expects data to be a dict with: student_name, egn, class_num, block, room, payments_list, amount_euro, method, cashier
    """
    global current_seq
    ser = None
    try:
        current_seq = 0x20
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=5)

        # 1. Close any stuck receipt
        send_datecs_command(ser, 0x27, "")

        # 2. Open Fiscal Receipt (Cmd 0x30)
        # Operator 1, Password 00000 (standard), Till 1
        send_datecs_command(ser, 0x30, "1,00000,1")

        # 3. Add Student Info as Free Text (Cmd 0x2A)
        # Note: 0x2A is for service text, inside a fiscal bone we use 0x36 for fiscal text
        # but 0x2A often works too. Let's try 0x36 for better compatibility inside fiscal bone.
        send_datecs_command(ser, 0x36, "КАСОВ БОН")
        send_datecs_command(ser, 0x36, f"НОМЕР: {data.get('invoice_num', '')}")
        send_datecs_command(ser, 0x36, f"ДАТА: {datetime.now().strftime('%d-%m-%Y %H:%M')}")
        send_datecs_command(ser, 0x36, f"КАСИЕР: {data.get('cashier', '')}")
        send_datecs_command(ser, 0x36, "--------------------------------")
        send_datecs_command(ser, 0x36, "ПОЛУЧЕНО ОТ:")
        send_datecs_command(ser, 0x36, data.get('student_name', '').upper()[:40])
        raw_egn = str(data.get('egn', ''))
        masked_egn = raw_egn[:-4] + "****" if len(raw_egn) >= 4 else raw_egn
        send_datecs_command(ser, 0x36, f"ЕГН: {masked_egn}")
        send_datecs_command(ser, 0x36, f"КУРСОВ НОМЕР: {data.get('class_num', '')}")
        send_datecs_command(ser, 0x36, f"БЛОК: {data.get('block', '')} СТАЯ: {data.get('room', '')}")
        send_datecs_command(ser, 0x36, "--------------------------------")

        # 4. Register each payment as an item (Cmd 0x31)
        # Format: <Name>\t<TaxGroup><Price>*<Quantity>
        payments = data.get('payments_list', [])
        total_due_euro = 0.0
        for m in payments:
            name = m['month_name'].upper()
            year = str(m['year'])
            days = m.get('days', 0)
            
            if name.startswith("ДОП.") or name.startswith("ДОП:"):
                item_label = name
            else:
                item_label = f"НАЕМ {name} {year} ({days} ДНИ)"
            
            # 1. Print Name/Year/Days as Fiscal Text (Line 1)
            send_datecs_command(ser, 0x36, item_label)
            
            # 2. Register Sale (Line 2)
            # We send the Euro amount as the price because the printer is configured
            # in dual-currency mode and handles the BGN conversion automatically in the footer.
            eur_val = float(m['amount_paid'])
            eur_text = f"{eur_val:.2f} EUR"
            
            fiscal_data = f"{eur_text}\tA{eur_val:.2f}"
            send_datecs_command(ser, 0x31, fiscal_data)
            total_due_euro += eur_val
            time.sleep(0.1)

        # 6. Payment (Cmd 0x35)
        # 0=Cash BGN, 1=Card BGN, 3=Bank BGN, 4=Cash EUR
        pay_type = '0' 
        if data.get('method') == 'card': pay_type = '1'
        elif data.get('method') == 'bank_transfer': pay_type = '3'
        
        received_euro = float(data.get('received_amount', 0))
        
        # If payment is cash, use the Euro-specific type (4) and send the Euro amount directly.
        # For other types (card/bank), we continue to use BGN (converted).
        if pay_type == '0':
            pay_type = '4'
            payment_amount = received_euro
        else:
            payment_amount = round(received_euro * EXCHANGE_RATE, 2)
        
        # Protocol syntax for 0x35: <Type><TAB><Amount>
        # Always send the amount for EUR cash (Type 4) to ensure "РЕСТО В ЕВРО" is printed.
        if pay_type == '4' or received_euro > (total_due_euro + 0.005):
            send_datecs_command(ser, 0x35, f"{pay_type}\t{payment_amount:.2f}")
        else:
            send_datecs_command(ser, 0x35, f"{pay_type}")
        
        time.sleep(0.1)

        # 7. CLOSE FISCAL RECEIPT (Cmd 0x38) - MANDATORY
        send_datecs_command(ser, 0x38, "")

        ser.close()
        print("Fiscal print job finished.", flush=True)

    except Exception as e:
        print(f"Hardware Error: {e}", flush=True)
        if ser and ser.is_open:
            ser.close()
        raise e


@app.route("/print-receipt", methods=["POST"])
def print_receipt():
    try:
        data = request.json
        print_to_datecs(data)
        return jsonify({"success": True}), 200

    except Exception as e:
        print(f"API Error: {e}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/z-report", methods=["POST"])
def z_report():
    print("Z-REPORT REQUESTED (v1.2)", flush=True)
    global current_seq
    ser = None
    try:
        current_seq = 0x20
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=5)
        
        # 1. Cleanup any open receipts
        print("Cleaning up printer state...", flush=True)
        send_datecs_command(ser, 0x3C, "") # Abort fiscal
        send_datecs_command(ser, 0x27, "") # Close service
        time.sleep(0.5)

        # 2. Try Z-Report variations
        # According to the protocol, '0' is Z-Report and '1' is X-Report.
        print("Trying Z-Report (cmd 0x45, '0')...", flush=True)
        resp = send_datecs_command(ser, 0x45, "0")
        
        if resp and is_error_status(resp):
            print(f"Option '0' failed (Error). Trying 'p'...", flush=True)
            resp = send_datecs_command(ser, 0x45, "p")

        if resp and is_error_status(resp):
            print(f"Option 'p' failed. Trying '0,p'...", flush=True)
            resp = send_datecs_command(ser, 0x45, "0,p")

        if resp and is_error_status(resp):
             print(f"Option '0,p' failed. Trying empty data...", flush=True)
             resp = send_datecs_command(ser, 0x45, "")

        ser.close()
        if resp:
            success = not is_error_status(resp)
            return jsonify({
                "success": success, 
                "status": resp.hex().upper(),
                "error": "Printer reported error status (A9?)" if not success else None
            }), 200
        else:
            return jsonify({"success": False, "error": "No response from printer"}), 500
    except Exception as e:
        print(f"Z-Report API Error: {e}", flush=True)
        if ser and ser.is_open:
            ser.close()
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/sync-time", methods=["POST"])
def sync_time():
    print("SYNC TIME REQUESTED", flush=True)
    global current_seq
    ser = None
    try:
        current_seq = 0x20
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=5)
        # 1. Cleanup
        send_datecs_command(ser, 0x3C, "") # Abort fiscal
        send_datecs_command(ser, 0x27, "") # Close service
        time.sleep(0.5)

        # 2. Set Time DD-MM-YY HH:MM:SS
        now = datetime.now()
        time_str = now.strftime("%d-%m-%y %H:%M:%S")
        print(f"Setting printer time to: {time_str}", flush=True)
        resp = send_datecs_command(ser, 0x3D, time_str)
        ser.close()
        if resp:
            success = not is_error_status(resp)
            return jsonify({"success": success, "status": resp.hex().upper()}), 200
        else:
            return jsonify({"success": False, "error": "No response from printer"}), 500
    except Exception as e:
        print(f"Sync Time API Error: {e}", flush=True)
        if ser and ser.is_open:
            ser.close()
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    print("Starting print-receipt server v1.3", flush=True)
    app.run(port=5001)