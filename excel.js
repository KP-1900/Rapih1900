/* RAPIH1900 - pembuat Excel dari template.xlsx (format sama seperti file acuan). */
(function () {
  var R = window.R;

  // ---------- nama area ----------
  function namaArea(ws) { return ws.name.replace(/[\s.]+$/, ''); }   // 'MOBIL KEPALA.' -> 'MOBIL KEPALA'
  function kunci(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').replace(/[\s.]+$/, '').trim(); }

  // Nama pendek untuk di Excel: buang keterangan dalam kurung.
  // 'RUANG PELAYANAN UMUM (PST, PPID, ...)' -> 'RUANG PELAYANAN UMUM'
  function pendek(s) {
    var t = String(s || '').replace(/\s*\(.*$/, '').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
    return t || String(s || '').slice(0, 31);
  }

  // nama sheet unik (maks 31 huruf, tidak boleh kembar)
  function namaUnik(dasar, dipakai) {
    var base = pendek(dasar).slice(0, 31), nama = base, n = 2;
    while (dipakai[nama.toUpperCase()]) {
      var suf = ' ' + n++;
      nama = base.slice(0, 31 - suf.length) + suf;
    }
    dipakai[nama.toUpperCase()] = 1;
    return nama;
  }

  // petugas yang benar-benar mengisi slot itu pada bulan tersebut (urut tanggal); kosong -> pemegang sekarang
  function pemilikBulan(rows, sekarang) {
    var n = [];
    rows.filter(function (x) { return x.oleh; })
      .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; })
      .forEach(function (x) { if (n.indexOf(x.oleh) < 0) n.push(x.oleh); });
    return n.length ? n : (sekarang ? [sekarang] : []);
  }

  // gandakan sheet ruangan sejenis untuk slot/ruangan baru (nama sementara, diganti di akhir)
  var seq = 0;
  function klonSheet(wb, src) {
    var ns = wb.addWorksheet('~klon' + (++seq));
    var m = JSON.parse(JSON.stringify(src.model));
    m.name = ns.name; m.mergeCells = src.model.merges;
    ns.model = m;
    ns._lama = (src._lama || []).slice();
    return ns;
  }

  // ganti teks nama ruangan lama di judul sheet (baris 1-8) dengan nama pendek yang baru
  function perbaruiJudul(ws, namaBaru) {
    var daftar = (ws._lama || []).filter(Boolean);
    for (var r = 1; r <= 8; r++) ws.getRow(r).eachCell(function (c) {
      if (typeof c.value !== 'string') return;
      for (var i = 0; i < daftar.length; i++) {
        var lp = pendek(daftar[i]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp(lp + '(\\s*\\([^)]*(\\)|$))?', 'i');
        if (re.test(c.value)) { c.value = c.value.replace(re, namaBaru); break; }
      }
    });
  }

  // cari baris pekerjaan (kolom A angka), baris paraf, dan baris akhir
  function pindai(ws) {
    var o = { tugas: [], petugas: 0, pengawas: 0, akhir: 0 };
    for (var r = 9; r <= ws.rowCount; r++) {
      var a = ws.getCell(r, 1).value;
      if (typeof a === 'number') { o.tugas.push(r); o.akhir = r; }
      else if (typeof a === 'string') {
        var s = a.trim().toUpperCase();
        if (s === 'PARAF PETUGAS') o.petugas = r;
        if (s === 'PARAF PENGAWAS') o.pengawas = r;
      }
    }
    return o;
  }

  // blok tanda tangan: jabatan (baris b), instansi (b+1), nama (b+3), NIP (b+4)
  // kolom kiri->kanan sesuai template: jabatan B,C,D; sisanya A,C,D
  function isiPejabat(ws, b) {
    var pj = (R.M.pejabat || []).slice(0, 3);
    var kolJab = [2, 3, 4], kolLain = [1, 3, 4];
    pj.forEach(function (p, i) {
      var nip = String(p.NIP || '').trim();
      if (/^\d/.test(nip)) nip = 'NIP. ' + nip;
      ws.getCell(b, kolJab[i]).value = p.Peran || null;
      ws.getCell(b + 1, kolLain[i]).value = p.Instansi || null;
      ws.getCell(b + 3, kolLain[i]).value = p.Nama || null;
      ws.getCell(b + 4, kolLain[i]).value = nip || null;
    });
  }

  // names = daftar petugas yang mengisi slot ini pada bulan tsb
  function isiSheet(ws, area, rows, ym, names) {
    var tugas = R.tugasArea(area);
    var p = ym.split('-'), n = R.jmlHari(ym);
    var byTgl = {}; rows.forEach(function (x) { byTgl[x.tanggal] = x; });
    function rec(d) { return byTgl[ym + '-' + R.pad(d)]; }
    function kolHari(d) { return 3 + d; }                         // hari 1 = kolom D

    var s = pindai(ws);
    // pekerjaan lebih banyak dari baris template -> tambah baris otomatis (gaya disalin)
    if (s.tugas.length && tugas.length > s.tugas.length) {
      ws.duplicateRow(s.tugas[s.tugas.length - 1], tugas.length - s.tugas.length, true);
      s = pindai(ws);
    }
    s.tugas.forEach(function (r, i) { if (i < tugas.length) ws.getCell(r, 1).value = i + 1; });

    ws.getCell(7, 4).value = R.BULAN[+p[1] - 1].toUpperCase() + ' ' + p[0];
    for (var d = 1; d <= 31; d++) ws.getCell(8, kolHari(d)).value = d <= n ? d : null;

    function tulisHari(r, fn) {
      for (var d = 1; d <= 31; d++) ws.getCell(r, kolHari(d)).value = d <= n ? fn(rec(d), d) : null;
    }
    s.tugas.forEach(function (r, i) {
      if (i >= tugas.length) {   // baris template berlebih -> dikosongkan
        ws.getCell(r, 1).value = null; ws.getCell(r, 2).value = null; ws.getCell(r, 3).value = null;
        tulisHari(r, function () { return null; });
        return;
      }
      ws.getCell(r, 2).value = tugas[i].Pekerjaan; ws.getCell(r, 3).value = tugas[i].Standar;
      tulisHari(r, function (x) { return !x ? null : x.libur ? 'X' : (x.tugas[i] === 'V' ? 'V' : null); });
    });

    // paraf otomatis: hari itu ada pekerjaan yang diceklis -> V (libur -> X)
    function parafOtomatis(x) {
      if (!x) return null;
      if (x.libur) return 'X';
      return (x.tugas || []).some(function (v) { return v === 'V'; }) ? 'V' : null;
    }
    if (s.petugas) tulisHari(s.petugas, parafOtomatis);
    if (s.pengawas) tulisHari(s.pengawas, parafOtomatis);

    // Nama & NIK dari petugas yang mengisi bulan itu (bukan pemegang slot sekarang)
    var nik = names.map(function (nm) {
      var pt = R.M.petugas.filter(function (x) { return x.Nama === nm; })[0];
      return pt && pt.NIK ? String(pt.NIK) : '';
    }).filter(Boolean).join(' / ');
    for (var rr = 2; rr <= 3; rr++) {
      for (var c = 20; c <= 40; c++) {
        if (ws.getCell(rr, c).value === ':') {
          ws.getCell(rr, c + 1).value = rr === 2 ? names.join(' / ') : nik;
          break;
        }
      }
    }

    // tanggal tanda tangan = tanggal 1 bulan berikutnya
    var nx = new Date(+p[0], +p[1], 1);
    for (var f = s.akhir; f <= ws.rowCount; f++) {
      var v = ws.getCell(f, 1).value;
      if (typeof v === 'string' && v.indexOf(R.C.KOTA) === 0) {
        ws.getCell(f, 1).value = R.C.KOTA + ', 1 ' + R.BULAN[nx.getMonth()] + ' ' + nx.getFullYear();
        isiPejabat(ws, f + 1);   // baris jabatan tepat di bawah baris tanggal
        break;
      }
    }
  }

  // ym = '2026-03', petugas = '' (semua) atau nama petugas
  R.buatExcel = function (ym, petugas) {
    var wb = new ExcelJS.Workbook();
    return Promise.all([
      fetch(R.C.TEMPLATE).then(function (r) { if (!r.ok) throw new Error('template.xlsx tidak ditemukan'); return r.arrayBuffer(); }),
      R.apiGet({ action: 'bulan', ym: ym })
    ]).then(function (hasil) {
      var rows = hasil[1].rows || [];
      return wb.xlsx.load(hasil[0]).then(function () {
        var pasangan = [];   // { ws, a (data area) }
        var terpakai = {};   // id sheet yang sudah dipasangkan
        var sudah = {};      // nama area yang sudah punya sheet

        wb.worksheets.forEach(function (ws) { ws._lama = [namaArea(ws)]; });

        // 1) cocokkan sheet template dengan area (nama lengkap, terpotong 31 huruf, atau nama pendek)
        function cocokkan(tes) {
          R.M.area.forEach(function (a) {
            if (sudah[a.Area]) return;
            var ws = wb.worksheets.filter(function (w) { return !terpakai[w.id] && tes(w, a); })[0];
            if (!ws) return;
            terpakai[ws.id] = 1; sudah[a.Area] = 1;
            ws._lama.push(a.Area);
            pasangan.push({ ws: ws, a: a });
          });
        }
        cocokkan(function (w, a) { return kunci(namaArea(w)) === kunci(a.Area); });
        cocokkan(function (w, a) { return kunci(a.Area).slice(0, 31) === kunci(namaArea(w)); });
        cocokkan(function (w, a) { return kunci(pendek(namaArea(w))) === kunci(pendek(a.Area)); });

        // 2) ruangan/slot yang belum punya sheet -> klon sheet sejenis
        R.M.area.forEach(function (a) {
          if (sudah[a.Area]) return;
          var proto = pasangan.filter(function (x) { return x.a.Kategori === a.Kategori; })[0];
          var src = proto ? proto.ws : wb.worksheets[0];
          if (!src) return;
          sudah[a.Area] = 1;
          pasangan.push({ ws: klonSheet(wb, src), a: a });
        });

        // 3) buang sheet yang tidak dipakai / bukan milik petugas terpilih, isi sisanya
        var simpanSheet = [];
        var buang = wb.worksheets.filter(function (ws) { return !pasangan.some(function (x) { return x.ws === ws; }); });
        pasangan.forEach(function (x) {
          var rA = rows.filter(function (r) { return r.area === x.a.Area; });
          var names = pemilikBulan(rA, x.a.Petugas);
          if (petugas && names.indexOf(petugas) < 0) { buang.push(x.ws); return; }
          x.names = names; x.rA = rA; simpanSheet.push(x);
        });
        buang.forEach(function (ws) { wb.removeWorksheet(ws.id); });
        if (!simpanSheet.length) throw new Error('Tidak ada ruangan untuk dipilih');

        // 4) beri nama sheet pendek & unik (lewat nama sementara supaya tidak bentrok)
        simpanSheet.forEach(function (x, i) { x.ws.name = '~tmp' + i; });
        var dipakai = {};
        simpanSheet.forEach(function (x) {
          x.nama = namaUnik(x.a.Area, dipakai);
          x.ws.name = x.nama;
          perbaruiJudul(x.ws, x.nama);
          isiSheet(x.ws, x.a.Area, x.rA, ym, x.names);
        });
        return wb.xlsx.writeBuffer();
      });
    }).then(function (buffer) {
      var p = ym.split('-');
      return { buffer: buffer, nama: 'CHECKLIST_PEKERJAAN_PPPK_' + R.BULAN[+p[1] - 1].toUpperCase() + '_' + p[0] + (petugas ? '_' + petugas.replace(/\s+/g, '_') : '') + '.xlsx' };
    });
  };
})();
