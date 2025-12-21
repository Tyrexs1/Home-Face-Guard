// frontend/assets/js/akun.js

// Pastikan fungsi fetchResidents, addResidentToBackend, checkDatasetExistence, dll. tersedia dari app.js
if (typeof fetchResidents === 'undefined' || typeof addResidentToBackend === 'undefined' || typeof checkDatasetExistence === 'undefined') {
    console.error('Error: app.js belum dimuat dengan lengkap. Pastikan app.js dimuat terlebih dahulu.');
} else {
    document.addEventListener('DOMContentLoaded', () => {
        renderResidents();
        
        const nameInput = document.getElementById('new-resident-name');
        if (nameInput) {
             // Listener untuk memicu pengecekan dataset DAN kontrol tombol scan
            nameInput.addEventListener('input', checkResidentDataset);
            
            // Panggil ini sekali saat startup untuk memuat kondisi awal jika ada data di form
            checkResidentDataset(); 
        }
    });
}

/**
 * Render daftar penghuni
 */
async function renderResidents() {
    const listElement = document.getElementById('residents-list');
    if (!listElement) return;

    listElement.innerHTML = `<li class="text-gray-500 text-sm py-3">Memuat daftar penghuni...</li>`;

    try {
        // Ambil data dari backend
        const fetchedResidents = await fetchResidents(); 
        
        listElement.innerHTML = '';
        
        if (fetchedResidents.length === 0) {
             listElement.innerHTML = `<li class="text-gray-500 text-sm py-3">Belum ada penghuni terdaftar.</li>`;
             return;
        }

        fetchedResidents.forEach(resident => {
            const faceCount = resident.face_count || 0;
            const role = resident.role || 'Penghuni'; // Role default: Penghuni
            
            const residentItem = `
                <li class="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition duration-150">
                    <div>
                        <p class="font-medium text-white">${resident.name}</p>
                        <span class="text-sm text-gray-400">${role}</span>
                        <span class="text-xs ml-2 ${faceCount > 0 ? 'text-green-400' : 'text-yellow-400'}">(${faceCount} sampel wajah)</span>
                    </div>
                    <div class="space-x-2">
                        <button onclick="editResident(${resident.id})" class="text-yellow-400 hover:text-yellow-300 text-sm font-medium">Edit</button>
                        <button onclick="deleteResident(${resident.id}, '${resident.name}')" class="text-red-400 hover:text-red-300 text-sm font-medium">Hapus</button>
                    </div>
                </li>
            `;
            listElement.innerHTML += residentItem;
        });
    } catch (error) {
        console.error("Error rendering residents:", error);
        listElement.innerHTML = `<li class="text-red-400 text-sm py-3">Gagal memuat daftar penghuni. Pastikan backend berjalan.</li>`;
    }
}

/**
 * Logika: Cek dataset, tampilkan pesan re-use, dan KONTROL TOMBOL SCAN.
 */
async function checkResidentDataset() {
    const nameInput = document.getElementById('new-resident-name');
    const currentName = nameInput.value.trim();
    const photoInput = document.getElementById('new-resident-photo');
    const scanButton = document.getElementById('start-scan-link'); 
    
    const reuseMessageId = 'dataset-reuse-message';
    let reuseMessage = document.getElementById(reuseMessageId);

    if (reuseMessage) reuseMessage.remove();
    
    // --- KONTROL TOMBOL SCAN ---
    if (currentName.length < 3) {
        // Disabled State
        scanButton.disabled = true;
        scanButton.classList.add('bg-indigo-800', 'text-gray-500', 'cursor-not-allowed');
        scanButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        scanButton.textContent = 'Isi Nama untuk Scan Wajah';
        photoInput.disabled = false;
        return;
    } else {
        // Enabled State
        scanButton.disabled = false;
        scanButton.classList.remove('bg-indigo-800', 'text-gray-500', 'cursor-not-allowed');
        scanButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        scanButton.textContent = 'Mulai Scan Wajah';
        
        // Navigasi Scan: Kirim nama melalui URL Query Parameter
        scanButton.onclick = () => {
            window.location.href = `scan.html?name=${encodeURIComponent(currentName)}`;
        };
    }
    // --- END KONTROL TOMBOL SCAN ---
    
    const datasetInfo = await checkDatasetExistence(currentName); 
    
    if (datasetInfo.exists && datasetInfo.face_count > 0) {
        reuseMessage = document.createElement('p');
        reuseMessage.id = reuseMessageId;
        reuseMessage.className = 'text-yellow-400 text-sm mt-2 p-2 bg-gray-700 rounded-lg';
        reuseMessage.innerHTML = `⚠️ **Dataset Wajah Ditemukan!** (${datasetInfo.face_count} sampel). Data ini akan otomatis digunakan jika Anda menyimpan penghuni.`;
        
        nameInput.parentNode.appendChild(reuseMessage);
    }
}

/**
 * Menambahkan penghuni baru (Tidak wajib Upload/Scan)
 */
async function addResident(event) {
    const form = event.target;
    const name = document.getElementById('new-resident-name').value.trim();
    const photoInput = document.getElementById('new-resident-photo');
    
    const role = 'Penghuni'; // ROLE OTOMATIS: Penghuni
    let faceCount = 0; 
    
    if (!name) {
        alert("Nama Lengkap wajib diisi.");
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Memproses...';

    const residentData = { name, role };

    try {
        // 1. Cek dataset yang ada
        const datasetInfo = await checkDatasetExistence(name);
        faceCount = datasetInfo.face_count; // Set default faceCount dari dataset lama (bisa 0)
        
        if (photoInput.files.length > 0) {
             // 2. Jika user upload file baru, proses upload dan dapatkan count baru
             
             const formData = new FormData();
             formData.append('name', name);
             
             for (const file of photoInput.files) {
                 formData.append('poses', 'upload'); 
                 formData.append('faces', file, file.name); 
             }
 
             submitButton.textContent = 'Mengunggah Foto...';
             const uploadResponse = await fetch(MOCK_API_BASE + '/upload/faces', {
                 method: 'POST',
                 body: formData, 
             });
 
             if (!uploadResponse.ok) {
                 const errorData = await uploadResponse.json();
                 throw new Error(`Gagal Unggah Wajah: ${errorData.message || uploadResponse.statusText}`);
             }
             
             const uploadResult = await uploadResponse.json();
             faceCount = uploadResult.face_count;
        }

        // 3. Simpan Metadata (faceCount bisa 0)
        residentData.face_count = faceCount;
        residentData.role = role; // Pastikan role dikirim
        submitButton.textContent = 'Menyimpan ke Database...';
        
        const newResident = await addResidentToBackend(residentData);
        
        // 4. Sukses Penuh
        form.reset();
        renderResidents(); // Refresh list
        alert(`Penghuni ${newResident.name} berhasil ditambahkan! (${faceCount} sampel terdaftar)`);
        
    } catch (error) {
        console.error("Error saving resident:", error);
        alert(`Gagal menyimpan penghuni: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Simpan Penghuni';
        checkResidentDataset(); // Reset state
    }
}

/**
 * Fungsi Edit: Arahkan ke edit.html (UPDATE)
 */
function editResident(id) {
    // Arahkan ke halaman edit dengan membawa ID penghuni
    window.location.href = `edit.html?id=${id}`;
}

/**
 * Fungsi Delete: Hapus metadata dan dataset (DELETE)
 */
async function deleteResident(id, name) {
    if (!confirm(`Yakin ingin menghapus Penghuni: ${name}? Operasi ini akan menghapus data metadata dari database DAN folder dataset wajah di server secara permanen.`)) {
        return;
    }

    try {
        const response = await fetch(MOCK_API_BASE + `/residents/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }

        alert(`Penghuni ${name} berhasil dihapus!`);
        renderResidents(); // Refresh list
    } catch (error) {
        console.error("Error deleting resident:", error);
        alert(`Gagal menghapus penghuni: ${error.message}`);
    }
}