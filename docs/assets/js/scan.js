// frontend/assets/js/scan.js

// Pastikan fungsi addResidentToBackend dan dataURLtoBlob tersedia dari app.js
if (typeof addResidentToBackend === 'undefined' || typeof dataURLtoBlob === 'undefined') {
    console.error('Error: app.js belum dimuat dengan lengkap.');
}

// ====================================================================
// LOGIKA KAMERA (WebRTC)
// ====================================================================

let currentStream;

/**
 * Mengaktifkan webcam dan menampilkan di elemen video
 */
function startWebcam(videoElement) {
    const placeholder = document.getElementById('camera-placeholder');
    const faceFrame = document.getElementById('face-frame');
    
    faceFrame.classList.add('hidden');
    placeholder.textContent = "Meminta izin kamera...";
    
    if (!videoElement || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        placeholder.innerHTML = "Browser Anda tidak mendukung WebRTC atau elemen tidak ditemukan.";
        return;
    }

    if (currentStream) {
        stopWebcam(); 
    }

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function(stream) {
            currentStream = stream;
            videoElement.srcObject = stream;
            
            videoElement.classList.remove('hidden'); 
            videoElement.style.display = 'block';    
            placeholder.style.display = 'none';      
            
            faceFrame.classList.remove('hidden'); 
            console.log("Webcam berhasil diaktifkan.");
            
            // Tampilkan nama di header setelah kamera aktif
            loadResidentName();
            
        })
        .catch(function(err) {
            console.error("Error accessing webcam: ", err);
            videoElement.classList.add('hidden');
            videoElement.style.display = 'none';
            placeholder.style.display = 'flex';
            
            if (err.name === "NotAllowedError" || err.name === "NotReadableError") {
                 placeholder.innerHTML = "Akses Kamera DITOLAK. Mohon berikan izin di pengaturan browser Anda.";
            } else {
                 placeholder.innerHTML = `Gagal Akses Kamera: ${err.name}.`;
            }
        });
}

/**
 * Menghentikan stream kamera
 */
function stopWebcam() {
    const videoElement = document.getElementById('webcam-feed');
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
        currentStream = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement.classList.add('hidden');
        const placeholder = document.getElementById('camera-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.textContent = "Siap Mengakses Kamera...";
        }
    }
    const faceFrame = document.getElementById('face-frame');
    if (faceFrame) {
        faceFrame.classList.add('hidden');
    }
}


/**
 * Mengambil nama dari URL query parameter
 */
function loadResidentName() {
    const urlParams = new URLSearchParams(window.location.search);
    const residentName = urlParams.get('name');
    
    const titleElement = document.getElementById('scan-title');
    if (residentName && titleElement) {
        titleElement.textContent = `Pendaftaran Wajah: ${decodeURIComponent(residentName)}`;
    } else if (titleElement) {
        titleElement.textContent = "Pendaftaran Wajah: (Nama Tidak Ditemukan)";
    }
    return residentName;
}


// ====================================================================
// LOGIKA CONTINUOUS CAPTURE (500 FRAMES)
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-scan-btn');
    if (!startButton) return; 

    // Ambli nama penghuni dari URL
    const residentName = loadResidentName();
    if (!residentName) {
        startButton.disabled = true;
        document.getElementById('scan-status').textContent = "ERROR: Nama penghuni tidak ditemukan di URL. Kembali ke halaman Akun.";
        return;
    }

    const totalFrames = 500;
    
    startButton.addEventListener('click', function initialStart(event) {
        event.preventDefault(); 
        
        const statusElement = document.getElementById('scan-status');
        const progressElement = document.getElementById('scan-progress');
        const webcamFeed = document.getElementById('webcam-feed');

        if (!currentStream) {
            alert('Kamera belum aktif. Silakan tunggu atau izinkan akses kamera.');
            return;
        }

        let capturedImages = []; 
        let captureInterval = null;
        
        startButton.disabled = true;
        startButton.textContent = `Merekam Sampel (0/${totalFrames})...`;
        statusElement.textContent = "Mulai gerakan kepala dan ekspresi secara perlahan...";

        function captureFrame() {
            if (capturedImages.length >= totalFrames) {
                clearInterval(captureInterval);
                statusElement.textContent = "Pendaftaran Selesai! Mengolah data dan mengirim ke server...";
                startButton.textContent = "Mengirim Data...";
                
                sendTrainingData(residentName, capturedImages);
                return;
            }
            
            // Logika pengambilan frame
            const canvas = document.createElement('canvas');
            canvas.width = webcamFeed.videoWidth;
            canvas.height = webcamFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(webcamFeed, 0, 0, canvas.width, canvas.height);
            
            const imageData = canvas.toDataURL('image/jpeg');
            // Hanya simpan data, tidak perlu pose name yang spesifik
            capturedImages.push({ data: imageData }); 
            
            // Update UI
            const currentCount = capturedImages.length;
            progressElement.style.width = `${(currentCount / totalFrames) * 100}%`;
            startButton.textContent = `Merekam Sampel (${currentCount}/${totalFrames})...`;
        }

        // Mulai interval pengambilan frame (misal 10 frame per detik)
        const frameRateMs = 100; // 100ms = 10 fps. 500 frames membutuhkan 100 detik.
        captureInterval = setInterval(captureFrame, frameRateMs);
    });
});

/**
 * Mengirim data gambar ke Backend untuk penyimpanan dan pelatihan
 */
async function sendTrainingData(residentName, images) {
    const statusElement = document.getElementById('scan-status');
    const startButton = document.getElementById('start-scan-btn');
    
    if (images.length === 0) {
         alert("Error: Tidak ada gambar wajah yang berhasil diambil. Proses dibatalkan.");
         return;
    }

    // NOTE:
    // Scan 500 sampel menghasilkan multipart form dengan > 500 "parts".
    // Pada Flask/Werkzeug versi baru, ada limit default jumlah parts (sering 500)
    // sehingga request bisa ditolak (413/400) SEBELUM sampai ke route.
    // Solusi paling aman: upload bertahap (batch) + training sekali di akhir.

    const totalImages = images.length;
    const batchSize = 80; // aman (<< 500 parts)
    const totalBatches = Math.ceil(totalImages / batchSize);

    statusElement.textContent = `Mengirim ${totalImages} gambar ke server (batch ${totalBatches}x)...`;

    // Helper: ambil pesan error dari response meskipun server mengembalikan HTML
    async function readErrorMessage(resp) {
        try {
            const ct = (resp.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('application/json')) {
                const j = await resp.json();
                return j.message || JSON.stringify(j);
            }
            const t = await resp.text();
            // potong biar tidak kepanjangan
            return (t || '').slice(0, 200);
        } catch (_e) {
            return resp.statusText || `HTTP ${resp.status}`;
        }
    }

    try {
        let lastUploadResult = null;

        // --- 1) UPLOAD BERTAHAP ---
        for (let b = 0; b < totalBatches; b++) {
            const start = b * batchSize;
            const end = Math.min(start + batchSize, totalImages);
            const batch = images.slice(start, end);

            statusElement.textContent = `Mengirim batch ${b + 1}/${totalBatches} (${end}/${totalImages})...`;

            const formData = new FormData();
            formData.append('name', residentName);

            batch.forEach((img, i) => {
                const blob = dataURLtoBlob(img.data);
                const globalIndex = start + i + 1;
                const filename = `${residentName.replace(/\s/g, '_')}_${globalIndex}.jpeg`;
                // Jangan kirim field tambahan (poses) agar parts tidak membengkak
                formData.append('faces', blob, filename);
            });

            // train=0 agar training tidak diulang-ulang
            const uploadResponse = await fetch(MOCK_API_BASE + '/upload/faces?train=0', {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                const msg = await readErrorMessage(uploadResponse);
                throw new Error(`Gagal Unggah Wajah (batch ${b + 1}): ${msg}`);
            }

            lastUploadResult = await uploadResponse.json();
        }

        // --- 2) TRAINING SEKALI DI AKHIR ---
        statusElement.textContent = 'Upload selesai. Menjalankan training model...';
        try {
            const trainResp = await fetch(MOCK_API_BASE + '/train', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_images_per_person: 200 }),
            });
            if (!trainResp.ok) {
                const msg = await readErrorMessage(trainResp);
                console.warn('Training gagal:', msg);
            }
        } catch (trainErr) {
            console.warn('Training gagal (exception):', trainErr);
        }

        // --- 3) SIMPAN / UPDATE METADATA RESIDENT ---
        let finalFaceCount = (lastUploadResult && lastUploadResult.face_count) ? lastUploadResult.face_count : totalImages;

        // Jika tersedia, gunakan checkDatasetExistence untuk angka paling akurat
        if (typeof checkDatasetExistence !== 'undefined') {
            const ds = await checkDatasetExistence(residentName);
            if (ds && typeof ds.face_count === 'number') {
                finalFaceCount = ds.face_count;
            }
        }

        // Jika scan dipanggil dari edit.html (mode=update&id=...), update resident tsb
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const idParam = urlParams.get('id');
        let targetId = idParam ? parseInt(idParam, 10) : null;

        // Jika tidak ada ID, coba cari existing resident berdasarkan nama
        if (!targetId && typeof fetchResidents !== 'undefined') {
            const existing = await fetchResidents();
            const found = (existing || []).find(r => (r.name || '').trim().toLowerCase() === residentName.trim().toLowerCase());
            if (found && found.id) targetId = found.id;
        }

        let newResident = null;
        if (targetId && !Number.isNaN(targetId)) {
            const updatePayload = { name: residentName, role: 'Penghuni', face_count: finalFaceCount };
            const updateResp = await fetch(MOCK_API_BASE + `/residents/${targetId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatePayload),
            });
            if (!updateResp.ok) {
                const msg = await readErrorMessage(updateResp);
                throw new Error(`Gagal update penghuni: ${msg}`);
            }
            newResident = await updateResp.json();
        } else {
            newResident = await addResidentToBackend({
                name: residentName,
                role: 'Penghuni',
                face_count: finalFaceCount,
            });
        }
        
        // 4. Sukses Penuh & NAVIGASI
        alert(`Data penghuni ${newResident.name} berhasil disimpan. Total sampel: ${newResident.face_count ?? finalFaceCount}. Anda akan diarahkan ke halaman Akun.`);
        
        stopWebcam(); 
        window.location.href = 'akun.html'; 
        

    } catch(e) {
        // PERINGATAN: Meskipun gagal, kita tetap navigasi karena file sudah terupload di langkah 2
        console.error("Kesalahan Proses Pendaftaran:", e);
        
        alert(`PERINGATAN: Gagal menyelesaikan pendaftaran (${e.message}). Jika upload sempat berjalan, data wajah mungkin sudah tersimpan. Silakan periksa halaman Akun secara manual.`);
        
        stopWebcam();
        window.location.href = 'akun.html'; 
        
    } finally {
        // Reset button state
        startButton.disabled = false;
        startButton.textContent = "Mulai Perekaman 500 Sampel";
        document.getElementById('scan-progress').style.width = "0%";
        statusElement.textContent = "Tekan 'Mulai' untuk memulai proses pengambilan 500 sampel.";
        
        // Catatan: listener awal dipasang sekali saat DOMContentLoaded.
        // Tidak perlu re-attach listener di sini.
    }
}