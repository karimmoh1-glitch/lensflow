import { ImageResponse } from "next/og";
import { person, hero } from "@/content/founder/profile";

export const alt = `${person.name} — ${hero.line.join(" ")}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share image: typographic only. No portrait, no stock imagery, no external fonts. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: "#F2F0EB", color: "#161513", padding: "72px 88px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#625E57" }}>
          <span>{person.name}</span>
          <span>{person.location}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 128, lineHeight: 0.92, letterSpacing: "-0.04em" }}>{hero.line[0]}</div>
          <div style={{ display: "flex", fontSize: 128, lineHeight: 0.92, letterSpacing: "-0.04em", paddingLeft: 88 }}>{hero.line[1]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 24, color: "#36332F" }}>
          {hero.trajectory.map((t, i) => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, backgroundColor: i === 0 ? "#B23C1C" : t.state === "next" ? "#F2F0EB" : "#161513", border: "1.5px solid #161513" }} />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
