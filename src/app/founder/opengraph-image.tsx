import { ImageResponse } from "next/og";
import { person, hero, trajectory } from "@/content/founder/profile";

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
          <div style={{ display: "flex", fontSize: 116, lineHeight: 0.95, letterSpacing: "-0.04em" }}>{hero.line[0]}</div>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, letterSpacing: "-0.03em", color: "#36332F", paddingLeft: 88 }}>{hero.line[1]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: "#36332F" }}>
          {trajectory.path.map((t, i) => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {i > 0 && <div style={{ display: "flex", width: 22, height: 1.5, backgroundColor: t.state === "next" ? "#A39E94" : "#161513" }} />}
              <div style={{ display: "flex", width: 11, height: 11, borderRadius: 11, backgroundColor: t.state === "now" ? "#B23C1C" : t.state === "exploring" ? "#161513" : "#F2F0EB", border: `1.5px solid ${t.state === "now" ? "#B23C1C" : "#161513"}` }} />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
