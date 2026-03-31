#!/usr/bin/env python3
"""
NetTools — Générateur de notice PDF
Convertit NOTICE.md en PDF professionnel via Playwright + Chromium
"""

import re
import sys
import os
from pathlib import Path
import markdown

BASE_DIR = Path(__file__).parent.parent
NOTICE_MD = BASE_DIR / "NOTICE.md"
OUTPUT_HTML = BASE_DIR / "tools" / "notice_rendered.html"
OUTPUT_PDF = BASE_DIR / "NOTICE_NetTools.pdf"


def md_to_html(text: str) -> str:
    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "attr_list", "def_list"]
    )
    return md.convert(text)


def build_html(body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NetTools — Notice d'utilisation</title>
<style>

/* ──────────────────────────────────────────────
   FONTS
────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ──────────────────────────────────────────────
   VARIABLES
────────────────────────────────────────────── */
:root {{
  --accent:       #3b82f6;
  --accent-light: #dbeafe;
  --accent-dark:  #1d4ed8;
  --success:      #16a34a;
  --warn:         #d97706;
  --danger:       #dc2626;
  --text:         #1e293b;
  --text-muted:   #64748b;
  --border:       #e2e8f0;
  --bg-code:      #f1f5f9;
  --bg-note:      #eff6ff;
  --bg-tip:       #f0fdf4;
  --bg-warn:      #fffbeb;
  --header-bg:    #0f172a;
  --header-accent:#60a5fa;
  --shadow-sm:    0 1px 3px rgba(0,0,0,.08);
  --shadow-md:    0 4px 12px rgba(0,0,0,.10);
  --radius:       8px;
  --font:         'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'Courier New', monospace;
}}

/* ──────────────────────────────────────────────
   RESET & BASE
────────────────────────────────────────────── */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

html {{ font-size: 10.5pt; }}

body {{
  font-family: var(--font);
  color: var(--text);
  background: #fff;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}}

/* ──────────────────────────────────────────────
   COVER PAGE
────────────────────────────────────────────── */
.cover {{
  background: var(--header-bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 60px 40px;
  page-break-after: always;
  position: relative;
  overflow: hidden;
}}

.cover::before {{
  content: '';
  position: absolute;
  top: -120px; left: -120px;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(59,130,246,.18) 0%, transparent 70%);
}}

.cover::after {{
  content: '';
  position: absolute;
  bottom: -80px; right: -80px;
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(96,165,250,.12) 0%, transparent 70%);
}}

.cover-logo {{
  font-size: 56pt;
  margin-bottom: 24px;
  position: relative; z-index: 1;
}}

.cover-title {{
  font-size: 30pt;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.5px;
  margin-bottom: 12px;
  position: relative; z-index: 1;
}}

.cover-subtitle {{
  font-size: 13pt;
  font-weight: 400;
  color: var(--header-accent);
  margin-bottom: 48px;
  position: relative; z-index: 1;
}}

.cover-badges {{
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 60px;
  position: relative; z-index: 1;
}}

.badge {{
  background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.15);
  color: #cbd5e1;
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 8.5pt;
  font-family: var(--font-mono);
  backdrop-filter: blur(4px);
}}

.cover-meta {{
  position: absolute;
  bottom: 40px;
  left: 0; right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 48px;
  font-size: 8pt;
  color: #475569;
  z-index: 1;
}}

.cover-line {{
  width: 60px;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--header-accent));
  border-radius: 2px;
  margin: 0 auto 32px;
  position: relative; z-index: 1;
}}

/* ──────────────────────────────────────────────
   PAGE LAYOUT
────────────────────────────────────────────── */
.content {{
  max-width: 860px;
  margin: 0 auto;
  padding: 0 0 48px;
}}

/* ──────────────────────────────────────────────
   TOC PAGE
────────────────────────────────────────────── */
.toc-page {{
  page-break-after: always;
  padding: 48px;
  max-width: 860px;
  margin: 0 auto;
}}

.toc-header {{
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--accent);
}}

.toc-header-label {{
  font-size: 18pt;
  font-weight: 700;
  color: var(--text);
}}

.toc-entries {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 32px;
  column-gap: 48px;
}}

.toc-item {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px dashed var(--border);
  gap: 8px;
}}

.toc-num {{
  font-size: 7pt;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-light);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}}

.toc-label {{
  font-size: 9pt;
  color: var(--text);
  flex: 1;
  font-weight: 500;
}}

/* ──────────────────────────────────────────────
   SECTION HEADERS
────────────────────────────────────────────── */
h1 {{
  font-size: 20pt;
  font-weight: 700;
  color: #0f172a;
  margin: 36px 0 20px;
  padding-bottom: 12px;
  border-bottom: 3px solid var(--accent);
  display: flex;
  align-items: center;
  gap: 12px;
  page-break-before: always;
}}

h1:first-of-type {{ page-break-before: avoid; }}

h1::before {{
  content: '';
  display: inline-block;
  width: 4px;
  height: 28px;
  background: linear-gradient(180deg, var(--accent), var(--accent-dark));
  border-radius: 2px;
  flex-shrink: 0;
}}

h2 {{
  font-size: 14pt;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 18px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
  color: #f1f5f9;
  border-left: 5px solid var(--header-accent);
  border-radius: 0 var(--radius) var(--radius) 0;
  page-break-before: always;
}}

h2:first-of-type {{ page-break-before: avoid; }}

h3 {{
  font-size: 11pt;
  font-weight: 600;
  color: #334155;
  margin: 22px 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}}

h3::before {{
  content: '▸';
  color: var(--accent);
  font-size: 9pt;
}}

h4 {{
  font-size: 10pt;
  font-weight: 600;
  color: #475569;
  margin: 16px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 8pt;
}}

/* ──────────────────────────────────────────────
   TYPOGRAPHY
────────────────────────────────────────────── */
p {{
  margin: 0 0 12px;
  font-size: 9.5pt;
}}

strong {{
  font-weight: 600;
  color: #0f172a;
}}

em {{
  color: var(--text-muted);
}}

a {{
  color: var(--accent);
  text-decoration: none;
}}

ul, ol {{
  margin: 8px 0 14px 20px;
  padding: 0;
}}

li {{
  font-size: 9.5pt;
  margin-bottom: 4px;
  line-height: 1.6;
}}

li > ul, li > ol {{
  margin: 4px 0 4px 18px;
}}

/* ──────────────────────────────────────────────
   TABLES
────────────────────────────────────────────── */
table {{
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0 20px;
  font-size: 8.5pt;
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius);
  overflow: hidden;
}}

thead tr {{
  background: var(--header-bg);
  color: #f1f5f9;
}}

thead th {{
  padding: 9px 13px;
  text-align: left;
  font-weight: 600;
  font-size: 8pt;
  letter-spacing: 0.3px;
  white-space: nowrap;
}}

tbody tr {{
  border-bottom: 1px solid var(--border);
  transition: background .1s;
}}

tbody tr:nth-child(even) {{
  background: #f8fafc;
}}

tbody tr:hover {{
  background: var(--accent-light);
}}

tbody td {{
  padding: 8px 13px;
  vertical-align: top;
  line-height: 1.5;
}}

tbody td:first-child {{
  font-weight: 500;
  white-space: nowrap;
}}

/* ──────────────────────────────────────────────
   CODE
────────────────────────────────────────────── */
code {{
  font-family: var(--font-mono);
  font-size: 8.5pt;
  background: var(--bg-code);
  color: #c026d3;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #e9d5ff;
}}

pre {{
  background: #0f172a;
  border-radius: var(--radius);
  padding: 16px 20px;
  margin: 12px 0 18px;
  overflow-x: auto;
  box-shadow: var(--shadow-md);
  position: relative;
}}

pre::before {{
  content: '';
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 16px 0 0 #f59e0b, 32px 0 0 #22c55e;
  position: absolute;
  top: 12px;
  left: 16px;
}}

pre code {{
  font-family: var(--font-mono);
  font-size: 8pt;
  background: transparent;
  color: #e2e8f0;
  padding: 0;
  border: none;
  display: block;
  padding-top: 18px;
  line-height: 1.65;
  white-space: pre;
}}

/* Syntax highlighting (simple) */
pre code .c  {{ color: #64748b; }} /* comments */
pre code .k  {{ color: #93c5fd; }} /* keywords */
pre code .s  {{ color: #86efac; }} /* strings */
pre code .n  {{ color: #fde68a; }} /* numbers */

/* ──────────────────────────────────────────────
   CALLOUTS
────────────────────────────────────────────── */
blockquote {{
  background: var(--bg-note);
  border-left: 4px solid var(--accent);
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 12px 16px;
  margin: 14px 0 18px;
  font-size: 9pt;
  color: #1e40af;
  box-shadow: var(--shadow-sm);
}}

blockquote p {{
  margin: 0;
}}

blockquote p:first-child::before {{
  content: '💡 ';
}}

blockquote strong {{
  color: #1d4ed8;
}}

/* ──────────────────────────────────────────────
   SECTION DIVIDERS
────────────────────────────────────────────── */
hr {{
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 32px 0;
}}

/* ──────────────────────────────────────────────
   SPECIAL CALLOUT BOXES
────────────────────────────────────────────── */
.callout {{
  border-radius: var(--radius);
  padding: 14px 18px;
  margin: 14px 0 18px;
  font-size: 9pt;
}}

.callout-tip    {{ background: var(--bg-tip);  border-left: 4px solid #16a34a; color: #14532d; }}
.callout-warn   {{ background: var(--bg-warn); border-left: 4px solid #d97706; color: #78350f; }}
.callout-danger {{ background: #fef2f2;         border-left: 4px solid #dc2626; color: #7f1d1d; }}

/* ──────────────────────────────────────────────
   PRINT
────────────────────────────────────────────── */
@media print {{
  @page {{
    margin: 18mm 16mm 20mm;
    size: A4;

    @top-center {{
      content: "NetTools — Notice d'utilisation";
      font-family: 'Inter', sans-serif;
      font-size: 7.5pt;
      color: #94a3b8;
    }}

    @bottom-right {{
      content: counter(page);
      font-family: 'Inter', sans-serif;
      font-size: 7.5pt;
      color: #94a3b8;
    }}

    @bottom-left {{
      content: "NetTools · Administration réseau";
      font-family: 'Inter', sans-serif;
      font-size: 7pt;
      color: #94a3b8;
    }}
  }}

  @page :first {{
    @top-center   {{ content: none; }}
    @bottom-right {{ content: none; }}
    @bottom-left  {{ content: none; }}
    margin: 0;
  }}

  body   {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  h1     {{ page-break-before: always; }}
  h1:first-of-type {{ page-break-before: avoid; }}
  h2     {{ page-break-before: always; }}
  h2:first-of-type {{ page-break-before: avoid; }}
  h2, h3 {{ page-break-after: avoid; }}
  table  {{ page-break-inside: avoid; }}
  pre    {{ page-break-inside: avoid; }}
  .cover {{ page-break-after: always; }}
  .toc-page {{ page-break-after: always; }}
}}

</style>
</head>
<body>

<!-- ══════════════════════ COVER PAGE ══════════════════════ -->
<div class="cover">
  <div class="cover-logo">🌐</div>
  <div class="cover-title">NetTools</div>
  <div class="cover-line"></div>
  <div class="cover-subtitle">Notice d'utilisation complète</div>
  <div class="cover-badges">
    <span class="badge">Wails v2</span>
    <span class="badge">Go 1.25+</span>
    <span class="badge">React 18</span>
    <span class="badge">SQLite</span>
    <span class="badge">SSH multi-vendor</span>
    <span class="badge">SNMP v2c/v3</span>
  </div>
  <div class="cover-meta">
    <span>NetTools — Administration réseau</span>
    <span>Version 2025</span>
    <span>Usage interne</span>
  </div>
</div>

<!-- ══════════════════════ TOC PAGE ══════════════════════ -->
<div class="toc-page">
  <div class="toc-header">
    <span style="font-size:20pt">📑</span>
    <span class="toc-header-label">Table des matières</span>
  </div>
  <div class="toc-entries">
    <div class="toc-item"><span class="toc-num">01</span><span class="toc-label">Présentation générale</span></div>
    <div class="toc-item"><span class="toc-num">02</span><span class="toc-label">Installation et premier lancement</span></div>
    <div class="toc-item"><span class="toc-num">03</span><span class="toc-label">Interface générale</span></div>
    <div class="toc-item"><span class="toc-num">04</span><span class="toc-label">Gestion des credentials</span></div>
    <div class="toc-item"><span class="toc-num">05</span><span class="toc-label">Découverte réseau (SNMP)</span></div>
    <div class="toc-item"><span class="toc-num">06</span><span class="toc-label">Inventaire des équipements</span></div>
    <div class="toc-item"><span class="toc-num">07</span><span class="toc-label">Backups SSH</span></div>
    <div class="toc-item"><span class="toc-num">08</span><span class="toc-label">Comparateur de configurations</span></div>
    <div class="toc-item"><span class="toc-num">09</span><span class="toc-label">Audit de conformité</span></div>
    <div class="toc-item"><span class="toc-num">10</span><span class="toc-label">Playbooks SSH</span></div>
    <div class="toc-item"><span class="toc-num">11</span><span class="toc-label">Planificateur de tâches</span></div>
    <div class="toc-item"><span class="toc-num">12</span><span class="toc-label">Journaux d'activité</span></div>
    <div class="toc-item"><span class="toc-num">13</span><span class="toc-label">Topologie réseau</span></div>
    <div class="toc-item"><span class="toc-num">14</span><span class="toc-label">Paramètres</span></div>
    <div class="toc-item"><span class="toc-num">15</span><span class="toc-label">Workflows types</span></div>
    <div class="toc-item"><span class="toc-num">16</span><span class="toc-label">Référence technique</span></div>
    <div class="toc-item"><span class="toc-num">17</span><span class="toc-label">Dépannage</span></div>
  </div>
</div>

<!-- ══════════════════════ CONTENT ══════════════════════ -->
<div class="content">
{body_html}
</div>

</body>
</html>"""


def post_process_html(html: str) -> str:
    """Apply custom transformations on rendered HTML for better PDF output."""

    # Remove the H1 "NetTools — Notice d'utilisation" (it's on the cover)
    html = re.sub(
        r'<h1[^>]*>NetTools\s*—\s*Notice[^<]*</h1>',
        '', html, flags=re.IGNORECASE
    )

    # Remove "Table des matières" h2 (we have our custom TOC page)
    html = re.sub(
        r'<h2[^>]*>Table des mati[^<]*</h2>',
        '', html, flags=re.IGNORECASE
    )

    # Remove the TOC list generated by markdown (after the heading)
    html = re.sub(
        r'<div class="toc">.*?</div>',
        '', html, flags=re.DOTALL
    )

    # Section numbers: add colored span to h1
    def style_h1(m):
        text = m.group(1)
        # Extract number prefix "1. Titre" → already has it from markdown
        return f'<h1>{text}</h1>'

    html = re.sub(r'<h1[^>]*>(.*?)</h1>', style_h1, html, flags=re.DOTALL)

    # Style blockquotes that start with "Note :" or "Attention :" or "Conseil :"
    def style_blockquote(m):
        inner = m.group(1)
        if re.search(r'attention|warning|danger|important', inner, re.IGNORECASE):
            cls = 'callout callout-warn'
        elif re.search(r'conseil|tip|recommand', inner, re.IGNORECASE):
            cls = 'callout callout-tip'
        else:
            cls = ''
        if cls:
            return f'<div class="{cls}">{inner}</div>'
        return m.group(0)

    html = re.sub(r'<blockquote>(.*?)</blockquote>', style_blockquote, html, flags=re.DOTALL)

    return html


def generate_pdf(html_path: Path, pdf_path: Path):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load local HTML file
        page.goto(html_path.as_uri(), wait_until="networkidle")

        # Wait for fonts to load
        page.wait_for_timeout(2000)

        page.pdf(
            path=str(pdf_path),
            format="A4",
            print_background=True,
            margin={
                "top":    "18mm",
                "bottom": "20mm",
                "left":   "16mm",
                "right":  "16mm",
            },
            display_header_footer=True,
            header_template="""
                <div style="width:100%; font-family:'Inter',sans-serif; font-size:7pt;
                            color:#94a3b8; padding:0 16mm; display:flex;
                            justify-content:space-between; align-items:center;
                            border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                  <span>NetTools</span>
                  <span style="color:#3b82f6; font-weight:600;">Notice d'utilisation</span>
                </div>""",
            footer_template="""
                <div style="width:100%; font-family:'Inter',sans-serif; font-size:7pt;
                            color:#94a3b8; padding:0 16mm; display:flex;
                            justify-content:space-between; align-items:center;
                            border-top:1px solid #e2e8f0; padding-top:4px;">
                  <span>NetTools · Administration réseau</span>
                  <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
                </div>""",
        )
        browser.close()


def main():
    print("[1/5] Lecture de NOTICE.md...")
    md_text = NOTICE_MD.read_text(encoding="utf-8")

    print("[2/5] Conversion Markdown -> HTML...")
    body_html = md_to_html(md_text)
    body_html = post_process_html(body_html)

    print("[3/5] Application du theme et mise en page...")
    full_html = build_html(body_html)

    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_HTML.write_text(full_html, encoding="utf-8")
    print(f"      HTML intermediaire -> {OUTPUT_HTML.name}")

    print("[4/5] Generation du PDF via Playwright/Chromium...")
    generate_pdf(OUTPUT_HTML, OUTPUT_PDF)

    size_kb = OUTPUT_PDF.stat().st_size // 1024
    print(f"[5/5] PDF genere : {OUTPUT_PDF}")
    print(f"      Taille : {size_kb} Ko")


if __name__ == "__main__":
    main()
