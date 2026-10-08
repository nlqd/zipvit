# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5", "defusedxml==0.7.1"]
# ///
"""Download the official 2025 sources and flatten them into sources/*.tsv.

Run: uv run --no-project tools/fetch_sources.py
Needs network access and `pdftotext` (poppler-utils) on PATH.

The TSVs keep values as published. Known errors in the publications are
corrected later, in tools/build-data.js, from sources/qd2334-fixes.tsv.
"""

import datetime
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
import urllib.request
from pathlib import Path

import openpyxl
from defusedxml import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sources"

QD2334_URL = (
    "https://mic.mediacdn.vn/document/2025/8/27/"
    "danh-muc-ma-buu-chinh-quoc-gia-cho-doi-tuong-la-phuong-xa-va-don-vi-hanh-chinh-tuong-duong-"
    "1756261572483234512520.pdf"
)
QD2334_PAGE = "https://mst.gov.vn/van-ban-phap-luat/25175.htm"
NSO_SOAP_URL = "https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx"
NSO_CONVERSION_URL = (
    "https://danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoi%C4%90VHCmoi_cu_final.xlsx"
)


def fetch(url, data=None, headers=None):
    request = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read(), response.headers.get("Last-Modified")


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value))).strip()


def unit_code(value):
    text = clean(value)
    return text.zfill(5) if text else ""


def write_tsv(name, header, rows):
    lines = ["\t".join(header)] + ["\t".join(row) for row in rows]
    (OUT / name).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(rows)


def parse_qd2334(pdf_bytes):
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "qd2334.pdf"
        pdf.write_bytes(pdf_bytes)
        text = subprocess.run(
            ["pdftotext", "-layout", str(pdf), "-"],
            check=True, capture_output=True, text=True,
        ).stdout
    # Page 1 lists each province with its two-digit prefixes; the rest is one commune per line.
    contents_row = re.compile(r"^\s+\d+\s+(\S.*?)\s{2,}(\d{2}(?:,\s*\d{2})*)\s{2,}\d+\s*$")
    province_header = re.compile(r"^\s+\d+\s+((?:TỈNH|TP\.)\s+\S.*?)\s*$")
    commune_row = re.compile(r"^\s+(\d+)\s+(.+?)\s{2,}(\d{5,6})\s*$")
    contents, rows, province = [], [], None
    for line in text.splitlines():
        entry = contents_row.match(line)
        if entry and not rows:
            prefixes = re.findall(r"\d{2}", entry.group(2))
            contents.append([clean(entry.group(1)), " ".join(prefixes)])
            continue
        header = province_header.match(line)
        if header and not re.search(r"\d\s*$", line):
            province = header.group(1)
            continue
        row = commune_row.match(line)
        if row and province:
            rows.append([province, row.group(1), clean(row.group(2)), row.group(3)])
    return contents, rows


def parse_conversion(xlsx_bytes):
    with tempfile.TemporaryDirectory() as tmp:
        xlsx = Path(tmp) / "conversion.xlsx"
        xlsx.write_bytes(xlsx_bytes)
        book = openpyxl.load_workbook(xlsx, read_only=True)
        # Sheet 2 ("không merge") repeats every column on every row.
        sheet = book.worksheets[1]
        rows = []
        for r in list(sheet.iter_rows(values_only=True))[2:]:
            if not r[1]:
                continue
            rows.append([
                clean(r[0]), unit_code(r[2]), clean(r[1]),
                unit_code(r[4]), clean(r[3]), clean(r[6]), clean(r[7]), clean(r[5]),
            ])
        return rows, sheet.title


def soap(operation, as_of):
    body = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>'
        f'<{operation} xmlns="http://tempuri.org/"><DenNgay>{as_of}</DenNgay>'
        "<Tinh></Tinh><TenTinh></TenTinh><QuanHuyen></QuanHuyen><TenQuanHuyen></TenQuanHuyen>"
        f"</{operation}></soap:Body></soap:Envelope>"
    )
    raw, _ = fetch(NSO_SOAP_URL, body.encode(), {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f'"http://tempuri.org/{operation}"',
    })
    tables = ET.fromstring(raw).iter("TABLE")
    return raw, [{child.tag: clean(child.text) for child in t} for t in tables]


def main():
    today = datetime.date.today()
    as_of = today.strftime("%d/%m/%Y")
    manifest = []

    pdf, _ = fetch(QD2334_URL)
    contents, rows = parse_qd2334(pdf)
    count = write_tsv("qd2334-communes.tsv", ["province", "stt", "name", "zip"], rows)
    manifest.append({
        "file": "qd2334-communes.tsv",
        "title": "Danh mục mã bưu chính quốc gia cho phường, xã (phụ lục QĐ 2334/QĐ-BKHCN, 24/08/2025)",
        "url": QD2334_URL, "page": QD2334_PAGE,
        "sha256": hashlib.sha256(pdf).hexdigest(), "rows": count,
        "method": "pdftotext -layout, one row per line ending in a postal code; values as printed",
    })
    count = write_tsv("qd2334-provinces.tsv", ["province", "prefixes"], contents)
    manifest.append({
        "file": "qd2334-provinces.tsv",
        "title": "Mục lục phụ lục QĐ 2334/QĐ-BKHCN: hai chữ số đầu mã bưu chính của từng tỉnh",
        "url": QD2334_URL, "page": QD2334_PAGE,
        "sha256": hashlib.sha256(pdf).hexdigest(), "rows": count,
        "method": "pdftotext -layout, table of contents on page 1",
    })

    xlsx, last_modified = fetch(NSO_CONVERSION_URL)
    rows, sheet = parse_conversion(xlsx)
    count = write_tsv("nso-old-to-new.tsv", [
        "new_province", "new_code", "new_name", "old_code", "old_name",
        "old_district", "old_province", "note",
    ], rows)
    manifest.append({
        "file": "nso-old-to-new.tsv",
        "title": "Bảng chuyển đổi ĐVHC mới - cũ (Cục Thống kê)",
        "url": NSO_CONVERSION_URL, "last_modified": last_modified, "sheet": sheet,
        "sha256": hashlib.sha256(xlsx).hexdigest(), "rows": count,
    })

    raw, provinces = soap("DanhMucTinh", as_of)
    count = write_tsv("nso-provinces.tsv", ["code", "name", "type"], [
        [p["MaTinh"], p["TenTinh"], p["LoaiHinh"]] for p in provinces
    ])
    manifest.append({
        "file": "nso-provinces.tsv", "title": "Danh mục tỉnh (Cục Thống kê)",
        "url": NSO_SOAP_URL, "operation": "DanhMucTinh", "as_of": as_of,
        "sha256": hashlib.sha256(raw).hexdigest(), "rows": count,
    })

    raw, communes = soap("DanhMucPhuongXa", as_of)
    count = write_tsv("nso-communes.tsv", ["province_code", "code", "name", "type"], [
        [c["MaTinh"], c["MaPhuongXa"], c["TenPhuongXa"], c["LoaiHinh"]] for c in communes
    ])
    manifest.append({
        "file": "nso-communes.tsv", "title": "Danh mục phường, xã (Cục Thống kê)",
        "url": NSO_SOAP_URL, "operation": "DanhMucPhuongXa", "as_of": as_of,
        "sha256": hashlib.sha256(raw).hexdigest(), "rows": count,
    })

    for entry in manifest:
        entry["retrieved"] = today.isoformat()
    manifest.append({
        "file": "mabuudien-2017.json",
        "title": "Mã bưu chính QĐ 2475/QĐ-BTTTT (2017) theo phường, xã cũ, kèm tọa độ",
        "url": "https://mabuudien.net/", "retrieved": "2026-03-10",
        "method": "scrape.sh",
    })
    manifest.append({
        "file": "qd2334-fixes.tsv",
        "title": "Hand corrections for two misprinted rows of the QĐ 2334 annex",
        "method": "written by hand; each row states what was printed and why it was changed",
    })
    manifest.append({
        "file": "regions.tsv",
        "title": "Region of each new province, for map colours",
        "method": "written by hand from the 8-region labels of the old zipcodes.js, "
                  "taking the old province whose name the new one kept",
    })
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
