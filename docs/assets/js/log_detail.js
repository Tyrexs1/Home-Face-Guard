// frontend/assets/js/log_detail.js

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('detail-container');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    container.innerHTML = '<p class="text-red-400">ID log tidak ditemukan.</p>';
    return;
  }

  try {
    const res = await fetch(MOCK_API_BASE + '/events/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Gagal memuat detail (HTTP ' + res.status + ')');
    const item = await res.json();

    const d = (item.timestamp && typeof item.timestamp === 'string')
      ? new Date(item.timestamp.replace(' ', 'T'))
      : new Date(item.timestamp);

    const time = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const date = isNaN(d.getTime()) ? '' : d.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});

    const name = item.name || 'Unknown';
    const category = item.category || ((String(name).trim().toLowerCase() === 'unknown') ? 'UNKNOWN' : 'PENGHUNI');
    const status = item.status || (category === 'UNKNOWN' ? 'DITOLAK' : 'MASUK');
    const conf = (typeof item.confidence === 'number') ? item.confidence.toFixed(2) : (item.confidence ?? '-');

    const badgeClass = category === 'UNKNOWN' ? 'bg-amber-700 text-amber-100' : 'bg-green-700 text-green-100';

    let snapUrl = item.snapshot_url;
    if (snapUrl && typeof snapUrl === 'string' && snapUrl.startsWith('/')) snapUrl = MOCK_API_BASE + snapUrl;

    const snapshot = snapUrl
      ? `<img src="${item.snapshot_url}" alt="Snapshot" class="mt-4 w-full rounded-xl border border-blue-900/50" />`
      : `<div class="mt-4 p-4 rounded-xl bg-gray-800 text-gray-300 border border-blue-900/30">Snapshot tidak tersedia (penghematan storage untuk PENGHUNI).</div>`;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div>
          <div class="text-2xl font-bold text-white">${escapeHtml(name)}</div>
          <div class="mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold ${badgeClass}">${category}</div>
          <div class="mt-4 text-gray-300">
            <div><span class="text-gray-400">Waktu:</span> <span class="text-white">${time}</span></div>
            <div><span class="text-gray-400">Tanggal:</span> <span class="text-white">${date}</span></div>
            <div><span class="text-gray-400">Status:</span> <span class="text-white">${escapeHtml(status)}</span></div>
            <div><span class="text-gray-400">Confidence:</span> <span class="text-white">${escapeHtml(conf)}</span></div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-gray-400 text-sm">ID Log</div>
          <div class="text-white font-mono">${escapeHtml(item.id)}</div>
        </div>
      </div>
      ${snapshot}
    `;

  } catch (e) {
    container.innerHTML = `<p class="text-red-400">Gagal memuat detail: ${escapeHtml(e.message || String(e))}</p>`;
  }
});

function escapeHtml(str){
  return String(str ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
