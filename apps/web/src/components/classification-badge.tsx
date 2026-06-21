'use client';

import { getClassificationLabel, getClassificationTailwindClasses, type FeedItem } from '@/lib/dashboard';

type ClassificationBadgeProps = {
  classificacao: FeedItem['classificacao'];
};

export function ClassificationBadge({ classificacao }: ClassificationBadgeProps) {
  const { bg, text } = getClassificationTailwindClasses(classificacao);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${bg} ${text}`}
      data-testid="classification-badge"
    >
      {getClassificationLabel(classificacao)}
    </span>
  );
}
