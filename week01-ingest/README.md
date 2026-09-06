# WEEK-01 — ingest เอกสารลงตาราง

ของตั้งต้นสำหรับ [WEEK-01.md](../WEEK-01.md) — อ่านไฟล์ → ล้าง → ตัดชิ้น → เขียนลง Postgres
สัปดาห์นี้ **ไม่มี embedding ไม่เรียก LLM**

## เริ่ม

```bash
cd week01-ingest
npm install
cp .env.example .env          # แก้ DATABASE_URL ให้ตรงเครื่อง
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/aiengineer"  # สำหรับ psql (สคริปต์ node อ่านจาก .env เอง)
createdb aiengineer           # ถ้ายังไม่มี
psql "$DATABASE_URL" -f schema.sql
```

## ตัดลองก่อน ยังไม่แตะ DB

```bash
npm run ingest -- docs/handbook.pdf --dry-run
```

ดูสามอย่าง: จำนวนชิ้นสมเหตุผลไหม, median โทเคนอยู่ราว 500–700 ไหม,
สามชิ้นแรกที่พิมพ์ออกมาอ่านรู้เรื่องไหม ถ้าไม่ผ่านให้แก้ที่ `LIMITS` ใน
[src/chunk.ts](src/chunk.ts) หรือแก้ขอบหัวข้อใน `asHeading()` ก่อนค่อยเขียนลงตาราง

## เขียนจริง

```bash
npm run ingest -- docs/handbook.pdf \
  --doc-id hr-handbook-2026 \
  --title "คู่มือพนักงาน 2569" \
  --type policy \
  --version "ฉบับปี 2569" \
  --effective-at 2026-01-01
```

รันซ้ำได้ — ถ้า `content_hash` เท่าเดิมจะข้าม ถ้าเนื้อหาเปลี่ยนจะลบ chunks เดิมของ
`doc_id` นั้นแล้วใส่ใหม่ทั้งชุดในทรานแซกชันเดียว

## ตรวจเกณฑ์ "จบเมื่อ"

```bash
npm run check
```

พิมพ์สรุปต่อเอกสาร + สุ่ม 10 ชิ้นมาให้อ่านด้วยตา ผ่านเมื่อ:
อ่านรู้เรื่องทั้ง 10 ชิ้น, ทุกชิ้นมี `page_from` หรือ `heading_path`,
รัน ingest ซ้ำแล้วจำนวน chunk ไม่เพิ่ม

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| [src/extract.ts](src/extract.ts) | อ่าน .pdf/.md/.txt เป็นหน้า ๆ + ล้าง header/footer/เลขหน้า |
| [src/chunk.ts](src/chunk.ts) | ขอบหัวข้อ → ขอบย่อหน้า → ตัดชิ้นตามโทเคน + เหลื่อม 15% |
| [src/split.ts](src/split.ts) | ตัวตัดขอบไล่จากหยาบไปละเอียด |
| [src/ingest.ts](src/ingest.ts) | เขียนลงตารางแบบรันซ้ำได้ |
| [src/check.ts](src/check.ts) | เกณฑ์จบของสัปดาห์นี้ |

## ที่ต้องรู้

- **นับโทเคนด้วย tokenizer จริง** (`gpt-tokenizer`) ไม่ใช่ `.length` —
  ภาษาไทยไม่มีเว้นวรรคระหว่างคำ นับตัวอักษรจะได้ชิ้นสั้นกว่าจริงมาก
- **ช่องว่างเดี่ยวคือขอบวรรคของไทย** — ข้อความไทยไม่มี `.` จบประโยค
  ถ้าตัดที่จุดอย่างเดียวจะได้ชิ้นละ 2,000+ โทเคน (เจอมาแล้วตอนทดสอบ)
  `split.ts` จึงไล่ขอบ: จบประโยค → ขึ้นบรรทัด → ช่องว่างคู่ → ช่องว่างเดี่ยว
- **คอลัมน์ `embedding` ยังไม่มีใน schema.sql** — อยู่ใน `02-week02-embedding.sql`
  เพิ่มด้วย `ALTER` ตอนเลือกโมเดลได้แล้ว ไม่ต้อง re-ingest
  (ต่างจาก `page_from`/`heading_path` ที่ถ้าไม่ใส่ตั้งแต่แรกต้องตัดใหม่ทั้งคลัง)
- **PDF สแกน** ตัวอ่านนี้ดึงข้อความไม่ได้ ต้อง OCR ก่อน — หรือเปลี่ยนเอกสาร อย่าฝืน
