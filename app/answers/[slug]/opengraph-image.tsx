import {
  createSayBackOgImage,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
} from "@/lib/og-image";
import { getSeoAnswerPageBySlug } from "@/lib/seo-answer-pages";

export const alt = 'SayBack - מדריך תשובות';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

type RouteParams = {
  slug: string;
};

export default async function AnswerOpenGraphImage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const answerPage = getSeoAnswerPageBySlug(slug);

  if (!answerPage) {
    return createSayBackOgImage({
      title: 'מה לענות להודעות',
      subtitle: '3 ניסוחים קצרים וטבעיים בעברית',
      cta: 'SayBack Answers',
    });
  }

  return createSayBackOgImage({
    title: answerPage.query,
    subtitle: answerPage.teaser,
    cta: 'לצפייה בתשובות + FAQ',
  });
}
