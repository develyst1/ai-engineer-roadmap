import { readFile } from "node:fs/promises";
import path from "node:path";

export type Page = { page: number; text: string };

/** อ่านไฟล์ต้นทางออกมาเป็นหน้า ๆ — .pdf แยกตามหน้าจริง, .md/.txt ถือเป็นหน้าเดียว */
export async function extractPages(filePath: string): Promise<Page[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return extractPdf(filePath);
  if (ext === ".md" || ext === ".txt") {
    return [{ page: 1, text: await readFile(filePath, "utf8") }];
  }
  throw new Error(`ยังไม่รองรับนามสกุล ${ext} (รองรับ .pdf .md .txt)`);
}

async function extractPdf(filePath: string): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const pages: Page[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let text = "";
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      text += item.str;
      if (item.hasEOL) text += "\n";
    }
    pages.push({ page: i, text });
  }
  return pages;
}

/**
 * ล้างข้อความ: ตัด header/footer ที่ซ้ำเกือบทุกหน้า, ตัดเลขหน้าเดี่ยว ๆ,
 * ต่อคำอังกฤษที่ถูกยัติภังค์ท้ายบรรทัด, ยุบช่องว่าง/บรรทัดว่างซ้อน
 * (บรรทัดว่างต้องเหลือไว้ — ตัวตัดชิ้นใช้เป็นขอบย่อหน้า)
 */
export function cleanPages(pages: Page[]): Page[] {
  const repeated = findRepeatedLines(pages);

  return pages.map(({ page, text }) => {
    const cleaned = text
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .map((l) => (isNoise(l) || repeated.has(l) ? "" : l))
      .join("\n")
      .replace(/(\w)-\n(\w)/g, "$1$2") // ยัติภังค์ท้ายบรรทัด (อังกฤษ)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { page, text: cleaned };
  });
}

/** เลขหน้าเดี่ยว ๆ หรือเส้นคั่น */
function isNoise(line: string): boolean {
  return line !== "" && /^[\d\s/.\-–—_=]+$/.test(line);
}

/** บรรทัดที่โผล่ซ้ำใน >= 60% ของหน้า ถือเป็น header/footer (ต้องมี >= 4 หน้าถึงจะเชื่อ) */
function findRepeatedLines(pages: Page[]): Set<string> {
  if (pages.length < 4) return new Set();
  const count = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set(
      p.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && l.length < 120),
    );
    for (const line of seen) count.set(line, (count.get(line) ?? 0) + 1);
  }
  const threshold = pages.length * 0.6;
  return new Set([...count].filter(([, n]) => n >= threshold).map(([l]) => l));
}
