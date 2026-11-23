/* RAPIH1900 - pembuat Excel dari template.xlsx (format sama seperti file acuan). */
(function () {
  var R = window.R;

  function namaArea(ws) { return ws.name.replace(/[\s.]+$/, ''); }   // 'MOBIL KEPALA.' -> 'MOBIL KEPALA'

  // isi satu sheet area
  function isiSheet(ws, area, rows, ym, pejabat) {
    var info = R.areaDari(area), tugas = R.tugasArea(area);
    var p = ym.split('-'), n = R.jmlHari(ym);
    var byTgl = {}; rows.forEach(function (x) { byTgl[x.tanggal] = x; });
    function rec(d) { return byTgl[ym + '-' + R.pad(d)]; }
    function kolHari(d) { return 3 + d; }                         // hari 1 = kolom D

    // baris pekerjaan = baris yang kolom A-nya angka; baris paraf = teks PARAF ...
    var barisTugas = [], barisPetugas = 0, barisPengawas = 0, barisAkhir = 0;
    for (var r = 9; r <= ws.rowCount; r++) {
      var a = ws.getCell(r, 1).value;
      if (typeof a === 'number') { barisTugas.push(r); barisAkhir = r; }
      else if (typeof a === 'string') {
        var s = a.trim().toUpperCase();
        if (s === 'PARAF PETUGAS') barisPetugas = r;
        if (s === 'PARAF PENGAWAS') barisPengawas = r;
      }
    }

    ws.getCell(7, 4).value = R.BULAN[+p[1] - 1].toUpperCase() + ' ' + p[0];
    for (var d = 1; d <= 31; d++) ws.getCell(8, kolHari(d)).value = d <= n ? d : null;

    function tulisHari(r, fn) {
      for (var d = 1; d <= 31; d++) ws.getCell(r, kolHari(d)).value = d <= n ? fn(rec(d), d) : null;
    }
    barisTugas.forEach(function (r, i) {
      if (tugas[i]) { ws.getCell(r, 2).value = tugas[i].Pekerjaan; ws.getCell(r, 3).value = tugas[i].Standar; }
      tulisHari(r, function (x) { return !x ? null : x.libur ? 'X' : (x.tugas[i] === 'V' ? 'V' : null); });
    });
    if (barisPetugas) tulisHari(barisPetugas, function (x) { return !x ? null : x.libur ? 'X' : (x.parafPetugas ? 'V' : null); });
    if (barisPengawas) tulisHari(barisPengawas, function (x) { return !x ? null : x.libur ? 'X' : (x.parafPengawas ? 'V' : null); });

    // Nama & NIK: sel di sebelah kanan tanda ':' pada baris 2 dan 3
    var pt = R.M.petugas.filter(function (x) { return x.Nama === info.Petugas; })[0];
    for (var rr = 2; rr <= 3; rr++) {
      for (var c = 20; c <= 40; c++) {
        if (ws.getCell(rr, c).value === ':') {
          ws.getCell(rr, c + 1).value = rr === 2 ? (info.Petugas || '') : (pt && pt.NIK ? String(pt.NIK) : '');
          break;
        }
      }
    }

    // tanggal tanda tangan = tanggal 1 bulan berikutnya
    var nx = new Date(+p[0], +p[1], 1);
    for (var f = barisAkhir; f <= ws.rowCount; f++) {
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
        var buang = [];
        wb.eachSheet(function (ws) {
          var area = namaArea(ws), a = R.areaDari(area);
          if (!a || (petugas && a.Petugas !== petugas)) buang.push(ws.id);
          else isiSheet(ws, area, rows.filter(function (x) { return x.area === area; }), ym, R.M.pejabat);
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
