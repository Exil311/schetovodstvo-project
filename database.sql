CREATE DATABASE IF NOT EXISTS shchetovodstvo;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('admin', 'owner')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, password, role) VALUES 
('admin', 'admin123', 'admin'),
('owner', 'owner123', 'owner')
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS family_statuses (
    id SERIAL PRIMARY KEY,
    status_name VARCHAR(100) NOT NULL UNIQUE,
    discount_percentage INT NOT NULL DEFAULT 0
);

INSERT INTO family_statuses (status_name, discount_percentage) VALUES  
('инвалид 1ва група', 100),
('инвалид 2ра група', 71),
('инвалид 3та група', 51),
('сирак без 2ма родители', 30),
('самотна майка с деца', 100),
('полусирак', 70),
('от многодетно семейство', 100),
('нормален', 0)
ON CONFLICT (status_name) DO UPDATE SET status_name = EXCLUDED.status_name;

CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    room_number VARCHAR(10) NOT NULL,
    block VARCHAR(10) CHECK (block IN ('1', '2')) NOT NULL,
    capacity INT CHECK (capacity IN (2, 3)) NOT NULL,
    is_in_use BOOLEAN DEFAULT TRUE,
    has_problem BOOLEAN DEFAULT FALSE,
    problem_details TEXT
);

INSERT INTO rooms (room_number, block, capacity) VALUES 
-- Block 1 (18 rooms on floor 1)
('101', '1', 3), ('102', '1', 2), ('103', '1', 3), ('104', '1', 2), ('105', '1', 3), ('106', '1', 2),
('107', '1', 3), ('108', '1', 2), ('109', '1', 3), ('110', '1', 2), ('111', '1', 3), ('112', '1', 2),
('113', '1', 3), ('114', '1', 2), ('115', '1', 3), ('116', '1', 2), ('117', '1', 3), ('118', '1', 2),
-- Block 2 (18 rooms on floor 2)
('201', '2', 3), ('202', '2', 2), ('203', '2', 3), ('204', '2', 2), ('205', '2', 3), ('206', '2', 2),
('207', '2', 3), ('208', '2', 2), ('209', '2', 3), ('210', '2', 2), ('211', '2', 3), ('212', '2', 2),
('213', '2', 3), ('214', '2', 2), ('215', '2', 3), ('216', '2', 2), ('217', '2', 3), ('218', '2', 2),
-- Block 1 (18 rooms on floor 3)
('301', '1', 3), ('302', '1', 2), ('303', '1', 3), ('304', '1', 2), ('305', '1', 3), ('306', '1', 2),
('307', '1', 3), ('308', '1', 2), ('309', '1', 3), ('310', '1', 2), ('311', '1', 3), ('312', '1', 2),
('313', '1', 3), ('314', '1', 2), ('315', '1', 3), ('316', '1', 2), ('317', '1', 3), ('318', '1', 2),
-- Block 1 (18 rooms on floor 4)
('401', '1', 3), ('402', '1', 2), ('403', '1', 3), ('404', '1', 2), ('405', '1', 3), ('406', '1', 2),
('407', '1', 3), ('408', '1', 2), ('409', '1', 3), ('410', '1', 2), ('411', '1', 3), ('412', '1', 2),
('413', '1', 3), ('414', '1', 2), ('415', '1', 3), ('416', '1', 2), ('417', '1', 3), ('418', '1', 2)
ON CONFLICT (room_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(50) NOT NULL,
    egn VARCHAR(10) NOT NULL UNIQUE,
    class_number VARCHAR(10) NOT NULL UNIQUE,
    from_address TEXT NOT NULL,
    phone VARCHAR(20),
    parent_phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    sex VARCHAR(10) CHECK (sex IN ('male', 'female')) NOT NULL,
    family_status_id INT NOT NULL REFERENCES family_statuses(id),
    punishments INT NOT NULL DEFAULT 0,
    block VARCHAR(10) CHECK (block IN ('1', '2')) NOT NULL,
    room_id INT NOT NULL REFERENCES rooms(id),
    fee DECIMAL(10, 6) NOT NULL DEFAULT 11.00,
    payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'bank transfer', 'bank_transfer')) NOT NULL DEFAULT 'cash',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    previous_fee DECIMAL(10, 6),
    fee_changed_at TIMESTAMP,
    is_assigned BOOLEAN DEFAULT TRUE
);

INSERT INTO students (first_name, last_name, egn, class_number, from_address, phone, parent_phone, email, sex, family_status_id, punishments, block, room_id, fee, payment_method, notes) VALUES
('Иван',    'Иванов',    '0000000001', '10001', 'гр. Град, ул. Улица 1',       '0888000001', '0888000002', 'ivan@example.com',    'male',   8, 0, '1', 1,  11.00, 'cash',          NULL),
('Мария',   'Маринова',  '0000000002', '10002', 'гр. Град, ул. Улица 2',      '0888000003', '0888000004', 'maria@example.com',   'female', 8, 0, '1', 2,  11.00, 'cash',          NULL),
('Георги',  'Георгиев',  '0000000003', '10003', 'гр. Град, ул. Улица 3',   '0888000005', '0888000006', 'georgi@example.com', 'male',   6, 1, '1', 3,  7.70,  'bank transfer', 'полусирак'),
('Елена',   'Еленова',   '0000000004', '10004', 'гр. Град, ул. Улица 4',       '0888000007', '0888000008', NULL,                     'female', 5, 0, '1', 4,  0.00,  'cash',          'самотна майка с деца'),
('Николай', 'Николов',   '0000000005', '10005', 'гр. Град, ул. Улица 5',  '0888000009', '0888000010', NULL,                     'male',   8, 2, '1', 5,  11.00, 'cash',          NULL),
('Десислава','Колева',   '0000000006', '10006', 'гр. Град, ул. Улица 6',         '0888000011', '0888000012', 'desi@example.com',  'female', 7, 0, '1', 6,  11.00, 'bank transfer', 'от многодетно семейство'),
('Стефан',  'Стефанов',  '0000000007', '10007', 'гр. Град, ул. Улица 7', '0888000013', '0888000014', NULL,               'male',   4, 0, '2', 19, 3.30,  'cash',          'сирак без 2ма родители')
ON CONFLICT (egn) DO NOTHING;

CREATE TABLE IF NOT EXISTS months (
    id SERIAL PRIMARY KEY,
    month_name VARCHAR(20) NOT NULL UNIQUE,
    fee_multiplier DECIMAL(5 , 2) NOT NULL DEFAULT 1.00
);

INSERT INTO months (month_name, fee_multiplier) VALUES 
('Януари', 30.00),
('Февруари', 30.00),
('Март', 30.00),
('Април', 30.00),
('Май', 30.00),
('Юни', 30.00),
('Юли', 30.00),
('Август', 30.00),
('Септември', 30.00),
('Октомври', 30.00),
('Ноември', 30.00),
('Декември', 30.00)
ON CONFLICT (month_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS student_payments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id),
    month_id INT NOT NULL REFERENCES months(id),
    year INT NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    payment_date TIMESTAMP,
    payment_method VARCHAR(20),
    amount_paid DECIMAL(10, 2),
    room_id INT REFERENCES rooms(id),
    date_from DATE,
    date_to DATE,
    days_paid DECIMAL(10, 2) DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_student_month_year ON student_payments (student_id, month_id, year) WHERE date_from IS NULL;

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES 
('base_fee', '11.00'),
('small_room_fee', '11.00'),
('large_room_fee', '10.00'),
('report_template_id', NULL),
('report_footer_template_id', NULL),
('assignment_template_id', NULL)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS student_assignments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id),
    action VARCHAR(20) CHECK (action IN ('assigned', 'unassigned')) NOT NULL,
    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);