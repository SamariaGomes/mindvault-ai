# 🛡️ MindVault AI — Hybrid Mental Health Journal

**Live Demo:** [https://mindvault-hybrid-ai.web.app](https://mindvault-hybrid-ai.web.app)

**MindVault AI** is a privacy-first hybrid mental health web application built for **#BuildHybridAI**, powered by **Firebase AI Logic**, **React**, and **TypeScript**. It solves a critical barrier in digital mental health: enabling deep AI-assisted therapeutic insights without ever exposing raw, sensitive journal entries to the cloud.

## 🏗️ Hybrid AI Architecture

* **Private Local Vault (`InferenceMode.PREFER_ON_DEVICE`):**
  * Raw journal entries never leave the user's device and are stored strictly in `localStorage`.
  * Immediate empathetic reflection and structured emotional tagging run locally on Chrome via **Gemini Nano** (with automatic cloud fallback when on-device hardware is unavailable) and work seamlessly **offline**.
* **Cloud Clinical Synthesis (`InferenceMode.PREFER_IN_CLOUD`):**
  * Only strictly anonymized metadata (`mood_score`, `emotions`, `triggers`, `cognitive_distortion`) is synced to **Cloud Firestore**, secured by **Firebase Anonymous Authentication** and **Firebase App Check (reCAPTCHA v3)**.
  * **Gemini Flash** (`gemini-3.8-flash` with `gemini-3.5-flash-lite` fallback) aggregates longitudinal patterns to generate a structured clinical summary for therapy sessions.

## 🚀 Running Locally

1. Clone the repository and install dependencies:
   ```bash
   npm install