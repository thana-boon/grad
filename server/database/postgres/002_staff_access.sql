-- =============================================================================
-- staff_access — รายชื่อครูที่ได้รับสิทธิ์เข้าใช้ GradTrack (allowlist)
-- =============================================================================
-- กฎเหล็กเดียวกับ 001: ADDITIVE เท่านั้น · IF NOT EXISTS ทุกที่ (รันซ้ำทุกสตาร์ท)
--
-- เดิมครูทุกคนใน SchoolOS ล็อกอินเข้ามาได้เอง และ role มาจาก SchoolOS ตรง ๆ
-- (teacher-admin → admin, ที่เหลือ → อ่านอย่างเดียว) ตารางนี้ย้ายการตัดสินใจ
-- มาไว้ที่ผู้ดูแลของ GradTrack แทน — เพิ่มใครเข้ามาก็เลือก role ให้ตรงนั้นเลย
--
-- ⚠️  ตารางว่าง = ยังไม่เปิดใช้ allowlist → ระบบกลับไปทำงานแบบเดิม (ครูทุกคนเข้าได้)
--     จงใจให้ fail-open เฉพาะตอนว่างเปล่า เพราะถ้า fail-closed ตั้งแต่ deploy แรก
--     จะไม่มีใครล็อกอินเข้ามาเพิ่มรายชื่อได้เลย — ล็อกทั้งโรงเรียนออกนอกระบบพร้อมกัน
--     (ทางเข้าสำรองที่เหลือคือบัญชี local ซึ่งไม่ผ่านตารางนี้)
--
-- teacher_code = รหัสครูจาก SchoolOS ใช้เป็น key เพราะเป็นตัวที่ /auth/verify
-- ตอบกลับมาตอนล็อกอิน (field "code") ส่วน sos_id เก็บไว้เทียบสำรองเผื่อโรงเรียน
-- แก้รหัสครูภายหลัง
-- =============================================================================

CREATE TABLE IF NOT EXISTS staff_access (
  teacher_code  VARCHAR(50)  PRIMARY KEY,
  sos_id        VARCHAR(64),
  name          VARCHAR(200) NOT NULL DEFAULT '',
  email         VARCHAR(200),
  subject_group VARCHAR(200),
  -- admin = แก้ไขข้อมูลได้ · teacher = เข้าดูอย่างเดียว
  role          VARCHAR(20)  NOT NULL DEFAULT 'teacher',
  -- username ของคนที่กดเพิ่ม — ไว้ตามย้อนหลังว่าใครให้สิทธิ์ใคร
  added_by      VARCHAR(100) NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_access_sos_id ON staff_access (sos_id);

CREATE OR REPLACE TRIGGER trg_staff_access_updated_at BEFORE UPDATE ON staff_access
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
