/* ============================================================
   ai.js — AI Processing Layer
   Functions: renderMarkdown, runAISpeakerCorrection, runAISummary
   Depends on: config.js (API_OAI, OAI_DEPLOY)

   Calls /api/oai proxy — keys are server-side only.
   ============================================================ */

/** Convert simple markdown to HTML for the summary panel. */
function renderMarkdown(text) {
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^## (.+)$/gm,   '<h3 class="text-sm font-bold text-slate-800 mt-4 mb-1">$1</h3>')
        .replace(/^### (.+)$/gm,  '<h4 class="text-xs font-bold text-slate-700 mt-3 mb-1">$1</h4>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-start gap-2 my-0.5"><input type="checkbox" class="mt-0.5 flex-none"><span>$1</span></div>')
        .replace(/^- (.+)$/gm,    '<div class="flex items-start gap-1.5 my-0.5"><span class="text-indigo-400 flex-none">•</span><span>$1</span></div>')
        .replace(/^---$/gm,       '<hr class="my-3 border-slate-200">')
        .replace(/\n{2,}/g,       '<div class="my-2"></div>')
        .replace(/\n/g,           '<br>');
}

/** Call the /api/oai proxy with a messages payload. */
async function callOAI(messages, opts = {}) {
    const resp = await fetch(API_OAI, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            deploy:      OAI_DEPLOY,
            messages,
            max_tokens:  opts.maxTokens  || 2000,
            temperature: opts.temperature ?? 0.2,
        }),
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${resp.status}: ${errText.substring(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * AI Speaker Correction — insert/fix speaker labels in transcript.
 * If transcript already has [ผู้พูด X]: fix typos only.
 * If no labels: analyse Q&A patterns and insert labels.
 */
async function runAISpeakerCorrection(text) {
    const hasSpeakerLabels = /\[ผู้พูด \d+\]/.test(text);
    const systemPrompt = hasSpeakerLabels
        ? `แก้คำผิดใน transcript ภาษาไทย คง [ผู้พูด X] ไว้ตามเดิม แก้เฉพาะคำผิด ตอบแค่ transcript`
        : `จัดรูปแบบ transcript ภาษาไทยโดยแยกผู้พูด

ตัวอย่าง input: ค่ะ อันนี้พึ่งจะมาให้คำปรึกษาด้านอาชีพนะ เบื้องต้น ขอข้อมูลพื้นฐานก่อน ขอชื่อนามสกุลค่ะ ชื่อนางสาวสโรชา จะนะกุลค่ะ อายุ 24 ปีค่ะ

ตัวอย่าง output:
[ผู้พูด 1]: ค่ะ อันนี้พึ่งจะมาให้คำปรึกษาด้านอาชีพนะ เบื้องต้น ขอข้อมูลพื้นฐานก่อน ขอชื่อนามสกุลค่ะ
[ผู้พูด 2]: ชื่อนางสาวสโรชา จะนะกุลค่ะ อายุ 24 ปีค่ะ

กฎบังคับ:
1. ทุกบรรทัดขึ้นต้นด้วย [ผู้พูด 1]: หรือ [ผู้พูด 2]: เสมอ
2. ขึ้นบรรทัดใหม่เมื่อเปลี่ยนคนพูด
3. ดูจากลักษณะคำพูด: คนถามคำถาม vs คนตอบคำถาม
4. แก้คำผิด
5. ห้ามเพิ่มคำอธิบาย ตอบแค่ transcript`;

    console.log('[AI] speaker correction, hasSpeakers:', hasSpeakerLabels, 'len:', text.length);
    const result = await callOAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: text.substring(0, 10000) }],
        { maxTokens: 4000, temperature: 0.1 }
    );
    console.log('[AI correction result]', result.substring(0, 300));

    if (/\[ผู้พูด \d+\]/.test(result)) {
        return result.replace(/\[ผู้พูด (\d+)\]\s*:?\s*/g, '[ผู้พูด $1]: ');
    }
    console.warn('[AI] no speaker labels in output, return raw');
    return result || text;
}

/**
 * AI Summary — structured Thai summary with roles, topics, Action Items.
 */
async function runAISummary(text) {
    return callOAI(
        [
            { role: 'system', content: 'คุณเป็น AI สรุปการประชุม ตอบเป็นภาษาไทย' },
            { role: 'user',   content: `สรุปบทสนทนานี้ในรูปแบบ:

## 👥 บทบาทผู้พูด
- ผู้พูด X: ...
## 📌 หัวข้อสำคัญ
- ...
## ✅ Action Items
- [ ] ...

บทสนทนา:
${text.substring(0, 8000)}` },
        ],
        { maxTokens: 1200, temperature: 0.3 }
    );
}