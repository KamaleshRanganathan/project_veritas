import sys
import json
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from Levenshtein import ratio  # Requires: pip install python-Levenshtein
from collections import Counter
import re

def compute_bert_similarity(documents):
    """Calculate Sentence-BERT cosine similarity scores for each document (max to others)."""
    n = len(documents)
    if n < 2:
        return np.zeros(n).tolist()
    
    model = SentenceTransformer('all-MiniLM-L6-v2')
    embeddings = model.encode(documents)
    sim_matrix = cosine_similarity(embeddings)
    bert_scores = [np.max(sim_matrix[i, np.arange(n) != i]) for i in range(n)]
    return bert_scores

def compute_ngram_overlap(documents, n=3):
    """Calculate n-gram overlap scores for each document pair."""
    def get_ngrams(text, n):
        words = re.findall(r'\b\w+\b', text.lower())
        return set([' '.join(words[i:i+n]) for i in range(len(words)-n+1)])
    
    ngrams = [get_ngrams(doc, n) for doc in documents]
    n_doc = len(documents)
    overlap_scores = np.zeros(n_doc)
    
    for i in range(n_doc):
        max_overlap = 0
        for j in range(n_doc):
            if i == j:
                continue
            intersection = len(ngrams[i] & ngrams[j])
            union = len(ngrams[i] | ngrams[j])
            score = intersection / union if union > 0 else 0
            max_overlap = max(max_overlap, score)
        overlap_scores[i] = max_overlap
    
    return overlap_scores.tolist()

def compute_levenshtein_similarity(documents):
    """Calculate Levenshtein similarity scores for each document (max to others)."""
    n = len(documents)
    lev_scores = np.zeros(n)
    for i in range(n):
        max_sim = 0
        for j in range(n):
            if i == j:
                continue
            sim = ratio(documents[i], documents[j])
            max_sim = max(max_sim, sim)
        lev_scores[i] = max_sim
    return lev_scores.tolist()

def compute_tfidf_similarity(documents):
    """Calculate TF-IDF cosine similarity scores for each document (max to others)."""
    n = len(documents)
    if n < 2:
        return np.zeros(n).tolist()
    
    vectorizer = TfidfVectorizer(stop_words='english', max_features=5000)
    tfidf_matrix = vectorizer.fit_transform(documents)
    sim_matrix = cosine_similarity(tfidf_matrix)
    tfidf_scores = [np.max(sim_matrix[i, np.arange(n) != i]) for i in range(n)]
    return tfidf_scores

def detect_plagiarism(documents):
    """Compute plagiarism scores using Sentence-BERT, n-gram, Levenshtein, and TF-IDF."""
    n = len(documents)
    if n < 2:
        return {
            "bert_scores": [0.0] * n,
            "ngram_scores": [0.0] * n,
            "levenshtein_scores": [0.0] * n,
            "tfidf_scores": [0.0] * n,
            "combined_scores": [0.0] * n
        }
    
    # Compute scores for each algorithm
    bert_scores = compute_bert_similarity(documents)
    ngram_scores = compute_ngram_overlap(documents, n=3)
    lev_scores = compute_levenshtein_similarity(documents)
    tfidf_scores = compute_tfidf_similarity(documents)
    
    # Combine scores (max across all four for strict detection)
    combined_scores = [
        max(bert, ngram, lev, tfidf) 
        for bert, ngram, lev, tfidf in zip(bert_scores, ngram_scores, lev_scores, tfidf_scores)
    ]
    
    return {
        "bert_scores": bert_scores,
        "ngram_scores": ngram_scores,
        "levenshtein_scores": lev_scores,
        "tfidf_scores": tfidf_scores,
        "combined_scores": combined_scores
    }

if __name__ == "__main__":
    input_data = sys.stdin.read().strip()
    documents = json.loads(input_data)
    result = detect_plagiarism(documents)
    print(json.dumps(result))