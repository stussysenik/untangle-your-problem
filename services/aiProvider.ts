import { MenuItem, UsageStats } from "../types";
import { generateMenuFromDump as generateGemini } from "./geminiService";
import { generateMenuFromDump as generateGLM } from "./glmService";

export const generateMenuFromDump = async (
        text: string,
        onLog: (message: string) => void
): Promise<{ items: MenuItem[]; usage: UsageStats }> => {
        const provider = import.meta.env.VITE_AI_PROVIDER || "GEMINI";

        onLog(`[SYSTEM] Provider selector: ${provider}`);

        if (provider === "GLM") {
                return generateGLM(text, onLog);
        } else {
                // Default to Gemini
                return generateGemini(text, onLog);
        }
};
