import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MenuItem, UsageStats } from "../types";

// Pricing for Gemini 1.5 Flash (closest proxy for 3-flash-preview in estimation logic)
// Pricing (Input / Output per 1M tokens)
const INPUT_PRICE_PER_1M = 0.10;
const OUTPUT_PRICE_PER_1M = 0.40;

const menuItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    dishName: {
      type: Type.STRING,
      description: "A metaphorical, imaginative, or characteristic title (connotation) for the task, strictly 3-5 words.",
    },
    quantity: {
      type: Type.STRING,
      description: "The tiniest first step to start (e.g., '1 x sketch', '2 x google it', '1 x read intro'). CRITICAL: MUST start with number, then 'x', then action verb. Format: 'NUMBER x ACTION VERB + optional context'. NEVER put the action verb before the number.",
    },
    sourceTrigger: {
      type: Type.STRING,
      description: "The exact sentence or phrase from the original text that led to this item.",
    },
    expertAdvice: {
      type: Type.STRING,
      description: "Brief advice from a senior expert who has done this before.",
    },
  },
  required: ["dishName", "quantity", "sourceTrigger", "expertAdvice"],
};

const menuSchema: Schema = {
  type: Type.ARRAY,
  items: menuItemSchema,
};

export const generateMenuFromDump = async (
  text: string,
  onLog: (message: string) => void
): Promise<{ items: MenuItem[]; usage: UsageStats }> => {
  onLog("[SYSTEM] Initializing Gemini client...");

  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    const msg = "[CRITICAL] VITE_GEMINI_API_KEY is missing from environment variables.";
    onLog(msg);
    throw new Error(msg);
  }

  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  onLog("[SYSTEM] Client initialized. Model: gemini-3-flash-preview");

  const systemPrompt = `
    You're basically a brain-dump translator who turns chaos into action. 
    Think of yourself as that friend who's really good at breaking down overwhelming stuff into "okay, just do THIS first" steps.
    
    **SUPER IMPORTANT - LANGUAGE MATCHING**:
    - First, figure out what language the user is writing in.
    - Everything you output (dishName, quantity, expertAdvice) needs to be in THE SAME LANGUAGE as their input.
    - If they write in Czech, you respond in Czech. Spanish → Spanish. English → English. You get it.
    - Don't translate. Don't switch languages. Just match their vibe.
    
    Rules (keep them tight):
    1. Read through the brain dump and spot the actual tasks hiding in there.
    2. For each task, make a "Menu Item" (yeah, we're calling them that).
    3. The "dishName" should be **creative and memorable** — not boring task names. Think like... "The Neural Spark" instead of "Read ML basics", or "The Signal Trace" instead of "Check bluetooth". Make it interesting. **Same language as the input.**
    4. The "quantity" is THE MOST IMPORTANT PART. This is the tiniest possible first step — something you can do in 2 minutes to build momentum. **CRITICAL FORMAT RULE: ALWAYS start with a NUMBER, then 'x', then the ACTION VERB.** Examples: "1 x sketch ideas", "2 x google it", "1 x read the intro", "1 x text them". NEVER write "sketch 1 x" or "google 2 x" — the number ALWAYS comes first. Use super casual action verbs that a 19-year-old would actually say. **Same language as the input.**
    5. The "sourceTrigger" needs to be a direct quote or very close paraphrase from what they actually wrote — this is your proof/evidence.
    6. The "expertAdvice" should sound like advice from someone who's been there and done that. Keep it real and helpful. **Same language as the input.**

    Keep it clean, practical, and honestly helpful. No corporate BS.
  `;

  try {
    onLog("[NETWORK] Preparing payload...");
    onLog(`[DATA] Input length: ${text.length} chars`);

    // Safety timeout promise
    const timeoutMs = 45000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const apiCallPromise = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: systemPrompt }, { text: `INPUT TEXT:\n${text}` }] },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: menuSchema,
        temperature: 0.2, // Low temperature for deterministic output
      },
    });

    onLog("[NETWORK] Sending request to Google AI Gateway...");
    const startTime = Date.now();

    // Race against timeout
    const response = await Promise.race([apiCallPromise, timeoutPromise]) as any;
    const duration = Date.now() - startTime;

    onLog(`[NETWORK] Response received in ${duration}ms.`);

    const usageMetadata = response.usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const candidateTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    const cost =
      (promptTokens / 1_000_000) * INPUT_PRICE_PER_1M +
      (candidateTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

    onLog(`[METRICS] Usage: ${totalTokens} tokens. Cost: ~$${cost.toFixed(6)}`);

    if (!response.candidates || response.candidates.length === 0) {
      onLog("[ERROR] No candidates returned from API. Possible safety block.");
      throw new Error("No candidates returned. content was likely filtered.");
    }

    const candidate = response.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      onLog(`[WARNING] Model finish reason: ${candidate.finishReason}`);
    }

    let items: MenuItem[] = [];
    if (response.text) {
      onLog("[PARSER] Decoded JSON content...");
      try {
        const parsed = JSON.parse(response.text);
        if (!Array.isArray(parsed)) {
          throw new Error("Response is not an array");
        }
        items = parsed.map((item: any, index: number) => ({
          ...item,
          id: `item-${index}-${Date.now()}`,
        }));
        onLog(`[SUCCESS] Extracted ${items.length} actionable items.`);
      } catch (parseError) {
        onLog("[ERROR] Failed to parse JSON response.");
        console.error("JSON Parse Error", parseError);
        console.log("Raw text:", response.text);
        throw new Error("Invalid JSON response from AI");
      }
    } else {
      onLog("[ERROR] Empty text response from model.");
      throw new Error("Empty text response from model.");
    }

    return {
      items,
      usage: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: candidateTokens,
        totalTokenCount: totalTokens,
        estimatedCost: cost,
      },
    };
  } catch (error: any) {
    onLog(`[CRITICAL] ${error.message || 'Unknown error occurred'}`);
    console.error("Gemini API Error:", error);
    throw error;
  }
};