/* ============================================================
   history.js — Transcript History (IndexedDB)
   Functions: saveToHistory, loadHistory, deleteFromHistory,
              renderHistoryPanel, loadHistoryItem
   ============================================================ */

const _DB_NAME    = 'cowork_audioai';
const _DB_VERSION = 1;
const _STORE      = 'transcripts';

/** Open (or upgrade) the IndexedDB database. */
function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(_DB_NAME, _DB_VERSION);
        req.onupgradeneeded = e => {
            const db    = e.target.result;
            if (!db.objectStoreNames.contains(_STORE)) {
                const store = db.createObjectStore(_STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('date',     'date');
                store.createIndex('fileName', 'fileName');
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

/**
 * Save a transcript record to history.
 * @param {{ fileName, duration, speakers, transcript, summary }} record
 */
async function saveToHistory(record) {
    const db = await _openDB();
    const tx = db.transaction(_STORE, 'readwrite');
    return new Promise((res, rej) => {
        const req = tx.objectStore(_STORE).add({
            ...record,
            date: new Date().toISOString(),
        });
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
    });
}

/** Get all records, newest first. */
async function _getAllHistory() {
    const db = await _openDB();
    const tx = db.transaction(_STORE, 'readonly');
    return new Promise((res, rej) => {
        const req = tx.objectStore(_STORE).getAll();
        req.onsuccess = () => res((req.result || []).reverse());
        req.onerror   = () => rej(req.error);
    });
}

/** Delete a record by id. */
async function _deleteHistory(id) {
    const db = await _openDB();
    const tx = db.transaction(_STORE, 'readwrite');
    return new Promise((res, rej) => {
        const req = tx.objectStore(_STORE).delete(id);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

/** Format ISO date string to Thai locale. */
function _fmtDate(iso) {
    try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
}

/** Render the history list inside #rpanel-history. */
async function renderHistoryPanel() {
    const container = document.getElementById('history-list');
    if (!container) return;

    container.innerHTML = '<p class="text-[11px] text-slate-300 text-center italic mt-4"><i class="fas fa-spinner fa-spin mr-1"></i> กำลังโหลด...</p>';

    let records;
    try { records = await _getAllHistory(); }
    catch (e) {
        container.innerHTML = `<p class="text-[11px] text-red-400 text-center italic mt-4">โหลดประวัติไม่ได้: ${e.message}</p>`;
        return;
    }

    if (!records.length) {
        container.innerHTML = '<p class="text-[11px] text-slate-300 text-center italic mt-4">ยังไม่มีประวัติ</p>';
        return;
    }

    container.innerHTML = records.map(r => `
        <div class="group flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-50 transition cursor-pointer border border-transparent hover:border-slate-200"
             onclick="loadHistoryItem(${r.id})">
            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center text-xs flex-none mt-0.5">
                <i class="fas fa-file-audio"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-slate-700 truncate">${r.fileName || 'ไม่ระบุชื่อ'}</p>
                <p class="text-[10px] text-slate-400">${_fmtDate(r.date)}</p>
                <div class="flex gap-2 mt-0.5">
                    ${r.duration ? `<span class="text-[10px] text-slate-400"><i class="fas fa-clock mr-1"></i>${r.duration}</span>` : ''}
                    ${r.speakers ? `<span class="text-[10px] text-slate-400"><i class="fas fa-users mr-1"></i>${r.speakers} คน</span>` : ''}
                </div>
            </div>
            <button onclick="event.stopPropagation();_historyDelete(${r.id})"
                class="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 text-[10px] transition mt-1">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

/** Load a history item into the main view. */
async function loadHistoryItem(id) {
    let records;
    try { records = await _getAllHistory(); }
    catch { return; }
    const r = records.find(x => x.id === id);
    if (!r) return;

    state.results.final   = r.transcript || '';
    state.results.summary = r.summary    || '';

    renderClickableText(finalText, state.results.final);
    document.getElementById('file-title').textContent        = r.fileName || '—';
    document.getElementById('stat-duration').textContent     = r.duration  || '—';
    document.getElementById('stat-speakers').textContent     = r.speakers ? `${r.speakers} คน` : '—';

    if (r.summary) {
        document.getElementById('summary-area').innerHTML =
            `<div class="prose prose-sm max-w-none text-slate-700 leading-relaxed">${renderMarkdown(r.summary)}</div>`;
    }

    switchTab('transcript');
    switchRight('summary');
    showStatus('📂 โหลดประวัติ: ' + (r.fileName || ''), 'ok');
    setTimeout(hideStatus, 3000);
}

/** Delete and re-render history. */
async function _historyDelete(id) {
    if (!confirm('ลบรายการนี้?')) return;
    await _deleteHistory(id);
    renderHistoryPanel();
}
