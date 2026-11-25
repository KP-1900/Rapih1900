/* RAPIH1900 - menu "Lapor Kerusakan" (halaman umum) + fungsi tampilan laporan yang dipakai juga oleh admin. */
(function () {
  var R = window.R, $ = R.$, esc = R.esc;
  var MAKS_FOTO = 3;
  var fotos = [];          // foto yang akan dikirim: { url: dataURL }
  var data = [];           // daftar laporan dari server
  var filter = 'buka';     // buka | selesai | semua
  var prio = 'Sedang';
  var terbentuk = false, mengirim = false;

  // ---------- util bersama (dipakai admin.js juga) ----------
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  R.fmtWaktu = function (s) {            // '2026-11-25 19:48' -> '25 Nov 2026, 19:48'
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
    return m ? (+m[3]) + ' ' + BLN[+m[2] - 1] + ' ' + m[1] + (m[4] ? ', ' + m[4] : '') : String(s || '');
  };
  R.umurHari = function (s) {            // selisih hari kalender sampai hari ini
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return 0;
    var a = new Date(+m[1], +m[2] - 1, +m[3]), b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((b - a) / 86400000));
  };
  R.fotoLaporanHtml = function (arr) {
    return (arr && arr.length) ? '<div class="lapfoto">' + arr.map(function (u) {
      return '<a href="' + esc(u.replace(/sz=w\d+/, 'sz=w1600')) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Foto kerusakan" loading="lazy"></a>';
    }).join('') + '</div>' : '';
  };
  R.umurLabel = function (x) {
    if (x.status === 'Selesai') return '';
    var h = R.umurHari(x.waktu);
    return h === 0 ? 'masuk hari ini' : h + ' hari belum selesai';
  };

  // ---------- pindah menu ----------
  document.querySelectorAll('.menu button').forEach(function (b) { b.onclick = function () { tampil(b.dataset.v); }; });
  function tampil(v) {
    document.querySelectorAll('.menu button').forEach(function (b) { b.classList.toggle('active', b.dataset.v === v); });
    $('v-harian').hidden = v !== 'harian';
    $('v-lapor').hidden = v !== 'lapor';
    window.scrollTo(0, 0);
    if (v === 'lapor') bukaLapor();
  }

  function bukaLapor() {
    if (!R.M) { $('v-lapor').innerHTML = '<div class="pesan">Memuat...</div>'; terbentuk = false; setTimeout(function () { if (!$('v-lapor').hidden) bukaLapor(); }, 600); return; }
    if (!terbentuk) bentukForm();
    muatDaftar();
  }

  // ---------- form ----------
  function daftarLokasi() {
    var k = []; R.M.tugas.forEach(function (t) { if (k.indexOf(t.Kategori) < 0) k.push(t.Kategori); }); return k;
  }

  function bentukForm() {
    terbentuk = true;
    var nama = localStorage.getItem('rapih_pelapor') || localStorage.getItem('rapih_nama') || '';
    $('v-lapor').innerHTML =
      '<section class="card form lapform"><b>🛠 Lapor Temuan Kerusakan</b>' +
      '<small class="sub">Temukan sesuatu yang rusak? Laporkan di sini supaya tercatat dan tidak terlewat. Sertakan foto agar mudah ditindaklanjuti.</small>' +
      '<label>Nama pelapor<input id="lapNama" list="lapNamaList" maxlength="60" placeholder="Nama Anda" autocomplete="off" value="' + esc(nama) + '"></label>' +
      '<datalist id="lapNamaList">' + R.M.petugas.map(function (p) { return '<option value="' + esc(p.Nama) + '">'; }).join('') + '</datalist>' +
      '<label>Lokasi<select id="lapLok">' + daftarLokasi().map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') +
      '<option value="__lain">Lainnya (tulis sendiri)</option></select></label>' +
      '<label id="lapLokLainBox" hidden>Tulis lokasi<input id="lapLokLain" maxlength="80" placeholder="mis. Gudang belakang"></label>' +
      '<label>Apa yang rusak?<textarea id="lapUraian" rows="4" maxlength="1000" placeholder="Jelaskan kerusakan dan posisi tepatnya. Contoh: Kran wastafel bilik 2 bocor, air menetes terus."></textarea></label>' +
      '<div class="lblteks">Seberapa mendesak?</div>' +
      '<div class="prio" id="lapPrio">' +
      '<button type="button" data-p="Ringan">Ringan</button><button type="button" data-p="Sedang" class="on">Sedang</button><button type="button" data-p="Mendesak">Mendesak</button></div>' +
      '<div class="lblteks">Foto kerusakan <small>(maks ' + MAKS_FOTO + ')</small></div>' +
      '<div class="fotoaksi">' +
      '<label class="btnfoto">📷 Kamera<input type="file" id="lapKamera" accept="image/*" capture="environment" hidden></label>' +
      '<label class="btnfoto alt">🖼 Galeri / File<input type="file" id="lapGaleri" accept="image/*" multiple hidden></label></div>' +
      '<div id="lapPreview" class="lapfoto"></div>' +
      '<button class="primary" id="lapKirim">Kirim Laporan</button><div id="lapStatus" class="err"></div></section>' +
      '<section><div class="lapbar"><b>Daftar Laporan</b><div class="chips" id="lapChips"></div></div><div id="lapDaftar"></div></section>';

    $('lapLok').onchange = function () { $('lapLokLainBox').hidden = this.value !== '__lain'; };
    $('lapPrio').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        prio = b.dataset.p;
        $('lapPrio').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      };
    });
    $('lapKamera').onchange = function () { tambahFoto(this); };
    $('lapGaleri').onchange = function () { tambahFoto(this); };
    $('lapKirim').onclick = kirim;
  }

  function tambahFoto(input) {
    var files = [].slice.call(input.files || []); input.value = '';
    if (!files.length) return;
    var sisa = MAKS_FOTO - fotos.length;
    if (sisa <= 0) { R.toast('Maksimal ' + MAKS_FOTO + ' foto'); return; }
    if (files.length > sisa) R.toast('Hanya ' + sisa + ' foto yang ditambahkan (maks ' + MAKS_FOTO + ')');
    files.slice(0, sisa).reduce(function (p, f) {
      return p.then(function () { return R.kecilkanFoto(f).then(function (url) { fotos.push({ url: url }); gambarPreview(); }); });
    }, Promise.resolve());
  }

  function gambarPreview() {
    $('lapPreview').innerHTML = fotos.map(function (f, i) {
      return '<div class="fotowrap"><img src="' + f.url + '" alt=""><button type="button" class="hapusfoto" data-i="' + i + '" title="Buang foto">✕</button></div>';
    }).join('');
    $('lapPreview').querySelectorAll('.hapusfoto').forEach(function (b) {
      b.onclick = function () { fotos.splice(+b.dataset.i, 1); gambarPreview(); };
    });
  }

  function kirim() {
    if (mengirim) return;
    var pelapor = $('lapNama').value.trim();
    var lokasi = $('lapLok').value === '__lain' ? $('lapLokLain').value.trim() : $('lapLok').value;
    var uraian = $('lapUraian').value.trim();
    if (!pelapor) { R.toast('Isi nama pelapor'); $('lapNama').focus(); return; }
    if (!lokasi) { R.toast('Isi lokasi kerusakan'); return; }
    if (uraian.length < 5) { R.toast('Jelaskan kerusakannya dulu'); $('lapUraian').focus(); return; }

    mengirim = true; $('lapKirim').disabled = true;
    $('lapStatus').style.color = '#51606f'; $('lapStatus').textContent = 'Mengirim' + (fotos.length ? ' beserta foto' : '') + '...';
    localStorage.setItem('rapih_pelapor', pelapor);
    R.apiPost({
      action: 'laporanBaru', pelapor: pelapor, lokasi: lokasi, uraian: uraian, prioritas: prio,
      fotos: fotos.map(function (f) { return { base64: f.url.split(',')[1], mime: 'image/jpeg' }; })
    }).then(function (r) {
      if (!r.ok) throw new Error(r.error || 'Gagal mengirim');
      R.toast('✔ Laporan terkirim. Terima kasih!');
      fotos = []; gambarPreview();
      $('lapUraian').value = ''; $('lapLokLain').value = ''; $('lapStatus').textContent = '';
      filter = 'buka'; muatDaftar();
    }).catch(function (e) {
      $('lapStatus').style.color = ''; $('lapStatus').textContent = '❌ ' + (e.message || 'Gagal mengirim, coba lagi');
    }).then(function () { mengirim = false; $('lapKirim').disabled = false; });
  }

  // ---------- daftar laporan ----------
  function muatDaftar() {
    $('lapDaftar').innerHTML = '<div class="pesan">Memuat laporan...</div>';
    R.apiGet({ action: 'laporan' }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      data = r.rows || []; gambarDaftar();
    }).catch(function () { $('lapDaftar').innerHTML = '<div class="pesan">Gagal memuat laporan. Tolong refresh kembali.</div>'; });
  }

  function gambarDaftar() {
    var buka = data.filter(function (x) { return x.status !== 'Selesai'; }).length;
    var chips = [['buka', 'Belum selesai (' + buka + ')'], ['selesai', 'Selesai (' + (data.length - buka) + ')'], ['semua', 'Semua (' + data.length + ')']];
    $('lapChips').innerHTML = chips.map(function (c) { return '<button type="button" data-f="' + c[0] + '" class="' + (filter === c[0] ? 'on' : '') + '">' + c[1] + '</button>'; }).join('');
    $('lapChips').querySelectorAll('button').forEach(function (b) { b.onclick = function () { filter = b.dataset.f; gambarDaftar(); }; });

    var list = data.filter(function (x) { return filter === 'semua' || (filter === 'buka' ? x.status !== 'Selesai' : x.status === 'Selesai'); });
    if (!list.length) { $('lapDaftar').innerHTML = '<div class="pesan">' + (filter === 'buka' ? 'Tidak ada laporan yang belum selesai. 🎉' : 'Belum ada laporan.') + '</div>'; return; }
    $('lapDaftar').innerHTML = list.map(R.kartuLaporan).join('');
  }

  // kartu satu laporan (tampilan baca saja)
  R.kartuLaporan = function (x) {
    var umur = R.umurLabel(x), telat = x.status !== 'Selesai' && R.umurHari(x.waktu) >= 3;
    return '<article class="lap p-' + esc(x.prioritas) + (telat ? ' telat' : '') + '">' +
      '<div class="laphead"><b>' + esc(x.lokasi) + '</b><span class="badge s-' + esc(x.status) + '">' + esc(x.status) + '</span></div>' +
      '<div class="lapmeta"><span class="pr p-' + esc(x.prioritas) + '">' + esc(x.prioritas) + '</span> · ' + esc(x.pelapor) + ' · ' + esc(R.fmtWaktu(x.waktu)) +
      (umur ? ' · <span class="umur">' + esc(umur) + '</span>' : '') + '</div>' +
      '<p>' + esc(x.uraian) + '</p>' + R.fotoLaporanHtml(x.foto) +
      (x.tindak ? '<div class="laptindak"><b>Tindak lanjut:</b> ' + esc(x.tindak) + '</div>' : '') + '</article>';
  };
})();
