import { ExamLanding } from "@/features/exams/landing/exam-landing";
import { landingMetadata } from "@/features/exams/landing/gate";

// The exam's landing page: public or staff-only by the registry's `public` (features/exams/landing/gate.ts). Public:
// static, re-rendered hourly; staff-only: read per request (the staff check reads the session cookie).
export const revalidate = 3600;
export const generateMetadata = () => landingMetadata("ini-cet");

export default function Page() {
  return <ExamLanding exam="ini-cet" />;
}
