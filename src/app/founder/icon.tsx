import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The profile's own favicon: initials on the page's paper color, with the oxide accent. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#161513", color: "#F2F0EB", fontSize: 30, letterSpacing: "-0.04em", borderRadius: 12, position: "relative" }}>
        KM
        <div style={{ display: "flex", position: "absolute", right: 10, bottom: 10, width: 8, height: 8, borderRadius: 8, backgroundColor: "#E9A58D" }} />
      </div>
    ),
    { ...size }
  );
}
