import {
  createSayBackOgImage,
  OG_IMAGE_ALT,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
} from "@/lib/og-image";

export const alt = OG_IMAGE_ALT;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function TwitterImage() {
  return createSayBackOgImage({
    title: "מה לענות עכשיו",
    subtitle: "הופכים כל הודעה לשלוש תשובות קצרות וטבעיות בעברית",
  });
}
