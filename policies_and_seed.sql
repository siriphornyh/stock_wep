-- ============================================================
--  RLS POLICIES + SEED DATA
--  รันไฟล์นี้ "หลังจาก" รัน supabase_schema.sql แล้วเท่านั้น
--
--  หมายเหตุ: เว็บแอปนี้เชื่อมต่อด้วย anon key ฝั่ง browser โดยตรง (ไม่มี
--  Supabase Auth จริง ยังคงพฤติกรรมเดิมคือเช็ครหัสผ่านเดียวจากตาราง config)
--  Policy ด้านล่างจึงเปิดให้ anon อ่าน/เขียนได้ทุกตาราง เพื่อให้ระบบทำงานได้
--  เหมือนต้นฉบับ — ถ้าต้องการความปลอดภัยที่สูงขึ้นในการใช้งานจริง ควรพิจารณา
--  ย้าย logic การเขียนข้อมูลไปไว้หลัง Supabase Edge Function + service_role key แทน
-- ============================================================

ALTER TABLE config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_list     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_receive    ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_issue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_receive   ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_issue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_receive  ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_issue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_receive   ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_issue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_receive   ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE machine_receive  ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE medicine_receive ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE uniform_receive  ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) DEFAULT 0;

CREATE POLICY anon_all ON config            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON employee_list     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON admin_logs        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON departments       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON employees         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON master_products   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON office_receive    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON office_issue      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON machine_receive   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON machine_issue     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON medicine_receive  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON medicine_issue    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON uniform_receive   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON uniform_issue     FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
--  SEED: ค่าเริ่มต้น (เหมือน setupSheets() เดิม)
-- ============================================================
INSERT INTO config (id, system_password, admin_name_last_login, setup_done)
VALUES (true, '123456', '', 'YES')
ON CONFLICT (id) DO NOTHING;

INSERT INTO employee_list (admin_name) VALUES
  ('จีมอ'), ('หญิง'), ('admin1'), ('admin2');

-- ============================================================
--  STORAGE BUCKET สำหรับรูปสินค้า (ทำผ่าน Dashboard หรือรันคำสั่งนี้ก็ได้)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY anon_storage_all ON storage.objects
  FOR ALL USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');
