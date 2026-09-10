/* ============================================================
   report-doc.js — every experiment describes its record once,
   as a list of blocks, and this renders it three ways:

     ReportDoc.html(blocks)            → the on-screen preview
     ReportDoc.pdf(blocks, meta)       → a PDF the student downloads
     ReportDoc.forBackend(blocks)      → what the Sheet turns into a Doc

   Block types
     {type:"title",     text}
     {type:"meta",      pairs:[[label, value], …]}
     {type:"heading",   text, level}
     {type:"paragraph", text}
     {type:"formula",   text}
     {type:"table",     caption, rows:[[…], …], alignRight}
     {type:"image",     svg | dataUrl, w, h, caption, width}
     {type:"pagebreak"}
   ============================================================ */

(function (root) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------- on-screen preview ---------- */

  function html(blocks) {
    return (blocks || []).map(function (b) {
      switch (b.type) {
        case "title":
          return '<h1 style="margin-bottom:4px">' + esc(b.text) + "</h1>";
        case "meta":
          return '<dl class="kv" style="margin:0 0 20px">' + (b.pairs || []).map(function (p) {
            return "<dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd>";
          }).join("") + "</dl>";
        case "heading":
          return "<h" + (b.level || 2) + ">" + esc(b.text) + "</h" + (b.level || 2) + ">";
        case "paragraph":
          return "<p>" + esc(b.text).replace(/\n/g, "<br>") + "</p>";
        case "formula":
          return '<p class="formula">' + esc(b.text) + "</p>";
        case "table":
          return table(b);
        case "image":
          return '<div class="chartbox">' + (b.svg || '<img src="' + esc(b.dataUrl) + '" alt="">') +
            (b.caption ? '<p style="font-size:.82rem;color:var(--ink-2);margin:6px 2px 0">' + esc(b.caption) + "</p>" : "") +
            "</div>";
        default:
          return "";
      }
    }).join("");
  }

  function table(b) {
    var rows = b.rows || [];
    if (!rows.length) return "";
    var head = rows[0], body = rows.slice(1);
    return '<div class="tablewrap"><table>' +
      (b.caption ? "<caption>" + esc(b.caption) + "</caption>" : "") +
      "<thead><tr>" + head.map(function (c, i) {
        return '<th' + (i && b.alignRight !== false ? ' class="num"' : "") + ">" + esc(c) + "</th>";
      }).join("") + "</tr></thead><tbody>" +
      body.map(function (r) {
        return "<tr>" + r.map(function (c, i) {
          return "<td" + (i && b.alignRight !== false ? ' class="num"' : "") + ">" + esc(c) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* ---------- what the backend turns into a Google Doc ---------- */

  function forBackend(blocks) {
    var out = [];
    (blocks || []).forEach(function (b) {
      if (b.type === "heading") out.push({ type: "heading", text: b.text, level: b.level });
      else if (b.type === "paragraph" || b.type === "formula") out.push({ type: "paragraph", text: b.text });
      else if (b.type === "table") out.push({ type: "table", caption: b.caption, rows: b.rows });
      else if (b.type === "image" && b.caption) out.push({ type: "paragraph", text: "[figure: " + b.caption + "]" });
    });
    return out;
  }

  /* ---------- rasterise an SVG so it can go into the PDF ---------- */

  function svgToJpeg(svgText, scale, quality) {
    scale = scale || 2;
    return new Promise(function (resolve, reject) {
      var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
      var w = m ? parseFloat(m[1]) : 800, h = m ? parseFloat(m[2]) : 400;
      var url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement("canvas");
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: cv.toDataURL("image/jpeg", quality || 0.86), w: cv.width, h: cv.height });
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return { dataUrl: canvas.toDataURL("image/jpeg", quality || 0.86), w: canvas.width, h: canvas.height };
  }

  /* ---------- the PDF ---------- */

  function pdf(blocks, meta) {
    meta = meta || {};
    blocks = blocks || [];

    // rasterise every SVG block first, in order
    var jobs = blocks.map(function (b) {
      if (b.type === "image" && b.svg && !b.dataUrl) {
        return svgToJpeg(b.svg, meta.imageScale || 2).then(function (r) {
          return Object.assign({}, b, r);
        }).catch(function () { return null; });
      }
      return Promise.resolve(b);
    });

    return Promise.all(jobs).then(function (list) {
      var doc = root.VLabPDF.create({
        title: meta.title || "Laboratory record",
        author: meta.author || "",
        subject: meta.subject || "",
        header: meta.header || "",
        footer: meta.footer || ""
      });
      list.forEach(function (b) {
        if (!b) return;
        switch (b.type) {
          case "title": doc.heading(b.text, 1); break;
          case "meta": doc.kv(b.pairs || []); break;
          case "heading": doc.heading(b.text, b.level || 2); break;
          case "paragraph": doc.paragraph(b.text); break;
          case "formula": doc.paragraph(b.text, { style: "i", indent: 14 }); break;
          case "table": doc.table({ caption: b.caption, rows: b.rows, alignRight: b.alignRight }); break;
          case "image":
            if (b.dataUrl) doc.image({ dataUrl: b.dataUrl, w: b.w, h: b.h, caption: b.caption, width: b.width, key: b.key });
            break;
          case "pagebreak": doc.pageBreak(); break;
        }
      });
      return doc;
    });
  }

  /* Build and download in one call. Returns a promise. */
  function download(blocks, meta, filename) {
    return pdf(blocks, meta).then(function (doc) {
      doc.save(filename || "record.pdf");
      return true;
    });
  }

  root.ReportDoc = {
    html: html, pdf: pdf, download: download, forBackend: forBackend,
    svgToJpeg: svgToJpeg, canvasToJpeg: canvasToJpeg
  };

})(window);
