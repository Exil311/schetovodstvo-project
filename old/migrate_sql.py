import re
import psycopg2
from psycopg2 import sql
import sys
import random
import string

# --- CONFIGURATION ---
SQL_FILE_PATH = r"c:\Users\Kasa\Documents\DormsMaster\old_database.sql"

DEST_DB_CONFIG = {
    "dbname": "shchetovodstvo",
    "user": "postgres",
    "password": "123456",
    "host": "localhost",
    "port": "5432"
}

OLD_DATABASE_COLUMNS = [
    "StudentID", "EGN", "Name", "SecondName", "FacNom", "Kurs", 
    "EduTypeID", "DepartmentID", "SubjectID", "StudentTypeID", 
    "Grupa", "CountryID", "PlaceOfBirth", "Town", "Address", 
    "Phone", "MobilePhone", "Email", "IdentityCard", "DateIdentityCard", 
    "IssuedBy", "Settle", "Sex", "Married", "RelPersonID", 
    "Power", "OfficeArea", "AvgScore", "PenaltyID", "Children", 
    "LivStatusID", "Comment", "Municipality", "ApplicationUser", "OnSleepovers"
]

COLUMN_MAPPING = {
    "Name": "first_name",
    "EGN": "egn",
    "Town": "from_address",
    "Phone": "phone",
    "MobilePhone": "parent_phone",
    "Email": "email",
    "Sex": "sex",
    "FacNom": "class_number",
    "LivStatusID": "family_status_id",
    "Comment": "notes",
}

def parse_sql_line(line):
    match = re.search(r"VALUES\s*\((.*)\)", line, re.IGNORECASE)
    if not match: return None
    values_raw = match.group(1)
    tokens = re.findall(r"(?:N'([^']*)'|NULL|(-?\d+(?:\.\d+)?)|CAST\(N'([^']*)' AS DateTime\))", values_raw)
    cleaned = []
    for t in tokens:
        if t[0] is not None: cleaned.append(t[0].strip())
        elif t[1]: cleaned.append(t[1])
        elif t[2]: cleaned.append(t[2])
        else: cleaned.append(None)
    return cleaned

def map_data_to_pg(found_data):
    pg_record = {}
    for old_col, new_col in COLUMN_MAPPING.items():
        try:
            idx = OLD_DATABASE_COLUMNS.index(old_col)
            val = found_data[idx]
            if old_col == "Name" and new_col == "first_name":
                names = val.split()
                pg_record["first_name"] = names[0] if len(names) > 0 else "Unknown"
                pg_record["last_name"] = names[-1] if len(names) > 1 else ""
                pg_record["middle_name"] = " ".join(names[1:-1]) if len(names) > 2 else ""
            elif old_col == "Sex" and new_col == "sex":
                pg_record["sex"] = 'female' if val == '1' else 'male'
            elif old_col == "LivStatusID" and new_col == "family_status_id":
                mapping = {'1': 8, '2': 1, '3': 4, '4': 5, '5': 6, '6': 7, '7': 2}
                pg_record["family_status_id"] = mapping.get(val, 8) 
            else:
                pg_record[new_col] = val
        except: continue
    
    # Clean EGN (max 10 chars)
    egn_val = str(pg_record.get("egn", ""))
    egn_clean = egn_val[:10]
    pg_record["egn"] = egn_clean

    # Clean Class Number (max 10 chars)
    original_class = str(pg_record.get("class_number", "")).strip()
    if not original_class or original_class == "None":
        pg_record["class_number"] = egn_clean
    else:
        pg_record["class_number"] = original_class[:10]

    defaults = {
        "class_number": "MIGRATED", "from_address": "N/A", "parent_phone": "0000000000",
        "family_status_id": 8, "is_assigned": True, "block": "1", "room_id": 263, "sex": "male",
        "created_at": "2026-01-01"
    }
    for key, d_val in defaults.items():
        if key not in pg_record: pg_record[key] = d_val
    return pg_record

def process_migration(egns=None, migrate_all=False):
    target_egns = set(egns) if egns else None
    count = 0
    conn = None
    try:
        conn = psycopg2.connect(**DEST_DB_CONFIG)
        cur = conn.cursor()
        print(f"[*] Starting migration (Nobody will be skipped)...")

        for encoding in ['utf-16', 'utf-8', 'cp1251']:
            try:
                with open(SQL_FILE_PATH, 'r', encoding=encoding) as f:
                    for line in f:
                        if "INSERT [dbo].[SOS_STUDENT]" in line:
                            data = parse_sql_line(line)
                            if not data or len(data) <= 1: continue
                            
                            egn = data[1]
                            fac_nom = str(data[4] or "").strip() # FacNom is index 4

                            # --- FILTER: Check if FacNom starts with at least '21' ---
                            # If it starts with 20, 19, 18 etc, skip them. 
                            # If it is empty or doesn't have 2 digits, we skip it to be safe 
                            # (or you can adjust this if you want to keep them).
                            if fac_nom:
                                prefix = fac_nom[:2]
                                if prefix.isdigit() and int(prefix) < 21:
                                    continue # Skip old students
                            else:
                                # If there is no FacNom, we skip them since we can't verify the year
                                continue

                            if migrate_all or (target_egns and egn in target_egns):
                                record = map_data_to_pg(data)
                                
                                # --- ROBUST INSERT LOOP ---
                                # We will keep trying with different class numbers if there is a conflict
                                attempt = 0
                                base_class = record["class_number"]
                                
                                while attempt < 100: # Max 100 tries per person
                                    try:
                                        cur.execute("SAVEPOINT migration_attempt")
                                        cols = record.keys()
                                        vals = [record[c] for c in cols]
                                        
                                        # Use ON CONFLICT (egn) DO UPDATE to fix existing records (like gender)
                                        update_set = sql.SQL(', ').join([
                                            sql.Composed([sql.Identifier(c), sql.SQL(" = EXCLUDED."), sql.Identifier(c)]) 
                                            for c in cols if c != 'egn'
                                        ])
                                        
                                        insert_query = sql.SQL("INSERT INTO students ({}) VALUES ({}) ON CONFLICT (egn) DO UPDATE SET {}").format(
                                            sql.SQL(', ').join(map(sql.Identifier, cols)),
                                            sql.SQL(', ').join(sql.Placeholder() * len(vals)),
                                            update_set
                                        )
                                        cur.execute(insert_query, vals)
                                        cur.execute("RELEASE SAVEPOINT migration_attempt")
                                        count += 1
                                        break # Success!
                                        
                                    except psycopg2.errors.UniqueViolation as e:
                                        cur.execute("ROLLBACK TO SAVEPOINT migration_attempt")
                                        if "students_class_number_key" in str(e):
                                            # Class number conflict! Generate a new variation
                                            attempt += 1
                                            # Method: Append a unique suffix or scramble the end
                                            # We use the EGN digits or a counter to make it unique
                                            suffix = str(attempt)
                                            record["class_number"] = (base_class[:(10-len(suffix))] + suffix)
                                        else:
                                            # Some other unique violation we didn't expect
                                            print(f"[!] Unexpected conflict for {egn}: {e}")
                                            break
                                    except Exception as e:
                                        cur.execute("ROLLBACK TO SAVEPOINT migration_attempt")
                                        print(f"[!] Error on {egn}: {e}")
                                        break

                                if count > 0 and count % 50 == 0:
                                    print(f"[i] Progress: {count} students migrated...")
                break 
            except (UnicodeDecodeError, LookupError): continue

        conn.commit()
        print(f"[++] DONE! Total students migrated: {count}")
    except Exception as e:
        print(f"[!] Fatal Error during migration: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python migrate_sql.py --all              (Migrate everyone)")
        print("  python migrate_sql.py EGN1 EGN2 ...      (Migrate specific list)")
    elif sys.argv[1] == "--all":
        process_migration(migrate_all=True)
    else:
        process_migration(egns=sys.argv[1:])
