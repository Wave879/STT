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

// ── Comments ──────────────────────────────────────────────────
const _comments = [];

function addComment() {
    const input = document.getElementById('comment-input');
    const text  = input.value.trim();
    if (!text) return;
    const ts = document.getElementById('current-time').textContent;
    const id = Date.now();
    _comments.push({ id, text, ts, time: Date.now() });
    input.value = '';
    renderComments();
}

function renderComments() {
    const list = document.getElementById('comment-list');
    if (!_comments.length) {
        list.innerHTML = '<p class="text-[11px] text-slate-300 text-center italic mt-4">ยังไม่มี comment</p>';
        return;
    }
    list.innerHTML = _comments.map(c => `
        <div class="group flex gap-2 p-2.5 rounded-xl hover:bg-slate-50 transition">
            <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] flex-none font-bold">U</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-[11px] font-bold text-slate-700">คุณ</span>
                    <span class="text-[10px] text-slate-300">${c.ts}</span>
                    <button onclick="deleteComment(${c.id})" class="ml-auto text-[10px] text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-times"></i></button>
                </div>
                <p class="text-xs text-slate-600 break-words">${c.text.replace(/</g, '&lt;')}</p>
            </div>
        </div>
    `).join('');
}

function deleteComment(id) {
    const idx = _comments.findIndex(c => c.id === id);
    if (idx > -1) { _comments.splice(idx, 1); renderComments(); }
}

// ── Context — Speaker Labels ───────────────────────────────────
const _speakerLabels = { A: '', B: '' };
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
    [outAz, outMai, finalText].forEach(c => {
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

