import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function parseGeminiJson(output: string): Record<string, unknown> {
  const cleaned = output.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error("Gemini response did not contain a JSON object");
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  }
}

function parseSimplePayment(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  const amountMatch = normalized.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(k)?(?:\s|$)/i);
  if (!amountMatch || amountMatch.index === undefined) return null;

  const amountTaka = Number(amountMatch[1]) * (amountMatch[2] ? 1000 : 1);
  if (!Number.isFinite(amountTaka) || amountTaka <= 0) return null;

  const beforeAmount = normalized.slice(0, amountMatch.index).trim();
  const recipientName = beforeAmount
    .replace(/\s+(ke|কে)$/i, "")
    .trim() || null;

  return {
    recipientName,
    amountTaka,
    note: null,
  };
}

export async function POST(request: Request) {
  let message = "";

  try {
    console.log("GEMINI_API_KEY exists:", Boolean(process.env.GEMINI_API_KEY));
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing from .env.local");

    const body = await request.json();
    if (typeof body.message !== "string" || !body.message.trim()) {
      return Response.json({ success: false, message: "Message is required" }, { status: 400 });
    }
    message = body.message;

    const prompt = `
You are TrustPay's payment intent parser.

Extract recipient, amount in Bangladeshi Taka, and note.
Understand English, Bangla and Banglish.

Examples:
"ovi ke 1000 pathao"
=> {"recipientName":"ovi","amountTaka":1000,"note":null}

"rahim 500"
=> {"recipientName":"rahim","amountTaka":500,"note":null}

"ma ke 2k dao medicine"
=> {"recipientName":"ma","amountTaka":2000,"note":"medicine"}

"রহিমকে ৫০০ টাকা পাঠাও"
=> {"recipientName":"রহিম","amountTaka":500,"note":null}

Never guess missing recipient or amount.
Return JSON only:
{"recipientName":string|null,"amountTaka":number|null,"note":string|null}

User message:
${JSON.stringify(message)}
`;

    const response = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: prompt,
      store: false,
    });

    console.log("Gemini interaction response:", response);
    const parsed = parseGeminiJson(response.output_text ?? "");
    const draft = {
      recipientName: typeof parsed.recipientName === "string" && parsed.recipientName.trim() ? parsed.recipientName.trim() : null,
      amountTaka: typeof parsed.amountTaka === "number" && parsed.amountTaka > 0 ? parsed.amountTaka : null,
      note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
    };

    const missingFields: string[] = [];
    if (!draft.recipientName) missingFields.push("recipient");
    if (!draft.amountTaka) missingFields.push("amount");

    return Response.json({ success: true, draft, missingFields });
  } catch (error) {
    console.error("PARSE PAYMENT FAILED:", error);

    const fallbackDraft = parseSimplePayment(message);
    if (fallbackDraft) {
      console.log("Using simple payment parser fallback");
      const missingFields: string[] = [];
      if (!fallbackDraft.recipientName) missingFields.push("recipient");
      return Response.json({ success: true, draft: fallbackDraft, missingFields });
    }

    return Response.json({ success: false, message: "Could not understand payment" }, { status: 500 });
  }
}
