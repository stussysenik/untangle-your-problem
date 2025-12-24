import { MenuItem, UsageStats } from "../types";

const GLM_API_URL =
        "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions";

// Estimated pricing for GLM-4 (adjust as needed based on actuals)
const INPUT_PRICE_PER_1M = 0.1; // Placeholder
const OUTPUT_PRICE_PER_1M = 0.4; // Placeholder

export const generateMenuFromDump = async (
        text: string,
        onLog: (message: string) => void,
): Promise<{ items: MenuItem[]; usage: UsageStats }> => {
        onLog("[SYSTEM] Initializing GLM-4 client...");

        if (!import.meta.env.VITE_GLM_API_KEY) {
                const msg =
                        "[CRITICAL] VITE_GLM_API_KEY is missing from environment variables.";
                onLog(msg);
                throw new Error(msg);
        }

        const systemPrompt = `
    You are a master delegator and an executive chef of productivity.
    Your goal is to deconstruct a messy "brain dump" into a clean, minimalist, actionable "Food Menu".

    You must output a VALID JSON array of objects. Do not wrap it in markdown code blocks.

    Rules for the JSON structure:
    [
      {
        "dishName": "3-5 words title",
        "quantity": "Calculated amount",
        "sourceTrigger": "Direct quote from input",
        "expertAdvice": "Short expert tip"
      }
    ]

    Rules for content:
    1. Analyze the input text to identify distinct actionable tasks.
    2. For each task, create a "Menu Item".
    3. The "dishName" must be 3-5 words, encouraging, and accurate.
    4. The "quantity" must be specific (e.g., "2 x emails", "1 x set").
    5. The "sourceTrigger" must be an EXACT COPY of the substring from the input text. Do not change punctuation or casing. It must be findable via strict string search.
    6. The "expertAdvice" is a short tip from someone who has successfully completed this task.

    Keep the tone minimalist, high-end, and extremely clear.
  `;

        try {
                onLog("[NETWORK] Preparing payload for GLM-4...");
                onLog(`[DATA] Input length: ${text.length} chars`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                        onLog(
                                "[CRITICAL] Request timeout exceeded (45s). Aborting connection...",
                        );
                        controller.abort();
                }, 45000);

                onLog("[NETWORK] Sending request to Zhipu AI Gateway...");
                onLog("[NETWORK] Using model: glm-4.7");
                const startTime = Date.now();

                // Simulated verbose logging for "Systems Engineering" feel
                const verboseInterval = setInterval(() => {
                        const elapsed = Date.now() - startTime;
                        if (elapsed > 2000 && elapsed < 4000)
                                onLog(
                                        "[SYSTEM] Handshaking with remote cluster...",
                                );
                        if (elapsed > 5000 && elapsed < 7000)
                                onLog(
                                        "[PROCESS] Allocating tensor buffers for context window...",
                                );
                        if (elapsed > 8000 && elapsed < 10000)
                                onLog(
                                        "[COMPUTE] Resolving attention heads (MoE layer)...",
                                );
                        if (elapsed > 12000 && elapsed < 14000)
                                onLog(
                                        "[WAIT] Processing complex input vectors...",
                                );
                        if (elapsed > 15000 && elapsed < 17000)
                                onLog(
                                        "[SYSTEM] Connection stable. Awaiting token generation...",
                                );
                        if (elapsed > 20000 && elapsed < 22000)
                                onLog(
                                        "[WARN] High latency detected. Rerouting packets...",
                                );
                }, 1000);

                const response = await fetch(GLM_API_URL, {
                        method: "POST",
                        headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${import.meta.env.VITE_GLM_API_KEY}`,
                        },
                        body: JSON.stringify({
                                model: "glm-4.7",
                                messages: [
                                        {
                                                role: "system",
                                                content: systemPrompt,
                                        },
                                        {
                                                role: "user",
                                                content: `INPUT TEXT:\n${text}`,
                                        },
                                ],
                                temperature: 0.2, // OpenAI compatible
                                top_p: 0.7,
                                max_tokens: 4095,
                        }),
                        signal: controller.signal,
                });

                clearInterval(verboseInterval);
                clearTimeout(timeoutId);
                const duration = Date.now() - startTime;
                onLog(`[NETWORK] Response received in ${duration}ms.`);

                if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(
                                `GLM API Error ${response.status}: ${errText}`,
                        );
                }

                const data = await response.json();

                // Usage tracking
                const usageMetadata = data.usage || {};
                const promptTokens = usageMetadata.prompt_tokens || 0;
                const completionTokens = usageMetadata.completion_tokens || 0;
                const totalTokens = usageMetadata.total_tokens || 0;

                const cost =
                        (promptTokens / 1_000_000) * INPUT_PRICE_PER_1M +
                        (completionTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

                onLog(
                        `[METRICS] Usage: ${totalTokens} tokens. Cost: ~$${cost.toFixed(6)}`,
                );

                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                        throw new Error("Empty content in GLM response");
                }

                onLog("[PARSER] Parsing JSON content...");
                let items: MenuItem[] = [];

                // Clean up markdown code blocks if present
                let cleanJson = content.trim();
                if (cleanJson.startsWith("```")) {
                        cleanJson = cleanJson
                                .replace(/^```(json)?/, "")
                                .replace(/```$/, "");
                }

                try {
                        const parsed = JSON.parse(cleanJson);
                        if (!Array.isArray(parsed)) {
                                throw new Error("Response is not an array");
                        }
                        items = parsed.map((item: any, index: number) => ({
                                ...item,
                                id: `glm-item-${index}-${Date.now()}`,
                        }));
                        onLog(
                                `[SUCCESS] Extracted ${items.length} actionable items.`,
                        );
                } catch (e) {
                        console.error("JSON Parse Error", e);
                        onLog("[ERROR] Failed to parse JSON response.");
                        throw e;
                }

                return {
                        items,
                        usage: {
                                promptTokenCount: promptTokens,
                                candidatesTokenCount: completionTokens,
                                totalTokenCount: totalTokens,
                                estimatedCost: cost,
                        },
                };
        } catch (error: any) {
                if (error.name === "AbortError") {
                        onLog(
                                "[CRITICAL] Request was aborted. This usually means:",
                        );
                        onLog(
                                "  1. The API request took longer than 45 seconds (timeout)",
                        );
                        onLog(
                                "  2. The connection was interrupted by the user",
                        );
                        onLog(
                                "  3. Network instability caused the request to fail",
                        );
                        throw new Error(
                                "Request timed out or was interrupted. Please try again.",
                        );
                }

                if (
                        error.name === "TypeError" &&
                        error.message.includes("fetch")
                ) {
                        onLog("[CRITICAL] Network error. Possible causes:");
                        onLog(
                                "  1. Invalid API key or missing VITE_GLM_API_KEY environment variable",
                        );
                        onLog("  2. Network connectivity issues");
                        onLog("  3. CORS restrictions");
                        throw new Error(
                                "Network error. Please check your API key and connection.",
                        );
                }

                onLog(
                        `[CRITICAL] ${error.message || "Unknown error occurred"}`,
                );
                console.error("GLM API Error:", error);
                throw error;
        }
};
