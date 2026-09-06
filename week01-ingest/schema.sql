-- WEEK-01 schema
-- คอลัมน์ embedding อยู่ใน 02-week02-embedding.sql (ALTER ทีหลังได้ ไม่ต้อง re-ingest)

CREATE TABLE IF NOT EXISTS documents (
  doc_id        TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  source        TEXT NOT NULL,
  doc_type      TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'th',
  version       TEXT,
  effective_at  DATE,
  content_hash  TEXT NOT NULL,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id      TEXT PRIMARY KEY,
  doc_id        TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  seq           INT  NOT NULL,
  text          TEXT NOT NULL,
  token_count   INT  NOT NULL,
  page_from     INT,
  page_to       INT,
  heading_path  TEXT,
  UNIQUE (doc_id, seq)
);

CREATE INDEX IF NOT EXISTS chunks_doc_id_idx ON chunks (doc_id);
