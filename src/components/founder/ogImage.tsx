import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * The founder pages' share image: typographic only — ink on paper, a thin coral rule, the
 * domain. No people, no photos, no external fonts.
 */
export function founderOgImage({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#F6F6F4",
          padding: "84px 96px",
          color: "#16171A",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? <div style={{ display: "flex", fontSize: 28, color: "rgba(22,23,26,0.65)", marginBottom: 28 }}>{eyebrow}</div> : null}
          <div style={{ display: "flex", fontSize: title.length > 18 ? 84 : 112, lineHeight: 1, letterSpacing: "-0.035em", fontWeight: 600 }}>{title}</div>
          <div style={{ display: "flex", width: 96, height: 4, backgroundColor: "#E8504A", marginTop: 40, marginBottom: 36 }} />
          <div style={{ display: "flex", fontSize: 40, color: "rgba(22,23,26,0.8)", letterSpacing: "-0.01em" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "1px solid rgba(22,23,26,0.16)", paddingTop: 28 }}>
          <div style={{ display: "flex", fontSize: 26, color: "rgba(22,23,26,0.65)" }}>daythread.org</div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
