/* RAPIH1900 - pembuat Excel dari template.xlsx (format sama seperti file acuan). */
(function () {
  var R = window.R;

  // ---------- nama area ----------
  function namaArea(ws) { return ws.name.replace(/[\s.]+$/, ''); }   // 'MOBIL KEPALA.' -> 'MOBIL KEPALA'
  function kunci(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').replace(/[\s.]+$/, '').trim(); }

  // Nama pendek untuk di Excel: buang keterangan dalam kurung.
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

  // ---------- util sel gabungan (merge) ----------
  function kolNo(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
  function parseRange(a) {
    var m = String(a).match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
    return m ? { left: kolNo(m[1]), top: +m[2], right: kolNo(m[3]), bottom: +m[4] } : null;
  }
  function gabung(ws, r) {
    if (ws.mergeCellsWithoutStyle) ws.mergeCellsWithoutStyle(r.top, r.left, r.bottom, r.right);
    else ws.mergeCells(r.top, r.left, r.bottom, r.right);
  }
  function daftarMerge(ws) {
    return (ws.model.merges || []).map(parseRange).filter(Boolean);
  }
  function lepasSemua(ws) {
    (ws.model.merges || []).slice().forEach(function (m) { ws.unMergeCells(m); });
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

  // kolom label "NAMA / NIK / ..." di kanan atas (TOILET = Z, lainnya = Y)
  function kolLabel(ws, gab) {
    for (var r = 2; r <= 3; r++) {
      for (var c = 20; c <= 32; c++) {
        var v = ws.getCell(r, c).value;
        if (typeof v === 'string' && v.trim().toUpperCase().indexOf('NAMA') === 0) return c;
      }
    }
    // cadangan: kolom tepat setelah kotak judul (gabungan yang mulai di D2)
    var j = (gab || daftarMerge(ws)).filter(function (m) { return m.top === 2 && m.left === 4; })[0];
    return j ? j.right + 1 : 25;
  }

  // ruangan/kategori baru (tidak punya template sendiri): judul & label disesuaikan, bukan "TOILET"
  function judulKategori(ws, kategori) {
    var nama = String(kategori || '').replace(/\s+\d+$/, '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!nama) return;
    ws.getCell(2, 4).value = 'CHECKLIST KEBERSIHAN ' + nama + '\nPPPK BPS PROVINSI KEPULAUAN BANGKA BELITUNG';
    ws.getCell(4, kolLabel(ws)).value = 'RUANG';          // label sebelum "LANTAI"
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

  // tambah baris pekerjaan TANPA merusak sel gabungan (bagian paraf, keterangan, tanda tangan)
  function tambahBaris(ws, src, tambah) {
    var asli = daftarMerge(ws);
    lepasSemua(ws);
    ws.duplicateRow(src, tambah, true);
    asli.forEach(function (r) {
      var b = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      if (b.top > src) { b.top += tambah; b.bottom += tambah; }
      else if (b.bottom > src) { b.bottom += tambah; }
      gabung(ws, b);
      if (r.top === src && r.bottom === src) {            // gabungan di baris pekerjaan -> ikut ke baris baru
        for (var i = 1; i <= tambah; i++) gabung(ws, { left: r.left, right: r.right, top: src + i, bottom: src + i });
      }
    });
  }

  // blok tanda tangan: jabatan (baris b), instansi (b+1), nama (b+3), NIP (b+4)
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
    // pekerjaan lebih banyak dari baris template -> tambah baris (sel gabungan dijaga)
    if (s.tugas.length && tugas.length > s.tugas.length) {
      tambahBaris(ws, s.tugas[s.tugas.length - 1], tugas.length - s.tugas.length);
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

  // ---------- perapihan akhir: garis tabel + font Calibri ----------
  function garis(ws, r1, r2, c1, c2) {
    var sisi = ['top', 'left', 'bottom', 'right'];
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        var cell = ws.getCell(r, c);
        var b = Object.assign({}, cell.border || {});
        sisi.forEach(function (k) { if (!b[k]) b[k] = { style: 'thin' }; });
        cell.border = b;
      }
    }
  }

  // kotak: garis tepi luar saja (dipaksa penuh), isi dalam dibiarkan
  function kotak(ws, r1, r2, c1, c2) {
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        var cell = ws.getCell(r, c);
        var b = Object.assign({}, cell.border || {});
        if (r === r1) b.top = { style: 'thin' };
        if (r === r2) b.bottom = { style: 'thin' };
        if (c === c1) b.left = { style: 'thin' };
        if (c === c2) b.right = { style: 'thin' };
        cell.border = b;
      }
    }
  }

  function calibri(f) {
    var o = Object.assign({}, f || {}, { name: 'Calibri', family: 2 });
    delete o.scheme;
    return o;
  }

  function rapikan(ws) {
    var gab = daftarMerge(ws);
    var lc = kolLabel(ws, gab);                       // kolom label NAMA (sebelum sel dilepas)
    // kotak logo/instansi selalu satu gabungan A2:C6 (seperti sheet TOILET)
    gab = gab.filter(function (m) { return !(m.left === 1 && m.right === 3 && m.top >= 2 && m.bottom <= 6); });
    gab.push({ left: 1, right: 3, top: 2, bottom: 6 });
    lepasSemua(ws);                                   // kerja di sel biasa dulu, gabungkan lagi di akhir

    // 0) kepala (baris 2-6): semua garis tepi dibuat penuh, tidak ada yang putus
    kotak(ws, 2, 6, 1, 3);                            // logo + nama instansi
    kotak(ws, 2, 5, 4, lc - 1);                       // judul
    kotak(ws, 2, 5, lc, 34);                          // NAMA / NIK / RUANG / LANTAI
    for (var ri = 2; ri <= 5; ri++) kotak(ws, ri, ri, lc, 34);   // garis pemisah tiap baris NAMA/NIK/RUANG/LANTAI, penuh sampai kanan
    kotak(ws, 6, 6, 4, 34);                           // "CHECKLIST KETUNTASAN KEGIATAN PER-HARI"
    ws.getRow(6).height = 33;                         // tinggi baris 6 selalu 33

    // 1) tabel utama: dari baris judul kolom sampai paraf pengawas, kolom A..AH
    var s = pindai(ws);
    var akhir = s.pengawas || s.petugas || s.akhir;
    if (akhir) garis(ws, 7, akhir, 1, 34);

    // 2) tabel keterangan (X / PAGI / SIANG / SORE), kolom A..C
    var ketemu = false;
    for (var r = (akhir || 9) + 1; r <= ws.rowCount && !ketemu; r++) {
      for (var c = 1; c <= 3; c++) {
        var v = ws.getCell(r, c).value;
        if (typeof v === 'string' && v.trim().toUpperCase().indexOf('KETERANGAN') === 0) {
          garis(ws, r, r + 4, 1, 3); ketemu = true; break;
        }
      }
    }

    // 3) semua font -> Calibri
    ws.eachRow({ includeEmpty: true }, function (row) {
      row.eachCell({ includeEmpty: true }, function (cell) {
        var v = cell.value;
        if (v && typeof v === 'object' && v.richText) {
          cell.value = { richText: v.richText.map(function (rt) { return { text: rt.text, font: calibri(rt.font) }; }) };
        }
        if (cell.font || (cell.value !== null && cell.value !== undefined && cell.value !== '')) cell.font = calibri(cell.font);
      });
    });

    // 4) gabungkan kembali
    gab.forEach(function (r) { gabung(ws, r); });
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
        var pasangan = [];   // { ws, a (data area), baruKat }
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

        // 2) ruangan/slot yang belum punya sheet -> klon sheet sejenis.
        //    Kategori yang belum punya template sama sekali (ruangan baru dari admin) memakai
        //    bentuk RUANG KERJA (bukan TOILET); judul & label disesuaikan di langkah 4.
        R.M.area.forEach(function (a) {
          if (sudah[a.Area]) return;
          var proto = pasangan.filter(function (x) { return x.a.Kategori === a.Kategori; })[0];
          var baruKat = proto ? !!proto.baruKat : true;
          if (!proto) {
            proto = pasangan.filter(function (x) { return x.a.Kategori === 'RUANG KERJA'; })[0]
              || pasangan.filter(function (x) { return !/TOILET/i.test(x.a.Kategori); })[0];
          }
          var src = proto ? proto.ws : wb.worksheets[0];
          if (!src) return;
          sudah[a.Area] = 1;
          pasangan.push({ ws: klonSheet(wb, src), a: a, baruKat: baruKat });
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
          if (x.baruKat) judulKategori(x.ws, x.a.Kategori || x.a.Area);   // judul + label "RUANG" untuk ruangan baru
          isiSheet(x.ws, x.a.Area, x.rA, ym, x.names);
          rapikan(x.ws);                       // garis kepala & tabel + tinggi baris 6 + font Calibri
        });
        return wb.xlsx.writeBuffer();
      });
    }).then(function (buffer) {
      var p = ym.split('-');
      return { buffer: buffer, nama: 'CHECKLIST_PEKERJAAN_PPPK_' + R.BULAN[+p[1] - 1].toUpperCase() + '_' + p[0] + (petugas ? '_' + petugas.replace(/\s+/g, '_') : '') + '.xlsx' };
    });
  };
})();
