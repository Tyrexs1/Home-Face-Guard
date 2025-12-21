// frontend/assets/js/edit.js

document.addEventListener('DOMContentLoaded', () => {
    loadResidentData();
});

let currentResidentId = null;
let currentResidentName = null;
let currentResidentRole = 'Penghuni'; // Role default: Penghuni

/**
 * Mengambil ID dari URL dan memuat data penghuni
 */
async function loadResidentData() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    currentResidentId = id;
    
    const loadingMessage = document.getElementById('loading-message');
    const editForm = document.getElementById('edit-resident-form');
    const titleElement = document.getElementById('resident-name-title');

    if (!id) {
        loadingMessage.textContent = 'Error: ID Penghuni tidak ditemukan di URL.';
        return;
    }

    try {
        // GET /api/residents/<id>
        const response = await fetch(MOCK_API_BASE + `/residents/${id}`);
        if (!response.ok) {
            throw new Error(`Gagal memuat data (Status: ${response.status})`);
        }
        const resident = await response.json();
        
        // Simpan nilai global
        currentResidentRole = resident.role || 'Penghuni'; // Role default: Penghuni
        currentResidentName = resident.name;

        // Isi Form dan Hidden Fields
        document.getElementById('resident-id').value = resident.id;
        document.getElementById('edit-resident-name').value = resident.name;
        
        // Simpan nilai awal untuk pembanding
        document.getElementById('initial-face-count').value = resident.face_count || 0;
        document.getElementById('initial-name').value = resident.name;
        
        // Update Tampilan
        titleElement.textContent = resident.name;
        document.getElementById('face-count-info').textContent = `${resident.face_count || 0} sampel terdaftar`;
        document.getElementById('current-role-info').textContent = `Peran saat ini: ${currentResidentRole}`;
        
        // Atur Tombol Scan
        const scanButton = document.getElementById('start-scan-link');
        scanButton.onclick = () => {
            const currentName = document.getElementById('edit-resident-name').value.trim();
            window.location.href = `/scan?name=${encodeURIComponent(currentName)}&id=${resident.id}&mode=update`;
        };
        
        // Atur Tombol Hapus Dataset (Pastikan terhubung dengan fungsi di bawah)
        const deleteDatasetButton = document.getElementById('delete-dataset-btn');
        deleteDatasetButton.onclick = (e) => deleteResidentDataset(e);


        loadingMessage.classList.add('hidden');
        editForm.classList.remove('hidden');

    } catch (error) {
        console.error("Error loading resident data:", error);
        loadingMessage.textContent = `Gagal memuat data penghuni: ${error.message}`;
    }
}

/**
 * Mengirim data pembaruan ke Backend (PUT/PATCH)
 */
async function updateResidentData(event) {
    const form = event.target;
    const residentId = document.getElementById('resident-id').value;
    
    const newName = document.getElementById('edit-resident-name').value.trim();
    const newRole = currentResidentRole; 
    
    const photoInput = document.getElementById('edit-resident-photo');
    
    const initialFaceCount = parseInt(document.getElementById('initial-face-count').value);
    let finalFaceCount = initialFaceCount;

    if (!newName) {
        alert("Nama Lengkap wajib diisi.");
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Memvalidasi...';

    try {
        // --- 1. Proses Upload File Baru Jika Ada ---
        if (photoInput.files.length > 0) {
            submitButton.textContent = 'Mengunggah Foto Baru...';
            
            const formData = new FormData();
            formData.append('name', newName); 
            
            for (const file of photoInput.files) {
                 formData.append('poses', 'upload'); 
                 formData.append('faces', file, file.name); 
            }
            
            const uploadResponse = await fetch(MOCK_API_BASE + '/upload/faces', {
                 method: 'POST',
                 body: formData, 
            });

            if (!uploadResponse.ok) {
                 const errorData = await uploadResponse.json();
                 throw new Error(`Gagal Unggah Wajah: ${errorData.message || uploadResponse.statusText}`);
            }
            
            const uploadResult = await uploadResponse.json();
            finalFaceCount = uploadResult.face_count; // Ambil jumlah sampel wajah yang baru
        }

        // --- 2. Simpan Metadata (PUT/PATCH) ---
        submitButton.textContent = 'Menyimpan Perubahan...';
        
        const metadataUpdate = {
            name: newName,
            role: newRole, // Kirim role lama/default (Penghuni)
            face_count: finalFaceCount 
        };
        
        // PUT /api/residents/<id>
        const updateResponse = await fetch(MOCK_API_BASE + `/residents/${residentId}`, {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadataUpdate),
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(errorData.message || `Gagal menyimpan metadata (Status: ${updateResponse.status})`);
        }
        
        const updateResult = await updateResponse.json();

        // 3. Sukses Penuh
        alert(`Perubahan untuk ${updateResult.name} berhasil disimpan! (${updateResult.face_count} sampel wajah)`);
        window.location.href = '/akun'; // Kembali ke daftar

    } catch (error) {
        console.error("Error updating resident:", error);
        alert(`Gagal menyimpan perubahan: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Simpan Perubahan';
    }
}

/**
 * Fungsi Baru: Menghapus hanya folder dataset wajah (DELETE /api/residents/dataset/<name>)
 */
async function deleteResidentDataset(event) {
    event.preventDefault();

    if (!currentResidentName || !currentResidentId) {
        alert("Error: Data penghuni tidak dimuat dengan benar.");
        return;
    }
    
    if (!confirm(`PERINGATAN! Anda akan menghapus SELURUH ${document.getElementById('face-count-info').textContent} untuk penghuni ${currentResidentName}. Data nama tetap tersimpan. Lanjutkan?`)) {
        return;
    }

    const deleteDatasetButton = document.getElementById('delete-dataset-btn');
    deleteDatasetButton.disabled = true;
    deleteDatasetButton.textContent = 'Menghapus Dataset...';
    
    try {
        // Panggil API baru: DELETE /api/residents/dataset/<name>
        const response = await fetch(MOCK_API_BASE + `/residents/dataset/${encodeURIComponent(currentResidentName)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }
        
        // Setelah folder dihapus, kita update metadata di DB dengan face_count=0
        const updateMetadata = {
            name: currentResidentName,
            role: currentResidentRole,
            face_count: 0 // Reset hitungan wajah
        };
        
        const updateResponse = await fetch(MOCK_API_BASE + `/residents/${currentResidentId}`, {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateMetadata),
        });
        
        if (!updateResponse.ok) {
             throw new Error("Gagal memperbarui metadata setelah dataset dihapus.");
        }

        alert(`Dataset wajah untuk ${currentResidentName} berhasil dihapus! (0 sampel tersisa)`);
        
        // Muat ulang data form untuk refresh status 
        loadResidentData(); 
        
    } catch (error) {
        console.error("Error deleting dataset:", error);
        alert(`Gagal menghapus dataset: ${error.message}`);
    } finally {
        deleteDatasetButton.disabled = false;
        deleteDatasetButton.textContent = 'Hapus Seluruh Dataset Wajah';
    }
}
