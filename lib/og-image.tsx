import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const OG_IMAGE_CONTENT_TYPE = "image/png";
export const OG_IMAGE_ALT = "SayBack - מה לענות עכשיו, 3 תשובות בעברית";

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
  cta = "תשובות בקליק",
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
            width: 330,
            height: "100%",
            background: "#ff5a2a",
            opacity: 0.06,
            transform: "skewX(-12deg)",
            transformOrigin: "top right",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            display: "flex",
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            alignItems: "stretch",
            gap: 46,
            padding: "62px 64px 54px",
          }}
        >
          <div
            style={{
              width: 610,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 38,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 26,
                    background: "#181411",
                    color: "#b7f36a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 46,
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
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 48,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: "#181411",
                    }}
                  >
                    {badge}
                  </span>
                  <span
                    style={{
                      fontSize: 25,
                      fontWeight: 700,
                      color: "#5b4d42",
                    }}
                  >
                    {toVisualRtl("עונים מהר ונשמעים טבעי")}
                  </span>
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
                    fontSize: 80,
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
                    fontSize: 34,
                    fontWeight: 700,
                    lineHeight: 1.28,
                    color: "#463b33",
                    textAlign: "right",
                    maxWidth: 580,
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
                gap: 18,
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
                {["וואטסאפ", "אינסטגרם", "דייטינג", "לקוחות"].map((label) => (
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
                  gap: 12,
                  borderRadius: 999,
                  background: "#ff5a2a",
                  color: "#fffdfa",
                  padding: "13px 22px",
                  fontSize: 29,
                  fontWeight: 900,
                  boxShadow: "0 10px 0 rgba(255, 90, 42, 0.24)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: "#fffdfa",
                    color: "#ff5a2a",
                    fontSize: 28,
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
              width: 420,
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
                  fontSize: 26,
                  fontWeight: 900,
                }}
              >
                {toVisualRtl("תצוגה מהירה")}
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
                LIVE
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 18,
                padding: "24px 24px 28px",
                background: "#f8f3eb",
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    color: "#7a6e64",
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {toVisualRtl("הודעה נכנסת")}
                </span>
                <div
                  style={{
                    maxWidth: 310,
                    display: "flex",
                    borderRadius: "22px 22px 6px 22px",
                    background: "#fffdfa",
                    border: "2px solid #ded2c3",
                    padding: "16px 18px",
                    color: "#241d18",
                    fontSize: 25,
                    fontWeight: 800,
                    lineHeight: 1.25,
                    textAlign: "right",
                  }}
                >
                  {toVisualRtl("היי אפשר לדבר רגע")}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    color: "#a45334",
                    fontSize: 18,
                    fontWeight: 900,
                    textAlign: "right",
                  }}
                >
                  {toVisualRtl("הצעות מוכנות")}
                </span>
                {[
                  "ברור, מה קרה",
                  "כן, אני פה",
                  "בטח, דבר איתי",
                ].map((reply, index) => (
                  <div
                    key={reply}
                    style={{
                      display: "flex",
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 18,
                      background:
                        index === 1
                          ? "#e3fbf7"
                          : index === 2
                            ? "#fff0ea"
                            : "#fffdfa",
                      border: "2px solid #181411",
                      padding: "12px 14px",
                      boxShadow: "0 4px 0 rgba(24, 20, 17, 0.10)",
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
                        color: "#241d18",
                        fontSize: 22,
                        fontWeight: 900,
                        lineHeight: 1.18,
                      }}
                    >
                      {toVisualRtl(reply)}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  borderRadius: 999,
                  border: "2px solid #b8e7df",
                  background: "#e3fbf7",
                  color: "#123a36",
                  padding: "11px 16px",
                  fontSize: 22,
                  fontWeight: 900,
                  marginTop: 2,
                }}
              >
                {toVisualRtl("קצר טבעי ומוכן לשליחה")}
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
            opacity: 0.96,
          }}
        />
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
    }
  );
}
