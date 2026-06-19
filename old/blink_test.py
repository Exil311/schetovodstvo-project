import serial
import time

COM_PORT = 'COM1'
BAUD_RATE = 115200

# THE FIX: Global sequence counter starting at 0x20
current_seq = 0x20

def send_datecs_command(ser, command_hex, data_string=""):
    global current_seq
    
    data_bytes = data_string.encode('cp1251')
    length_val = 0x20 + 4 + len(data_bytes)
    
    # Use current_seq instead of hardcoded 0x20
    packet_content = bytes([length_val, current_seq, command_hex]) + data_bytes + bytes([0x05])
    checksum = sum(packet_content)
    cs_bytes = bytes([
        0x30 + ((checksum >> 12) & 0xF),
        0x30 + ((checksum >> 8) & 0xF),
        0x30 + ((checksum >> 4) & 0xF),
        0x30 + (checksum & 0xF)
    ])
    
    full_packet = bytes([0x01]) + packet_content + cs_bytes + bytes([0x03])
    
    print(f"OUT [Cmd {hex(command_hex)} | Seq {hex(current_seq)}]: {full_packet.hex().upper()}")
    
    ser.write(full_packet)
    ser.flush()
    
    # INCREMENT SEQUENCE for the next command (Loops back to 0x20 after 0x7F)
    current_seq += 1
    if current_seq > 0x7F:
        current_seq = 0x20
        
    # Wait for response (Timeout increased to 5s to allow paper feeding and logo printing)
    resp = ser.read_until(b'\x03')
    
    if resp:
        print(f"IN  [Cmd {hex(command_hex)}]: {resp.hex().upper()}\n")
    else:
        print(f"IN  [Cmd {hex(command_hex)}]: NO RESPONSE\n")
        
    time.sleep(0.1) # Small delay to give the physical printer head time to rest
    return resp

def test_print():
    print(f"Connecting to {COM_PORT}...")
    try:
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=5)
        
        # 1. Close any stuck receipt just in case
        send_datecs_command(ser, 0x27, "")
        
        # 2. Open Non-Fiscal (Service) Receipt
        send_datecs_command(ser, 0x26, "")
        
        # 3. Print Text
        send_datecs_command(ser, 0x2A, "========================")
        send_datecs_command(ser, 0x2A, "      HELLO WORLD!      ")
        send_datecs_command(ser, 0x2A, " PRINTER IS CONNECTED!  ")
        send_datecs_command(ser, 0x2A, "========================")
        
        # 4. Close Non-Fiscal Receipt (This triggers the paper cut!)
        send_datecs_command(ser, 0x27, "")
        
        ser.close()
        print("✅ Print sequence finished successfully!")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    test_print()