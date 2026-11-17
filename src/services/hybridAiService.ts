import { getGenerativeModel, InferenceMode } from "firebase/ai";
import { ai } from "../config/firebase";

export interface LocalAnalysisResult {
  empathy_reply: string;
  mood_score: number;
  emotions: string[];
  triggers: string[];
  cognitive_distortion: string | null;
  source: "on-device" | "cloud-fallback";
}

async function generateWithFallback(
  mode: InferenceMode,
  prompt: string,
  jsonMode: boolean
) {
  const candidateModels = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
  let lastError: any;

  for (const modelName of candidateModels) {
    try {
      const model = getGenerativeModel(ai, {
        mode,
        inCloudParams: {
          model: modelName,
          ...(jsonMode && {
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      });

      return await model.generateContent(prompt);
    } catch (error: any) {
      lastError = error;
      console.warn(`Falha temporária no modelo ${modelName}, tentando próximo...`, error);
    }
  }

  throw lastError;
}

export async function analyzeJournalEntryPrivately(journalText: string): Promise<LocalAnalysisResult> {
  const prompt = `
    You are an empathetic mental health assistant running locally on the user's device.
    Respond in the same language as the user's journal entry (e.g. Portuguese if written in Portuguese).
    Analyze the following private journal entry and return ONLY a valid raw JSON object (no markdown backticks) with these exact English keys:
    {
      "empathy_reply": "A warm, supportive 2-sentence reflection for the user",
      "mood_score": number from 1 (very distressed) to 10 (very happy),
      "emotions": ["array", "of", "detected", "emotions"],
      "triggers": ["array", "of", "anonymized", "triggers", "like", "work", "sleep", "family"],
      "cognitive_distortion": "name of cognitive distortion if present or null"
    }
    CRITICAL PRIVACY RULE: Never include real names, locations, or specific personal identifiers in the JSON.

    Journal Entry:
    "${journalText}"
  `;

  const result = await generateWithFallback(InferenceMode.PREFER_ON_DEVICE, prompt, true);
  const rawResponse = result.response.text();

  const cleanedJson = rawResponse.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleanedJson);

  const inferenceSource = (result.response as any)?.inferenceSource === "on-device"
    ? "on-device"
    : "cloud-fallback";

  return {
    empathy_reply: parsed.empathy_reply || parsed.resposta_empatica || "Obrigado por partilhar os seus pensamentos.",
    mood_score: parsed.mood_score ?? parsed.pontuacao_humor ?? 5,
    emotions: parsed.emotions || parsed.emocoes || parsed["emoções"] || [],
    triggers: parsed.triggers || parsed.gatilhos || [],
    cognitive_distortion: parsed.cognitive_distortion || parsed.distorcao_cognitiva || null,
    source: inferenceSource,
  };
}

export async function generateTherapistBriefFromCloud(anonymizedLogs: any[]): Promise<string> {
  const prompt = `
    You are a clinical data synthesizer helping a patient prepare for their weekly therapy session.
    Respond in Portuguese (or the same language as the emotional tags in the logs).
    Below is a list of anonymized emotional metadata logs collected over the past days (no raw journal text was ever sent to the cloud).
    
    Identify:
    1. Key mood trends and emotional patterns.
    2. Recurring triggers correlated with mood drops.
    3. Suggested talking points for their therapist.
    
    Keep the tone objective, compassionate, and structured in clean text/bullet points.

    Anonymized Logs:
    ${JSON.stringify(anonymizedLogs, null, 2)}
  `;

  const result = await generateWithFallback(InferenceMode.PREFER_IN_CLOUD, prompt, false);
  const text = result?.response?.text?.();
  return typeof text === "string" && text.trim().length > 0
    ? text
    : "Não foi possível gerar o resumo clínico com os registos atuais.";
}