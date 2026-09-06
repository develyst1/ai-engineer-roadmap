import "dotenv/config";
import pg from "pg";

/** เกณฑ์ "จบเมื่อ" ของ WEEK-01 — รันหลัง ingest แล้วอ่านผลด้วยตา */
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const summary = await client.query(
  `SELECT d.doc_id, d.title, count(c.*) AS chunks,
          min(c.token_count) AS min_tok, max(c.token_count) AS max_tok,
          round(avg(c.token_count)) AS avg_tok
     FROM documents d LEFT JOIN chunks c ON c.doc_id = d.doc_id
    GROUP BY d.doc_id, d.title ORDER BY d.doc_id`,
);
console.table(summary.rows);

const noSource = await client.query(
  "SELECT count(*)::int AS n FROM chunks WHERE page_from IS NULL AND heading_path IS NULL",
);
console.log(`ชิ้นที่ย้อนกลับไปหาแหล่งไม่ได้ (ต้องเป็น 0): ${noSource.rows[0].n}`);

const sample = await client.query(
  `SELECT chunk_id, page_from, page_to, heading_path, token_count, text
     FROM chunks ORDER BY random() LIMIT 10`,
);
for (const r of sample.rows) {
  console.log(`\n=== ${r.chunk_id} [p.${r.page_from}-${r.page_to}] ${r.heading_path ?? "-"} (${r.token_count} tok)`);
  console.log(r.text);
}
console.log("\nอ่าน 10 ชิ้นข้างบน: ทุกชิ้นต้องอ่านรู้เรื่อง ไม่ขาดกลางประโยค");

await client.end();
