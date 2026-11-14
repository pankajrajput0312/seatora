import { ImageResponse } from "next/og";

export const alt = "Seatora · NEET PG counselling planner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#0b0e12", color: "#f1f4f7" }}>
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#5ccfe6" }}>Seatora</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>Plan your PG seat, not just your rank.</div>
        <div style={{ fontSize: 28, color: "#a3abb3" }}>Institutes · previous-year ranks · fees · stipends · bonds · residents</div>
      </div>
    ),
    size,
  );
}
