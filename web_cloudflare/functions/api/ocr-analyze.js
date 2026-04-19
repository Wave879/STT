/**
 * Azure Document Intelligence OCR proxy
 * POST /api/ocr-analyze
 */

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    });
}

export async function onRequestPost({ request, env }) {
    try {
        return await handleOcr(request, env);
    } catch (err) {
        return jsonResponse({ detail: 'Unhandled error: ' + String(err) }, 500);
    }
}

async function handleOcr(request, env) {
    const endpoint = (env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || '').replace(/\/$/, '');
    const key = env.AZURE_DOCUMENT_INTELLIGENCE_KEY || '';

    if (!endpoint || !key) {
        return jsonResponse({ detail: 'Missing Azure credentials.' }, 500);
    }

    let form;
    try { form = await request.formData(); }
    catch (e) { return jsonResponse({ detail: 'FormData parse error: ' + e.message }, 400); }

    const fileBlob = form.get('file');
    if (!fileBlob) return jsonResponse({ detail: 'No "file" field in FormData' }, 400);

    const fileName = fileBlob.name || 'document';
    const browserMime = fileBlob.type || '';

    // Read raw bytes first
    const fileBytes = typeof fileBlob.arrayBuffer === 'function'
        ? await fileBlob.arrayBuffer()
        : await new Response(fileBlob).arrayBuffer();

    // Detect PDF by magic bytes %PDF (most reliable — handles Thai filenames & wrong MIME)
    const magic = new Uint8Array(fileBytes, 0, 4);
    const isPdf = (magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46)
        || fileName.toLowerCase().endsWith('.pdf')
        || browserMime === 'application/pdf'
        || browserMime === 'application/x-pdf';

    const contentType = isPdf ? 'application/pdf' : (browserMime || 'image/jpeg');

    // Submit to Azure DI — plain text format so content is in lines/paragraphs
    const analyzeUrl = endpoint
        + '/documentintelligence/documentModels/prebuilt-layout:analyze'
        + '?api-version=2024-11-30';

    let submitRes;
    try {
        submitRes = await fetch(analyzeUrl, {
            method: 'POST',
            headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': contentType },
            body: fileBytes,
        });
    } catch (e) {
        return jsonResponse({ detail: 'Network error: ' + e.message }, 502);
    }

    if (!submitRes.ok) {
        const txt = await submitRes.text();
        return jsonResponse({ detail: 'Azure DI submit failed (' + submitRes.status + '): ' + txt.slice(0, 800) }, 502);
    }

    const opUrl = submitRes.headers.get('Operation-Location');
    if (!opUrl) return jsonResponse({ detail: 'No Operation-Location from Azure DI' }, 502);

    // Poll — max 40 x 1.5s = 60s
    let analyzeResult = null;
    for (var i = 0; i < 40; i++) {
        await new Promise(function(r) { setTimeout(r, 1500); });
        var pollRes;
        try { pollRes = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': key } }); }
        catch (e) { return jsonResponse({ detail: 'Poll network error: ' + e.message }, 502); }

        if (!pollRes.ok) {
            var etxt = await pollRes.text();
            return jsonResponse({ detail: 'Poll failed (' + pollRes.status + '): ' + etxt.slice(0, 500) }, 502);
        }

        var pollData = await pollRes.json();
        if (pollData.status === 'succeeded') { analyzeResult = pollData.analyzeResult; break; }
        if (pollData.status === 'failed') return jsonResponse({ detail: 'Azure DI failed: ' + JSON.stringify(pollData.error) }, 502);
    }

    if (!analyzeResult) return jsonResponse({ detail: 'Azure DI timed out.' }, 504);

    var azPages = analyzeResult.pages || [];
    var azParagraphs = analyzeResult.paragraphs || [];
    var azTables = analyzeResult.tables || [];
    var rawContent = analyzeResult.content || '';

    // Only encode as image for non-PDF files under 4MB
    var imageDataUrl = null;
    if (!isPdf && fileBytes.byteLength < 4 * 1024 * 1024) {
        imageDataUrl = 'data:' + contentType + ';base64,' + toBase64(fileBytes);
    }

    var pagePayload = azPages.map(function(page, idx) {
        var num = page.pageNumber || (idx + 1);
        var w = page.width || 1;
        var h = page.height || 1;

        // Text from lines
        var pageText = (page.lines || []).map(function(l) { return (l.content || '').trim(); }).filter(Boolean).join('\n');

        // Paragraphs for this page
        var pageParagraphs = azParagraphs
            .filter(function(p) {
                return (p.boundingRegions || []).some(function(r) { return r.pageNumber === num; });
            })
            .map(function(p) {
                var reg = (p.boundingRegions || []).find(function(r) { return r.pageNumber === num; }) || {};
                return { content: (p.content || '').trim(), role: p.role || 'text', polygon: reg.polygon || [] };
            });

        var pageTables = azTables
            .filter(function(t) { return (t.boundingRegions || []).some(function(r) { return r.pageNumber === num; }); })
            .map(buildTable);

        var boxes = buildBoxes(pageParagraphs, page.lines || [], w, h);

        var preview = null;
        if (imageDataUrl && idx === 0) {
            preview = { image: imageDataUrl, width: Math.round(w * 96), height: Math.round(h * 96) };
        }

        return { pageNumber: num, width: w, height: h, unit: page.unit || 'inch', text: pageText, paragraphs: pageParagraphs, tables: pageTables, boxes: boxes, preview: preview };
    });

    var markdown = rawContent || buildMarkdown(pagePayload);

    return jsonResponse({
        filename: fileName,
        pageCount: pagePayload.length,
        markdown: markdown,
        rawText: rawContent.slice(0, 50000), // cap to avoid size issues
        pages: pagePayload,
        _debug: {
            filename: fileName,
            browserMime: browserMime,
            isPdf: isPdf,
            contentType: contentType,
            fileSizeBytes: fileBytes.byteLength,
            rawContentLength: rawContent.length,
            pagesCount: azPages.length,
            paragraphsCount: azParagraphs.length,
            page0Lines: (azPages[0] ? (azPages[0].lines || []).length : 0),
        },
    }, 200);
}

function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 32768;
    var s = '';
    for (var i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
}

function buildTable(table) {
    var headers = {};
    var rows = {};
    (table.cells || []).forEach(function(cell) {
        var r = cell.rowIndex || 0;
        var c = cell.columnIndex || 0;
        var txt = (cell.content || '').trim();
        if (r === 0) { headers[c] = txt || ('Col_' + (c + 1)); return; }
        if (!rows[r]) rows[r] = {};
        rows[r][headers[c] || ('Col_' + (c + 1))] = txt;
    });
    return Object.values(rows);
}

function polygonToBounds(poly, w, h) {
    if (!poly || poly.length < 8 || !w || !h) return null;
    var xs = poly.filter(function(_, i) { return i % 2 === 0; }).map(function(x) { return x / w; });
    var ys = poly.filter(function(_, i) { return i % 2 === 1; }).map(function(y) { return y / h; });
    var l = Math.min.apply(null, xs), t = Math.min.apply(null, ys), r2 = Math.max.apply(null, xs), b = Math.max.apply(null, ys);
    return {
        left: Math.max(0, Math.min(1, l)),
        top: Math.max(0, Math.min(1, t)),
        width: Math.max(0, Math.min(1, r2 - l)),
        height: Math.max(0, Math.min(1, b - t)),
    };
}

function buildBoxes(paragraphs, lines, w, h) {
    var boxes = [];
    var titleUsed = false;
    for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        var bounds = polygonToBounds(p.polygon, w, h);
        if (!bounds) continue;
        var label = (p.role && p.role !== 'text') ? p.role : 'text';
        if (label === 'text' && !titleUsed && (p.content || '').length > 40) { label = 'title'; titleUsed = true; }
        boxes.push({ label: label, content: p.content || '', bounds: bounds });
    }
    if (boxes.length) return boxes;
    for (var j = 0; j < lines.length; j++) {
        var b2 = polygonToBounds(lines[j].polygon, w, h);
        if (b2) boxes.push({ label: 'text', content: lines[j].content || '', bounds: b2 });
    }
    return boxes;
}

function buildMarkdown(pages) {
    return pages.map(function(page) {
        var parts = [];
        (page.paragraphs || []).forEach(function(p) {
            var c = (p.content || '').trim();
            if (!c) return;
            if (p.role === 'title') parts.push('# ' + c);
            else if (p.role === 'sectionHeading') parts.push('## ' + c);
            else if (p.role === 'footnote') parts.push('_' + c + '_');
            else parts.push(c);
        });
        return parts.join('\n\n');
    }).join('\n\n---\n\n');
}
