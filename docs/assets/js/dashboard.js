// frontend/assets/js/dashboard.js

// Menampilkan log terbaru pada Dashboard (index.html)

if (typeof fetchLogs === 'undefined') {
    console.error('Error: app.js (fetchLogs) belum dimuat.');
} else {
    document.addEventListener('DOMContentLoaded', () => {
        renderLatestLogs();
        startDashboardCamera();
    });
}

// ====================================================================
// LIVE CAMERA FEED (WebRTC) untuk Dashboard
// Catatan: HTML UI tidak diubah; video element disisipkan via JS.
// ====================================================================

let dashboardStream = null;
let recognitionTimer = null;
let overlayCanvas = null;
let overlayCtx = null;

async function startDashboardCamera() {
    // Ambil container feed video pada kartu "Live Camera Feed"
    // Selector ini mengarah ke div .aspect-video di card kiri.
    const container = document.querySelector('.lg\\:col-span-2 .aspect-video');
    if (!container) return;

    // Cegah duplikasi
    if (container.querySelector('video')) return;

    // Buat video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // hindari feedback audio
    video.className = 'w-full h-full object-cover';

    // Ganti placeholder menjadi video
    container.innerHTML = '';
    // Pastikan canvas overlay bisa diposisikan di atas video
    container.style.position = 'relative';
    container.appendChild(video);

    // Canvas overlay untuk tracing bbox (kotak deteksi wajah)
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.className = 'absolute inset-0 w-full h-full pointer-events-none';
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.width = '100%';
    overlayCanvas.style.height = '100%';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCtx = overlayCanvas.getContext('2d');
    container.appendChild(overlayCanvas);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        container.innerHTML = '<span class="text-sm text-gray-500">Browser tidak mendukung akses kamera (WebRTC).</span>';
        return;
    }

    try {
        dashboardStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = dashboardStream;

        // Mulai loop pengenalan dari frame browser -> backend
        startRealtimeRecognitionFromDashboard(video);
    } catch (err) {
        console.error('Gagal akses kamera dashboard:', err);
        const reason = err && err.name ? err.name : 'UnknownError';
        container.innerHTML = `<span class="text-sm text-gray-500">Gagal akses kamera: ${reason}. Cek izin kamera di browser.</span>`;
    }
}

window.addEventListener('beforeunload', () => {
    if (dashboardStream) {
        dashboardStream.getTracks().forEach(t => t.stop());
        dashboardStream = null;
    }

    if (recognitionTimer) {
        clearInterval(recognitionTimer);
        recognitionTimer = null;
    }

    if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
});

// ====================================================================
// Realtime Recognition via Browser Frame
// - Menghindari konflik akses kamera (browser vs OpenCV worker)
// - Mengirim frame JPEG ke backend /api/recognition/frame
// - Backend akan menulis event ke DB -> UI log akan terisi
// ====================================================================

function setDashboardStatus(text, ok = true) {
    // HTML UI tidak diubah; status span adalah elemen kedua dalam teks "Status: ..."
    const statusSpan = document.querySelector('.lg\\:col-span-2 p.mt-4 span');
    if (!statusSpan) return;
    statusSpan.textContent = text;
    statusSpan.classList.remove('text-green-400', 'text-red-400', 'text-yellow-400');
    statusSpan.classList.add(ok ? 'text-green-400' : 'text-yellow-400');
}

function startRealtimeRecognitionFromDashboard(videoEl) {
    if (recognitionTimer) return;
    if (typeof MOCK_API_BASE === 'undefined') {
        console.warn('MOCK_API_BASE tidak tersedia. app.js belum dimuat?');
        return;
    }

    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

    // Kirim 1 frame / detik (cukup untuk demo + hemat CPU)
    const FPS = 1;

    recognitionTimer = setInterval(async () => {
        try {
            if (!videoEl || videoEl.readyState < 2) return; // belum ada frame

            const vw = videoEl.videoWidth || 640;
            const vh = videoEl.videoHeight || 360;

            // Resize supaya payload kecil
            const targetW = 640;
            const targetH = Math.round((vh / vw) * targetW);
            captureCanvas.width = targetW;
            captureCanvas.height = targetH;
            captureCtx.drawImage(videoEl, 0, 0, targetW, targetH);

            const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.7);

            const res = await fetch(MOCK_API_BASE + '/recognition/frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl })
            });

            // Backend selalu JSON untuk /api/*
            const out = await res.json();

            if (!res.ok) {
                console.warn('Recognition error:', out);
                setDashboardStatus('Aktif (Recognition Error)', false);
                return;
            }

            if (out && out.detected) {
                // Tampilkan status ringkas: kategori + nama
                const isKnown = out.name && out.name.toLowerCase() !== 'unknown' && out.status === 'MASUK';
                const category = isKnown ? 'Penghuni' : 'Unknown';
                const label = out.name || 'Unknown';
                setDashboardStatus(`Aktif, ${category} (${label})`, true);

                // Gambar kotak tracing berdasarkan bbox yang dikirim backend
                if (overlayCanvas && overlayCtx) {
                    drawFaceOverlay(overlayCanvas, overlayCtx, out, {
                        srcW: (out.image_size && out.image_size.w) ? out.image_size.w : targetW,
                        srcH: (out.image_size && out.image_size.h) ? out.image_size.h : targetH,
                    });
                }

                // Refresh log terbaru agar langsung tampil
                renderLatestLogs();
            } else {
                setDashboardStatus('Aktif (Tidak ada wajah)', true);
                if (overlayCanvas && overlayCtx) {
                    clearOverlay(overlayCanvas, overlayCtx);
                }
            }
        } catch (e) {
            console.error('Realtime recognition loop error:', e);
            setDashboardStatus('Aktif (Backend belum siap)', false);
            if (overlayCanvas && overlayCtx) {
                clearOverlay(overlayCanvas, overlayCtx);
            }
        }
    }, Math.round(1000 / FPS));
}

function clearOverlay(cnv, ctx) {
    // Reset size to match displayed element (retina aware)
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(cnv.clientWidth * dpr));
    const h = Math.max(1, Math.floor(cnv.clientHeight * dpr));
    if (cnv.width !== w || cnv.height !== h) {
        cnv.width = w;
        cnv.height = h;
    }
    ctx.clearRect(0, 0, cnv.width, cnv.height);
}

function drawFaceOverlay(cnv, ctx, out, { srcW, srcH }) {
    clearOverlay(cnv, ctx);
    const faces = (out && out.faces) ? out.faces : [];
    if (!faces.length) return;

    const dpr = window.devicePixelRatio || 1;
    const scaleX = (cnv.width / dpr) / (srcW || 1);
    const scaleY = (cnv.height / dpr) / (srcH || 1);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'top';

    for (const f of faces) {
        const b = f.bbox || {};
        const x = (b.x || 0) * scaleX;
        const y = (b.y || 0) * scaleY;
        const w = (b.w || 0) * scaleX;
        const h = (b.h || 0) * scaleY;

        const isKnown = !!f.known;
        ctx.strokeStyle = isKnown ? '#22c55e' : '#f59e0b';
        ctx.fillStyle = isKnown ? '#22c55e' : '#f59e0b';

        // Kotak
        ctx.strokeRect(x, y, w, h);

        // Label
        const label = (f.name || 'Unknown');
        const badge = isKnown ? `Penghuni: ${label}` : 'Unknown';
        const pad = 6;
        const textW = ctx.measureText(badge).width;
        const boxH = 20;
        const bx = x;
        const by = Math.max(0, y - boxH - 2);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx, by, textW + pad * 2, boxH);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b1020';
        ctx.fillText(badge, bx + pad, by + 3);
    }

    ctx.restore();
}

/**
 * Render 5 log terbaru (untuk Dashboard)
 */
async function renderLatestLogs() {
    const listElement = document.getElementById('latest-logs-list');
    if (!listElement) return;

    listElement.innerHTML = `<li class="text-gray-500 text-sm">Memuat log...</li>`;

    try {
        const fetchedLogs = await fetchLogs();
        const latest = (fetchedLogs || []).slice(0, 5);

        listElement.innerHTML = '';

        if (latest.length === 0) {
            listElement.innerHTML = `<li class="text-gray-500 text-sm">Belum ada aktivitas terdeteksi.</li>`;
            return;
        }

        latest.forEach(log => {
            const category = (log.category || ((log.name && log.name.toLowerCase() !== 'unknown' && log.status === 'MASUK') ? 'PENGHUNI' : 'UNKNOWN'));
            const statusClass = category === 'PENGHUNI'
                ? 'bg-green-900/50 text-green-400'
                : 'bg-yellow-900/50 text-yellow-400';

            const timeString = log.timestamp.toLocaleTimeString('id-ID');

            const item = `
                <li class="flex items-center justify-between bg-[#1f2430] p-3 rounded-lg border border-gray-700/50">
                    <div>
                        <p class="font-semibold text-white">${log.name}</p>
                        <span class="text-xs font-medium px-2 py-1 rounded-full ${statusClass}">${category}</span>
                    </div>
                    <p class="text-xs text-gray-400">${timeString}</p>
                </li>
            `;

            listElement.innerHTML += item;
        });

    } catch (error) {
        console.error('Error rendering latest logs:', error);
        listElement.innerHTML = `<li class="text-red-400 text-sm">Gagal memuat log. Pastikan backend berjalan.</li>`;
    }
}
