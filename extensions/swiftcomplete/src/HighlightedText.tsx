function adjustHighlightsForPrefix(highlights: number[], text: string) {
  if (!text.startsWith("///")) return highlights;

  return highlights.map((value) => Math.max(0, value + 3));
}

export default function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: number[];
}) {
  const segments: Array<{ value: string; isHighlight: boolean }> = [];

  highlights = adjustHighlightsForPrefix(highlights, text);
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

  return (
    <s-stack direction="inline" gap="none">
      {segments.map((segment, index) => {
        const value = segment.value;
        const isWhitespaceOnly = value.trim().length === 0;
        let displayValue: string;

        if (isWhitespaceOnly) {
          displayValue = value.replace(/ /g, '\u00A0') || '\u00A0';
        } else {
          const leadingSpaces = value.match(/^ +/g)?.[0] ?? '';
          const trailingSpaces = value.match(/ +$/g)?.[0] ?? '';
          const middle = value.slice(
            leadingSpaces.length,
            value.length - trailingSpaces.length,
          );
          displayValue =
            `${leadingSpaces.replace(/ /g, '\u00A0')}${middle}${trailingSpaces.replace(/ /g, '\u00A0') || ''
            }` || '\u00A0';
        }

        return segment.isHighlight ? (
          <s-text key={`highlight-${index}`} type="strong">
            {displayValue}
          </s-text>
        ) : (
          <s-text key={`text-${index}`}>{displayValue}</s-text>
        );
      })}
    </s-stack>
  );
}
