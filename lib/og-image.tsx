import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const OG_IMAGE_CONTENT_TYPE = "image/png";
export const OG_IMAGE_ALT = "SayBack - לא יודעים מה לענות, 3 תשובות בעברית";

function toVisualRtl(text: string) {
  return [...text].reverse().join("");
}

const platformLabels = ["וואטסאפ", "אינסטגרם", "דייטינג", "לקוחות"];
const steps = ["מדביקים הודעה", "בוחרים וייב", "מקבלים 3 תשובות"];
const replies = ["בטח, אני פה", "ברור, מה קרה", "אפשר לדבר בערב"];

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
  cta = "נסו עכשיו בחינם",
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
          background:
            "linear-gradient(180deg, #fffdfa 0%, #f7f3ec 44%, #eee5d8 100%)",
          color: "#181411",
          fontFamily: "Rubik, Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            left: 0,
            height: 18,
            background:
              "linear-gradient(90deg, #20d6c7 0%, #ffb089 48%, #ff5a2a 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 0,
            width: 360,
            height: "100%",
            background: "#ff5a2a",
            opacity: 0.06,
            transform: "skewX(-12deg)",
            transformOrigin: "top right",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 0,
            width: 430,
            height: "100%",
            background: "#20d6c7",
            opacity: 0.06,
            transform: "skewX(10deg)",
            transformOrigin: "top left",
          }}
        />

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row-reverse",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: 50,
            padding: "58px 64px 46px",
          }}
        >
          <div
            style={{
              width: 600,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 32,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: 28,
                    background: "#181411",
                    color: "#b7f36a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 50,
                    fontWeight: 900,
                    boxShadow: "0 8px 0 #ff5a2a",
                  }}
                >
                  ?
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 52,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: "#181411",
                    }}
                  >
                    {badge}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 999,
                      border: "2px solid #b8e7df",
                      background: "#e3fbf7",
                      color: "#123a36",
                      padding: "7px 14px",
                      fontSize: 21,
                      fontWeight: 900,
                    }}
                  >
                    {toVisualRtl("תשובות קצרות בעברית")}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    maxWidth: 590,
                  fontSize: 82,
                    fontWeight: 900,
                    lineHeight: 1.02,
                    color: "#181411",
                    textAlign: "right",
                  }}
                >
                  {toVisualRtl(title)}
                </div>
                <div
                  style={{
                    maxWidth: 575,
                    fontSize: 34,
                    fontWeight: 800,
                    lineHeight: 1.28,
                    color: "#5b4d42",
                    textAlign: "right",
                  }}
                >
                  {toVisualRtl(subtitle)}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {platformLabels.map((label) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 999,
                      border: "2px solid #181411",
                      background: "#fffdfa",
                      padding: "9px 14px",
                      color: "#241d18",
                      fontSize: 21,
                      fontWeight: 800,
                    }}
                  >
                    {toVisualRtl(label)}
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  borderRadius: 999,
                  background: "#ff5a2a",
                  color: "#fffdfa",
                  padding: "15px 24px",
                  fontSize: 31,
                  fontWeight: 900,
                  boxShadow: "0 12px 0 rgba(255, 90, 42, 0.22)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    background: "#fffdfa",
                    color: "#ff5a2a",
                    fontSize: 29,
                    fontWeight: 900,
                  }}
                >
                  3
                </span>
                <span>{toVisualRtl(cta)}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              width: 430,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              border: "4px solid #181411",
              borderRadius: 34,
              background: "#fffdfa",
              boxShadow: "0 18px 0 rgba(24, 20, 17, 0.16)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row-reverse",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 22px",
                background: "#181411",
                color: "#fffdfa",
              }}
            >
              <span
                style={{
                  fontSize: 27,
                  fontWeight: 900,
                }}
              >
                {toVisualRtl("מה מקבלים")}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  background: "#20d6c7",
                  color: "#102b29",
                  padding: "7px 12px",
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                {toVisualRtl("ברור")}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "18px 24px 20px",
                background: "#f8f3eb",
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {steps.map((step, index) => (
                  <div
                    key={step}
                    style={{
                      display: "flex",
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 12,
                      borderRadius: 18,
                      border: "2px solid #e2d7c8",
                      background: index === 1 ? "#e3fbf7" : "#fffdfa",
                      padding: "9px 14px",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        background: "#181411",
                        color: "#b7f36a",
                        fontSize: 18,
                        fontWeight: 900,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: "#241d18",
                      }}
                    >
                      {toVisualRtl(step)}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    color: "#a45334",
                    fontSize: 17,
                    fontWeight: 900,
                  }}
                >
                  {toVisualRtl("דוגמה לתוצאה")}
                </div>
                {replies.map((reply, index) => (
                  <div
                    key={reply}
                    style={{
                      display: "flex",
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 18,
                      background:
                        index === 0
                          ? "#fffdfa"
                          : index === 1
                            ? "#fff0ea"
                            : "#e3fbf7",
                      border: "2px solid #181411",
                      padding: "9px 14px",
                      boxShadow: "0 4px 0 rgba(24, 20, 17, 0.10)",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: "#ff5a2a",
                        color: "#fffdfa",
                        fontSize: 17,
                        fontWeight: 900,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span
                      style={{
                        color: "#241d18",
                        fontSize: 19,
                        fontWeight: 900,
                        lineHeight: 1.18,
                      }}
                    >
                      {toVisualRtl(reply)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            left: 0,
            height: 10,
            background: "#181411",
          }}
        />
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
    }
  );
}
