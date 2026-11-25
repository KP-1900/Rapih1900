/* RAPIH1900 - halaman PPPK + fungsi bersama (window.R). */
(function () {
  var C = window.CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var R = window.R = { C: C, M: null, $: $ };

  // ---------- util bersama ----------
  R.BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  R.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  R.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  R.hariIni = function () { var d = new Date(); return d.getFullYear() + '-' + R.pad(d.getMonth() + 1) + '-' + R.pad(d.getDate()); };
  R.jmlHari = function (ym) { var p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); };
  R.toast = function (msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2500); };
  R.areaDari = function (nama) { return R.M.area.filter(function (a) { return a.Area === nama; })[0]; };
  R.tugasArea = function (nama) {
    var a = R.areaDari(nama);
    return R.M.tugas.filter(function (t) { return t.Kategori === a.Kategori; }).sort(function (x, y) { return x.No - y.No; });
  };
  R.apiGet = function (params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(C.API_URL + '?' + q).then(function (r) { return r.json(); });
  };
  R.apiPost = function (body) {   // text/plain supaya tidak memicu preflight CORS di Apps Script
    return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  };
  R.loadMaster = function () {
    return R.apiGet({ action: 'master' }).then(function (r) { if (!r.ok) throw new Error(r.error); R.M = r; return r; });
  };
  R.kecilkanFoto = function (file) {   // target < 300 KB: turun bertahap kualitas, lalu ukuran
    var MAX = 300 * 1024;
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var dim = 1280, q = 0.75, url;
        for (var i = 0; i < 12; i++) {
          var s = Math.min(1, dim / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          url = c.toDataURL('image/jpeg', q);
          if (url.length * 0.75 < MAX * 0.97) break;
          if (q > 0.45) q -= 0.1; else dim = Math.round(dim * 0.8);
        }
        URL.revokeObjectURL(img.src);
        res(url);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // ---------- logo (coba png, lalu jpg) ----------
  (function () {
    var i = 0, img = $('logoImg');
    function coba() {
      if (i >= C.LOGO.length) { img.hidden = true; $('logoTeks').hidden = false; return; }
      img.src = encodeURI(C.LOGO[i++]);
    }
    img.onerror = coba; coba();
    var app = $('logoApp'); app.onload = function () { app.hidden = false; }; app.src = C.LOGO_APP;
  })();

  // ---------- state PPPK ----------
  var data = {};            // area (slot) -> catatan hari itu
  var aktif = null;         // slot yang sedang dibuka
  var antrean = Promise.resolve();
  var BATAS_KUNCI = 10000;  // ceklis bisa dibatalkan 10 detik, setelah itu TERKUNCI
  var timerKunci = null;

  function areaSaya() { return R.M.area.filter(function (a) { return a.Petugas === $('selNama').value; }); }
  // waktu[i] = kapan ceklis ke-i diberi centang (ms, jam perangkat). 0 / kosong = sudah lama (terkunci).
  function recBaru() { return { tugas: [], waktu: [], libur: false, parafPetugas: false, catatan: '', foto: [] }; }

  // ceklis terkunci bila sudah dicentang >= 10 detik
  function terkunci(d, i) {
    return d.tugas[i] === 'V' && (Date.now() - (d.waktu[i] || 0)) >= BATAS_KUNCI;
  }

  function isiNama() {
    var pil = localStorage.getItem('rapih_nama') || '';
    var nama = R.M.petugas.map(function (p) { return p.Nama; }).sort();
    $('selNama').innerHTML = '<option value="">— pilih nama —</option>' + nama.map(function (n) { return '<option' + (n === pil ? ' selected' : '') + '>' + R.esc(n) + '</option>'; }).join('');
  }

  function muatHari() {
    var nama = $('selNama').value, tgl = $('selTanggal').value;
    $('panel').hidden = true; $('tabArea').innerHTML = '';
    if (!nama) { $('pesan').textContent = 'Pilih nama Anda dulu.'; return; }
    localStorage.setItem('rapih_nama', nama);
    var areas = areaSaya();
    if (!areas.length) { $('pesan').textContent = 'Belum ada ruangan untuk ' + nama + '. Hubungi admin.'; return; }
    $('pesan').textContent = 'Memuat...';
    R.apiGet({ action: 'bulan', ym: tgl.slice(0, 7) }).then(function (r) {
      data = {};
      areas.forEach(function (a) { data[a.Area] = recBaru(); });
      var sekarang = Date.now();
      (r.rows || []).forEach(function (x) {
        if (x.tanggal === tgl && data[x.area]) {
          data[x.area] = Object.assign(recBaru(), x, { foto: (x.foto || []).map(function (u) { return { url: u, t: 0 }; }) });
          // umur ceklis dari server (ms) -> waktu centang di jam perangkat ini
          data[x.area].waktu = (x.umur || []).map(function (u) { return u >= 0 ? sekarang - u : 0; });
        }
      });
      $('pesan').textContent = '';
      if (!aktif || !data[aktif]) aktif = areas[0].Area;
      gambarTab(); bukaArea(aktif);
    }).catch(function () { $('pesan').textContent = '❌ Gagal memuat data. Cek koneksi / URL API.'; });
  }

  function lengkap(area) {
    var t = R.tugasArea(area), d = data[area];
    return d.libur || (t.length && t.every(function (_, i) { return d.tugas[i] === 'V'; }));
  }

  // Tampilan memakai KATEGORI (mis. "PANTRY"), kunci data tetap slot (mis. "PANTRY 2")
  function gambarTab() {
    $('tabArea').innerHTML = areaSaya().map(function (a) {
      return '<button data-a="' + R.esc(a.Area) + '" class="' + (a.Area === aktif ? 'aktif ' : '') + (lengkap(a.Area) ? 'lengkap' : '') + '">' + R.esc(a.Kategori) + '</button>';
    }).join('');
    $('tabArea').querySelectorAll('button').forEach(function (b) { b.onclick = function () { bukaArea(b.dataset.a); }; });
  }

  // pasang status kunci ke semua kotak ceklis + jadwalkan pengunci otomatis
  function jadwalKunci() {
    clearTimeout(timerKunci);
    var d = data[aktif]; if (!d) return;
    var now = Date.now(), sisa = 0;
    $('daftar').querySelectorAll('input').forEach(function (c) {
      var i = +c.dataset.i, k = terkunci(d, i);
      c.disabled = k;
      c.closest('.task').classList.toggle('terkunci', k);
      if (d.tugas[i] === 'V' && !k) {
        var s = BATAS_KUNCI - (now - (d.waktu[i] || 0));
        if (s > 0) sisa = sisa ? Math.min(sisa, s) : s;
      }
    });
    if (sisa) { var area = aktif; timerKunci = setTimeout(function () { if (aktif === area) jadwalKunci(); }, sisa + 50); }
  }

  function bukaArea(area) {
    aktif = area;
    var tugas = R.tugasArea(area), d = data[area];
    $('panel').hidden = false;
    $('chkLibur').checked = d.libur;
    $('daftar').classList.toggle('mati', d.libur);
    $('daftar').innerHTML = tugas.map(function (t, i) {
      return '<label class="task"><input type="checkbox" data-i="' + i + '"' + (d.tugas[i] === 'V' ? ' checked' : '') + '><span>' +
        R.esc(t.Pekerjaan) + '<small>' + R.esc(t.Standar) + '</small></span></label>';
    }).join('');
    $('daftar').querySelectorAll('input').forEach(function (c) {
      c.onchange = function () {
        var i = +c.dataset.i;
        if (c.checked) { d.tugas[i] = 'V'; d.waktu[i] = Date.now(); }
        else {
          if (terkunci(d, i)) { c.checked = true; R.toast('🔒 Ceklis sudah terkunci'); return; }
          d.tugas[i] = ''; d.waktu[i] = 0;
        }
        berubah(); jadwalKunci();
      };
    });
    tampilFoto();
    $('simpanStatus').textContent = ''; $('simpanStatus').className = '';
    hitung(); gambarTab(); jadwalKunci();
  }

  function hitung() {
    var t = R.tugasArea(aktif), d = data[aktif];
    var n = t.filter(function (_, i) { return d.tugas[i] === 'V'; }).length;
    $('pgs').textContent = R.areaDari(aktif).Kategori + ' — ' + n + '/' + t.length + ' selesai';
  }
  var BATAS_HAPUS = 10000;   // tombol silang hanya muncul 10 detik setelah upload
  function tampilFoto() {
    var d = data[aktif], sekarang = Date.now(), sisa = 0;
    $('fotoList').innerHTML = (d.foto || []).map(function (f) {
      var bisa = f.t && sekarang - f.t < BATAS_HAPUS;
      if (bisa) sisa = Math.max(sisa, BATAS_HAPUS - (sekarang - f.t));
      return '<div class="fotowrap"><img src="' + R.esc(f.url) + '" alt="">' +
        (bisa ? '<button type="button" class="hapusfoto" data-u="' + R.esc(f.url) + '" title="Hapus foto">✕</button>' : '') + '</div>';
    }).join('');
    if (sisa) { var area = aktif; setTimeout(function () { if (aktif === area) tampilFoto(); }, sisa + 100); }
  }

  // Libur (X): bebas dicentang/dilepas kapan saja (tanpa aturan 10 detik).
  // Saat Libur dicentang, semua ceklis pekerjaan di-reset (dikosongkan, termasuk yang terkunci).
  $('chkLibur').onchange = function () {
    var d = data[aktif], box = this;
    if (box.checked) {
      var adaCeklis = d.tugas.some(function (v) { return v === 'V'; });
      if (adaCeklis && !confirm('Tandai Libur? Semua ceklis pekerjaan akan dihapus.')) { box.checked = false; return; }
      d.libur = true; d.tugas = []; d.waktu = [];
      $('daftar').querySelectorAll('input').forEach(function (c) { c.checked = false; c.disabled = false; c.closest('.task').classList.remove('terkunci'); });
    } else {
      d.libur = false;
    }
    $('daftar').classList.toggle('mati', d.libur);
    berubah(); jadwalKunci();
  };
  // ketuk ceklis yang terkunci -> beri tahu
  $('daftar').onclick = function (e) {
    if (e.target.closest('.task.terkunci')) R.toast('🔒 Ceklis sudah terkunci');
  };
  $('fotoList').onclick = function (e) {
    var b = e.target.closest('.hapusfoto'); if (!b) return;
    var area = aktif, d = data[area], url = b.dataset.u;
    if (!confirm('Hapus foto ini?')) return;
    d.foto = d.foto.filter(function (f) { return f.url !== url; });
    tampilFoto();
    simpan(area, { hapusFotoUrl: url }).then(function (r) {
      if (!r || !r.ok) { R.toast('❌ ' + ((r && r.error) || 'Gagal menghapus')); muatHari(); }
    });
  };
  $('inFoto').onchange = function (e) {
    var f = e.target.files[0], area = aktif; if (!f) return;
    e.target.value = '';
    $('simpanStatus').className = ''; $('simpanStatus').textContent = 'Mengunggah foto...';
    R.kecilkanFoto(f).then(function (url) {
      return simpan(area, { foto: { base64: url.split(',')[1], mime: 'image/jpeg' } });
    }).then(function (r) {
      if (!r || !r.ok || !r.foto) return;
      data[area].foto.push({ url: r.foto, t: Date.now() });   // silang aktif 10 detik, setelah itu terkunci
      if (area === aktif) tampilFoto();
    });
  };

  // ---------- simpan otomatis ----------
  var timer = null;
  function berubah() {
    hitung(); gambarTab();
    var area = aktif;
    clearTimeout(timer);
    $('simpanStatus').className = ''; $('simpanStatus').textContent = 'Menyimpan...';
    timer = setTimeout(function () { simpan(area); }, 700);
  }

  function simpan(area, extra) {
    var d = data[area], tugas = R.tugasArea(area), nama = $('selNama').value, tgl = $('selTanggal').value;
    var sekarang = Date.now();
    var umur = [];   // umur tiap ceklis (ms) -> server mencatat waktu centang yang akurat
    for (var i = 0; i < tugas.length; i++) umur.push(d.tugas[i] === 'V' && d.waktu[i] ? sekarang - d.waktu[i] : -1);
    var body = {
      action: 'simpan', area: area, tanggal: tgl, libur: d.libur,
      tugas: tugas.map(function (_, i) { return d.tugas[i] === 'V' ? 'V' : ''; }),
      umur: umur,
      parafPetugas: !d.libur && d.tugas.some(function (v) { return v === 'V'; }),
      catatan: d.catatan, oleh: nama
    };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    $('simpanStatus').className = ''; $('simpanStatus').textContent = 'Menyimpan...';
    var p = antrean.then(function () { return R.apiPost(body); }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      // server menolak pembatalan ceklis yang sudah terkunci -> kembalikan centangnya
      if (r.ditolak && r.ditolak.length && data[area] && !data[area].libur) {
        r.ditolak.forEach(function (i) { data[area].tugas[i] = 'V'; data[area].waktu[i] = 0; });
        R.toast('🔒 Ceklis sudah terkunci');
        if (area === aktif) { bukaArea(area); }
      }
      if (area === aktif) { $('simpanStatus').className = ''; $('simpanStatus').textContent = '✔ Tersimpan'; }
      return r;
    }).catch(function (err) {
      if (area === aktif) {
        var s = $('simpanStatus'); s.className = 'err'; s.textContent = '❌ Gagal menyimpan — ketuk untuk ulangi';
        s.onclick = function () { simpan(area); };
      }
      return { ok: false, error: err.message };
    });
    antrean = p;
    return p;
  }

  $('selNama').onchange = function () { aktif = null; muatHari(); };
  $('selTanggal').onchange = muatHari;

  // ---------- mulai ----------
  R.mulai = function () {
    isiNama();
    $('selTanggal').value = R.hariIni(); $('selTanggal').max = R.hariIni();
    muatHari();
  };
  R.refreshNama = function () { isiNama(); muatHari(); };

  $('judul').textContent = C.JUDUL; $('subjudul').textContent = C.SUBJUDUL;
  if (C.API_URL.indexOf('GANTI_') === 0) { $('pesan').textContent = '⚠ Isi API_URL di config.js terlebih dahulu.'; return; }
  R.loadMaster().then(R.mulai).catch(function (e) { $('pesan').textContent = '❌ Gagal memuat data: ' + e.message; });
})();
