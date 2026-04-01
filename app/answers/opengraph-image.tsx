import {
  createSayBackOgImage,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
} from "@/lib/og-image";

export const alt = 'מה לענות ל... | SayBack';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function OpenGraphImage() {
  return createSayBackOgImage({
    title: 'מה לענות ל...',
    subtitle: 'קראש/אקס · לקוח/בוס · יד2 · יומיומי/דייטינג',
    cta: '3 תשובות + FAQ',
  });
}
