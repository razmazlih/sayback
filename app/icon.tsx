import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
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
          background:
            "linear-gradient(145deg, #ff5a1a 0%, #ff8248 45%, #ffd44f 100%)",
        }}
      >
        <div
          style={{
            width: 388,
            height: 388,
            borderRadius: 116,
            background: "#121212",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 60px rgba(17, 17, 17, 0.35)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 246,
              height: 188,
              borderRadius: 68,
              background: "#f7ff4f",
              color: "#111111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 126,
              fontWeight: 800,
              lineHeight: 1,
              position: "relative",
            }}
          >
            ?
            <div
              style={{
                position: "absolute",
                right: 30,
                bottom: -29,
                width: 62,
                height: 62,
                transform: "rotate(45deg)",
                borderRadius: 12,
                background: "#f7ff4f",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 46,
              width: 58,
              height: 58,
              borderRadius: 18,
              background: "#ffd44f",
              color: "#121212",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            *
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
