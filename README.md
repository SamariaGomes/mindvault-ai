# 🛡️ MindVault AI — Diário Híbrido de Saúde Mental

**Demo ao vivo:** [https://mindvault-hybrid-ai.web.app](https://mindvault-hybrid-ai.web.app)

O **MindVault AI** é uma aplicação web híbrida de saúde mental construída com **Firebase AI Logic**, **React** e **TypeScript**, projetada para equilibrar **privacidade absoluta** com **síntese clínica inteligente**.

## 🏗️ Arquitetura Híbrida

* **Cofre Local Privado (`InferenceMode.PREFER_ON_DEVICE`):**
  * Os relatos brutos do diário nunca saem do dispositivo do usuário (armazenados exclusivamente no `localStorage`).
  * A análise emocional imediata e a resposta empática são processadas localmente via Gemini Nano (com fallback seguro em nuvem quando o navegador não possui modelo local ativo) e funcionam mesmo **offline**.
* **Síntese Clínica em Nuvem (`InferenceMode.PREFER_IN_CLOUD`):**
  * Apenas metadados estritamente anonimizados (`mood_score`, `emotions`, `triggers`, `cognitive_distortion`) são sincronizados com o **Cloud Firestore** sob autenticação anônima protegida pelo **Firebase App Check (reCAPTCHA v3)**.
  * O **Gemini Flash** (`gemini-3.8-flash` com fallback automático para `gemini-3.5-flash-lite`) consolida os padrões longitudinais para gerar um resumo estruturado para sessões de terapia.

## 🚀 Como executar localmente

1. Clone o repositório e instale as dependências:
   ```bash
   npm install