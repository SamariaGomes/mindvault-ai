import { useState, useEffect } from "react";
import { Shield, Cloud, Lock, Sparkles, Wifi, WifiOff, FileText, Eye, CheckCircle2, Trash2 } from "lucide-react";
import { collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db, ensureAuth } from "./config/firebase";
import { analyzeJournalEntryPrivately, generateTherapistBriefFromCloud } from "./services/hybridAiService";

interface LocalEntry {
  id: string;
  date: string;
  rawText: string;
  empathyReply: string;
  moodScore: number;
  emotions: string[];
  triggers: string[];
  source: string;
}

function FormattedClinicalBrief({ text }: { text: string }) {
  const lines = text.split("\n");

  const renderBold = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={idx} style={{ color: "#0f172a" }}>{part.slice(2, -2)}</strong>
      ) : (
        part.replace(/`/g, "")
      )
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", color: "#334155", fontSize: "13px", lineHeight: "1.6" }}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} style={{ height: "4px" }} />;
        if (line === "---") return <hr key={index} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "6px 0" }} />;

        if (line.startsWith("### ")) {
          return (
            <h4 key={index} style={{ margin: "10px 0 4px", fontSize: "14px", color: "#1e3a8a", fontWeight: 700 }}>
              {line.replace("### ", "")}
            </h4>
          );
        }

        if (line.startsWith("## ")) {
          return (
            <h3 key={index} style={{ margin: "12px 0 4px", fontSize: "15px", color: "#1e3a8a", fontWeight: 700 }}>
              {line.replace("## ", "")}
            </h3>
          );
        }

        if (line.startsWith("* ") || line.startsWith("- ")) {
          return (
            <div key={index} style={{ display: "flex", gap: "8px", paddingLeft: "8px" }}>
              <span style={{ color: "#2563eb", fontWeight: "bold" }}>•</span>
              <span>{renderBold(line.slice(2))}</span>
            </div>
          );
        }

        return <p key={index} style={{ margin: 0 }}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

export function App() {
  const [journalInput, setJournalInput] = useState("");
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [therapistBrief, setTherapistBrief] = useState<string | null>(null);
  const [lastCloudPayload, setLastCloudPayload] = useState<any | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [activeEngine, setActiveEngine] = useState<"idle" | "on-device" | "cloud">("idle");

  const effectiveOnline = isOnline && !simulatedOffline;

  useEffect(() => {
    const saved = localStorage.getItem("mindvault_private_entries");
    if (saved) setLocalEntries(JSON.parse(saved));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSaveEntry = async () => {
    if (!journalInput.trim()) return;
    setIsAnalyzing(true);
    setActiveEngine("on-device");

    try {
      const analysis = await analyzeJournalEntryPrivately(journalInput);

      const newLocalEntry: LocalEntry = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString("pt-BR"),
        rawText: journalInput,
        empathyReply: analysis.empathy_reply,
        moodScore: analysis.mood_score,
        emotions: analysis.emotions,
        triggers: analysis.triggers,
        source: analysis.source,
      };

      const updatedLocal = [newLocalEntry, ...localEntries];
      setLocalEntries(updatedLocal);
      localStorage.setItem("mindvault_private_entries", JSON.stringify(updatedLocal));

      const anonymizedPayload = {
        timestamp: new Date().toISOString(),
        mood_score: analysis.mood_score,
        emotions: analysis.emotions,
        triggers: analysis.triggers,
        cognitive_distortion: analysis.cognitive_distortion,
        inference_source: analysis.source,
      };
      setLastCloudPayload(anonymizedPayload);

      if (effectiveOnline) {
        const user = await ensureAuth();
        await addDoc(collection(db, "users", user.uid, "entries"), anonymizedPayload);
      }

      setJournalInput("");
    } catch (error: any) {
      console.error("Erro ao processar entrada:", error);
      alert("Erro ao processar entrada: " + (error?.message || "Verifique o Console (F12)."));
    } finally {
      setIsAnalyzing(false);
      setActiveEngine("idle");
    }
  };

  const handleGenerateTherapistBrief = async () => {
    if (!effectiveOnline) {
      alert("Você está em modo offline. Reative a conexão para sintetizar os dados na nuvem.");
      return;
    }
    setIsGeneratingBrief(true);
    setActiveEngine("cloud");

    try {
      const user = await ensureAuth();
      const q = query(collection(db, "users", user.uid, "entries"), orderBy("timestamp", "desc"), limit(14));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map((doc) => doc.data());

      if (logs.length === 0) {
        alert("Escreva e guarde pelo menos uma entrada no diário primeiro!");
        return;
      }

      const brief = await generateTherapistBriefFromCloud(logs);
      setTherapistBrief(String(brief));
    } catch (error: any) {
      console.error("Erro ao gerar resumo:", error);
      alert("Erro ao gerar resumo: " + (error?.message || "Verifique o Console (F12)."));
    } finally {
      setIsGeneratingBrief(false);
      setActiveEngine("idle");
    }
  };

  const handleClearLocalEntries = () => {
    if (confirm("Deseja limpar o histórico local deste navegador?")) {
      setLocalEntries([]);
      setLastCloudPayload(null);
      localStorage.removeItem("mindvault_private_entries");
    }
  };

  return (
    <div translate="no" style={{ maxWidth: "960px", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif", color: "#1e293b" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield color="#059669" /> MindVault AI
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#64748b" }}>
            Diário Híbrido de Saúde Mental — Privacidade Local + Insights Clínicos na Nuvem
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSimulatedOffline(!simulatedOffline)}
            title="Clique para simular modo offline"
            style={{ padding: "6px 12px", borderRadius: "20px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer", backgroundColor: effectiveOnline ? "#dcfce7" : "#fee2e2", color: effectiveOnline ? "#166534" : "#991b1b", display: "flex", alignItems: "center", gap: "4px" }}
          >
            {effectiveOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {effectiveOnline ? "Online (Clique p/ Simular Offline)" : "Modo Offline Ativo"}
          </button>

          <span style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: activeEngine === "cloud" ? "#dbeafe" : "#f1f5f9", color: activeEngine === "cloud" ? "#1e40af" : "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
            {activeEngine === "cloud" ? <Cloud size={14} /> : <Lock size={14} />}
            {activeEngine === "on-device" ? "Processando Localmente..." : activeEngine === "cloud" ? "Consultando Gemini na Nuvem..." : "SDK Híbrido Ativo"}
          </span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <section style={{ backgroundColor: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "16px", marginTop: 0, display: "flex", alignItems: "center", gap: "6px" }}>
            <Lock size={18} color="#059669" /> Cofre Local Privado (Nunca Sai do Dispositivo)
          </h2>
          <textarea
            rows={5}
            placeholder="Escreva livremente sobre como você está se sentindo hoje... Seu texto original permanece 100% neste dispositivo."
            value={journalInput}
            onChange={(e) => setJournalInput(e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box", marginBottom: "12px" }}
          />
          <button
            type="button"
            onClick={handleSaveEntry}
            disabled={isAnalyzing || !journalInput.trim()}
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", backgroundColor: "#059669", color: "white", fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
          >
            <Sparkles size={16} />
            {isAnalyzing ? "Analisando Localmente..." : "Salvar e Refletir em Particular"}
          </button>

          {lastCloudPayload && (
            <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#ecfdf5", borderRadius: "8px", border: "1px solid #a7f3d0", fontSize: "12px" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: "4px", color: "#065f46", marginBottom: "4px" }}>
                <Eye size={14} /> Prova de Privacidade — Dados Anonimizados Enviados à Nuvem:
              </strong>
              <pre style={{ margin: 0, overflowX: "auto", color: "#047857" }}>
                {JSON.stringify(lastCloudPayload, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "14px", color: "#475569", margin: 0 }}>Entradas Locais ({localEntries.length})</h3>
              {localEntries.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLocalEntries}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Trash2 size={12} /> Limpar
                </button>
              )}
            </div>

            {localEntries.map((entry) => (
              <div key={entry.id} style={{ backgroundColor: "white", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "10px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "11px", marginBottom: "6px" }}>
                  <span>{entry.date}</span>
                  <span>Humor: {entry.moodScore}/10 • {entry.source}</span>
                </div>
                <p style={{ margin: "0 0 8px", fontStyle: "italic" }}>"{entry.rawText}"</p>
                <div style={{ backgroundColor: "#f1f5f9", padding: "8px", borderRadius: "6px", color: "#334155" }}>
                  <strong>Reflexão da IA:</strong> {entry.empathyReply}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ backgroundColor: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "16px", marginTop: 0, display: "flex", alignItems: "center", gap: "6px" }}>
            <Cloud size={18} color="#2563eb" /> Síntese Clínica em Nuvem (Anônima)
          </h2>
          <p style={{ fontSize: "13px", color: "#64748b" }}>
            Utiliza o Gemini na nuvem para analisar metadados de humor anonimizados armazenados no Firestore e preparar um relatório estruturado para o seu terapeuta.
          </p>

          <button
            type="button"
            onClick={handleGenerateTherapistBrief}
            disabled={isGeneratingBrief || !effectiveOnline}
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", backgroundColor: effectiveOnline ? "#2563eb" : "#94a3b8", color: "white", fontWeight: 600, cursor: effectiveOnline ? "pointer" : "not-allowed", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
          >
            <FileText size={16} />
            {isGeneratingBrief ? "Sintetizando Padrões na Nuvem..." : "Gerar Resumo Semanal do Terapeuta"}
          </button>

          {typeof therapistBrief === "string" && therapistBrief.length > 0 && (
            <div style={{ marginTop: "16px", backgroundColor: "white", padding: "16px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1d4ed8", fontWeight: 600, fontSize: "14px", marginBottom: "10px", borderBottom: "1px solid #eff6ff", paddingBottom: "8px" }}>
                <CheckCircle2 size={16} /> Resumo Clínico Pronto
              </div>
              <FormattedClinicalBrief text={therapistBrief} />
            </div>
          )}
        </section>
      </div>

      <footer style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
        Aviso: O MindVault AI é uma ferramenta de autorreflexão e organização, não um substituto para diagnóstico ou tratamento médico profissional.
      </footer>
    </div>
  );
}

export default App;