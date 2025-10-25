import HighlightedText from "./HighlightedText";
import type { Location } from "./type"

function suggestionKey({ primary, secondary }: Location) {
  return `${primary.text}-${secondary.text}`;
}

export default function SuggestionList({
  suggestions,
  activeSuggestionKey,
  onSelect,
}: {
  suggestions: Location[];
  activeSuggestionKey: string | null;
  onSelect: (suggestion: Location) => Promise<void> | void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <s-stack direction="block">
      {suggestions.map((suggestion, index) => {
        const suggestionId = suggestionKey(suggestion);
        const isActive = activeSuggestionKey === suggestionId;
        const isLast = index === suggestions.length - 1;

        return (
          <s-stack key={suggestionId} direction="block" gap='none'>
            <s-clickable
              onClick={() => {
                void onSelect(suggestion);
              }}
              accessibilityLabel={`Use address ${suggestion.primary.text}`}
            >
              <s-box
                padding='small'
                background={isActive ? 'subdued' : 'transparent'}
              >
                <s-stack direction="block">
                  <HighlightedText
                    text={suggestion.primary.text}
                    highlights={suggestion.primary.highlights}
                  />
                  <s-stack
                    direction="inline"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-text color="subdued">
                      {suggestion.secondary.text}
                    </s-text>
                    <s-stack direction="inline" alignItems="center">
                      {suggestion.isContainer && (
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <s-text color="subdued">
                            More
                          </s-text>
                          <s-icon type="chevron-right" size="small-200" aria-hidden="true" />
                        </s-stack>
                      )}
                      {isActive && (
                        <s-spinner size="small" accessibilityLabel="Applying address" />
                      )}
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-clickable>
            {!isLast && <s-divider />}
          </s-stack>
        );
      })}
    </s-stack>
  );
}
