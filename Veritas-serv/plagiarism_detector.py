#!/usr/bin/env python3
"""
PlagiGuard – backend mode + Enhanced PDF report + Auto-Open
Call: python plagiarism_detector.py '<json-docs>' [threshold] [weights-json] [mode]
"""

import sys
import json
import logging
import re
import string
from typing import List, Dict
from datetime import datetime
from pathlib import Path
import os
import subprocess
import platform

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer

# ----------------------------------------------------------------------
# PDF & Viz Imports (Agg backend to prevent hanging)
# ----------------------------------------------------------------------
import matplotlib
matplotlib.use('Agg')
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
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
    """Preprocess text: lowercase, remove punctuation, numbers, stopwords, and lemmatize."""
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
    """Calculate BERT-based semantic similarity."""
    if len(docs) < 2: 
        return np.zeros((len(docs), len(docs)))
    try:
        model = load_bert()
        emb = model.encode(docs, show_progress_bar=False)
        s = cosine_similarity(emb)
        np.fill_diagonal(s, 0.0)
        return s
    except Exception as e:
        log.warning(f"BERT similarity failed: {e}")
        return np.zeros((len(docs), len(docs)))

def tfidf_sim(docs: List[str]) -> np.ndarray:
    """Calculate TF-IDF based similarity."""
    if len(docs) < 2: 
        return np.zeros((len(docs), len(docs)))
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
    """Calculate N-gram Jaccard similarity."""
    if len(docs) < 2: 
        return np.zeros((len(docs), len(docs)))
    try:
        ngs = []
        for d in docs:
            words = d.split()
            if len(words) < n:
                ngs.append(set([' '.join(words)]))
            else:
                ngs.append(set(' '.join(words[i:i+n]) for i in range(len(words)-n+1)))
        
        mat = np.zeros((len(docs), len(docs)))
        for i in range(len(docs)):
            for j in range(i+1, len(docs)):
                inter = len(ngs[i] & ngs[j])
                union = len(ngs[i] | ngs[j])
                score = inter / union if union else 0.0
                mat[i, j] = mat[j, i] = score
        return mat
    except Exception as e:
        log.warning(f"N-gram similarity failed: {e}")
        return np.zeros((len(docs), len(docs)))

def levenshtein_ratio(s1: str, s2: str) -> float:
    """
    Calculate normalized Levenshtein distance (edit distance ratio).
    Uses dynamic programming. Returns similarity ratio between 0 and 1.
    """
    if len(s1) == 0 and len(s2) == 0:
        return 1.0
    if len(s1) == 0 or len(s2) == 0:
        return 0.0
    
    # For very long strings, use sampling to avoid memory issues
    MAX_LEN = 10000
    if len(s1) > MAX_LEN:
        # Take first, middle, and last chunks
        chunk_size = MAX_LEN // 3
        s1 = s1[:chunk_size] + s1[len(s1)//2 - chunk_size//2:len(s1)//2 + chunk_size//2] + s1[-chunk_size:]
    if len(s2) > MAX_LEN:
        chunk_size = MAX_LEN // 3
        s2 = s2[:chunk_size] + s2[len(s2)//2 - chunk_size//2:len(s2)//2 + chunk_size//2] + s2[-chunk_size:]
    
    # Dynamic programming approach
    rows = len(s1) + 1
    cols = len(s2) + 1
    
    # Create distance matrix (use only two rows for memory efficiency)
    prev_row = list(range(cols))
    curr_row = [0] * cols
    
    for i in range(1, rows):
        curr_row[0] = i
        for j in range(1, cols):
            if s1[i-1] == s2[j-1]:
                curr_row[j] = prev_row[j-1]
            else:
                curr_row[j] = 1 + min(prev_row[j],      # deletion
                                     curr_row[j-1],     # insertion
                                     prev_row[j-1])     # substitution
        prev_row, curr_row = curr_row, prev_row
    
    distance = prev_row[-1]
    max_len = max(len(s1), len(s2))
    
    # Return similarity ratio (1 - normalized distance)
    return 1.0 - (distance / max_len)

def lev_sim(raw: List[str]) -> np.ndarray:
    """Calculate Levenshtein distance-based similarity for all document pairs."""
    if len(raw) < 2: 
        return np.zeros((len(raw), len(raw)))
    
    log.info("Computing Levenshtein similarities...")
    mat = np.zeros((len(raw), len(raw)))
    
    # Try to use python-Levenshtein package if available (much faster)
    try:
        from Levenshtein import ratio as lev_ratio
        log.info("Using fast Levenshtein library")
        use_fast = True
    except ImportError:
        log.info("Using custom Levenshtein implementation (install python-Levenshtein for better performance)")
        use_fast = False
    
    for i in range(len(raw)):
        for j in range(i+1, len(raw)):
            try:
                if use_fast:
                    # Use fast C implementation if available
                    sim = lev_ratio(raw[i], raw[j])
                else:
                    # Use our custom implementation
                    sim = levenshtein_ratio(raw[i], raw[j])
                
                mat[i, j] = mat[j, i] = sim
            except Exception as e:
                log.warning(f"Levenshtein calculation failed for pair ({i},{j}): {e}")
                mat[i, j] = mat[j, i] = 0.0
    
    return mat

# ----------------------------------------------------------------------
# Detection Logic
# ----------------------------------------------------------------------
def detect(raw: List[str], proc: List[str], names: List[str], weights: Dict, thresh: float) -> Dict:
    """Main plagiarism detection function."""
    n = len(raw)
    log.info(f"Computing similarities for {n} documents …")

    # Compute all similarity matrices
    tf_mat = tfidf_sim(proc)
    ng_mat = ngram_sim(proc)
    lv_mat = lev_sim(raw)  # Fixed Levenshtein
    bt_mat = bert_sim(raw)

    # Weighted combination
    combined = (
        bt_mat * weights.get("bert", 0.5) +
        tf_mat * weights.get("tfidf", 0.2) +
        ng_mat * weights.get("ngram", 0.2) +
        lv_mat * weights.get("lev", 0.1)
    )

    # Per-file analysis
    per_file = []
    for i in range(n):
        row = combined[i].copy()
        row[i] = -1
        max_score = float(np.max(row))
        max_idx = int(np.argmax(row))
        per_file.append({
            "file": names[i],
            "combined": round(max_score, 3),
            "pair": names[max_idx] if max_score > 0 else "",
            "bert": round(float(bt_mat[i, max_idx]) if max_idx >= 0 else 0.0, 3),
            "tfidf": round(float(tf_mat[i, max_idx]) if max_idx >= 0 else 0.0, 3),
            "ngram": round(float(ng_mat[i, max_idx]) if max_idx >= 0 else 0.0, 3),
            "lev": round(float(lv_mat[i, max_idx]) if max_idx >= 0 else 0.0, 3),
        })

    # Suspicious pairs
    pairs = []
    for i in range(n):
        for j in range(i+1, n):
            if combined[i, j] >= thresh:
                pairs.append({
                    "file1": names[i],
                    "file2": names[j],
                    "score": round(float(combined[i, j]), 3),
                    "bert": round(float(bt_mat[i, j]), 3),
                    "tfidf": round(float(tf_mat[i, j]), 3),
                    "ngram": round(float(ng_mat[i, j]), 3),
                    "lev": round(float(lv_mat[i, j]), 3),
                })

    per_file.sort(key=lambda x: x["combined"], reverse=True)
    pairs.sort(key=lambda x: x["score"], reverse=True)

    return {
        "per_file": per_file, 
        "pairs": pairs, 
        "combined_matrix": combined.tolist(),
        "matrices": {
            "bert": bt_mat.tolist(),
            "tfidf": tf_mat.tolist(),
            "ngram": ng_mat.tolist(),
            "lev": lv_mat.tolist()
        }
    }

# ----------------------------------------------------------------------
# Enhanced PDF Generation with Beautiful Design
# ----------------------------------------------------------------------
def generate_pdf(result: Dict, filenames: List[str], weights: Dict, threshold: float, output_path: str = "report.pdf"):
    doc = SimpleDocTemplate(
        output_path, 
        pagesize=A4, 
        topMargin=0.75*inch, 
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    styles.add(ParagraphStyle(
        name='CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a237e'),
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='Subtitle',
        fontSize=12,
        textColor=colors.HexColor('#666666'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        fontSize=16,
        textColor=colors.HexColor('#1a237e'),
        spaceAfter=12,
        spaceBefore=20,
        fontName='Helvetica-Bold',
        borderWidth=0,
        borderColor=colors.HexColor('#1a237e'),
        borderPadding=5,
        backColor=colors.HexColor('#e8eaf6')
    ))
    
    styles.add(ParagraphStyle(
        name='InfoText',
        fontSize=10,
        textColor=colors.HexColor('#333333'),
        spaceAfter=6,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='HighlightBox',
        fontSize=11,
        textColor=colors.HexColor('#1a237e'),
        backColor=colors.HexColor('#f5f5f5'),
        borderWidth=1,
        borderColor=colors.HexColor('#1a237e'),
        borderPadding=10,
        spaceAfter=15,
        fontName='Helvetica-Bold'
    ))
    
    story = []

    # ===== COVER PAGE =====
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph("🛡️ PlagiGuard", styles['CustomTitle']))
    story.append(Paragraph("Advanced Plagiarism Detection Report", styles['Subtitle']))
    story.append(Spacer(1, 0.5*inch))
    
    # Info Box
    info_data = [
        ["Report Generated:", datetime.now().strftime('%B %d, %Y at %H:%M:%S')],
        ["Documents Analyzed:", str(len(filenames))],
        ["Detection Threshold:", f"{threshold:.0%}"],
        ["Analysis Model:", "Multi-Algorithm Ensemble (BERT + TF-IDF + N-gram + Levenshtein)"]
    ]
    
    info_table = Table(info_data, colWidths=[2.2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8eaf6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#1a237e')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5*inch))
    
    # Weight Configuration
    story.append(Paragraph("Algorithm Weight Configuration", styles['SectionHeader']))
    weight_data = [["Algorithm", "Weight", "Description"]]
    weight_info = {
        "bert": "Semantic Similarity (Deep Learning)",
        "tfidf": "Term Frequency Analysis",
        "ngram": "Phrase Pattern Matching",
        "lev": "Character-Level Edit Distance"
    }
    for alg, weight in weights.items():
        weight_data.append([alg.upper(), f"{weight:.1%}", weight_info.get(alg, "")])
    
    weight_table = Table(weight_data, colWidths=[1.5*inch, 1.2*inch, 3.5*inch])
    weight_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a237e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(weight_table)
    
    story.append(PageBreak())

    # ===== EXECUTIVE SUMMARY =====
    story.append(Paragraph("📊 Executive Summary", styles['SectionHeader']))
    
    high_risk = sum(1 for p in result['pairs'] if p['score'] >= 0.85)
    medium_risk = sum(1 for p in result['pairs'] if 0.70 <= p['score'] < 0.85)
    low_risk = sum(1 for p in result['pairs'] if p['score'] < 0.70)
    
    summary_text = f"""
    This report presents a comprehensive analysis of {len(filenames)} documents using advanced 
    multi-algorithm plagiarism detection. The system identified <b>{len(result['pairs'])} suspicious pairs</b> 
    that exceed the {threshold:.0%} similarity threshold.
    <br/><br/>
    <b>Risk Distribution:</b><br/>
    • High Risk (≥85%): {high_risk} pairs<br/>
    • Medium Risk (70-84%): {medium_risk} pairs<br/>
    • Low Risk (&lt;70%): {low_risk} pairs
    """
    story.append(Paragraph(summary_text, styles['InfoText']))
    story.append(Spacer(1, 0.3*inch))

    # ===== DOCUMENT ANALYSIS =====
    story.append(Paragraph("📁 Individual Document Analysis", styles['SectionHeader']))
    
    if result['per_file']:
        data = [["Rank", "Document Name", "Max Score", "Algorithms Breakdown", "Most Similar To"]]
        
        for idx, r in enumerate(result['per_file'][:10], 1):  # Top 10
            breakdown = f"B:{r['bert']:.2f} | T:{r['tfidf']:.2f} | N:{r['ngram']:.2f} | L:{r['lev']:.2f}"
            
            data.append([
                str(idx),
                r['file'][:30] + ('...' if len(r['file']) > 30 else ''),
                f"{r['combined']:.1%}",
                breakdown,
                r['pair'][:25] + ('...' if len(r['pair']) > 25 else '')
            ])
        
        doc_table = Table(data, colWidths=[0.5*inch, 1.8*inch, 0.9*inch, 2*inch, 1.8*inch])
        
        table_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a237e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]
        
        # Add row coloring based on risk
        for idx, r in enumerate(result['per_file'][:10], 1):
            if r['combined'] >= 0.85:
                table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#ffcdd2')))
            elif r['combined'] >= 0.70:
                table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fff9c4')))
        
        doc_table.setStyle(TableStyle(table_style))
        story.append(doc_table)
        story.append(Spacer(1, 0.3*inch))

    # ===== SUSPICIOUS PAIRS =====
    story.append(PageBreak())
    story.append(Paragraph("⚠️ Suspicious Document Pairs", styles['SectionHeader']))
    
    if result['pairs']:
        story.append(Paragraph(
            f"The following {len(result['pairs'])} pairs show similarity above the {threshold:.0%} threshold:",
            styles['InfoText']
        ))
        story.append(Spacer(1, 0.2*inch))
        
        data = [["Rank", "Document 1", "Document 2", "Combined", "BERT", "TF-IDF", "N-gram", "Lev"]]
        
        for idx, p in enumerate(result['pairs'], 1):
            data.append([
                str(idx),
                p['file1'][:25] + ('...' if len(p['file1']) > 25 else ''),
                p['file2'][:25] + ('...' if len(p['file2']) > 25 else ''),
                f"{p['score']:.1%}",
                f"{p['bert']:.2f}",
                f"{p['tfidf']:.2f}",
                f"{p['ngram']:.2f}",
                f"{p['lev']:.2f}"
            ])
        
        pairs_table = Table(data, colWidths=[0.4*inch, 1.6*inch, 1.6*inch, 0.8*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.6*inch])
        
        pair_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d32f2f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]
        
        # Color rows based on severity
        for idx, p in enumerate(result['pairs'], 1):
            if p['score'] >= 0.85:
                pair_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#ffcdd2')))
            elif p['score'] >= 0.70:
                pair_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fff9c4')))
        
        pairs_table.setStyle(TableStyle(pair_style))
        story.append(pairs_table)
    else:
        story.append(Paragraph(
            "✅ <b>No suspicious pairs detected!</b> All documents appear to be original.",
            styles['HighlightBox']
        ))

    # ===== VISUALIZATIONS =====
    story.append(PageBreak())
    story.append(Paragraph("📈 Visual Analysis", styles['SectionHeader']))

    # Enhanced Bar Chart with better styling
    if result['per_file']:
        fig, ax = plt.subplots(figsize=(10, 6))
        files = [r['file'][:25] for r in result['per_file'][:15]]  # Top 15
        scores = [r['combined'] for r in result['per_file'][:15]]
        
        colors_list = ['#d32f2f' if s >= 0.85 else '#fbc02d' if s >= 0.70 else '#43a047' for s in scores]
        
        bars = ax.barh(files, scores, color=colors_list, edgecolor='black', linewidth=0.5)
        ax.set_xlabel('Similarity Score', fontsize=12, fontweight='bold')
        ax.set_ylabel('Documents', fontsize=12, fontweight='bold')
        ax.set_title('Top 15 Documents by Maximum Similarity Score', fontsize=14, fontweight='bold', pad=20)
        ax.set_xlim(0, 1)
        ax.grid(axis='x', alpha=0.3, linestyle='--')
        
        # Add value labels
        for bar, score in zip(bars, scores):
            width = bar.get_width()
            ax.text(width + 0.02, bar.get_y() + bar.get_height()/2, 
                   f'{score:.1%}', ha='left', va='center', fontsize=9, fontweight='bold')
        
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=200, bbox_inches='tight', facecolor='white')
        plt.close()
        buf.seek(0)
        
        story.append(Image(buf, width=6.5*inch, height=4.5*inch))
        story.append(Spacer(1, 0.3*inch))

    # Enhanced Heatmap
    story.append(PageBreak())
    story.append(Paragraph("🔥 Similarity Heatmap", styles['SectionHeader']))
    
    mat = np.array(result['combined_matrix'])
    fig, ax = plt.subplots(figsize=(10, 8))
    
    im = ax.imshow(mat, cmap='RdYlGn_r', vmin=0, vmax=1, aspect='auto')
    
    ax.set_xticks(range(len(filenames)))
    ax.set_yticks(range(len(filenames)))
    ax.set_xticklabels([f[:15] for f in filenames], rotation=45, ha='right', fontsize=8)
    ax.set_yticklabels([f[:15] for f in filenames], fontsize=8)
    
    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, label='Similarity Score')
    cbar.set_label('Similarity Score', fontsize=11, fontweight='bold')
    
    ax.set_title('Document Similarity Matrix', fontsize=14, fontweight='bold', pad=20)
    
    # Add grid
    ax.set_xticks(np.arange(len(filenames))-.5, minor=True)
    ax.set_yticks(np.arange(len(filenames))-.5, minor=True)
    ax.grid(which="minor", color="gray", linestyle='-', linewidth=0.5)
    
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=200, bbox_inches='tight', facecolor='white')
    plt.close()
    buf.seek(0)
    
    story.append(Image(buf, width=6.5*inch, height=6*inch))

    # ===== ALGORITHM COMPARISON =====
    story.append(PageBreak())
    story.append(Paragraph("🔬 Algorithm Performance Comparison", styles['SectionHeader']))
    
    if result['pairs']:
        fig, axes = plt.subplots(2, 2, figsize=(12, 10))
        algorithms = ['bert', 'tfidf', 'ngram', 'lev']
        titles = ['BERT (Semantic)', 'TF-IDF (Term Frequency)', 'N-gram (Phrases)', 'Levenshtein (Edit Distance)']
        
        for idx, (alg, title) in enumerate(zip(algorithms, titles)):
            ax = axes[idx // 2, idx % 2]
            scores = [p[alg] for p in result['pairs'][:10]]
            pairs = [f"{p['file1'][:12]}↔{p['file2'][:12]}" for p in result['pairs'][:10]]
            
            bars = ax.barh(pairs, scores, color=plt.cm.viridis(idx/4), edgecolor='black', linewidth=0.5)
            ax.set_xlabel('Score', fontsize=10, fontweight='bold')
            ax.set_title(title, fontsize=11, fontweight='bold')
            ax.set_xlim(0, 1)
            ax.grid(axis='x', alpha=0.3, linestyle='--')
            
            # Add value labels
            for bar, score in zip(bars, scores):
                width = bar.get_width()
                ax.text(width + 0.02, bar.get_y() + bar.get_height()/2, 
                       f'{score:.2f}', ha='left', va='center', fontsize=8)
        
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=200, bbox_inches='tight', facecolor='white')
        plt.close()
        buf.seek(0)
        
        story.append(Image(buf, width=7*inch, height=6*inch))

    # ===== FOOTER =====
    story.append(PageBreak())
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", styles['Subtitle']))
    story.append(Paragraph(
        "<b>PlagiGuard</b> - Advanced Plagiarism Detection System<br/>"
        "Powered by Machine Learning & Natural Language Processing<br/>"
        f"Report Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        styles['Subtitle']
    ))

    # Build PDF
    doc.build(story)
    log.info(f"Enhanced PDF report saved: {output_path}")

# ----------------------------------------------------------------------
# Auto-Open PDF
# ----------------------------------------------------------------------
def auto_open_pdf(pdf_path: str):
    """Auto-open PDF in default viewer."""
    try:
        sys_platform = platform.system()
        if sys_platform == "Windows":
            os.startfile(pdf_path)
        elif sys_platform == "Darwin":  # macOS
            subprocess.run(["open", pdf_path], check=True)
        else:  # Linux
            subprocess.run(["xdg-open", pdf_path], check=True)
        log.info(f"PDF opened: {pdf_path}")
    except Exception as e:
        log.warning(f"Auto-open failed: {e}")

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
            raise ValueError("Weights must sum to 1.0")
    except Exception as e:
        print(json.dumps({"error": f"Invalid weights: {e}"}), file=sys.stderr)
        sys.exit(1)

    raw = [d["content"] for d in docs]
    names = [d["filename"] for d in docs]
    proc = [preprocess(t) for t in raw]

    result = detect(raw, proc, names, weights, threshold)

    # === GENERATE ENHANCED PDF ===
    pdf_path = "report.pdf"
    try:
        generate_pdf(result, names, weights, threshold, pdf_path)
        # --- AUTO-OPEN PDF ---
        auto_open_pdf(pdf_path)
    except Exception as e:
        log.error(f"PDF generation failed: {e}")

    # === RETURN JSON + EXIT ===
    print(json.dumps(result))
    sys.stdout.flush()
    os._exit(0)

if __name__ == "__main__":
    main()