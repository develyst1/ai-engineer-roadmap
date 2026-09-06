import "dotenv/config";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { extractPages, cleanPages } from "./extract.js";
import { chunkPages, LIMITS } from "./chunk.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "doc-id": { type: "string" },
    title: { type: "string" },
    type: { type: "string", default: "policy" },
    lang: { type: "string", default: "th" },
    version: { type: "string" },
    "effective-at": { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const file = positionals[0];
if (!file) {
  console.error(
    "ใช้: npm run ingest -- <ไฟล์> --doc-id hr-handbook-2026 --title 'คู่มือพนักงาน 2569' --type policy",
  );
  process.exit(1);
}

const docId = values["doc-id"] ?? path.basename(file, path.extname(file));
const title = values.title ?? docId;

const pages = cleanPages(await extractPages(file));
const chunks = chunkPages(pages);
const contentHash = createHash("sha256").update(pages.map((p) => p.text).join("\n")).digest("hex");

console.log(`ไฟล์: ${file}`);
console.log(`หน้า: ${pages.length}  ชิ้น: ${chunks.length}  hash: ${contentHash.slice(0, 12)}`);
report(chunks.map((c) => c.tokenCount));

if (values["dry-run"]) {
  for (const c of chunks.slice(0, 3)) {
    console.log(`\n--- ${docId}#${c.seq} [p.${c.pageFrom}-${c.pageTo}] ${c.headingPath ?? "-"}`);
    console.log(c.text.slice(0, 300));
  }
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");

  const existing = await client.query<{ content_hash: string }>(
    "SELECT content_hash FROM documents WHERE doc_id = $1",
    [docId],
  );
  if (existing.rows[0]?.content_hash === contentHash) {
    console.log("เนื้อหาเหมือนเดิม ข้าม (idempotent)");
    await client.query("ROLLBACK");
  } else {
    await client.query(
      `INSERT INTO documents (doc_id, title, source, doc_type, lang, version, effective_at, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (doc_id) DO UPDATE SET
         title = EXCLUDED.title, source = EXCLUDED.source, doc_type = EXCLUDED.doc_type,
         lang = EXCLUDED.lang, version = EXCLUDED.version, effective_at = EXCLUDED.effective_at,
         content_hash = EXCLUDED.content_hash, ingested_at = now()`,
      [docId, title, path.resolve(file), values.type, values.lang, values.version ?? null,
       values["effective-at"] ?? null, contentHash],
    );
    await client.query("DELETE FROM chunks WHERE doc_id = $1", [docId]);

    for (const c of chunks) {
      await client.query(
        `INSERT INTO chunks (chunk_id, doc_id, seq, text, token_count, page_from, page_to, heading_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`${docId}#${c.seq}`, docId, c.seq, c.text, c.tokenCount, c.pageFrom, c.pageTo, c.headingPath],
      );
    }
    await client.query("COMMIT");
    console.log(`เขียนลงตารางแล้ว: ${chunks.length} ชิ้น (doc_id = ${docId})`);
  }
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}

function report(tokens: number[]) {
  if (tokens.length === 0) return;
  const sorted = [...tokens].sort((a, b) => a - b);
  const under = tokens.filter((t) => t < LIMITS.min).length;
  const over = tokens.filter((t) => t > LIMITS.max).length;
  console.log(
    `โทเคน/ชิ้น: min ${sorted[0]}  median ${sorted[Math.floor(sorted.length / 2)]}  max ${sorted.at(-1)}` +
      `  | ต่ำกว่า ${LIMITS.min}: ${under}  เกิน ${LIMITS.max}: ${over}`,
  );
}
