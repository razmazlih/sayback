import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const OG_IMAGE_CONTENT_TYPE = "image/png";
export const OG_IMAGE_ALT = "SayBack - תשובות מהירות להודעות";

function toVisualRtl(text: string) {
  return [...text].reverse().join("");
}

type SayBackOgImageInput = {
  title: string;
  subtitle: string;
  badge?: string;
  cta?: string;
};

export function createSayBackOgImage({
  title,
  subtitle,
  badge = "SayBack",
  cta = "3 תשובות בקליק",
}: SayBackOgImageInput) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundImage:
            "radial-gradient(circle at 10% 8%, #ffe38a 0%, #ffe38a00 36%), radial-gradient(circle at 90% 0%, #ff9a66 0%, #ff9a6600 32%), linear-gradient(135deg, #fff8e8 0%, #ffe7d4 100%)",
          color: "#19130f",
          fontFamily: "Rubik, Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -100,
            width: 380,
            height: 380,
            borderRadius: "999px",
            background: "rgba(255, 77, 0, 0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -140,
            right: -100,
            width: 430,
            height: 430,
            borderRadius: "999px",
            background: "rgba(255, 212, 0, 0.16)",
          }}
        />

        <div
          style={{
            position: "relative",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "54px 62px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 28,
                background: "#111111",
                color: "#f7ff4f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 46,
                fontWeight: 800,
                boxShadow: "0 8px 0 #ff623d",
              }}
            >
              ?
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: "#1a130f",
                }}
              >
                {badge}
              </span>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#5a2b10",
                }}
              >
                {toVisualRtl("עונים מהר. נשמעים טבעי. נשארים בסטייל.")}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              maxWidth: 820,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                lineHeight: 1.06,
                color: "#1a130f",
              }}
            >
              {toVisualRtl(title)}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 600,
                lineHeight: 1.3,
                color: "#42200c",
              }}
            >
              {toVisualRtl(subtitle)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#111111",
                borderRadius: 999,
                padding: "12px 20px",
                color: "#f7ff4f",
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              <span>{toVisualRtl(cta)}</span>
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#6c3b18",
              }}
            >
              SayBack
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
    }
  );
}
