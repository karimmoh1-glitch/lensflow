import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#101114",
          borderRadius: 7,
          fontSize: 20,
          fontWeight: 700,
          color: "#FAFAF9",
        }}
      >
        D
      </div>
    ),
    { ...size }
  );
}
