-- ============================================================
--  SUPABASE (PostgreSQL) SCHEMA
--  Migrated from Google Apps Script setupSheets() (Stock Management v6.x)
-- ============================================================

-- ============================================================
--  DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
    department_name TEXT PRIMARY KEY
);

-- ============================================================
--  EMPLOYEES
-- ============================================================
CREATE TABLE employees (
    emp_code    TEXT PRIMARY KEY,
    emp_name    TEXT NOT NULL,
    department  TEXT REFERENCES departments (department_name)
                ON UPDATE CASCADE ON DELETE SET NULL
);

-- ============================================================
--  EMPLOYEE_LIST (รายชื่อแอดมิน)
-- ============================================================
CREATE TABLE employee_list (
    id          BIGSERIAL PRIMARY KEY,
    admin_name  TEXT NOT NULL
);

-- ============================================================
--  CONFIG (singleton row)
-- ============================================================
CREATE TABLE config (
    id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT config_singleton CHECK (id),
    system_password         TEXT NOT NULL,
    admin_name_last_login   TEXT,
    setup_done              TEXT NOT NULL DEFAULT 'YES'
);

-- ============================================================
--  ADMIN_LOGS
-- ============================================================
CREATE TABLE admin_logs (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    admin_name  TEXT NOT NULL,
    activity    TEXT NOT NULL,
    detail      TEXT
);

-- ============================================================
--  MASTER_PRODUCTS
-- ============================================================
CREATE TABLE master_products (
    item_code       TEXT PRIMARY KEY,
    stock_type      TEXT NOT NULL,
    category        TEXT,
    item_name       TEXT NOT NULL,
    unit            TEXT,
    min_stock       INTEGER DEFAULT 0,
    image_url       TEXT,
    extra1          TEXT,
    extra2          TEXT,
    price           DECIMAL(12, 2) DEFAULT 0,
    deduct_salary   TEXT DEFAULT 'N',   -- 'Y' / 'N'
    aliases         TEXT,
    verified        TEXT DEFAULT 'N'    -- 'Y' / 'N'
);

-- ============================================================
--  OFFICE_RECEIVE
-- ============================================================
CREATE TABLE office_receive (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    recorded_by     TEXT NOT NULL,
    note            TEXT
);

-- ============================================================
--  OFFICE_ISSUE
-- ============================================================
CREATE TABLE office_issue (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    emp_code        TEXT REFERENCES employees (emp_code)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    emp_name        TEXT,
    department      TEXT REFERENCES departments (department_name)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    note            TEXT,
    recorded_by     TEXT NOT NULL,
    price_snapshot  DECIMAL(12, 2) DEFAULT 0
);

-- ============================================================
--  MACHINE_RECEIVE
-- ============================================================
CREATE TABLE machine_receive (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    recorded_by     TEXT NOT NULL,
    note            TEXT
);

-- ============================================================
--  MACHINE_ISSUE
-- ============================================================
CREATE TABLE machine_issue (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    emp_code        TEXT REFERENCES employees (emp_code)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    emp_name        TEXT,
    department      TEXT REFERENCES departments (department_name)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    machine_code    TEXT,
    issue_type      TEXT,
    note            TEXT,
    recorded_by     TEXT NOT NULL,
    price_snapshot  DECIMAL(12, 2) DEFAULT 0
);

-- ============================================================
--  MEDICINE_RECEIVE
-- ============================================================
CREATE TABLE medicine_receive (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    recorded_by     TEXT NOT NULL,
    note            TEXT
);

-- ============================================================
--  MEDICINE_ISSUE
-- ============================================================
CREATE TABLE medicine_issue (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    emp_code        TEXT REFERENCES employees (emp_code)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    emp_name        TEXT,
    department      TEXT REFERENCES departments (department_name)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    symptom         TEXT,
    note            TEXT,
    recorded_by     TEXT NOT NULL,
    price_snapshot  DECIMAL(12, 2) DEFAULT 0
);

-- ============================================================
--  UNIFORM_RECEIVE
-- ============================================================
CREATE TABLE uniform_receive (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    recorded_by     TEXT NOT NULL,
    note            TEXT
);

-- ============================================================
--  UNIFORM_ISSUE
-- ============================================================
CREATE TABLE uniform_issue (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date            DATE NOT NULL,
    item_code       TEXT NOT NULL REFERENCES master_products (item_code)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    item_name       TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    emp_code        TEXT REFERENCES employees (emp_code)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    emp_name        TEXT,
    department      TEXT REFERENCES departments (department_name)
                    ON UPDATE CASCADE ON DELETE SET NULL,
    issue_type      TEXT,
    note            TEXT,
    recorded_by     TEXT NOT NULL,
    price_snapshot  DECIMAL(12, 2) DEFAULT 0
);

-- ============================================================
--  INDEXES (เพื่อเร่งความเร็ว JOIN / ค้นหา)
-- ============================================================
CREATE INDEX idx_office_receive_item_code    ON office_receive (item_code);
CREATE INDEX idx_office_issue_item_code      ON office_issue (item_code);
CREATE INDEX idx_office_issue_emp_code       ON office_issue (emp_code);

CREATE INDEX idx_machine_receive_item_code   ON machine_receive (item_code);
CREATE INDEX idx_machine_issue_item_code     ON machine_issue (item_code);
CREATE INDEX idx_machine_issue_emp_code      ON machine_issue (emp_code);

CREATE INDEX idx_medicine_receive_item_code  ON medicine_receive (item_code);
CREATE INDEX idx_medicine_issue_item_code    ON medicine_issue (item_code);
CREATE INDEX idx_medicine_issue_emp_code     ON medicine_issue (emp_code);

CREATE INDEX idx_uniform_receive_item_code   ON uniform_receive (item_code);
CREATE INDEX idx_uniform_issue_item_code     ON uniform_issue (item_code);
CREATE INDEX idx_uniform_issue_emp_code      ON uniform_issue (emp_code);

CREATE INDEX idx_employees_department        ON employees (department);
CREATE INDEX idx_admin_logs_timestamp         ON admin_logs (timestamp);
