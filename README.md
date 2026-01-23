# OCR Check Processing System

A production-ready system for automated check processing using dual OCR/AI extraction engines with QuickBooks integration.

![System Architecture](docs/architecture-diagram.png)

## 🌟 Features

### Core Capabilities
- **Dual Extraction Engines**: Tesseract OCR + Google Vision AI
- **Hybrid Field Selection**: Automatic best-result selection with confidence scoring
- **Multi-Check Processing**: Handle multiple checks on a single page
- **Handwriting Support**: AI-powered handwritten check recognition
- **Real-Time Processing**: Live stage-by-stage progress updates
- **Validation Pipeline**: Required fields, format validation, duplicate detection

### Integrations
- **QuickBooks Online**: Direct API export + CSV fallback
- **Supabase Backend**: Real-time database with row-level security
- **Bull Queue**: Async job processing with Redis

### User Experience
- **Interactive Review**: Editable fields with OCR vs AI comparison
- **Confidence Indicators**: Color-coded confidence levels
- **Audit Trail**: Complete history of all changes
- **Analytics Dashboard**: Accuracy metrics and performance tracking

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **Redis** >= 6.0
- **Tesseract OCR** >= 4.0
- **Google Cloud** account (for Vision API)
- **Supabase** project
- **QuickBooks Online** developer account (optional)

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/ocr-check-processor.git
cd ocr-check-processor

### 2. Install Dependencies
```bash