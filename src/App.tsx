import React, { useState, useEffect } from "react";
import {
  Shield,
  Lock,
  Cloud,
  Cpu,
  Sparkles,
  FileText,
  Wifi,
  WifiOff,
  CheckCircle2,
  EyeOff,
  Brain,
  ArrowRight,
  Clock,
  Activity,
  HeartHandshake,
  Layers,
} from "lucide-react";
import { collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db, ensureAuth } from "./config/firebase";
import {
  analyzeJournalEntryPrivately,
  generateTherapistBriefFromCloud,
  type LocalAnalysisResult,
} from "./services/hybridAiService";

interface LocalEntry {
  id: string;
  text: string;
  createdAt: string;
  analysis: LocalAnalysisResult;
}

const SAMPLE_PROMPTS = [
  "I've been feeling overwhelmed by project deadlines this week and haven't slept well.",
  "Today I took a long walk without my phone and finally felt calm and grounded.",
  "I keep worrying that I'm falling behind compared to my peers at work.",
];

export function App() {
  const [journalText, setJournalText] = useState("");
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [therapistBrief, setTherapistBrief] = useState<string | null>(null);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [lastSavedEntry, setLastSavedEntry] = useState<LocalEntry | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<"idle" | "synced" | "queued-offline">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("mindvault_private_entries");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Normaliza entradas antigas e novas para nunca quebrar
          const validEntries: LocalEntry[] = parsed
            .filter((item: any) => item && typeof item.text === "string")
            .map((item: any) => ({
              id: item.id || crypto.randomUUID(),
              text: item.text,
              createdAt: item.createdAt || item.timestamp || new Date().toISOString(),
              analysis: {
                empathy_reply:
                  item.analysis?.empathy_reply ||
                  item.empathy_reply ||
                  "Thank you for sharing your thoughts privately.",
                mood_score: Number(item.analysis?.mood_score ?? item.mood_score ?? 5),
                emotions: Array.isArray(item.analysis?.emotions)
                  ? item.analysis.emotions
                  : Array.isArray(item.emotions)
                  ? item.emotions
                  : [],
                triggers: Array.isArray(item.analysis?.triggers)
                  ? item.analysis.triggers
                  : Array.isArray(item.triggers)
                  ? item.triggers
                  : [],
                cognitive_distortion:
                  item.analysis?.cognitive_distortion ?? item.cognitive_distortion ?? null,
                source: item.analysis?.source || "on-device",
              },
            }));

          setLocalEntries(validEntries);
          if (validEntries.length > 0) {
            setLastSavedEntry(validEntries[0]);
          }
        }
      } catch {
        localStorage.removeItem("mindvault_private_entries");
        setLocalEntries([]);
      }
    }
  }, []);

  const saveEntriesToLocalStorage = (entries: LocalEntry[]) => {
    setLocalEntries(entries);
    localStorage.setItem("mindvault_private_entries", JSON.stringify(entries));
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalText.trim()) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const analysis = await analyzeJournalEntryPrivately(journalText.trim());

      const newEntry: LocalEntry = {
        id: crypto.randomUUID(),
        text: journalText.trim(),
        createdAt: new Date().toISOString(),
        analysis,
      };

      const updated = [newEntry, ...localEntries];
      saveEntriesToLocalStorage(updated);
      setLastSavedEntry(newEntry);
      setJournalText("");

      if (!simulatedOffline && navigator.onLine) {
        try {
          const user = await ensureAuth();
          await addDoc(collection(db, "users", user.uid, "entries"), {
            mood_score: analysis.mood_score,
            emotions: analysis.emotions,
            triggers: analysis.triggers,
            cognitive_distortion: analysis.cognitive_distortion,
            createdAt: newEntry.createdAt,
            inferenceSource: analysis.source,
          });
          setCloudSyncStatus("synced");
        } catch {
          setCloudSyncStatus("queued-offline");
        }
      } else {
        setCloudSyncStatus("queued-offline");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not process your entry right now. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateBrief = async () => {
    if (simulatedOffline || !navigator.onLine) {
      setErrorMsg("Switch back to Online mode to synthesize your cloud therapist brief.");
      return;
    }

    setIsGeneratingBrief(true);
    setErrorMsg(null);

    try {
      const user = await ensureAuth();
      const q = query(
        collection(db, "users", user.uid, "entries"),
        orderBy("createdAt", "desc"),
        limit(14)
      );
      const snapshot = await getDocs(q);

      let logs = snapshot.docs.map((doc) => doc.data());

      if (logs.length === 0 && localEntries.length > 0) {
        logs = localEntries.map((entry) => ({
          mood_score: entry.analysis?.mood_score ?? 5,
          emotions: entry.analysis?.emotions ?? [],
          triggers: entry.analysis?.triggers ?? [],
          cognitive_distortion: entry.analysis?.cognitive_distortion ?? null,
          createdAt: entry.createdAt,
        }));
      }

      if (logs.length === 0) {
        setErrorMsg("Write at least one journal entry first so MindVault AI has anonymized patterns to analyze.");
        setIsGeneratingBrief(false);
        return;
      }

      const brief = await generateTherapistBriefFromCloud(logs);
      setTherapistBrief(brief);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to generate clinical summary from the cloud.");
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const renderFormattedMarkdown = (text: string) => {
    return text.split("\n").map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={index} className="h-2" />;

      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={index} className="text-base font-bold text-indigo-950 mt-4 mb-1.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            {trimmed.replace("### ", "")}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={index} className="text-lg font-bold text-slate-900 mt-5 mb-2 border-b border-indigo-100 pb-1">
            {trimmed.replace("## ", "")}
          </h3>
        );
      }
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const content = trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return (
          <div key={index} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed pl-2 my-1">
            <span className="text-indigo-500 font-bold mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        );
      }

      const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, "<strong class='text-slate-900 font-semibold'>$1</strong>");
      return (
        <p
          key={index}
          className="text-sm text-slate-700 leading-relaxed my-1.5"
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });
  };

  const averageMood =
    localEntries.length > 0
      ? (
          localEntries.reduce((acc, item) => acc + (item.analysis?.mood_score ?? 5), 0) /
          localEntries.length
        ).toFixed(1)
      : "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/40 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Glass Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-900">MindVault AI</span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                  <Layers className="w-3 h-3" /> Hybrid AI
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Local-First Privacy • Cloud Clinical Synthesis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border shadow-xs ${
                simulatedOffline
                  ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              {simulatedOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>Offline Mode (On-Device Only)</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Online (Click to Test Offline)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero Status Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Edge Layer (Gemini Nano)
              </p>
              <p className="text-sm font-bold text-slate-800">100% Local Raw Storage</p>
              <p className="text-xs text-slate-500">Zero raw text leaves your browser</p>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Cloud Layer (Gemini Flash)
              </p>
              <p className="text-sm font-bold text-slate-800">Anonymized Synthesis</p>
              <p className="text-xs text-slate-500">App Check + Firestore protected</p>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Vault Metrics
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {localEntries.length} {localEntries.length === 1 ? "Entry" : "Entries"}
                </p>
                <p className="text-xs text-slate-500">Avg Mood: {averageMood} / 10</p>
              </div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-semibold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Two-Column Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (7 cols): Private Local Vault */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Private Local Vault</h2>
                    <p className="text-xs text-slate-500">
                      Processed via <code className="text-emerald-700 font-semibold">PREFER_ON_DEVICE</code>
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  <EyeOff className="w-3.5 h-3.5 text-emerald-600" />
                  Never uploaded
                </span>
              </div>

              <form onSubmit={handleSaveEntry} className="space-y-4">
                <div>
                  <textarea
                    rows={4}
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    placeholder="Write freely about how you're feeling today... Your raw words stay strictly on this device."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all resize-none"
                  />

                  {/* Quick Sample Prompts for Easy Demo */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-400 mr-1">Quick try:</span>
                    {SAMPLE_PROMPTS.map((sample, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setJournalText(sample)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-colors cursor-pointer truncate max-w-[210px]"
                      >
                        "{sample.slice(0, 34)}..."
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span>Stored in localStorage only</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isAnalyzing || !journalText.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-spin" />
                        <span>Reflecting Privately...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Save & Reflect Privately</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Empathetic AI Reflection Result */}
              {lastSavedEntry && lastSavedEntry.analysis && (
                <div className="mt-6 pt-5 border-t border-slate-100 space-y-4">
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-50/80 to-violet-50/60 border border-indigo-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                        <HeartHandshake className="w-4 h-4 text-indigo-600" />
                        Immediate Private Reflection
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white text-indigo-700 border border-indigo-200/70">
                        {lastSavedEntry.analysis.source === "on-device"
                          ? "⚡ Gemini Nano (On-Device)"
                          : "☁️ Hybrid Fallback"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {lastSavedEntry.analysis.empathy_reply}
                    </p>
                  </div>

                  {/* Privacy Proof Inspector */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Real-Time Privacy Boundary Proof
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {cloudSyncStatus === "queued-offline"
                          ? "Offline: queued locally"
                          : "Firestore synced (metadata only)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white rounded-xl p-3 border border-emerald-200/80">
                        <div className="font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Kept on Device (Raw)
                        </div>
                        <p className="text-slate-600 italic line-clamp-3">"{lastSavedEntry.text}"</p>
                      </div>

                      <div className="bg-white rounded-xl p-3 border border-indigo-200/80">
                        <div className="font-bold text-indigo-800 mb-1 flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5" /> Sent to Cloud (Anonymized)
                        </div>
                        <pre className="text-[11px] text-slate-600 font-mono overflow-x-auto">
                          {JSON.stringify(
                            {
                              mood_score: lastSavedEntry.analysis.mood_score,
                              emotions: lastSavedEntry.analysis.emotions,
                              triggers: lastSavedEntry.analysis.triggers,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Recent Local Vault History */}
            {localEntries.length > 0 && (
              <section className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Local Vault History ({localEntries.length})
                </h3>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {localEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                        <span className="px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700">
                          Mood: {entry.analysis?.mood_score ?? 5}/10
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{entry.text}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(entry.analysis?.emotions ?? []).map((em, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600"
                          >
                            {em}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column (5 cols): Cloud Clinical Synthesis */}
          <div className="lg:col-span-5">
            <section className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-6 shadow-sm sticky top-24">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Weekly Therapist Brief</h2>
                  <p className="text-xs text-slate-500">
                    Synthesized via <code className="text-indigo-700 font-semibold">PREFER_IN_CLOUD</code>
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-5">
                Combines anonymized emotional metadata across multiple days in Cloud Firestore using{" "}
                <strong>Gemini Flash</strong> to prepare actionable insights for your next therapy session—without
                ever reading your raw journal text.
              </p>

              <button
                type="button"
                onClick={handleGenerateBrief}
                disabled={isGeneratingBrief}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
              >
                {isGeneratingBrief ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin text-indigo-300" />
                    <span>Synthesizing Cloud Patterns...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-indigo-300" />
                    <span>Generate Weekly Therapist Brief</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {therapistBrief ? (
                <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/90 max-h-[480px] overflow-y-auto">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                      Clinical Session Summary
                    </span>
                    <span className="text-[11px] text-slate-400">Gemini Cloud</span>
                  </div>
                  <div>{renderFormattedMarkdown(therapistBrief)}</div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <Sparkles className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-600">No clinical brief generated yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Save 1 or more entries on the left, then click above to synthesize anonymized trends.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;