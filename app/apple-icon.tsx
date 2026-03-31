import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, #ff5a1a 0%, #ff8248 45%, #ffd44f 100%)",
        }}
      >
        <div
          style={{
            width: 134,
            height: 134,
            borderRadius: 38,
            background: "#121212",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 82,
              height: 64,
              borderRadius: 24,
              background: "#f7ff4f",
              color: "#111111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1,
              position: "relative",
            }}
          >
            ?
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: -9,
                width: 22,
                height: 22,
                transform: "rotate(45deg)",
                borderRadius: 6,
                background: "#f7ff4f",
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
