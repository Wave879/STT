/* ============================================================
   ui.js — UI Components & Rendering
   Functions: tab switching, comments, speakers, search,
              transcript rendering, word highlighting
   Depends on: app.js globals (wavesurfer, playPauseBtn,
               outAz, outMai, finalText, state)
   ============================================================ */

// ── Tab switching (center panel) ──────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.getElementById('panel-' + name).classList.remove('hidden');
    document.getElementById('tab-'   + name).classList.add('tab-active');
}

// ── Tab switching (right panel) ───────────────────────────────
function switchRight(name) {
    document.querySelectorAll('.rpanel').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('flex-1', 'flex', 'flex-col', 'overflow-hidden', 'overflow-y-auto', 'p-3');
    });
    document.querySelectorAll('.rtab-btn').forEach(b => b.classList.remove('tab-active'));

    const panel = document.getElementById('rpanel-' + name);
    panel.classList.remove('hidden');
    document.getElementById('rtab-' + name).classList.add('tab-active');

    if (name === 'comments') {
        panel.classList.add('flex-1', 'flex', 'flex-col', 'overflow-hidden');
    } else {
        panel.classList.add('flex-1', 'overflow-y-auto', 'p-3');
    }
}

// ── Agent AI Chat ─────────────────────────────────────────────
const _comments = [];
let _agentBusy = false;
let _agentSystemPrompt = null;

const DEFAULT_AGENT_SYSTEM_PROMPT = 'คุณคือ Agent AI ผู้ช่วยตอบคำถามจากบทถอดเสียงของไฟล์ที่ผู้ใช้กำลังเปิดอยู่ ตอบเป็นภาษาไทยแบบกระชับ ชัดเจน อ้างอิงจาก transcript ที่ให้มาเท่านั้น ห้ามใช้ความรู้ภายนอกเติม ถ้าข้อมูลไม่พอให้บอกว่าไม่มีในไฟล์นี้';

function escapeHtmlChat(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getChatTimestamp() {
    const current = document.getElementById('current-time')?.textContent;
    if (current && current.trim()) return current.trim();
    const now = new Date();
    return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function getTranscriptContext() {
    const src = (state.results && state.results.final)
        || document.getElementById('final-text-display')?.innerText
        || '';
    return String(src || '').trim().slice(0, 12000);
}

function getCurrentFileLabel() {
    const name = state.currentFile?.name || '';
    return String(name).replace(/\.[^.]+$/, '').trim();
}

function buildAgentSuggestions() {
    const transcript = getTranscriptContext();
    const fileLabel = getCurrentFileLabel();
    const lower = transcript.toLowerCase();
    const suggestions = [];

    if (fileLabel) {
        suggestions.push(`ไฟล์ ${fileLabel} นี้พูดถึงเรื่องอะไร`);
    }

    suggestions.push('การประชุมครั้งนี้ชื่ออะไร');
    suggestions.push('วันนี้พูดเรื่องอะไร');

    if (/\[ผู้พูด|ผู้เข้าร่วม|speaker|attendee|ทีม|คุณ|ครับ|ค่ะ/.test(transcript)) {
        suggestions.push('ใครอยู่ในการประชุมนี้บ้าง');
    }

    if (/next step|action|todo|task|ต่อไป|ถัดไป|ต้องทำ|มอบหมาย|ติดตาม/i.test(transcript)) {
        suggestions.push('Next step คืออะไร');
    } else {
        suggestions.push('มี Action Item อะไรบ้าง');
    }

    if (/risk|issue|ปัญหา|ความเสี่ยง|อุปสรรค|blocker/i.test(lower)) {
        suggestions.push('มี Risk หรือ Issue อะไรบ้าง');
    }

    if (/ตัดสินใจ|มติ|approve|อนุมัติ|ตกลง/i.test(transcript)) {
        suggestions.push('มีมติหรือข้อตกลงอะไรบ้าง');
    }

    return Array.from(new Set(suggestions)).slice(0, 5);
}

function renderAgentSuggestions() {
    const container = document.getElementById('agent-suggestion-list');
    const input = document.getElementById('comment-input');
    if (!container || !input) return;

    const suggestions = buildAgentSuggestions();
    container.innerHTML = suggestions.map((text) => `
        <button
            type="button"
            class="agent-suggestion rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-4 text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            data-agent-suggestion="${escapeHtmlChat(text)}"
        >${escapeHtmlChat(text)}</button>
    `).join('');

    container.querySelectorAll('[data-agent-suggestion]').forEach((button) => {
        button.addEventListener('click', () => {
            input.value = button.dataset.agentSuggestion || '';
            input.focus();
        });
    });
}

async function getAgentSystemPrompt() {
    if (_agentSystemPrompt) return _agentSystemPrompt;
    try {
        const resp = await fetch('static/prompts/agent-ai-system.txt', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = (await resp.text()).trim();
        _agentSystemPrompt = text || DEFAULT_AGENT_SYSTEM_PROMPT;
    } catch (error) {
        console.warn('Failed to load Agent AI system prompt file:', error.message || error);
        _agentSystemPrompt = DEFAULT_AGENT_SYSTEM_PROMPT;
    }
    return _agentSystemPrompt;
}

function setAgentBusy(isBusy) {
    _agentBusy = isBusy;
    const input = document.getElementById('comment-input');
    const button = document.querySelector('#rpanel-comments button[onclick="addComment()"]');
    if (input) input.disabled = isBusy;
    if (button) {
        button.disabled = isBusy;
        button.textContent = isBusy ? 'กำลังตอบ...' : 'ส่ง';
        button.classList.toggle('opacity-60', isBusy);
        button.classList.toggle('cursor-not-allowed', isBusy);
    }
}

async function addComment() {
    if (_agentBusy) return;
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;

    const userMessage = { id: Date.now(), role: 'user', text, ts: getChatTimestamp() };
    _comments.push(userMessage);
    input.value = '';

    const pendingMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        text: 'Agent AI กำลังคิดคำตอบ...',
        ts: getChatTimestamp(),
        pending: true,
    };
    _comments.push(pendingMessage);
    renderComments();
    setAgentBusy(true);

    try {
        const transcript = getTranscriptContext();
        if (!transcript) {
            pendingMessage.text = 'กรุณาถอดเสียงก่อน แล้ว Agent AI จะช่วยสรุป วิเคราะห์ และตอบคำถามจากเนื้อหาที่ถอดเสียงได้';
            pendingMessage.pending = false;
            return;
        }

        const systemPrompt = await getAgentSystemPrompt();

        const messages = [
            {
                role: 'system',
                content: systemPrompt,
            },
        ];
        messages.push({
            role: 'system',
            content: `Transcript ปัจจุบัน:\n\n${transcript}`,
        });

        _comments
            .filter((item) => !item.pending)
            .slice(-8)
            .forEach((item) => {
                messages.push({
                    role: item.role === 'assistant' ? 'assistant' : 'user',
                    content: item.text,
                });
            });

        const answer = await callOAI(messages, { maxTokens: 900, temperature: 0.2 });
        pendingMessage.text = (answer || '').trim() || 'Agent AI ไม่มีคำตอบในตอนนี้';
        pendingMessage.pending = false;
    } catch (error) {
        pendingMessage.text = `เกิดข้อผิดพลาด: ${error.message || error}`;
        pendingMessage.pending = false;
    } finally {
        setAgentBusy(false);
        renderComments();
        input.focus();
    }
}

function renderComments() {
    const list = document.getElementById('comment-list');
    if (!_comments.length) {
        list.innerHTML = '<p class="text-[11px] text-slate-300 text-center italic mt-4">ยังไม่มี Agent AI</p>';
        return;
    }
    list.innerHTML = _comments.map(c => {
        const isUser = c.role === 'user';
        const side = isUser ? 'justify-end' : 'justify-start';
        const bubble = isUser
            ? 'bg-indigo-600 text-white rounded-br-md'
            : 'bg-slate-100 text-slate-700 rounded-bl-md';
        const avatar = isUser ? 'U' : 'AI';
        const name = isUser ? 'คุณ' : 'Agent AI';
        const metaTone = isUser ? 'text-indigo-200' : 'text-slate-400';
        const pending = c.pending ? '<i class="fas fa-spinner fa-spin text-[10px]"></i>' : '';
        return `
        <div class="flex ${side}">
            <div class="max-w-[88%] flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2 items-start">
                <div class="w-7 h-7 rounded-full ${isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'} flex items-center justify-center text-[10px] flex-none font-bold">${avatar}</div>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : 'justify-start'}">
                        <span class="text-[11px] font-bold text-slate-700">${name}</span>
                        <span class="text-[10px] ${metaTone}">${escapeHtmlChat(c.ts)}</span>
                        ${pending}
                    </div>
                    <div class="px-3 py-2.5 text-xs leading-6 break-words shadow-sm ${bubble}">${escapeHtmlChat(c.text).replace(/\n/g, '<br>')}</div>
                </div>
            </div>
        </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('comment-input');
    if (!input) return;
    renderAgentSuggestions();
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            addComment();
        }
    });
});

// ── Context — Speaker Labels ───────────────────────────────────
const _speakerLabels = { A: '', B: '' };
const _speakerNameMap = {};
let   _spkCount      = 2;
const _spkColors     = ['spk-a', 'spk-b', 'spk-c', 'spk-d'];
const _spkLetters    = ['A', 'B', 'C', 'D', 'E', 'F'];

function updateSpeakerLabel(input) {
    _speakerLabels[input.dataset.spk] = input.value.trim();
    renderSpeakerMap();
}

function renderSpeakerMap() {
    const map     = document.getElementById('speaker-map');
    const entries = Object.entries(_speakerLabels).filter(([, v]) => v);
    if (!entries.length) {
        map.innerHTML = '<p class="text-[10px] text-slate-300 italic">ยังไม่ได้ตั้งชื่อ</p>';
        return;
    }
    map.innerHTML = entries.map(([k, v], i) =>
        `<div class="flex items-center gap-2"><span class="ctx-tag ${_spkColors[i] || 'spk-a'}">${k}</span><span class="text-xs text-slate-600 font-medium">${v}</span></div>`
    ).join('');
}

function addSpeakerRow() {
    if (_spkCount >= _spkLetters.length) return;
    const letter   = _spkLetters[_spkCount];
    _speakerLabels[letter] = '';
    _spkCount++;
    const container = document.getElementById('participant-list');
    const div        = document.createElement('div');
    div.className    = 'flex items-center gap-2';
    const colorCls   = _spkColors[_spkCount - 1] || 'spk-a';
    div.innerHTML = `
        <span class="ctx-tag ${colorCls}">${letter}</span>
        <input type="text" placeholder="ชื่อผู้พูด ${letter}..." data-spk="${letter}"
            class="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            oninput="updateSpeakerLabel(this)">
    `;
    container.insertBefore(div, container.lastElementChild);
}

function escapeRegExp(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSpeakerRows(text) {
    const rows = [];
    const seen = new Set();
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());

    for (const line of lines) {
        let speaker = null;
        let quote = '';

        const m1 = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)$/);
        const m2 = line.match(/^\*\*\[[^\]]*?-\s*([^\]]+)\]\*\*\s*(.*)$/);
        if (m1) {
            speaker = m1[1].trim();
            quote = (m1[2] || '').trim();
        } else if (m2) {
            speaker = m2[1].trim();
            quote = (m2[2] || '').trim();
        }

        if (!speaker || seen.has(speaker)) continue;
        seen.add(speaker);
        rows.push({ speaker, quote: quote || '(ไม่มีตัวอย่างคำพูด)' });
    }

    return rows;
}

function openSpeakerNamingPopup() {
    const src = (state.results && state.results.final) || (document.getElementById('final-text-display')?.innerText || '');
    const rows = extractSpeakerRows(src);
    const body = document.getElementById('speaker-popup-body');
    const popup = document.getElementById('speaker-popup');
    if (!body || !popup) return;

    if (!rows.length) {
        body.innerHTML = '<p class="text-xs text-slate-400 italic">ยังไม่พบผู้พูดใน transcript (ต้องมีรูปแบบเช่น [ผู้พูด 1] หรือ **[00:10 - ผู้พูด 1]**)</p>';
        popup.classList.remove('hidden');
        popup.classList.add('flex');
        return;
    }

    body.innerHTML = rows.map((r, i) => `
        <div class="rounded-xl border border-slate-200 bg-white p-3">
            <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-xs font-bold text-slate-700">${r.speaker}</span>
                <span class="text-[10px] text-slate-400">ผู้พูดคนที่ ${i + 1}</span>
            </div>
            <p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 mb-2">ตัวอย่าง: ${r.quote.replace(/</g, '&lt;')}</p>
            <input type="text" data-speaker-key="${r.speaker.replace(/"/g, '&quot;')}" value="${(_speakerNameMap[r.speaker] || '').replace(/"/g, '&quot;')}"
                placeholder="ตั้งชื่อผู้พูดคนนี้..."
                class="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200">
        </div>
    `).join('');

    popup.classList.remove('hidden');
    popup.classList.add('flex');
}

function closeSpeakerNamingPopup() {
    const popup = document.getElementById('speaker-popup');
    if (!popup) return;
    popup.classList.remove('flex');
    popup.classList.add('hidden');
}

function saveSpeakerNaming() {
    const src = (state.results && state.results.final) || '';
    if (!src) {
        closeSpeakerNamingPopup();
        return;
    }

    let next = src;
    const inputs = document.querySelectorAll('#speaker-popup-body input[data-speaker-key]');
    inputs.forEach(input => {
        const key = input.dataset.speakerKey;
        const name = input.value.trim();
        if (!key) return;
        if (name) _speakerNameMap[key] = name;
        if (!name) return;

        const esc = escapeRegExp(key);
        next = next.replace(new RegExp('\\[' + esc + '\\]', 'g'), `[${name}]`);
        next = next.replace(new RegExp('(\\[[^\\]\\n]*-\\s*)' + esc + '(\\])', 'g'), `$1${name}$2`);
        _speakerLabels[key] = name;
    });

    state.results.final = next;
    renderClickableText(finalText, next, true);
    renderSpeakerMap();
    closeSpeakerNamingPopup();
    showStatus('✅ อัปเดตชื่อผู้พูดแล้ว', 'ok');
    setTimeout(hideStatus, 2000);
}

// ── Attachments ────────────────────────────────────────────────
const _attachments = [];

function addAttachment(input) {
    Array.from(input.files).forEach(f => {
        _attachments.push(f);
        const div       = document.createElement('div');
        div.className   = 'flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg';
        div.innerHTML   = `<i class="fas fa-file text-slate-300 text-xs"></i><span class="text-[11px] text-slate-600 truncate flex-1">${f.name}</span><span class="text-[10px] text-slate-300">${(f.size / 1024).toFixed(0)}KB</span>`;
        document.getElementById('attachment-list').appendChild(div);
    });
    input.value = '';
}

// ── Tags ───────────────────────────────────────────────────────
const _tags = [];

function addTag() {
    const input = document.getElementById('tag-input');
    const val   = input.value.trim();
    if (!val || _tags.includes(val)) return;
    _tags.push(val);
    input.value = '';
    renderTags();
}

function renderTags() {
    document.getElementById('tag-list').innerHTML = _tags.map((t, i) =>
        `<span class="ctx-tag">${t}<button onclick="_tags.splice(${i},1);renderTags()" class="ml-1 text-slate-300 hover:text-red-400">&times;</button></span>`
    ).join('');
}

function saveContext() {
    const ctx = {
        title:    document.getElementById('ctx-title').value,
        date:     document.getElementById('ctx-date').value,
        note:     document.getElementById('ctx-note').value,
        speakers: { ..._speakerLabels },
        tags:     [..._tags],
    };
    localStorage.setItem('meetingContext_' + (state.jobId || 'draft'), JSON.stringify(ctx));
    const btn = event.target;
    btn.textContent = '✅ บันทึกแล้ว';
    setTimeout(() => { btn.innerHTML = '<i class="fas fa-save mr-1"></i> บันทึก Context'; }, 1500);
}

// ── Transcript Search ──────────────────────────────────────────
function searchTranscript(query) {
    const panel = document.querySelector('.tab-panel:not(.hidden)');
    if (!panel) return;
    panel.querySelectorAll('.clickable-word').forEach(s => {
        s.style.background = (query && s.textContent.toLowerCase().includes(query.toLowerCase()))
            ? '#fef08a' : '';
    });
}

// ── Status bar ─────────────────────────────────────────────────
function showStatus(msg, type) {
    const el = document.getElementById('process-status');
    el.classList.remove('hidden',
        'bg-red-50', 'text-red-600',
        'bg-yellow-50', 'text-yellow-700',
        'bg-green-50', 'text-green-700',
        'bg-blue-50', 'text-blue-600'
    );
    if (type === 'error') el.classList.add('bg-red-50', 'text-red-600');
    if (type === 'warn')  el.classList.add('bg-yellow-50', 'text-yellow-700');
    if (type === 'ok')    el.classList.add('bg-green-50', 'text-green-700');
    if (type === 'info')  el.classList.add('bg-blue-50', 'text-blue-600');
    el.textContent = msg;
}

function hideStatus() {
    document.getElementById('process-status').classList.add('hidden');
}

// ── Progress step dots ─────────────────────────────────────────
function updateProgressDots(currentStep) {
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        const dotEl  = document.getElementById(`dot-${i}`);
        if (!stepEl || !dotEl) continue;
        if (i <= currentStep) {
            stepEl.style.opacity = '1';
            dotEl.className = 'w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs';
            dotEl.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            stepEl.style.opacity = '0.4';
        }
    }
}

// Alias kept for backward compatibility
function updateProgress(step) { updateProgressDots(step); }

// ── Speaker badge helpers ──────────────────────────────────────
const _spkBadgeColors = ['spk-a', 'spk-b', 'spk-c', 'spk-d'];
const _spkBadgeMap    = {};
let   _spkBadgeIdx    = 0;

function getSpkColor(label) {
    if (!_spkBadgeMap[label])
        _spkBadgeMap[label] = _spkBadgeColors[_spkBadgeIdx++ % _spkBadgeColors.length];
    return _spkBadgeMap[label];
}

// ── Clickable transcript renderer ─────────────────────────────
/**
 * Render `text` as clickable word spans inside `container`.
 * Speaker lines are shown with coloured badge + words.
 * Each word stores a ratio/timestamp for seek-on-click.
 */
function renderClickableText(container, text, isFinal = false) {
    container.innerHTML = '';
    if (!text) { container.textContent = 'รอผลลัพธ์...'; return; }

    const lines = text.split(/\r?\n/).filter(l => l.trim());

    // Collect all words (excluding speaker tags) for timestamp distribution
    const allWords = [];
    lines.forEach(line => {
        line.replace(/^\[[^\]]+\]\s*:?\s*/, '')
            .split(/\s+/)
            .filter(w => w.length > 0)
            .forEach(w => allWords.push(w));
    });
    const totalWords = Math.max(allWords.length, 1);

    function makeWordSpan(word, myIdx) {
        const span           = document.createElement('span');
        span.innerText       = word + ' ';
        span.className       = isFinal ? 'clickable-word text-slate-800' : 'clickable-word';
        span.dataset.ratio   = (myIdx / totalWords).toFixed(4);

        span.onclick = () => {
            const ratio    = parseFloat(span.dataset.ratio);
            let   seekTime;
            if (span.dataset.start) {
                seekTime = parseFloat(span.dataset.start);
            } else {
                const dur = wavesurfer ? wavesurfer.getDuration() : 0;
                seekTime  = dur > 0 ? dur * ratio : 0;
            }
            if (wavesurfer) {
                try {
                    wavesurfer.setTime(seekTime);
                    wavesurfer.play();
                    const icon = playPauseBtn.querySelector('i');
                    if (icon) icon.className = 'fas fa-pause text-xs';
                } catch (e) {}
            }
            syncContainersByRatio(ratio, container);
        };
        return span;
    }

    let wordIdx = 0;
    lines.forEach(line => {
        const spkMatch = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)/);
        const lineDiv  = document.createElement('div');
        lineDiv.className = 'tx-line';

        if (spkMatch) {
            const spkLabel = spkMatch[1];
            const lineText = spkMatch[2];
            const badge    = document.createElement('span');
            badge.className  = `ctx-tag ${getSpkColor(spkLabel)} mr-2 flex-none`;
            badge.textContent = spkLabel;
            lineDiv.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:2px;';
            lineDiv.appendChild(badge);
            lineText.split(/\s+/).filter(w => w.length > 0).forEach(word => {
                lineDiv.appendChild(makeWordSpan(word, wordIdx++));
            });
        } else {
            line.split(/\s+/).filter(w => w.length > 0).forEach(word => {
                lineDiv.appendChild(makeWordSpan(word, wordIdx++));
            });
        }
        container.appendChild(lineDiv);
    });

    const assigned = assignWordTimestamps(container, allWords);
    if (!assigned && wavesurfer) {
        const retry = () => assignWordTimestamps(container, allWords);
        wavesurfer.once('ready',  retry);
        wavesurfer.once('decode', retry);
    }
}

// ── Sync all containers to the same relative position ─────────
function syncContainersByRatio(ratio, sourceContainer) {
    [outAz, outWhisper, outMai, finalText].forEach(c => {
        if (!c || c === sourceContainer) return;
        const spans = Array.from(c.querySelectorAll('.clickable-word'));
        if (!spans.length) return;
        let best = spans[0], bestDiff = Infinity;
        spans.forEach(s => {
            const diff = Math.abs(parseFloat(s.dataset.ratio || 0) - ratio);
            if (diff < bestDiff) { bestDiff = diff; best = s; }
        });
        spans.forEach(s => s.classList.remove('word-active'));
        best.classList.add('word-active');
        best.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

// ── Highlight word at current playback time ────────────────────
function highlightWordsAtTime(currentTime) {
    if (currentTime == null) return;
    document.querySelectorAll('.clickable-word').forEach(word => {
        const start = parseFloat(word.dataset.start || 0);
        const end   = parseFloat(word.dataset.end   || (start + 1));
        if (currentTime >= start && currentTime < end) {
            word.classList.add('word-active');
        } else {
            word.classList.remove('word-active');
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// EXPORT — PDF & Word
// ═══════════════════════════════════════════════════════════════

/** Export current transcript as PDF via browser print dialog. */
function exportPDF() {
    const text = state.results.final;
    if (!text) { alert('ยังไม่มี transcript'); return; }
    const fileName = state.currentFile?.name || 'transcript';
    const date     = new Date().toLocaleDateString('th-TH');

    // Build print-friendly HTML in a new window
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8">
<title>${fileName}</title>
<style>
  body { font-family: 'Anuphan', 'Sarabun', sans-serif; font-size: 13px; line-height: 1.8; color: #1e293b; padding: 0; margin: 0; }
  h1   { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
  .line { margin-bottom: 6px; page-break-inside: avoid; }
  .badge { display: inline-block; background: #dbeafe; color: #1d4ed8; border-radius: 12px; padding: 1px 8px; font-size: 11px; font-weight: 600; margin-right: 6px; }
  @page { margin: 2cm; }
</style></head><body>
<h1>${fileName}</h1>
<p class="meta">วันที่: ${date} | ระยะเวลา: ${document.getElementById('stat-duration').textContent}</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:16px;">
${text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const m = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)/);
    return m
        ? `<div class="line"><span class="badge">${m[1]}</span>${m[2].replace(/</g,'&lt;')}</div>`
        : `<div class="line">${line.replace(/</g,'&lt;')}</div>`;
}).join('')}
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}

/** Export current transcript as a Word-compatible HTML file (.doc). */
function exportWord() {
    const text = state.results.final;
    if (!text) { alert('ยังไม่มี transcript'); return; }
    const fileName = (state.currentFile?.name || 'transcript').replace(/\.[^.]+$/, '');
    const date     = new Date().toLocaleDateString('th-TH');

    const rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
        const m = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)/);
        if (m) return `<p><b>[${m[1]}]</b> ${m[2]}</p>`;
        return `<p>${line}</p>`;
    }).join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${fileName}</title>
<style>body{font-family:Anuphan,sans-serif;font-size:13pt;line-height:1.8;}
b{color:#1d4ed8;}</style></head>
<body>
<h2>${fileName}</h2>
<p style="color:#64748b;font-size:10pt;">วันที่: ${date}</p>
<hr>
${rows}
</body></html>`;

    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${fileName}.doc`;
    a.click();
}

// ═══════════════════════════════════════════════════════════════
// EDITABLE TRANSCRIPT
// ═══════════════════════════════════════════════════════════════

let _editMode = false;

/** Toggle edit mode on the final transcript panel. */
function toggleEditMode() {
    _editMode = !_editMode;
    const btn = document.getElementById('edit-btn');

    if (_editMode) {
        // Switch to plain textarea for editing
        const plain = document.createElement('textarea');
        plain.id        = 'edit-textarea';
        plain.className = 'w-full h-full min-h-[300px] text-sm text-slate-700 leading-relaxed p-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none font-mono';
        plain.value     = state.results.final || '';
        finalText.innerHTML = '';
        finalText.appendChild(plain);
        plain.focus();
        btn.innerHTML   = '<i class="fas fa-check mr-1"></i> บันทึก';
        btn.classList.replace('bg-slate-100', 'bg-indigo-600');
        btn.classList.replace('text-slate-600', 'text-white');
        btn.classList.replace('hover:bg-slate-200', 'hover:bg-indigo-700');
    } else {
        // Save textarea content back to state
        const ta = document.getElementById('edit-textarea');
        if (ta) {
            state.results.final = ta.value;
            renderClickableText(finalText, state.results.final);
        }
        btn.innerHTML = '<i class="fas fa-edit mr-1"></i> แก้ไข';
        btn.classList.replace('bg-indigo-600', 'bg-slate-100');
        btn.classList.replace('text-white', 'text-slate-600');
        btn.classList.replace('hover:bg-indigo-700', 'hover:bg-slate-200');
    }
}

