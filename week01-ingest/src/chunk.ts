import { encode } from "gpt-tokenizer";
import type { Page } from "./extract.js";
import { packTo, tailWithin } from "./split.js";

export type Chunk = {
  seq: number;
  text: string;
  tokenCount: number;
  pageFrom: number;
  pageTo: number;
  headingPath: string | null;
};

export const LIMITS = { min: 300, target: 600, max: 800, overlapRatio: 0.15 };

export const countTokens = (s: string) => encode(s).length;

type Block = { text: string; page: number; headingPath: string | null };

/** ตัดเอกสารเป็นชิ้น: เคารพขอบหัวข้อก่อน แล้วขอบย่อหน้า/วรรค */
export function chunkPages(pages: Page[]): Chunk[] {
  const blocks = toBlocks(pages);
  const chunks: Chunk[] = [];

  let buf: Block[] = [];
  let bufTokens = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.map((b) => b.text).join("\n\n");
    chunks.push({
      seq: chunks.length,
      text,
      tokenCount: countTokens(text),
      pageFrom: Math.min(...buf.map((b) => b.page)),
      pageTo: Math.max(...buf.map((b) => b.page)),
      headingPath: buf[0].headingPath,
    });
    // เหลื่อม: ยกท้ายชิ้นเดิมไปตั้งต้นชิ้นถัดไป
    const carry = tailWithin(text, Math.round(LIMITS.target * LIMITS.overlapRatio));
    const last = buf[buf.length - 1];
    buf = carry ? [{ text: carry, page: last.page, headingPath: last.headingPath }] : [];
    bufTokens = carry ? countTokens(carry) : 0;
  };

  for (const block of blocks) {
    const t = countTokens(block.text);
    const headingChanged = buf.length > 0 && block.headingPath !== buf[buf.length - 1].headingPath;

    if (buf.length > 0 && (bufTokens + t > LIMITS.max || (headingChanged && bufTokens >= LIMITS.min))) {
      flush();
    }
    buf.push(block);
    bufTokens += t;
  }
  flush();

  // ชิ้นสุดท้ายที่เหลือแต่ส่วนเหลื่อม คือของซ้ำ ไม่เอา
  const last = chunks.at(-1);
  if (chunks.length > 1 && last && chunks[chunks.length - 2].text.endsWith(last.text)) chunks.pop();

  return chunks.map((c, i) => ({ ...c, seq: i }));
}

function toBlocks(pages: Page[]): Block[] {
  const stack: { level: number; title: string }[] = [];
  const blocks: Block[] = [];

  for (const { page, text } of pages) {
    for (const para of text.split(/\n{2,}/)) {
      let started = false;
      for (const part of para.split("\n")) {
        const line = part.trim();
        if (!line) continue;

        const heading = asHeading(line);
        if (heading) {
          while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
          stack.push(heading);
          started = false;
          continue;
        }
        const headingPath = stack.length ? stack.map((h) => h.title).join(" > ") : null;
        const prev = blocks.at(-1);
        // บรรทัดต่อในย่อหน้าเดียวกัน ต่อเข้าไป ไม่แยกเป็นบล็อกใหม่
        if (started && prev && prev.page === page && prev.headingPath === headingPath) {
          prev.text += ` ${line}`;
        } else {
          blocks.push({ text: line, page, headingPath });
          started = true;
        }
      }
    }
  }

  // บล็อกที่ยาวเกิน max ตัดย่อยให้ราว ๆ target
  return blocks.flatMap((b) =>
    countTokens(b.text) <= LIMITS.max ? [b] : packTo(b.text, LIMITS.target).map((text) => ({ ...b, text })),
  );
}

function asHeading(line: string): { level: number; title: string } | null {
  if (line.length > 120) return null;

  const md = line.match(/^(#{1,6})\s+(.+)$/);
  if (md) return { level: md[1].length, title: md[2].trim() };

  const numbered = line.match(/^(\d+(?:\.\d+)*)[.)]?\s+\S/);
  if (numbered && line.length <= 100) {
    return { level: numbered[1].split(".").length, title: line };
  }

  const thai = line.match(/^(บทที่|หมวด|ส่วนที่|ภาคผนวก|ข้อ)\s*\S/);
  if (thai && line.length <= 100) {
    return { level: thai[1] === "ข้อ" ? 2 : 1, title: line };
  }

  return null;
}
