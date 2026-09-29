"""
PDF Parser Module for Omnisage Medical Record Aggregator.

This module provides utilities to open digital PDFs, extract raw text, identify tables
(such as lab panel structures), and parse key clinical indicators (vitals, diagnoses, and biometrics)
using regex heuristics.
"""

import re
from datetime import datetime, date
from typing import Any, Optional
import pdfplumber


def parse_pdf(file_path: str) -> dict[str, Any]:
    """
    Parses a digital PDF document using pdfplumber to extract text, tables,
    and parse common medical biometrics, dates, and names.

    Args:
        file_path (str): The absolute filesystem path to the PDF file.

    Returns:
        dict: A dictionary containing extracted clinical fields:
            - record_date (date/None)
            - category (str)
            - doctor (str/None)
            - diagnoses (list)
            - medications (list)
            - vitals (list)
            - raw_text (str)
    """
    raw_text = ""
    extracted_tables = []

    # Open PDF and extract text and tables
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                raw_text += page_text + "\n"
            
            # Extract tables if present (useful for lab reports)
            tables = page.extract_tables()
            for table in tables:
                if table:
                    extracted_tables.append(table)

    # Apply heuristics to classify category
    category = "Other"
    lower_text = raw_text.lower()
    if any(x in lower_text for x in ["lab", "panel", "cbc", "lipid", "cholesterol", "hba1c", "blood test", "hemoglobin"]):
        category = "Lab Report"
    elif any(x in lower_text for x in ["prescription", "rx", "mg", "tablet", "capsule", "sig:", "refills"]):
        category = "Prescription"
    elif any(x in lower_text for x in ["soap note", "progress note", "clinical note", "consultation", "patient note"]):
        category = "Doctor Note"

    # Heuristic: Extract record date
    record_date = _extract_date(raw_text)

    # Heuristic: Extract doctor name
    doctor = _extract_doctor(raw_text)

    # Parse biometrics / vitals
    vitals = _parse_vitals(raw_text, extracted_tables)

    # Parse diagnoses
    diagnoses = _parse_diagnoses(raw_text, category)

    # Parse medications
    medications = _parse_medications(raw_text)

    return {
        "record_date": record_date,
        "category": category,
        "doctor": doctor,
        "diagnoses": diagnoses,
        "medications": medications,
        "vitals": vitals,
        "raw_text": raw_text
    }


def _extract_date(text: str) -> Optional[date]:
    """
    Search for dates in text (e.g. YYYY-MM-DD, MM/DD/YYYY, or Month DD, YYYY).
    """
    # Regex patterns
    iso_pattern = r"\b(\d{4})[-/](\d{2})[-/](\d{2})\b"
    us_pattern = r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b"
    written_pattern = r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},\s*\d{4}\b"

    # Check ISO first
    match = re.search(iso_pattern, text)
    if match:
        try:
            return datetime.strptime(match.group(0), "%Y-%m-%d").date()
        except ValueError:
            pass

    # Check US pattern
    match = re.search(us_pattern, text)
    if match:
        date_str = match.group(0)
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

    # Check written date
    match = re.search(written_pattern, text, re.IGNORECASE)
    if match:
        try:
            return datetime.strptime(match.group(0), "%b %d, %Y").date()
        except ValueError:
            try:
                return datetime.strptime(match.group(0), "%B %d, %Y").date()
            except ValueError:
                pass

    return None


def _extract_doctor(text: str) -> Optional[str]:
    """
    Search for doctor names in text (e.g. Dr. John Smith, MD).
    """
    # Name tokens are joined with [ \t]+ rather than \s+ so the match can't
    # cross a line break — with \s+, a name immediately followed on the next
    # line by an all-caps qualification (e.g. "Dr. Shruti Sharma\nMBBS, DNB")
    # would greedily swallow "MBBS" into the captured name too, since it also
    # starts with a capital letter.
    doc_patterns = [
        r"\b(?:Dr\.|Doctor)[ \t]+([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+)+)",
        r"(?:Physician|Provider|Practitioner):[ \t]*([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+)+)",
        r"\b([A-Z][a-zA-Z]+[ \t]+[A-Z][a-zA-Z]+),[ \t]*(?:MD|DO|NP|PA-C)\b"
    ]

    for pattern in doc_patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1) if len(match.groups()) > 0 else match.group(0)
    return None


def _parse_vitals(text: str, tables: list) -> list:
    """
    Extract common vitals/biometrics from text and tables.
    Matches metrics like Blood Pressure, Vitamin D, Cholesterol, Hemoglobin, Glucose, Height, Weight,
    and standard chemistry-panel values (Triglycerides, VLDL, kidney function, etc).
    """
    vitals = []
    text_lower = text.lower()

    # Define vital targets and patterns: (metric name, unit, keyword, tight regex)
    #
    # `keyword` is used by the looser fallback pass below (matched independently
    # of `pattern`) — kept separate from the tight regex because real lab PDFs
    # (e.g. pdfplumber text extracted from a report with method-description text
    # wedged between the test name and its result, like "Fluoride Plasma,Glucose
    # Oxidase- 85 mg/dL") often don't have the number directly adjacent to the
    # label the way the tight pattern requires.
    vital_patterns = [
        ("Hemoglobin", "g/dL", "hemoglobin", r"hemoglobin\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)"),
        ("Vitamin D", "ng/mL", "vitamin d", r"vitamin d(?:,\s*25-hydroxy)?\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)"),
        ("Total Cholesterol", "mg/dL", r"(?:total\s*cholesterol|cholesterol,?\s*total)", r"total cholesterol\s*[:\-]?\s*(\d{1,3})"),
        ("LDL Cholesterol", "mg/dL", "ldl", r"ldl\s*(?:cholesterol)?\s*[:\-]?\s*(\d{1,3})"),
        ("HDL Cholesterol", "mg/dL", "hdl", r"hdl\s*(?:cholesterol)?\s*[:\-]?\s*(\d{1,3})"),
        ("Fasting Glucose", "mg/dL", "glucose", r"glucose\s*[:\-]?\s*(\d{1,3})"),
        ("Systolic Blood Pressure", "mmHg", r"(?:bp|blood pressure)", r"(?:bp|blood pressure)\s*[:\-]?\s*(\d{2,3})/\d{2,3}"),
        ("Diastolic Blood Pressure", "mmHg", r"(?:bp|blood pressure)", r"(?:bp|blood pressure)\s*[:\-]?\s*\d{2,3}/(\d{2,3})"),
        ("Weight", "lbs", "weight", r"weight\s*[:\-]?\s*(\d{2,3}(?:\.\d{1,2})?)\s*lbs"),
        ("Heart Rate", "bpm", r"(?:heart rate|pulse|hr)", r"(?:heart rate|pulse|hr)\s*[:\-]?\s*(\d{2,3})\s*(?:bpm|/min)?"),
        ("Triglycerides", "mg/dL", "triglycerides", r"triglycerides\s*[:\-]?\s*(\d{1,4})"),
        ("VLDL Cholesterol", "mg/dL", "vldl", r"vldl\s*(?:cholesterol)?\s*[:\-]?\s*(\d{1,3})"),
        ("Urea", "mg/dL", "urea", r"urea\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)"),
        ("Creatinine", "mg/dL", "creatinine", r"creatinine\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)"),
        ("Blood Urea Nitrogen", "mg/dL", r"blood urea nitrogen|bun\b", r"(?:blood urea nitrogen|bun)\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)"),
        ("Uric Acid", "mg/dL", "uric acid", r"uric acid\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)"),
        ("Calcium", "mg/dL", "calcium", r"calcium\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)"),
        ("Phosphorus", "mg/dL", "phosphorus", r"phosphorus\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)"),
        ("eGFR", "ml/min/1.73m²", r"egfr", r"egfr\s*[:\-]?\s*(\d{1,3})"),
    ]

    def _status_for(metric: str, val: float) -> str:
        if metric == "Vitamin D" and val < 30:
            return "Low"
        if metric == "Total Cholesterol" and val >= 200:
            return "High"
        if metric == "Systolic Blood Pressure" and val >= 130:
            return "High"
        return "Normal"

    # Pass 1: tight adjacency match — label and value with nothing but a
    # colon/dash between them. Cheapest and most precise; try this first.
    for metric, unit, keyword, pattern in vital_patterns:
        match = re.search(pattern, text_lower)
        if match:
            try:
                val = float(match.group(1))
                vitals.append({
                    "metric": metric,
                    "value": val,
                    "unit": unit,
                    "status": _status_for(metric, val)
                })
            except (ValueError, TypeError, IndexError):
                # match.group(1) can legitimately be None (e.g. an alternation
                # branch without a capture group matched) — skip that vital
                # instead of letting the whole parse fail.
                pass

    # Pass 2: loose fallback — for any metric pass 1 didn't find, look for its
    # keyword followed (within a bounded window, allowing method-description
    # text and line breaks in between) by a number immediately followed by
    # that metric's own unit. This catches real-world lab report layouts
    # where pdfplumber's text extraction interleaves method/reagent text
    # between a test's label and its result (e.g. "Fluoride Plasma,Glucose
    # Oxidase- 85 mg/dL"), without inventing metrics from arbitrary text —
    # it's still anchored to the same trusted metric list and its unit.
    found_metrics = {v["metric"] for v in vitals}
    for metric, unit, keyword, _tight_pattern in vital_patterns:
        if metric in found_metrics:
            continue
        unit_pattern = re.escape(unit).replace(r"\ ", r"\s*")
        loose_pattern = rf"(?:{keyword})[\s\S]{{0,120}}?(\d{{1,4}}(?:\.\d{{1,2}})?)\s*{unit_pattern}\b"
        match = re.search(loose_pattern, text, re.IGNORECASE)
        if match:
            try:
                val = float(match.group(1))
                vitals.append({
                    "metric": metric,
                    "value": val,
                    "unit": unit,
                    "status": _status_for(metric, val)
                })
                found_metrics.add(metric)
            except (ValueError, TypeError, IndexError):
                pass

    # Search in extracted tables (common for blood panels with ruled cell borders)
    for table in tables:
        for row in table:
            # Flatten/clean cells
            row_clean = [str(cell).strip().lower() for cell in row if cell]
            if len(row_clean) < 2:
                continue

            # Look for row matching key metrics
            for metric, unit, keyword, pattern in vital_patterns:
                if any(metric.lower() in cell for cell in row_clean):
                    # Find numerical values in subsequent columns
                    for cell in row_clean[1:]:
                        num_match = re.search(r"(\d+(?:\.\d+)?)", cell)
                        if num_match:
                            try:
                                val = float(num_match.group(1))
                                # Prevent duplicates
                                if not any(v["metric"] == metric for v in vitals):
                                    vitals.append({
                                        "metric": metric,
                                        "value": val,
                                        "unit": unit,
                                        "status": "Normal"  # Default
                                    })
                                break
                            except ValueError:
                                pass

    return vitals


def _parse_diagnoses(text: str, category: str = "Other") -> list:
    """
    Search for common diagnoses or chronic conditions mentioned in medical text.

    Deliberately skipped for `category == "Lab Report"`: lab panels (blood
    chemistry, lipid profiles, etc.) routinely include generic educational
    blurbs explaining what abnormal results *can* indicate — e.g. "Cholesterol
    levels are increased in ... diabetes mellitus" or "Low phosphorus levels
    can be caused by ... vitamin D deficiency" — text that isn't a statement
    about the patient at all. A keyword scan across the full document can't
    tell that apart from an actual diagnosis, and a lab doesn't diagnose
    conditions in the first place (a physician does), so for this category
    it's safer to report no diagnoses than to risk recording an incorrect
    one — the earlier version of this function returned "Diabetes",
    "Hypothyroidism", and "Vitamin D Deficiency" for a real lab report whose
    actual results (glucose 85, HDL 49, etc.) were all in the normal range.
    """
    if category == "Lab Report":
        return []

    conditions = [
        "hypertension", "diabetes", "hyperlipidemia", "anemia",
        "hypothyroidism", "asthma", "gerd", "vitamin d deficiency",
        "depression", "anxiety", "arthritis", "obesity"
    ]

    # Phrases that mark the surrounding sentence as generic/explanatory
    # rather than a statement about this specific patient.
    explanatory_markers = [
        "no history", "negative for", "denies", "no signs", "rule out",
        "may be due to", "may be caused by", "can be due to", "can be caused by",
        "are seen in", "is seen in", "are used in", "is used in",
        "are increased in", "is increased in", "may be found in",
        "associated with the development of", "risk of developing",
        "used to evaluate", "suggestive of poor",
    ]

    found = []
    text_lower = text.lower()
    for cond in conditions:
        if cond in text_lower:
            # Avoid matching negated or generic/explanatory mentions by
            # checking a window of text both before and after the match.
            pos = text_lower.find(cond)
            window = text_lower[max(0, pos - 40):pos + len(cond) + 20]
            if not any(marker in window for marker in explanatory_markers):
                found.append(cond.title())
    return found


def _parse_medications(text: str) -> list:
    """
    Extract common prescriptions with dosage if mentioned.
    """
    medications = []
    
    # Common drugs list
    drugs = [
        "lisinopril", "metformin", "atorvastatin", "levothyroxine", 
        "albuterol", "amlodipine", "omeprazole", "gabapentin", 
        "sertraline", "losartan", "vitamin d3", "ibuprofen"
    ]
    
    # Pattern: drug name followed by dosage (e.g., 10 mg, 500mg, 50,000 IU) and optional frequency
    for drug in drugs:
        pattern = rf"\b{drug}\b\s*(?:tablet|capsule|mg|mcg|iu)?\s*(\d+(?:,\d+)?\s*(?:mg|mcg|iu|g))\b"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Look for frequency
            freq = "As directed"
            freq_patterns = [
                (r"once daily|daily|qd", "Once daily"),
                (r"twice daily|bid", "Twice daily"),
                (r"three times daily|tid", "Three times daily"),
                (r"at bedtime|qhs", "At bedtime"),
                (r"weekly", "Weekly")
            ]
            
            pos = match.start()
            sentence = text[pos:pos+100].lower()
            for fp, f_name in freq_patterns:
                if re.search(fp, sentence):
                    freq = f_name
                    break
                    
            medications.append({
                "name": drug.title(),
                "dosage": match.group(1),
                "frequency": freq
            })
            
    return medications
