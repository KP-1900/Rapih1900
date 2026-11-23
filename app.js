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

  function areaSaya() { return R.M.area.filter(function (a) { return a.Petugas === $('selNama').value; }); }
  function recBaru() { return { tugas: [], libur: false, parafPetugas: false, catatan: '', foto: '', fotoBaru: null, hapusFoto: false }; }

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
      (r.rows || []).forEach(function (x) { if (x.tanggal === tgl && data[x.area]) data[x.area] = Object.assign(recBaru(), x); });
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
      c.onchange = function () { d.tugas[+c.dataset.i] = c.checked ? 'V' : ''; berubah(); };
    });
    tampilFoto(d.fotoBaru || d.foto);
    $('simpanStatus').textContent = ''; $('simpanStatus').className = '';
    hitung(); gambarTab();
  }

  function hitung() {
    var t = R.tugasArea(aktif), d = data[aktif];
    var n = t.filter(function (_, i) { return d.tugas[i] === 'V'; }).length;
    $('pgs').textContent = R.areaDari(aktif).Kategori + ' — ' + n + '/' + t.length + ' selesai';
  }
  function tampilFoto(src) { $('fotoPreview').src = src || ''; $('fotoWrap').hidden = !src; }

  $('chkLibur').onchange = function () { data[aktif].libur = this.checked; $('daftar').classList.toggle('mati', this.checked); berubah(); };
  $('hapusFoto').onclick = function () {
    var area = aktif, d = data[area];
    if (!confirm('Hapus foto ini?')) return;
    d.fotoBaru = null; d.hapusFoto = true; d.foto = '';
    tampilFoto('');
    simpan(area);
  };
  $('inFoto').onchange = function (e) {
    var f = e.target.files[0], area = aktif; if (!f) return;
    R.kecilkanFoto(f).then(function (url) { data[area].fotoBaru = url; data[area].hapusFoto = false; tampilFoto(url); simpan(area); });
    e.target.value = '';
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

  function simpan(area) {
    var d = data[area], tugas = R.tugasArea(area), nama = $('selNama').value, tgl = $('selTanggal').value;
    var body = {
      action: 'simpan', area: area, tanggal: tgl, libur: d.libur, tugas: d.tugas.slice(0, tugas.length),
      parafPetugas: !d.libur && d.tugas.some(function (v) { return v === 'V'; }),
      catatan: d.catatan, oleh: nama
    };
    var foto = d.fotoBaru, hapus = d.hapusFoto && !foto;
    if (foto) body.foto = { base64: foto.split(',')[1], mime: 'image/jpeg' };
    if (hapus) body.hapusFoto = true;
    $('simpanStatus').className = ''; $('simpanStatus').textContent = 'Menyimpan...';
    antrean = antrean.then(function () { return R.apiPost(body); }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      if (foto && d.fotoBaru === foto) { d.foto = r.foto || d.foto; d.fotoBaru = null; }
      if (hapus && d.hapusFoto) d.hapusFoto = false;
      if (area === aktif) { $('simpanStatus').className = ''; $('simpanStatus').textContent = '✔ Tersimpan'; }
    }).catch(function () {
      if (area === aktif) {
        var s = $('simpanStatus'); s.className = 'err'; s.textContent = '❌ Gagal menyimpan — ketuk untuk ulangi';
        s.onclick = function () { simpan(area); };
      }
    });
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
