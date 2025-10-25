const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

function escapeHtml(value: string) {
  return value.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_LOOKUP[char]);
}

const NBSP_ENTITY = '&nbsp;';

export default function HighlightedText({
  text,
  highlights,
  fallbackQuery,
}: {
  text: string;
  highlights?: number[];
  fallbackQuery?: string;
}) {
  const segments: Array<{ value: string; isHighlight: boolean }> = [];

  if (Array.isArray(highlights) && highlights.length >= 2) {
    let cursor = 0;
    for (let i = 0; i < highlights.length; i += 2) {
      const rawStart = highlights[i] ?? 0;
      const rawEnd = highlights[i + 1] ?? rawStart;
      const start = Math.min(Math.max(rawStart, 0), text.length);
      const endExclusive = Math.min(Math.max(rawEnd + 1, start), text.length);

      if (start > cursor) {
        segments.push({ value: text.slice(cursor, start), isHighlight: false });
      }
      if (endExclusive > start) {
        segments.push({
          value: text.slice(start, endExclusive),
          isHighlight: true,
        });
      }
      cursor = endExclusive;
    }
    if (cursor < text.length) {
      segments.push({ value: text.slice(cursor), isHighlight: false });
    }
  } else if (fallbackQuery) {
    const normalizedQuery = fallbackQuery.trim();
    if (normalizedQuery.length > 0) {
      const lowerText = text.toLowerCase();
      const lowerQuery = normalizedQuery.toLowerCase();
      const startIndex = lowerText.indexOf(lowerQuery);

      if (startIndex !== -1) {
        const endIndex = startIndex + normalizedQuery.length;
        if (startIndex > 0) {
          segments.push({ value: text.substring(0, startIndex), isHighlight: false });
        }
        segments.push({ value: text.substring(startIndex, endIndex), isHighlight: true }); if (endIndex < text.length) {
          segments.push({ value: text.substring(endIndex), isHighlight: false });
        }
      }
    }
  }

  if (segments.length === 0) {
    segments.push({ value: text, isHighlight: false });
  }

  return (
    <s-stack direction="inline" gap="none">
      {segments.map((segment, index) => {
        const safeHtmlValue =
          escapeHtml(segment.value).replace(/ /g, NBSP_ENTITY) || NBSP_ENTITY;

        if (segment.isHighlight) {
          return (
            <s-text
              key={`highlight-${index}`}
              type="strong"
              dangerouslySetInnerHTML={{ __html: safeHtmlValue }}
            />
          );
        }

        return (
          <s-text
            key={`text-${index}`}
            dangerouslySetInnerHTML={{ __html: safeHtmlValue }}
          />
        );
      })}
    </s-stack>
  );
}
