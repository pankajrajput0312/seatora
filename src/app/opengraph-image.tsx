import { ImageResponse } from "next/og";

export const alt = "Seatora · See the residents at every NEET PG hospital";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The link preview (Instagram, WhatsApp, X): residents first. The table is a sketch: bars, never real names.
const row = (w1: number, w2: number, course: string, year: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 20px", borderTop: "1px solid #232a33" }}>
    <div style={{ width: w1, height: 16, borderRadius: 8, background: "#3a4552" }} />
    <div style={{ width: w2, height: 16, borderRadius: 8, background: "#2b343f" }} />
    <div style={{ flex: 1, display: "flex", fontSize: 22, color: "#a3abb3" }}>{course}</div>
    <div style={{ display: "flex", fontSize: 22, color: "#a3abb3" }}>{year}</div>
  </div>
);

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 72px", background: "#0b0e12", color: "#f1f4f7" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 28, letterSpacing: 6, color: "#5ccfe6" }}>SEATORA</div>
          <div style={{ display: "flex", fontSize: 24, padding: "6px 16px", borderRadius: 999, background: "#123a24", color: "#5fd36f" }}>Free · NEET PG 2026</div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05, marginTop: 28, maxWidth: 1000 }}>See who&apos;s already at every PG hospital.</div>
        <div style={{ display: "flex", fontSize: 28, color: "#a3abb3", marginTop: 14 }}>77,000+ residents by hospital, course and year · from MCC&apos;s official lists</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 30, border: "1px solid #232a33", borderRadius: 18, background: "#11161c" }}>
          <div style={{ display: "flex", gap: 18, padding: "12px 20px", fontSize: 20, color: "#5ccfe6" }}>
            <div style={{ width: 220, display: "flex" }}>Resident</div>
            <div style={{ width: 260, display: "flex" }}>Hospital</div>
            <div style={{ flex: 1, display: "flex" }}>Course</div>
            <div style={{ display: "flex" }}>Year</div>
          </div>
          {row(220, 260, "MD Anaesthesiology", "2025")}
          {row(180, 230, "DNB General Medicine", "2024")}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#a3abb3", marginTop: 22 }}>Also: options for your rank · seats · fees, stipend and bond</div>
      </div>
    ),
    size,
  );
}
