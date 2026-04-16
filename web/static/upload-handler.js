/**
 * Upload and STT Processing Handler for index.html
 */

let currentJobId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎤 Upload handler initialized');
    setupUploadHandlers();
});

function setupUploadHandlers() {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const mainButton = document.getElementById('main-action-btn');

    if (!fileInput || !dropZone || !mainButton) {
        console.error('❌ Upload form elements not found');
        return;
    }

    // Drag & drop
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-400', 'bg-indigo-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-400', 'bg-indigo-50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-400', 'bg-indigo-50');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            updateUI(files[0].name);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            updateUI(e.target.files[0].name);
        }
    });

    // Process button
    mainButton.addEventListener('click', () => {
        if (!fileInput.files.length) {
            alert('❌ กรุณาเลือกไฟล์เสียง');
            return;
        }
        startProcessing(fileInput.files[0]);
    });
}

function updateUI(filename) {
    const dropZone = document.getElementById('drop-zone');
    const icon = dropZone.querySelector('i');
    const p1 = dropZone.querySelector('p:nth-of-type(1)');
    const p2 = dropZone.querySelector('p:nth-of-type(2)');

    if (icon) icon.className = 'fas fa-file-audio text-4xl text-green-500';
    if (p1) p1.textContent = `✓ ${filename}`;
    if (p2) p2.textContent = 'พร้อมประมวลผล';

    dropZone.classList.add('bg-green-50', 'border-green-300');
}

async function startProcessing(file) {
    console.log(`📤 Uploading: ${file.name}`);
    
    const mainBtn = document.getElementById('main-action-btn');
    mainBtn.disabled = true;
    mainBtn.textContent = 'กำลังอัพโหลด...';

    try {
        // Step 1: Upload
        const uploadForm = new FormData();
        uploadForm.append('audio', file);

        const uploadResp = await fetch('/api/upload', {
            method: 'POST',
            body: uploadForm
        });

        if (uploadResp.status !== 200) {
            throw new Error(`Upload failed: HTTP ${uploadResp.status}`);
        }

        const uploadData = await uploadResp.json();
        currentJobId = uploadData.job_id;
        console.log(`✅ Uploaded: ${currentJobId}`);

        // Step 2: Start processing
        mainBtn.textContent = 'กำลังเริ่มประมวลผล...';
        const processResp = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: currentJobId })
        });

        if (processResp.status !== 200) {
            throw new Error(`Process failed: HTTP ${processResp.status}`);
        }

        console.log('✅ Processing started');
        mainBtn.textContent = 'ประมวลผลกำลังดำเนิน...';

        // Step 3: Poll status
        pollStatus();
    } catch (error) {
        console.error('❌ Error:', error);
        mainBtn.disabled = false;
        mainBtn.textContent = 'ประมวลผลทันที';
        mainBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';

        // Show error message
        const step2 = document.getElementById('step-2');
        if (step2) {
            step2.innerHTML = `<div class="text-red-600 font-bold">❌ ${error.message}</div>`;
        }
    }
}

async function pollStatus() {
    if (!currentJobId) return;

    const maxAttempts = 120; // 2 minutes
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const resp = await fetch(`/api/status/${currentJobId}`);
            if (resp.status !== 200) {
                console.error(`Status check failed: HTTP ${resp.status}`);
                break;
            }

            const job = await resp.json();
            updateProgress(job);

            if (job.status === 'complete' || job.status === 'error') {
                displayResults(job);
                break;
            }
        } catch (error) {
            console.error('Poll error:', error);
            break;
        }

        await new Promise(r => setTimeout(r, 1000));
    }
}

function updateProgress(job) {
    const step = job.step || 0;
    const msg = job.message || '';

    console.log(`[Step ${step}] ${msg}`);

    // Update step indicators
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        const dotEl = document.getElementById(`dot-${i}`);
        if (!stepEl || !dotEl) continue;

        if (i < step) {
            stepEl.classList.remove('opacity-40');
            dotEl.innerHTML = '<i class="fas fa-check text-white text-xs"></i>';
            dotEl.classList = 'w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs';
        } else if (i === step) {
            stepEl.classList.remove('opacity-40');
            dotEl.innerHTML = `<i class="fas fa-spinner fa-spin text-indigo-600 text-xs"></i>`;
            dotEl.classList = 'w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs';
        }
    }

    // Update message
    const step3Label = document.querySelector('#step-3 p');
    if (step3Label) step3Label.textContent = msg || 'STT Engines';
}

function displayResults(job) {
    console.log('✅ Processing complete:', job);

    const mainBtn = document.getElementById('main-action-btn');
    
    if (job.status === 'error') {
        mainBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        mainBtn.textContent = '❌ เกิดข้อผิดพลาด';
        
        const resultArea = document.querySelector('[id*="result"]') || document.createElement('div');
        resultArea.innerHTML = `<div class="text-red-600 font-bold">❌ Error: ${job.message}</div>`;
        document.body.appendChild(resultArea);
    } else {
        mainBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        mainBtn.textContent = '✅ สำเร็จ!';

        // Show results (simple display)
        const resultDiv = document.createElement('div');
        resultDiv.className = 'fixed bottom-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-xl max-w-xs';
        resultDiv.innerHTML = `
            <h3 class="font-bold mb-2">📝 ผลลัพธ์</h3>
            <p><strong>Azure:</strong> ${(job.stt_azure || '').substring(0, 50)}...</p>
            <p><strong>Whisper:</strong> ${(job.stt_whisper || '').substring(0, 50)}...</p>
            <p><strong>MAI:</strong> ${(job.stt_mai || '').substring(0, 50)}...</p>
        `;
        document.body.appendChild(resultDiv);

        setTimeout(() => resultDiv.remove(), 5000);
    }

    // Update progress
    updateProgress({ step: 5, message: 'สำเร็จ' });
}

console.log('🎤 Upload handler ready');
