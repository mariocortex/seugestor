import { GoogleGenAI, Type } from "@google/genai";

export class AIService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateMetadata(creativeName: string, count: number) {
    const response = await this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Generate ${count} variations of marketing copy for a Facebook Ad. 
      Creative theme: ${creativeName}.
      Return a JSON array of objects with 'title' (short headline) and 'body' (ad text).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              body: { type: Type.STRING }
            },
            required: ["title", "body"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  }
}
