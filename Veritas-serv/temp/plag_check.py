#!/usr/bin/env python3
"""
PlagiGuard – backend mode + PDF report
Call: python plag_check.py '<json-docs>' [threshold] [weights-json] [mode]
"""

import sys
import json
import logging
import re
import string
from typing import List, Dict
from datetime import datetime
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer

# ----------------------------------------------------------------------
# PDF & Viz Imports (Agg backend to prevent hanging)
# ----------------------------------------------------------------------
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend – FIXES HANGING
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
)
from reportlab.lib.units import inch
import matplotlib.pyplot as plt
import io

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stderr)
log = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# NLTK Setup
# ----------------------------------------------------------------------
def _ensure_nltk():
    import nltk
    for name in ("punkt", "stopwords", "wordnet"):
        try:
            nltk.data.find(f"tokenizers/{name}" if name == "punkt" else f"corpora/{name}")
        except LookupError:
            log.info(f"Downloading NLTK {name} …")
            nltk.download(name, quiet=True)

_ensure_nltk()
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize

# ----------------------------------------------------------------------
# Core Helpers
# ----------------------------------------------------------------------
BERT_MODEL = None
def load_bert():
    global BERT_MODEL
    if BERT_MODEL is None:
        log.info("Loading Sentence-BERT …")
        from sentence_transformers import SentenceTransformer
        BERT_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
    return BERT_MODEL

def preprocess(text: str) -> str:
    text = text.lower()
    text = text.translate(str.maketrans('', '', string.punctuation))
    text = re.sub(r'\d+', '', text)
    tokens = word_tokenize(text)
    stop = set(stopwords.words('english'))
    lem = WordNetLemmatizer()
    return ' '.join([lem.lemmatize(w) for w in tokens if w not in stop and len(w) > 1])

# ----------------------------------------------------------------------
# Similarity Functions
# ----------------------------------------------------------------------
def bert_sim(docs: List[str]) -> np.ndarray:
    if len(docs) < 2: return np.zeros((len(docs), len(docs)))
    model = load_bert()
    emb = model.encode(docs, show_progress_bar=False)
    s = cosine_similarity(emb)
    np.fill_diagonal(s, 0.0)
    return s

def tfidf_sim(docs: List[str]) -> np.ndarray:
    if len(docs) < 2: return np.zeros((len(docs), len(docs)))
    try:
        vec = TfidfVectorizer(max_features=5000, stop_words='english')
        tf = vec.fit_transform(docs)
        s = cosine_similarity(tf)
        np.fill_diagonal(s, 0.0)
        return s
    except Exception as e:
        log.warning(f"TF-IDF failed: {e}")
        return np.zeros((len(docs), len(docs)))

def ngram_sim(docs: List[str], n: int = 3) -> np.ndarray:
    if len(docs) < 2: return np.zeros((len(docs), len(docs)))
    ngs = [set(' '.join(d.split()[i:i+n]) for i in range(len(d.split())-n+1)) for d in docs]
    mat = np.zeros((len(docs), len(docs)))
    for i in range(len(docs)):
        for j in range(i+1, len(docs)):
            inter = len(ngs[i] & ngs[j])
            union = len(ngs[i] | ngs[j])
            score = inter / union if union else 0.0
            mat[i, j] = mat[j, i] = score
    return mat

def lev_sim(raw: List[str]) -> np.ndarray:
    if len(raw) < 2: return np.zeros((len(raw), len(raw)))
    try:
        from Levenshtein import ratio
    except ImportError:
        log.warning("Levenshtein not available")
        return np.zeros((len(raw), len(raw)))
    mat = np.zeros((len(raw), len(raw)))
    for i in range(len(raw)):
        for j in range(i+1, len(raw)):
            if len(raw[i]) > 2000 or len(raw[j]) > 2000:
                continue
            mat[i, j] = mat[j, i] = ratio(raw[i], raw[j])
    return mat

# ----------------------------------------------------------------------
# Detection Logic
# ----------------------------------------------------------------------
def detect(raw: List[str], proc: List[str], names: List[str], weights: Dict, thresh: float) -> Dict:
    n = len(raw)
    log.info(f"Computing similarities for {n} docs …")

    tf_mat = tfidf_sim(proc)
    ng_mat = ngram_sim(proc)
    lv_mat = lev_sim(raw)
    bt_mat = bert_sim(raw)

    combined = (
        bt_mat * weights.get("bert", 0.5) +
        tf_mat * weights.get("tfidf", 0.2) +
        ng_mat * weights.get("ngram", 0.2) +
        lv_mat * weights.get("lev", 0.1)
    )

    per_file = []
    for i in range(n):
        row = combined[i].copy()
        row[i] = -1
        max_score = float(np.max(row))
        max_idx = int(np.argmax(row))
        per_file.append({
            "file": names[i],
            "combined": round(max_score, 3),
            "pair": names[max_idx] if max_score > 0 else ""
        })

    pairs = []
    for i in range(n):
        for j in range(i+1, n):
            if combined[i, j] >= thresh:
                pairs.append({
                    "file1": names[i],
                    "file2": names[j],
                    "score": round(float(combined[i, j]), 3)
                })

    per_file.sort(key=lambda x: x["combined"], reverse=True)
    pairs.sort(key=lambda x: x["score"], reverse=True)

    return {"per_file": per_file, "pairs": pairs, "combined_matrix": combined.tolist()}

# ----------------------------------------------------------------------
# PDF Generation
# ----------------------------------------------------------------------
def generate_pdf(result: Dict, filenames: List[str], output_path: str = "report.pdf"):
    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=1*inch, bottomMargin=0.8*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Center', alignment=1, fontSize=14, spaceAfter=12))
    styles.add(ParagraphStyle(name='TitleBig', fontSize=18, alignment=1, spaceAfter=20))
    story = []

    # Title
    story.append(Paragraph("PlagiGuard – Plagiarism Detection Report", styles['TitleBig']))
    story.append(Paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Center']))
    story.append(Spacer(1, 0.3*inch))

    # Summary
    story.append(Paragraph(f"<b>Documents Scanned:</b> {len(filenames)}", styles['Normal']))
    story.append(Paragraph(f"<b>Suspicious Pairs:</b> {len(result['pairs'])}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Per-file table
    if result['per_file']:
        data = [["File", "Max Similarity", "Most Similar To"]]
        for r in result['per_file']:
            data.append([r['file'], f"{r['combined']:.1%}", r['pair']])
        t = Table(data, colWidths=[2.5*inch, 1.2*inch, 2.3*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4CAF50')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.3*inch))

    # Pairs table
    if result['pairs']:
        data = [["File 1", "File 2", "Similarity"]]
        for p in result['pairs']:
            data.append([p['file1'], p['file2'], f"{p['score']:.1%}"])
        t = Table(data, colWidths=[2.5*inch, 2.5*inch, 1.2*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#FF5722')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ]))
        story.append(Paragraph("<b>Suspicious Pairs</b>", styles['Heading2']))
        story.append(t)

    # Charts
    story.append(PageBreak())

    # Bar chart
    fig, ax = plt.subplots(figsize=(8, 5))
    files = [r['file'][:20] for r in result['per_file']]
    scores = [r['combined'] for r in result['per_file']]
    ax.barh(files, scores, color='skyblue')
    ax.set_xlabel('Similarity Score')
    ax.set_title('Per-File Maximum Similarity')
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close()
    buf.seek(0)
    story.append(Paragraph("<b>Per-File Similarity Bar Chart</b>", styles['Heading2']))
    story.append(Image(buf, width=6*inch, height=4*inch))
    story.append(Spacer(1, 0.3*inch))

    # Heatmap
    mat = np.array(result['combined_matrix'])
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(mat, cmap='viridis', vmin=0, vmax=1)
    ax.set_xticks(range(len(filenames)))
    ax.set_yticks(range(len(filenames)))
    ax.set_xticklabels([f[:8] for f in filenames], rotation=45)
    ax.set_yticklabels([f[:8] for f in filenames])
    plt.colorbar(im, label='Similarity')
    ax.set_title('Similarity Heatmap')
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close()
    buf.seek(0)
    story.append(Paragraph("<b>Similarity Heatmap</b>", styles['Heading2']))
    story.append(Image(buf, width=6*inch, height=5*inch))

    # Build PDF
    doc.build(story)
    log.info(f"PDF report saved: {output_path}")

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No JSON docs supplied"}), file=sys.stderr)
        sys.exit(1)

    docs_json = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.70
    weights_json = sys.argv[3] if len(sys.argv) > 3 else '{"bert":0.5,"tfidf":0.2,"ngram":0.2,"lev":0.1}'

    try:
        docs = json.loads(docs_json)
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}), file=sys.stderr)
        sys.exit(1)

    if len(docs) < 2:
        print(json.dumps({"error": "Need ≥2 documents"}), file=sys.stderr)
        sys.exit(1)

    try:
        weights = json.loads(weights_json)
        if abs(sum(weights.values()) - 1.0) > 1e-6:
            raise ValueError
    except Exception:
        print(json.dumps({"error": "Weights must sum to 1.0"}), file=sys.stderr)
        sys.exit(1)

    raw = [d["content"] for d in docs]
    names = [d["filename"] for d in docs]
    proc = [preprocess(t) for t in raw]

    result = detect(raw, proc, names, weights, threshold)

    # === GENERATE PDF ===
    try:
        generate_pdf(result, names, "report.pdf")
    except Exception as e:
        log.error(f"PDF generation failed: {e}")

    # === RETURN JSON + FORCE EXIT ===
    print(json.dumps(result))
    sys.stdout.flush()

    # KILL EVERYTHING – NO HANG
    import os
    os._exit(0)

if __name__ == "__main__":
    main()