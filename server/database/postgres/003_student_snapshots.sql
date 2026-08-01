-- =============================================================================
-- student_snapshots — สำเนาชื่อ/ชั้น/ห้อง ของนักเรียนแยกตามปีการศึกษา
-- =============================================================================
-- กฎเหล็กเดียวกับ 001: ADDITIVE เท่านั้น · IF NOT EXISTS ทุกที่ (รันซ้ำทุกสตาร์ท)
--
-- ทำไมต้องเก็บซ้ำในเมื่อ SchoolOS มีข้อมูลอยู่แล้ว:
--
--   1. /students เป็น inner join กับ enrollment ของปีที่ถาม (API.md §5.3)
--      พอ SchoolOS สลับปี active (ราวกลางเดือน พ.ค.) รุ่นที่จบไปเมื่อ มี.ค.
--      จะหายจากทุก query ที่ไม่ได้ระบุ yearId ทันที — รวมถึง ?q= ที่ใช้ค้นรายคน
--   2. ถ้าผู้ดูแล SchoolOS "ย้ายเข้ากรุ" (§5.4) รุ่นนั้นจะหายจากทุก endpoint ถาวร
--      เราสั่งอะไรไม่ได้เลย และรายงานย้อนหลังจะเหลือแต่รหัสนักเรียนลอย ๆ
--   3. ไล่ยิงรายคนทั้งรุ่นเพื่อ resolve ชื่อ ชนเพดาน 600 req/ชม. ของ API ได้ง่าย
--
-- GradTrack เป็นระบบ "บันทึกว่าใครจบไปแล้วสอบติดที่ไหน" — ข้อมูลรุ่นเก่าคือของหลัก
-- ไม่ใช่ของแถม จึงต้องมีสำเนาของตัวเอง ไม่ผูกชะตากับอายุข้อมูลฝั่ง SchoolOS
--
-- 1 แถว = 1 คน ต่อ 1 ปี (คนหนึ่งมีหลายแถว ปีละแถว) เขียนทับได้เรื่อย ๆ ตราบใดที่
-- ยังเห็นข้อมูลจาก API — แถวของปีที่ผ่านไปแล้วจะค้างเป็นสำเนาสุดท้ายที่เคยเห็น
--
-- class_room / number_in_room เก็บเป็นข้อความตาม API.md §4.2 (`"5"` ไม่ใช่ `5`)
-- ค่าที่โรงเรียนกรอกเป็น "1/2" หรือเว้นว่างจะได้ไม่ตกหล่นตอนแปลงชนิด
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_snapshots (
  student_code   VARCHAR(20)  NOT NULL,
  year_id        INTEGER      NOT NULL,       -- id ปีการศึกษาฝั่ง SchoolOS
  schoolos_id    INTEGER,                     -- id ตัวจริงของนักเรียน (API.md ข้อ 1)
  year_be        VARCHAR(10),                 -- พ.ศ. ไว้แสดงผลโดยไม่ต้อง join
  title_prefix   VARCHAR(50)  NOT NULL DEFAULT '',
  first_name     VARCHAR(200) NOT NULL DEFAULT '',
  last_name      VARCHAR(200) NOT NULL DEFAULT '',
  class_level    VARCHAR(20),
  class_room     VARCHAR(20),
  number_in_room VARCHAR(20),
  status         VARCHAR(30),                 -- studying / withdrawn / graduated
  seen_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_code, year_id)
);

-- ดึงรายชื่อทั้งรุ่น (หน้ารายงานย้อนหลัง)
CREATE INDEX IF NOT EXISTS idx_student_snapshots_year ON student_snapshots (year_id);

-- เผื่ออนาคตย้ายไปผูกด้วย schoolos_id แทน student_code ตามที่ API.md ข้อ 1 แนะนำ
CREATE INDEX IF NOT EXISTS idx_student_snapshots_sos  ON student_snapshots (schoolos_id);
