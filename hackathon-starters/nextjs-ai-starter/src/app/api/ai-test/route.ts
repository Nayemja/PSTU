import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function GET() {
  try {
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: "Reply with exactly: Gemini connection successful",
    });

    return Response.json({
      success: true,
      message: interaction.output_text,
    });
  } catch (error) {
    console.error("Gemini test failed:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}