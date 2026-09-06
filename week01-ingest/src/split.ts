import { countTokens } from "./chunk.js";

/** ขอบตัดจากหยาบไปละเอียด: จบประโยค → ขึ้นบรรทัด → ช่องว่างคู่ → ช่องว่างเดี่ยว
 *  ภาษาไทยไม่มีจุดจบประโยค ช่องว่างเดี่ยวคือขอบวรรคจริง จึงต้องมีชั้นสุดท้ายนี้ */
const BOUNDARIES = [/(?<=[.!?…])\s+/, /\n+/, / {2,}/, / /];

/** ตัดข้อความให้ทุกชิ้น <= limit โดยใช้ขอบหยาบที่สุดเท่าที่พอ */
export function packTo(text: string, limit: number, level = 0): string[] {
  if (countTokens(text) <= limit) return [text];
  if (level >= BOUNDARIES.length) return hardSplit(text, limit);

  const parts = text.split(BOUNDARIES[level]).filter(Boolean);
  if (parts.length < 2) return packTo(text, limit, level + 1);

  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur} ${p}` : p;
    if (cur && countTokens(next) > limit) {
      out.push(cur);
      cur = p;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);

  return out.flatMap((p) => (countTokens(p) <= limit ? [p] : packTo(p, limit, level + 1)));
}

/** ข้อความยาวที่ไม่มีขอบให้ตัดเลย — ตัดตามโทเคนตรง ๆ เป็นทางสุดท้าย */
function hardSplit(text: string, limit: number): string[] {
  const step = Math.max(1, Math.floor((text.length * limit) / countTokens(text)));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) out.push(text.slice(i, i + step));
  return out;
}

/** ท้ายข้อความยาวไม่เกิน maxTokens ตัดที่ขอบ ไม่ตัดกลางคำ */
export function tailWithin(text: string, maxTokens: number): string | null {
  const parts = firstUsableSplit(text);
  if (parts.length < 2) return null;

  const picked: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = [parts[i], ...picked].join(" ");
    if (countTokens(candidate) > maxTokens) break;
    picked.unshift(parts[i]);
  }
  if (picked.length === 0 || picked.length === parts.length) return null;
  return picked.join(" ");
}

function firstUsableSplit(text: string): string[] {
  for (const re of BOUNDARIES) {
    const parts = text.split(re).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  return [text];
}
