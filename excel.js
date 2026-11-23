/* RAPIH1900 - pembuat Excel dari template.xlsx (format sama seperti file acuan). */
(function () {
  var R = window.R;
  function namaArea(ws) { return ws.name.replace(/[\s.]+$/, ''); }   // 'MOBIL KEPALA.' -> 'MOBIL KEPALA'

  // petugas yang benar-benar mengisi slot itu pada bulan tersebut (urut tanggal); kosong -> pemegang sekarang
  function pemilikBulan(rows, sekarang) {
    var n = [];
    rows.filter(function (x) { return x.oleh; })
      .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; })
      .forEach(function (x) { if (n.indexOf(x.oleh) < 0) n.push(x.oleh); });
    return n.length ? n : (sekarang ? [sekarang] : []);
  }

  // gandakan sheet ruangan sejenis untuk slot/ruangan baru
  function klonSheet(wb, src, nama) {
    var ns = wb.addWorksheet(nama.slice(0, 31));
    var m = JSON.parse(JSON.stringify(src.model));
    m.name = ns.name; m.mergeCells = src.model.merges;
    ns.model = m;
    var lama = namaArea(src);
    for (var r = 1; r <= 8; r++) ns.getRow(r).eachCell(function (c) {
      if (typeof c.value === 'string' && c.value.indexOf(lama) >= 0) c.value = c.value.split(lama).join(nama);
    });
    return ns;
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
      if (typeof v === 'string' && v.indexOf(R.C.KOTA) === 0) ws.getCell(f, 1).value = R.C.KOTA + ', 1 ' + R.BULAN[nx.getMonth()] + ' ' + nx.getFullYear();
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
        var ada = {};
        wb.worksheets.forEach(function (ws) { ada[namaArea(ws)] = ws; });

        // ruangan/slot yang belum punya sheet di template -> klon sheet sejenis
        R.M.area.forEach(function (a) {
          if (ada[a.Area]) return;
          var proto = R.M.area.filter(function (x) { return x.Kategori === a.Kategori && ada[x.Area]; })[0];
          var src = proto ? ada[proto.Area] : wb.worksheets[0];
          if (src) ada[a.Area] = klonSheet(wb, src, a.Area);
        });

        var buang = [];
        wb.worksheets.slice().forEach(function (ws) {
          var area = namaArea(ws), a = R.areaDari(area);
          if (!a) { buang.push(ws.id); return; }
          var rA = rows.filter(function (x) { return x.area === area; });
          var names = pemilikBulan(rA, a.Petugas);
          if (petugas && names.indexOf(petugas) < 0) buang.push(ws.id);
          else isiSheet(ws, area, rA, ym, names);
        });
        buang.forEach(function (id) { wb.removeWorksheet(id); });
        if (!wb.worksheets.length) throw new Error('Tidak ada ruangan untuk dipilih');
        return wb.xlsx.writeBuffer();
      });
    }).then(function (buffer) {
      var p = ym.split('-');
      return { buffer: buffer, nama: 'CHECKLIST_PEKERJAAN_PPPK_' + R.BULAN[+p[1] - 1].toUpperCase() + '_' + p[0] + (petugas ? '_' + petugas.replace(/\s+/g, '_') : '') + '.xlsx' };
    });
  };
})();
