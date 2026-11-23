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

  function buka() { $('admin').hidden = false; tab('petugas'); }
  document.querySelectorAll('.admintabs button').forEach(function (b) { b.onclick = function () { tab(b.dataset.at); }; });
  function tab(t) {
    document.querySelectorAll('.admintabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.at === t); });
    ['petugas', 'unduh'].forEach(function (x) { $('at-' + x).hidden = x !== t; });
    ({ petugas: viewPetugas, unduh: viewUnduh })[t]();
  }
  function post(body) { body.adminPin = pass; return R.apiPost(body); }

  // ---------- petugas ----------
  function viewPetugas() {
    var h = '<button class="primary" id="btnTambah">+ Tambah PPPK</button><div class="card">';
    R.M.petugas.forEach(function (p) {
      var ar = R.M.area.filter(function (a) { return a.Petugas === p.Nama; }).map(function (a) { return a.Area; });
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
    R.M.area.forEach(function (a) {
      var lain = a.Petugas && a.Petugas !== nama ? ' <small>(' + esc(a.Petugas) + ')</small>' : '';
      h += '<label><input type="checkbox" value="' + esc(a.Area) + '"' + (nama && a.Petugas === nama ? ' checked' : '') + '>' + esc(a.Area) + lain + '</label>';
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
