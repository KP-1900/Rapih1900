/* RAPIH1900 - panel admin (klik logo BPS). */
(function () {
  var R = window.R, $ = R.$, esc = R.esc;
  var pass = '';

  // ---------- login ----------
  $('logoBtn').onclick = function () { $('adminPass').value = ''; $('loginErr').textContent = ''; $('dlgLogin').showModal(); $('adminPass').focus(); };
  $('loginBatal').onclick = function () { $('dlgLogin').close(); };
  $('formLogin').onsubmit = function (e) {
    e.preventDefault();
    $('loginErr').textContent = 'Memeriksa...';
    R.apiPost({ action: 'adminCek', adminPin: $('adminPass').value }).then(function (r) {
      if (!r.ok) { $('loginErr').textContent = r.error || 'Password salah'; return; }
      pass = $('adminPass').value; $('dlgLogin').close(); buka();
    }).catch(function () { $('loginErr').textContent = 'Gagal terhubung'; });
  };
  $('adminTutup').onclick = function () { $('admin').hidden = true; pass = ''; R.refreshNama(); };

  function buka() { $('admin').hidden = false; tab('petugas'); hitungLaporan(); }
  document.querySelectorAll('.admintabs button').forEach(function (b) { b.onclick = function () { tab(b.dataset.at); }; });
  function tab(t) {
    document.querySelectorAll('.admintabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.at === t); });
    ['petugas', 'tugas', 'laporan', 'pejabat', 'unduh'].forEach(function (x) { $('at-' + x).hidden = x !== t; });
    ({ petugas: viewPetugas, tugas: viewTugas, laporan: viewLaporan, pejabat: viewPejabat, unduh: viewUnduh })[t]();
  }
  function post(body) { body.adminPin = pass; return R.apiPost(body); }

  // ---------- petugas ----------
  function viewPetugas() {
    var h = '<button class="primary" id="btnTambah">+ Tambah PPPK</button><div class="card">';
    R.M.petugas.forEach(function (p) {
      var ar = R.M.area.filter(function (a) { return a.Petugas === p.Nama; }).map(function (a) { return a.Kategori; });
      h += '<div class="prow"><div><b>' + esc(p.Nama) + '</b><small>NIK: ' + esc(p.NIK || '-') + '</small><small>' + (ar.length ? esc(ar.join(', ')) : 'belum ada ruangan') + '</small></div>' +
        '<div><button class="kecil" data-ed="' + esc(p.Nama) + '">Ubah</button> <button class="kecil" data-del="' + esc(p.Nama) + '">Hapus</button></div></div>';
    });
    $('at-petugas').innerHTML = h + '</div><div id="formPetugas"></div>';
    $('btnTambah').onclick = function () { formPetugas(null); };
    $('at-petugas').querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { formPetugas(b.dataset.ed); }; });
    $('at-petugas').querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Hapus ' + b.dataset.del + '? Ruangannya jadi kosong (data harian tetap tersimpan).')) return;
        post({ action: 'petugasHapus', nama: b.dataset.del }).then(segarkan);
      };
    });
  }
  function formPetugas(nama) {
    var p = R.M.petugas.filter(function (x) { return x.Nama === nama; })[0] || { Nama: '', NIK: '' };
    var h = '<div class="card form"><b>' + (nama ? 'Ubah ' + esc(nama) : 'Tambah PPPK') + '</b>' +
      '<label>Nama<input id="fNama" value="' + esc(p.Nama) + '"' + (nama ? ' readonly' : '') + '></label>' +
      '<label>NIK<input id="fNik" value="' + esc(p.NIK) + '" inputmode="numeric"></label><b>Ruangan yang dikerjakan</b><div class="areagrid">';
    var kats = [];
    R.M.tugas.forEach(function (t) { if (kats.indexOf(t.Kategori) < 0) kats.push(t.Kategori); });
    kats.forEach(function (k) {
      var slot = R.M.area.filter(function (a) { return a.Kategori === k; });
      var milik = nama && slot.some(function (a) { return a.Petugas === nama; });
      var lain = slot.filter(function (a) { return a.Petugas && a.Petugas !== nama; }).map(function (a) { return a.Petugas; });
      h += '<label><input type="checkbox" value="' + esc(k) + '"' + (milik ? ' checked' : '') + '>' + esc(k) + (lain.length ? ' <small>(' + esc(lain.join(', ')) + ')</small>' : '') + '</label>';
    });
    $('formPetugas').innerHTML = h + '</div><button class="primary" id="fSimpan">Simpan</button></div>';
    $('fSimpan').onclick = function () {
      var areas = [].map.call($('formPetugas').querySelectorAll('.areagrid input:checked'), function (c) { return c.value; });
      if (!$('fNama').value.trim()) { R.toast('Nama wajib diisi'); return; }
      post({ action: 'petugasSimpan', nama: $('fNama').value, nik: $('fNik').value, areas: areas })
        .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Tersimpan'); segarkan(); })
        .catch(function (e) { R.toast('❌ ' + e.message); });
    };
    $('formPetugas').scrollIntoView({ behavior: 'smooth' });
  }
  function segarkan() { R.loadMaster().then(viewPetugas); }

  // ---------- tugas (Master_Tugas: tambah / ubah / hapus ruangan & pekerjaannya) ----------
  var MAX_TUGAS = 15;   // sama dengan MAX_TUGAS di Code.gs (kolom T1..T15 di sheet Harian)
  function daftarKategori() {
    var k = []; R.M.tugas.forEach(function (t) { if (k.indexOf(t.Kategori) < 0) k.push(t.Kategori); }); return k;
  }
  function viewTugas() {
    var h = '<button class="primary" id="btnTambahK">+ Tambah Ruangan</button><div class="card">';
    daftarKategori().forEach(function (k) {
      var n = R.M.tugas.filter(function (t) { return t.Kategori === k; }).length;
      h += '<div class="prow"><div><b>' + esc(k) + '</b><small>' + n + ' pekerjaan</small></div><div><button class="kecil" data-ek="' + esc(k) + '">Ubah</button></div></div>';
    });
    $('at-tugas').innerHTML = h + '</div><div id="formTugas"></div>';
    $('btnTambahK').onclick = function () { formTugas(null); };
    $('at-tugas').querySelectorAll('[data-ek]').forEach(function (b) { b.onclick = function () { formTugas(b.dataset.ek); }; });
  }
  function segarkanTugas() { return R.loadMaster().then(viewTugas); }

  function formTugas(kat) {
    var baru = !kat, namaBaru = '';
    var rows = baru ? [{ p: '', s: '', id: '' }] : R.M.tugas.filter(function (t) { return t.Kategori === kat; })
      .sort(function (a, b) { return a.No - b.No; }).map(function (t) { return { p: t.Pekerjaan, s: t.Standar, id: t.ID || '' }; });
    var box = $('formTugas');

    function gambar(fokusAkhir) {
      var h = '<div class="card form"><b>' + (baru ? 'Tambah Ruangan' : 'Ubah ' + esc(kat)) + '</b>' +
        (baru ? '<label>Nama ruangan<input id="tKat" placeholder="mis. GUDANG" value="' + esc(namaBaru) + '"></label>' : '') +
        '<b>Daftar pekerjaan <small style="font-weight:400">(maks ' + MAX_TUGAS + ')</small></b>';
      rows.forEach(function (r, i) {
        h += '<div class="trow"><span class="tno">' + (i + 1) + '</span><div class="tin">' +
          '<input data-p="' + i + '" value="' + esc(r.p) + '" placeholder="Pekerjaan">' +
          '<input data-s="' + i + '" value="' + esc(r.s) + '" placeholder="Standar (mis. Bersih, Tidak Kotor)"></div>' +
          '<div class="tbtn"><button type="button" data-up="' + i + '">↑</button><button type="button" data-dn="' + i + '">↓</button><button type="button" data-rm="' + i + '">✕</button></div></div>';
      });
      h += '<button type="button" class="ghost" id="tAdd"' + (rows.length >= MAX_TUGAS ? ' disabled' : '') + '>+ Tambah pekerjaan</button>' +
        '<button class="primary" id="tSimpan">Simpan</button>' +
        (baru ? '' : '<button type="button" class="ghost bahaya" id="tHapus">Hapus ruangan ini</button>') + '</div>';
      box.innerHTML = h;

      if (baru) $('tKat').oninput = function () { namaBaru = this.value; };
      box.querySelectorAll('[data-p]').forEach(function (e) { e.oninput = function () { rows[+e.dataset.p].p = e.value; }; });
      box.querySelectorAll('[data-s]').forEach(function (e) { e.oninput = function () { rows[+e.dataset.s].s = e.value; }; });
      box.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () {
        var i = +b.dataset.up; if (i < 1) return; var x = rows[i]; rows[i] = rows[i - 1]; rows[i - 1] = x; gambar(); }; });
      box.querySelectorAll('[data-dn]').forEach(function (b) { b.onclick = function () {
        var i = +b.dataset.dn; if (i >= rows.length - 1) return; var x = rows[i]; rows[i] = rows[i + 1]; rows[i + 1] = x; gambar(); }; });
      box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { rows.splice(+b.dataset.rm, 1); gambar(); }; });
      $('tAdd').onclick = function () { rows.push({ p: '', s: '', id: '' }); gambar(true); };
      if (fokusAkhir) { var ins = box.querySelectorAll('[data-p]'); if (ins.length) ins[ins.length - 1].focus(); }

      $('tSimpan').onclick = function () {
        var nm = baru ? namaBaru.trim() : kat;
        var list = rows.filter(function (r) { return r.p.trim(); }).map(function (r) { return { Pekerjaan: r.p.trim(), Standar: r.s.trim(), ID: r.id }; });
        if (!nm) { R.toast('Nama ruangan wajib diisi'); return; }
        if (!list.length) { R.toast('Isi minimal 1 pekerjaan'); return; }
        post({ action: 'tugasSimpan', kategori: nm, baru: baru, tugas: list })
          .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Tersimpan'); return segarkanTugas(); })
          .catch(function (e) { R.toast('❌ ' + e.message); });
      };
      if (!baru) $('tHapus').onclick = function () {
        if (!confirm('Hapus ruangan ' + kat + '? Penugasan petugas di ruangan ini ikut lepas (data harian lama tetap tersimpan).')) return;
        post({ action: 'kategoriHapus', kategori: kat })
          .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Dihapus'); return segarkanTugas(); })
          .catch(function (e) { R.toast('❌ ' + e.message); });
      };
    }
    gambar();
    box.scrollIntoView({ behavior: 'smooth' });
  }

  // ---------- laporan kerusakan: tinjau, ubah status, tulis tindak lanjut ----------
  var STATUS = ['Baru', 'Diproses', 'Selesai'];
  function labelTabLaporan(n) {
    var b = document.querySelector('.admintabs [data-at="laporan"]');
    if (b) b.textContent = n > 0 ? 'Laporan (' + n + ')' : 'Laporan';
  }
  function hitungLaporan() {     // angka laporan yang belum selesai di tab admin
    R.apiGet({ action: 'laporan' }).then(function (r) {
      if (r.ok) labelTabLaporan((r.rows || []).filter(function (x) { return x.status !== 'Selesai'; }).length);
    }).catch(function () {});
  }
  function viewLaporan() {
    var box = $('at-laporan');
    box.innerHTML = '<div class="pesan">Memuat laporan...</div>';
    R.apiGet({ action: 'laporan' }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      var list = (r.rows || []).slice().sort(function (a, b) { return (a.status === 'Selesai' ? 1 : 0) - (b.status === 'Selesai' ? 1 : 0); });   // belum selesai di atas
      var buka = list.filter(function (x) { return x.status !== 'Selesai'; }).length;
      labelTabLaporan(buka);
      var h = '<div class="pesan"><b>' + buka + '</b> laporan belum selesai dari ' + list.length + ' laporan.</div>';
      if (!list.length) h = '<div class="pesan">Belum ada laporan kerusakan.</div>';
      list.forEach(function (x) {
        h += '<div class="lapadm" data-id="' + esc(x.id) + '">' + R.kartuLaporan(Object.assign({}, x, { tindak: '' })) +
          '<div class="card form"><label>Status<select data-st>' + STATUS.map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
          '<label>Tindak lanjut / catatan<textarea data-tl rows="2" maxlength="500" placeholder="mis. Sudah dihubungi teknisi, perbaikan Jumat">' + esc(x.tindak) + '</textarea></label>' +
          '<div class="baris"><button type="button" class="ghost bahaya" data-hapus>Hapus</button><button type="button" class="primary" data-simpan>Simpan</button></div></div></div>';
      });
      box.innerHTML = h;
      box.querySelectorAll('.lapadm').forEach(function (el) {
        var id = el.dataset.id;
        el.querySelector('[data-simpan]').onclick = function () {
          var btn = this; btn.disabled = true;
          post({ action: 'laporanStatus', id: id, status: el.querySelector('[data-st]').value, tindak: el.querySelector('[data-tl]').value })
            .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Tersimpan'); viewLaporan(); })
            .catch(function (e) { R.toast('❌ ' + e.message); btn.disabled = false; });
        };
        el.querySelector('[data-hapus]').onclick = function () {
          if (!confirm('Hapus laporan ini beserta fotonya? Tidak bisa dibatalkan.')) return;
          post({ action: 'laporanHapus', id: id })
            .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Dihapus'); viewLaporan(); })
            .catch(function (e) { R.toast('❌ ' + e.message); });
        };
      });
    }).catch(function (e) { box.innerHTML = '<div class="pesan">❌ ' + esc(e.message || 'Gagal memuat') + '</div>'; });
  }

  // ---------- pejabat penandatangan (Master_Pejabat; tampil di bagian TTD Excel) ----------
  function viewPejabat() {
    var h = '<div class="card form"><b>Pejabat penandatangan</b><small style="color:var(--muted)">Urutan = posisi kiri ke kanan di bagian tanda tangan Excel.</small>';
    R.M.pejabat.slice(0, 3).forEach(function (p, i) {
      h += '<div class="card form" data-pj="' + i + '"><b>Pejabat ' + (i + 1) + '</b>' +
        '<label>Jabatan / Peran<input data-f="Peran" value="' + esc(p.Peran) + '"></label>' +
        '<label>Nama<input data-f="Nama" value="' + esc(p.Nama) + '"></label>' +
        '<label>NIP<input data-f="NIP" value="' + esc(p.NIP) + '" placeholder="NIP. 1987..."></label>' +
        '<label>Instansi<input data-f="Instansi" value="' + esc(p.Instansi) + '"></label></div>';
    });
    $('at-pejabat').innerHTML = h + '<button class="primary" id="pjSimpan">Simpan</button></div>';
    $('pjSimpan').onclick = function () {
      var list = [].map.call($('at-pejabat').querySelectorAll('[data-pj]'), function (box) {
        var o = {}; box.querySelectorAll('[data-f]').forEach(function (e) { o[e.dataset.f] = e.value; }); return o;
      });
      $('pjSimpan').disabled = true;
      post({ action: 'pejabatSimpan', pejabat: list })
        .then(function (r) { if (!r.ok) throw new Error(r.error); R.toast('✔ Tersimpan'); return R.loadMaster().then(viewPejabat); })
        .catch(function (e) { R.toast('❌ ' + e.message); })
        .then(function () { var b = $('pjSimpan'); if (b) b.disabled = false; });
    };
  }

  // ---------- unduh (paraf petugas & pengawas terisi otomatis di Excel) ----------
  function viewUnduh() {
    $('at-unduh').innerHTML = '<div class="card form"><label>Bulan <input type="month" id="uBulan"></label>' +
      '<label>Petugas <select id="uPetugas"><option value="">Semua ruangan</option>' +
      R.M.petugas.map(function (p) { return '<option>' + esc(p.Nama) + '</option>'; }).join('') + '</select></label>' +
      '<button class="primary" id="uBtn">⬇ Unduh Excel</button><div id="uInfo" class="err"></div></div>';
    $('uBulan').value = R.hariIni().slice(0, 7);
    $('uBtn').onclick = function () {
      $('uBtn').disabled = true; $('uInfo').style.color = '#51606f'; $('uInfo').textContent = 'Menyusun file...';
      R.buatExcel($('uBulan').value, $('uPetugas').value).then(function (f) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([f.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = f.nama; document.body.appendChild(a); a.click(); a.remove();
        $('uInfo').textContent = '';
      }).catch(function (e) { $('uInfo').style.color = ''; $('uInfo').textContent = '❌ ' + e.message; })
        .then(function () { $('uBtn').disabled = false; });
    };
  }
})();
