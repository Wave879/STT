/* ============================================================
   app.js — Main Orchestration & Event Handling
   Initialises WaveSurfer, binds UI events, drives runAllBrowser.
   Depends on: config.js, audio.js, ai.js, ui.js
   ============================================================ */

// ── Global app state ───────────────────────────────────────────
const state = {
    jobId:       null,
    currentFile: null,
    isProcessing: false,
    results:     { azure: '', whisper: '', mai: '', final: '' },
};

// ── DOM references (used across ui.js functions) ───────────────
const runBtn          = document.getElementById('main-action-btn');
const playPauseBtn    = document.getElementById('play-pause-btn');
const timeDisplay     = document.getElementById('current-time');
const dropZone        = document.getElementById('drop-zone');
const outAz           = document.getElementById('out-azure');
const outWhisper      = document.getElementById('out-whisper');
const outMai          = document.getElementById('out-mai');
const finalText       = document.getElementById('final-text-display');
const summaryArea     = document.getElementById('summary-area');
const finalModelSelect = document.getElementById('final-model-select');

// ── WaveSurfer initialisation ──────────────────────────────────
let wavesurfer;
try {
    wavesurfer = WaveSurfer.create({
        container:     '#waveform-container',
        waveColor:     '#cbd5e1',
        progressColor: '#f97316',
        cursorColor:   '#ea580c',
        barWidth:      3,
        barRadius:     3,
        responsive:    true,
        height:        120,
        normalize:     true,
        backend:       'WebAudio',
    });
    wavesurfer.on('error', err => console.warn('WaveSurfer error:', err));
} catch (e) {
    console.error('WaveSurfer init failed:', e);
    wavesurfer = null;
}

// ── Word timestamp assignment ──────────────────────────────────
/**
 * Spread word timestamps evenly across the audio duration.
 * Returns false if wavesurfer isn't ready yet.
 */
function assignWordTimestamps(container, words) {
    const dur = (wavesurfer && wavesurfer.getDuration && wavesurfer.getDuration() > 0.5)
        ? wavesurfer.getDuration() : null;
    if (!dur) return false;
    const wd    = dur / Math.max(words.length, 1);
    const spans = container.querySelectorAll('.clickable-word');
    spans.forEach((span, idx) => {
        span.dataset.start = (idx * wd).toFixed(3);
        span.dataset.end   = ((idx + 1) * wd).toFixed(3);
    });
    return true;
}

// ── Save transcript as plain .txt ─────────────────────────────
function saveAsTxt() {
    const text = state.results.final;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = (state.currentFile?.name || 'transcript').replace(/\.[^.]+$/, '') + '.txt';
    a.click();
}

// ── Swap final-view model ──────────────────────────────────────
finalModelSelect.addEventListener('change', () => {
    const picked = state.results[finalModelSelect.value];
    if (picked) {
        renderClickableText(finalText, picked);
    } else {
        finalText.innerHTML = '<span class="text-slate-300 italic">ยังไม่มีข้อมูลจากโมเดลนี้</span>';
    }
});

// ── Drop zone ──────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.background = 'rgba(99, 102, 241, 0.1)';
});
dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = '';
});
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.background = '';
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
});

document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
});

// ── File selection ─────────────────────────────────────────────
function handleFileSelect(file) {
    state.currentFile = file;
    state.jobId       = null;

    dropZone.innerHTML = `
        <i class="fas fa-check-circle text-3xl text-green-500 mb-2"></i>
        <p class="text-sm font-bold text-slate-800 truncate max-w-[160px] mx-auto">${file.name}</p>
        <p class="text-[10px] text-green-500 font-bold mt-1 uppercase">โหลดไฟล์แล้ว ✓</p>
    `;
    runBtn.disabled = false;

    document.getElementById('file-title').textContent  = file.name;
    document.getElementById('stat-model').textContent  = document.getElementById('model-select').selectedOptions[0].text;
    document.getElementById('stat-size').textContent   = (file.size / 1024 / 1024).toFixed(1) + ' MB';
    if (typeof renderAgentSuggestions === 'function') renderAgentSuggestions();

    if (wavesurfer) {
        try { wavesurfer.load(URL.createObjectURL(file)); }
        catch (audioErr) { console.warn('WaveSurfer load error (non-critical):', audioErr); }
    }
}

// ── Play / Pause ───────────────────────────────────────────────
playPauseBtn.addEventListener('click', () => {
    if (!wavesurfer) return;
    wavesurfer.playPause();
    const icon = playPauseBtn.querySelector('i');
    icon.className = wavesurfer.isPlaying() ? 'fas fa-pause text-xs' : 'fas fa-play text-xs';
});

// ── WaveSurfer events ──────────────────────────────────────────
if (wavesurfer) {
    wavesurfer.on('timeupdate', time => {
        const mins = Math.floor(time / 60).toString().padStart(2, '0');
        const secs = Math.floor(time % 60).toString().padStart(2, '0');
        timeDisplay.innerText = `${mins}:${secs}`;
        document.getElementById('comment-ts').textContent = `ตอนนี้: ${mins}:${secs}`;
        highlightWordsAtTime(time);
    });

    wavesurfer.on('ready', () => {
        const dur = wavesurfer.getDuration();
        const m   = Math.floor(dur / 60).toString().padStart(2, '0');
        const s   = Math.floor(dur % 60).toString().padStart(2, '0');
        document.getElementById('total-time').textContent    = `${m}:${s}`;
        document.getElementById('stat-duration').textContent = `${m}:${s}`;

        // Re-assign timestamps now that duration is known
        [outAz, outMai, finalText].forEach(container => {
            const spans = container.querySelectorAll('.clickable-word');
            if (spans.length > 0) {
                const words = Array.from(spans).map(s => s.innerText.trim());
                assignWordTimestamps(container, words);
            }
        });
    });
}

// ── Process button ─────────────────────────────────────────────
runBtn.addEventListener('click', async () => {
    if (!state.currentFile) {
        showStatus('⚠️ กรุณาเลือกไฟล์ก่อน', 'warn');
        return;
    }

    state.isProcessing = true;
    runBtn.disabled    = true;
    runBtn.innerHTML   = '<i class="fas fa-spinner fa-spin mr-2"></i> กำลังประมวลผล...';

    try {
        await runAllBrowser(state.currentFile);
    } catch (err) {
        showStatus('❌ ' + err.message, 'error');
        finalText.innerHTML = `<div class="p-3 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700"><i class="fas fa-exclamation-circle mr-2"></i>${err.message}</div>`;
    }

    runBtn.disabled  = false;
    runBtn.innerHTML = '<i class="fas fa-bolt mr-1"></i> ประมวลผล';
    state.isProcessing = false;
});

// ── Main processing pipeline ───────────────────────────────────
/**
 * Orchestrates the full pipeline:
 *   1. Decode audio to PCM
 *   2. MAI (await, fast) + Azure (background)
 *   3. AI speaker correction + summary (parallel)
 *   4. Render results
 */
async function runAllBrowser(file) {
    switchTab('transcript');
    finalText.innerHTML = '<p class="text-slate-400 italic text-sm"><i class="fas fa-spinner fa-spin mr-2"></i> กำลังเตรียมไฟล์...</p>';

    // Step 1 — Decode PCM
    showStatus('🎧 กำลัง decode ไฟล์เสียง...', 'info');
    updateProgressDots(1);
    let int16;
    try {
        int16 = await toPCM16k(file);
    } catch (e) {
        throw new Error('decode ไฟล์ไม่ได้: ' + e.message);
    }

    // Step 2 — รัน MAI + Whisper + Azure สามอันขนาน แสดงผลของอันแรกที่เสร็จทันที
    updateProgressDots(2);
    showStatus('⚡ ถอดความด้วย MAI + Whisper + Azure...', 'info');
    outAz.innerHTML      = '<span class="text-slate-400 italic text-xs"><i class="fas fa-spinner fa-spin mr-1"></i> กำลังถอด...</span>';
    outWhisper.innerHTML = '<span class="text-slate-400 italic text-xs"><i class="fas fa-spinner fa-spin mr-1"></i> กำลังถอด...</span>';
    outMai.innerHTML     = '<span class="text-slate-400 italic text-xs"><i class="fas fa-spinner fa-spin mr-1"></i> กำลังถอด...</span>';

    let correctionDone = false;

    // ── สร้าง promise รับผลแต่ละโมเดล เมื่อเสร็จให้ update UI ทันที ──
    const maiPromise = runMAIRest(file, STT_LANG, int16)
        .then(txt => { state.results.mai = txt; renderClickableText(outMai, txt); return txt; })
        .catch(err => { outMai.innerHTML = `<span class="text-red-400 text-xs">❌ MAI: ${err.message}</span>`; return ''; });

    const whisperPromise = runWhisperRest(file, STT_LANG, int16, (txt) => { renderClickableText(outWhisper, txt); })
        .then(txt => { state.results.whisper = txt; renderClickableText(outWhisper, txt); return txt; })
        .catch(err => { outWhisper.innerHTML = `<span class="text-red-400 text-xs">❌ Whisper: ${err.message}</span>`; return ''; });

    const azPromise = runAzureSDK(int16, STT_LANG, (txt) => { renderClickableText(outAz, txt); })
        .then(txt => {
            state.results.azure = txt;
            renderClickableText(outAz, txt);
            if (!correctionDone && txt && txt.length > (state.results.final || '').length) {
                state.results.final = txt;
                renderClickableText(finalText, txt);
                if (typeof renderAgentSuggestions === 'function') renderAgentSuggestions();
            }
            return txt;
        })
        .catch(err => { outAz.innerHTML = `<span class="text-red-400 text-xs">❌ Azure: ${err.message}</span>`; return ''; });

    // ── รออันแรกที่เสร็จ แล้ว update Transcript ทันที ──
    const firstResult = await Promise.race([
        maiPromise.then(t => t || Promise.reject('empty')),
        whisperPromise.then(t => t || Promise.reject('empty')),
        azPromise.then(t => t || Promise.reject('empty')),
    ]).catch(() => ''); // ถ้าทุกอัน reject: รอต่อ

    if (firstResult) {
        state.results.final = firstResult;
        renderClickableText(finalText, firstResult);
        if (typeof renderAgentSuggestions === 'function') renderAgentSuggestions();
        switchTab('transcript');
        updateProgressDots(3);
        showStatus('✨ ได้ผลแรกแล้ว กำลัง AI แยกผู้พูดและสรุป...', 'info');
    }

    // ── รอทุกอันเสร็จ ใช้ผลดีที่สุด ──
    const [maiText, whisperText, azText] = await Promise.all([maiPromise, whisperPromise, azPromise]);
    const bestRaw = [maiText, whisperText, azText].filter(Boolean).sort((a,b) => b.length - a.length)[0] || firstResult;
    if (!bestRaw) throw new Error('ถอดความไม่สำเร็จทุกโมเดล กรุณาตรวจข้อความในแท็บ Azure, Whisper และ MAI เพื่อดูสาเหตุ');

    // ใช้ผลดีสุดสำหรับขั้น AI correction
    const inputForAI = bestRaw;

    // Step 3+4 — AI Speaker Correction + Summary (parallel)
    updateProgressDots(4);
    showStatus('✨ AI กำลังแยกผู้พูดและสรุป...', 'info');

    let correctedText = inputForAI;
    let aiError       = '';
    try {
        const [corrected, summary] = await Promise.all([
            runAISpeakerCorrection(inputForAI).catch(e => {
                aiError = 'Correction: ' + e.message;
                console.error('[AI fail]', e);
                return firstResult;
            }),
            runAISummary(inputForAI).catch(e => {
                console.warn('AI summary fail:', e);
                return '';
            }),
        ]);

        correctedText = corrected;
        state.results.final = correctedText;
        renderClickableText(finalText, correctedText);
        if (typeof renderAgentSuggestions === 'function') renderAgentSuggestions();

        if (summary) {
            summaryArea.innerHTML = `<div class="prose prose-sm max-w-none text-slate-700 leading-relaxed">${renderMarkdown(summary)}</div>`;
            switchRight('summary');
        }
    } catch (e) {
        aiError = e.message;
        console.error('AI failed:', e);
    }
    correctionDone = true;

    // Update stats
    const spkCount = new Set((correctedText.match(/\[ผู้พูด \d+\]/g) || []).map(s => s)).size;
    document.getElementById('stat-model').textContent    = 'MAI + Azure (bg)';
    document.getElementById('stat-speakers').textContent = spkCount > 0 ? `${spkCount} คน` : '—';

    // Auto-save to history (IndexedDB)
    try {
        await saveToHistory({
            fileName:   file.name,
            duration:   document.getElementById('stat-duration').textContent,
            speakers:   spkCount || null,
            transcript: correctedText,
            summary:    summaryArea.innerText || '',
        });
    } catch (e) { console.warn('History save failed:', e); }

    showStatus('✅ เสร็จสิ้น!', 'ok');
    setTimeout(hideStatus, 5000);

    // Azure/Whisper สิ้นสุดแล้ว (ไม่ต้อง block)
    azPromise.catch(() => {});
}
