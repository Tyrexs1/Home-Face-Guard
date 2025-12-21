// frontend/assets/js/app.js

// ====================================================================
// PLACEHOLDER API FUNCTIONS (Siap diisi dengan Panggilan 'fetch' ke Backend Flask)
// ====================================================================

const MOCK_API_BASE = 'https://home-face-guard.onrender.com/';

        
let residents = [];
let logs = [];

/**
 * Mengambil data Penghuni dari Backend
 */
async function fetchResidents() {
    console.log("API: Fetching /api/residents...");
    
    try {
        const response = await fetch(MOCK_API_BASE + '/residents');
        if (!response.ok) {
            // Jika backend tidak berjalan atau endpoint error (misal 500)
            throw new Error(`Failed to fetch residents (Status: ${response.status})`);
        }
        return await response.json(); // Backend harus mengembalikan array JSON
    } catch (error) {
        console.error("Error fetching residents:", error);
        // Mengembalikan array kosong jika gagal
        return []; 
    }
}

/**
 * Mengambil data Log dari Backend (Saat ini placeholder kosong)
 */
async function fetchLogs() {
    console.log("API: Fetching /api/logs...");
    try {
        const response = await fetch(MOCK_API_BASE + '/logs?limit=200');
        if (!response.ok) {
            throw new Error(`Failed to fetch logs (Status: ${response.status})`);
        }

        const data = await response.json();

        // Normalisasi timestamp agar konsisten dipakai di UI (Date object)
        const parsed = (data || []).map(item => {
            let ts = item.timestamp;
            let dateObj = null;

            if (typeof ts === 'string' && ts.includes(' ')) {
                // Format SQLite default: "YYYY-MM-DD HH:MM:SS"
                const [dPart, tPart] = ts.split(' ');
                const [y, m, d] = dPart.split('-').map(Number);
                const [hh, mm, ss] = tPart.split(':').map(Number);
                dateObj = new Date(y, (m - 1), d, hh, mm, ss || 0);
            } else {
                const tmp = new Date(ts);
                dateObj = isNaN(tmp.getTime()) ? new Date() : tmp;
            }

            return { ...item, timestamp: dateObj };
        });

        return parsed;

    } catch (error) {
        console.error("Error fetching logs:", error);
        return [];
    }
}

/**
 * Menambahkan Penghuni Baru ke database (Endpoint di routes/residents.py)
 */
async function addResidentToBackend(residentData) {
    console.log("API: POSTing /api/residents", residentData);
    
    try {
        const response = await fetch(MOCK_API_BASE + '/residents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(residentData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }
        return await response.json();

    } catch (error) {
        console.error("Error saving resident metadata:", error);
        throw new Error(error.message || 'Gagal menyimpan metadata penghuni.');
    }
}

/**
 * Memeriksa apakah data wajah untuk nama tertentu sudah ada di folder dataset.
 */
async function checkDatasetExistence(name) {
    if (!name) return { exists: false, face_count: 0 };
    console.log(`API: Checking dataset for: ${name}`);

    try {
        const response = await fetch(MOCK_API_BASE + `/check_dataset/${encodeURIComponent(name)}`);
        
        if (!response.ok) {
             console.error("Gagal memeriksa dataset via API. Status:", response.status);
             return { exists: false, face_count: 0 };
        }
        
        const data = await response.json();
        return data; // Mengembalikan { exists: boolean, face_count: number }
        
    } catch (error) {
        console.error("Error fetching or parsing dataset check:", error);
        return { exists: false, face_count: 0 };
    }
}

/**
 * MOCKUP fungsi Edit 
 */
function editResident(id) {
    alert(`[MOCK] Membuka modal Edit untuk Penghuni ID: ${id}`);
}

/**
 * MOCKUP fungsi Delete 
 */
function deleteResident(id) {
    if (confirm(`Yakin ingin menghapus Penghuni ID: ${id}? Data wajah akan dihapus permanen.`)) {
        console.log(`API: DELETE /api/residents/${id}`);
        // TODO: Implementasikan fetch DELETE
        
        alert(`[MOCK] Penghuni ID ${id} berhasil dihapus! Silakan refresh halaman.`);
        window.location.reload(); 
    }
}

/**
 * Mengubah Data URL (Base64) menjadi objek Blob
 * Dibutuhkan oleh scan.js dan akun.js untuk mengirim gambar via FormData.
 */
function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}
