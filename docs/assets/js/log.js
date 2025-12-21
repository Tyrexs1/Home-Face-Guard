// frontend/assets/js/log.js
// Halaman Log minimal: hanya filter tanggal

document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('log-filter-date');
  const btn = document.getElementById('applyFilterBtn');

  const apply = async () => {
    const logs = await fetchLogs();
    const selected = (dateEl && dateEl.value) ? dateEl.value : '';

    let filtered = logs;
    if (selected) {
      filtered = logs.filter(item => {
        const d = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        const ymd = `${y}-${m}-${dd}`;
        return ymd === selected;
      });
    }

    renderLogList(filtered);
  };

  if (btn) btn.addEventListener('click', apply);
  if (dateEl) dateEl.addEventListener('change', apply);

  // load initial
  apply();
});

function formatTime(d){
  try{
    return d.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  }catch(_){
    return '';
  }
}
function formatDate(d){
  try{
    return d.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
  }catch(_){
    return '';
  }
}

function renderLogList(items){
  const listEl = document.getElementById('full-logs-list');
  if (!listEl) return;

  if (!items || items.length === 0){
    listEl.innerHTML = '<p class="text-gray-500">Tidak ada log untuk tanggal ini.</p>';
    return;
  }

  const html = items.map(item => {
    const d = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
    const name = item.name || 'Unknown';
    const cat = (String(name).trim().toLowerCase() === 'unknown') ? 'UNKNOWN' : 'PENGHUNI';
    const badgeClass = cat === 'UNKNOWN' ? 'bg-amber-700 text-amber-100' : 'bg-green-700 text-green-100';

    return `
      <div class="flex items-center justify-between p-6 bg-[#252a34] rounded-2xl shadow-lg border border-blue-900/50 mb-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
            <i class="fa-regular fa-user text-blue-300 text-xl"></i>
          </div>
          <div>
            <div class="text-lg font-semibold text-white">${escapeHtml(name)}</div>
            <span class="inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold ${badgeClass}">${cat}</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-white font-semibold">${formatTime(d)}</div>
          <div class="text-gray-400 text-sm">${formatDate(d)}</div>
          <a href="log_detail.html?id=${encodeURIComponent(item.id)}" class="text-blue-400 hover:text-blue-300 font-medium">Lihat Detail</a>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
}

function escapeHtml(str){
  return String(str ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
