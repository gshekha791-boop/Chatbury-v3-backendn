const API = "https://generativelanguage.googleapis.com/v1beta/models";

export async function streamGemini({ apiKey, model, prompt, history, onText }) {
  const contents = [];
  for (const item of history.slice(-30)) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") continue;
    contents.push({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content.slice(0, 20000) }] });
  }
  contents.push({ role: "user", parts: [{ text: prompt.slice(0, 20000) }] });

  const response = await fetch(`${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Gemini did not return a response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", fullText = "", inputTokens = 0, outputTokens = 0;

  const consume = async (block) => {
    let data = "";
    for (const line of block.split(/\r?\n/)) if (line.startsWith("data:")) data += line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let obj;
    try { obj = JSON.parse(data); } catch { return; }
    const parts = obj.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (typeof part.text === "string") { fullText += part.text; onText(part.text); }
    }
    const u = obj.usageMetadata;
    if (u) { inputTokens = u.promptTokenCount || inputTokens; outputTokens = u.candidatesTokenCount || outputTokens; }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let i;
    while ((i = pending.indexOf("\n\n")) !== -1) {
      const block = pending.slice(0, i); pending = pending.slice(i + 2);
      await consume(block);
    }
  }
  if (pending.trim()) await consume(pending);
  return { text: fullText, inputTokens, outputTokens };
}
