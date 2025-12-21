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
      description: "The smallest, 2-minute starter action (e.g., '1 x sketch', '1 x search'). Format: 'NUMBER x ACTION'.",
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
    You are a master delegator and an executive chef of productivity. 
    Your goal is to deconstruct a messy "brain dump" into a clean, minimalist, actionable "Food Menu".
    
    Rules:
    1. Analyze the input text to identify distinct actionable tasks.
    2. For each task, create a "Menu Item".
    3. The "dishName" must be **metaphorical, imaginative, or characteristic** (e.g., "The Neural Spark" instead of "Read ML basics", "The Signal Trace" instead of "Check bluetooth"). Make it an evocative connotation.
    4. The "quantity" must be the **smallest, 2-minute starter** to get momentum (e.g., "1 x micro-step", "1 x google search", "1 x sketch"). Focus on the highest-potential intention with the lowest barrier to entry.
    5. The "sourceTrigger" must be a direct quote or close paraphrase from the input text to serve as evidence.
    6. The "expertAdvice" is a short tip from someone who has successfully completed this task.
    
    Keep the tone minimalist, high-end, and extremely clear.
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