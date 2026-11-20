import { llmsText } from "@/features/exams/landing/llms";

// Seatora for AI answer engines (llmstxt.org), re-read hourly like the pages it describes.
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsText(true), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
