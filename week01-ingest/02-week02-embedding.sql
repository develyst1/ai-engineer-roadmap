-- รันตอนสัปดาห์ 2 เมื่อเลือกโมเดล embedding ได้แล้ว (ปรับมิติให้ตรงโมเดล)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
