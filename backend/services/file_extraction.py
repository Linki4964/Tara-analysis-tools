from html import escape
from pathlib import Path
from typing import Any
from zipfile import ZipFile
import csv
import io
import json
import xml.etree.ElementTree as ET

from fastapi import HTTPException, UploadFile


ALLOWED_EXTENSIONS = {".docx", ".pdf", ".txt", ".json", ".md", ".csv"}
WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


async def extract_upload(file: UploadFile) -> dict[str, Any]:
    filename = file.filename or "uploaded"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        supported = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Supported: {supported}")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File is too large. Maximum size is 50MB.")

    extracted_text = ""
    extracted_html = ""

    if ext == ".docx":
        extracted = _extract_docx(content)
        extracted_text = extracted["text"]
        extracted_html = extracted["html"]
    elif ext == ".pdf":
        extracted_text = _extract_pdf(content)
    else:
        extracted_text = content.decode("utf-8", errors="replace")

    extracted_text = extracted_text.strip()
    if len(extracted_text) < 10:
        raise HTTPException(
            status_code=400,
            detail="No text extracted. The file appears to be empty or contains only non-text content.",
        )

    return {
        "success": True,
        "metadata": {
            "filename": filename,
            "fileType": ext,
            "fileSize": len(content),
            "charCount": len(extracted_text),
            "lineCount": len(extracted_text.splitlines()),
            "hasHtml": bool(extracted_html),
        },
        "extractedText": extracted_text,
        "extractedHtml": extracted_html or None,
    }


def _extract_docx(content: bytes) -> dict[str, str]:
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            document_xml = archive.read("word/document.xml")
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Failed to parse DOCX file: {error}") from error

    root = ET.fromstring(document_xml)
    paragraphs: list[str] = []
    html_parts: list[str] = []

    for child in root.findall(".//w:body/*", WORD_NS):
        tag = _local_name(child.tag)
        if tag == "p":
            text = _node_text(child)
            if text:
                paragraphs.append(text)
                html_parts.append(f"<p>{escape(text)}</p>")
        elif tag == "tbl":
            rows = []
            for row in child.findall(".//w:tr", WORD_NS):
                cells = [_node_text(cell) for cell in row.findall("./w:tc", WORD_NS)]
                rows.append(cells)
                if any(cells):
                    paragraphs.append(" | ".join(cells))
            if rows:
                html_parts.append(_table_to_html(rows))

    return {"text": "\n".join(paragraphs), "html": "\n".join(html_parts)}


def _node_text(node: ET.Element) -> str:
    pieces = [text_node.text or "" for text_node in node.findall(".//w:t", WORD_NS)]
    return "".join(pieces).strip()


def _table_to_html(rows: list[list[str]]) -> str:
    row_html = []
    for row in rows:
        cells = "".join(f"<td>{escape(cell)}</td>" for cell in row)
        row_html.append(f"<tr>{cells}</tr>")
    return f"<table>{''.join(row_html)}</table>"


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _extract_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise HTTPException(
            status_code=500,
            detail="PDF extraction requires pypdf. Please install backend dependencies from requirements.txt.",
        ) from error

    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="Failed to parse PDF. The file may be encrypted, scanned, or corrupted.",
        ) from error
