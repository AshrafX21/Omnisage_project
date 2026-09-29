"""
Document Parser Routing Module for Omnisage Medical Record Aggregator.

This module acts as the router for the parsing pipeline. It inspects the file extension
and routes the document to the PDF parser, Image OCR parser, or DICOM metadata parser.
"""

import os
from typing import Any
from backend.parsers.pdf_parser import parse_pdf
from backend.parsers.ocr_parser import parse_image_ocr
from backend.parsers.dicom_parser import parse_dicom


def _strip_unsafe_chars(value: Any) -> Any:
    """
    Recursively strips NUL bytes and other C0 control characters (other than
    newline/tab/carriage-return) from every string found in a parsed value,
    walking into lists/tuples/dicts. Leaves non-string values untouched.

    This exists because text extracted from real-world PDFs (pdfplumber) and
    OCR/DICOM metadata can legitimately contain stray control characters —
    most commonly NUL (\\x00) — when a document embeds a subset/corrupted
    font whose character map doesn't cover every glyph it references. Some
    databases tolerate this (SQLite stores it as-is), but PostgreSQL's text
    types flatly reject any string containing a NUL byte
    ("A string literal cannot contain NUL (0x00) characters"), which
    otherwise surfaces to the user as an opaque "Failed to record data in
    database" upload error for specific PDFs, with no way to tell what
    about that one file was different.

    Applied centrally here (rather than in each individual parser) so every
    current and future parser — PDF, OCR, DICOM — gets this safety net for
    free.
    """
    if isinstance(value, str):
        return "".join(
            ch for ch in value
            if ch in ("\n", "\t", "\r") or ord(ch) >= 32
        )
    if isinstance(value, dict):
        return {k: _strip_unsafe_chars(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_strip_unsafe_chars(v) for v in value]
    return value


def parse_document(file_path: str, file_name: str) -> dict[str, Any]:
    """
    Routes an uploaded file to the appropriate parser based on its file extension.

    Args:
        file_path (str): The absolute path to the stored file.
        file_name (str): The original filename uploaded by the user.

    Returns:
        dict: A structured dictionary of the clinical observations.

    Raises:
        ValueError: If the file type is unsupported.
    """
    ext = os.path.splitext(file_name.lower())[1]

    if ext == ".pdf":
        try:
            # First, attempt normal digital PDF text extraction
            result = parse_pdf(file_path)
        except Exception:
            # Fall back to image-based OCR parsing if digital extraction fails
            # (e.g. if the PDF contains scanned pages saved as images)
            try:
                result = parse_image_ocr(file_path)
            except Exception as ocr_err:
                raise ValueError(f"Failed to parse PDF even with OCR: {str(ocr_err)}")

    elif ext in [".dcm", ".dicom"]:
        result = parse_dicom(file_path)

    elif ext in [".png", ".jpg", ".jpeg", ".heic"]:
        result = parse_image_ocr(file_path)

    else:
        raise ValueError(f"Unsupported file format: {ext}")

    return _strip_unsafe_chars(result)
