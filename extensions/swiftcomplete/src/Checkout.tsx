/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApplyShippingAddressChange } from '@shopify/ui-extensions/checkout/preact';
import type {
  CountryCode,
} from '@shopify/ui-extensions/checkout';

type TextFieldElement = HTMLElement & { value?: string };

interface HighlightableText {
  text: string;
  highlights: number[];
}

interface Location {
  type?: string;
  isContainer?: boolean;
  container?: string;
  primary: HighlightableText;
  secondary: HighlightableText;
  countryCode: CountryCode;
}

function HighlightedText({
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
        const value = segment.value;
        const leadingSpaces = value.match(/^ +/g)?.[0] ?? '';
        const trailingSpaces = value.match(/ +$/g)?.[0] ?? '';
        const middle = value.slice(leadingSpaces.length, value.length - trailingSpaces.length);
        const displayValue = `${leadingSpaces.replace(/ /g, '\u00A0')}${middle.length > 0 ? middle : ''
          }${trailingSpaces.replace(/ /g, '\u00A0') || ''}` || '\u00A0';

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

const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;
const DEBOUNCE_MS = 250;

const LOOKUP_ENDPOINT = 'https://api.swiftcomplete.com/v1/swiftlookup/';

type BannerTone = 'success' | 'critical';
type BannerState = { tone: BannerTone; message: string } | null;

const LOOKUP_PARAMS = new URLSearchParams({
  countries: 'GB',
  maxResults: String(MAX_RESULTS),
  origin: 'swiftcomplete-store.myshopify.com',
  key: '1564a0e7-5eea-4aaf-8a31-39ed0c62698d',
  searchFor: 'what3words,address',
});

function buildLookupUrl(query?: string, container?: string) {
  const params = new URLSearchParams(LOOKUP_PARAMS);
  if (query) {
    params.set('text', query);
  }
  if (container) {
    params.set('container', container);
  }
  return `${LOOKUP_ENDPOINT}?${params.toString()}`;
}

function suggestionKey({ primary, secondary }: Location) {
  return `${primary.text}-${secondary.text}`;
}

function AddressLookupExtension() {
  const applyShippingAddressChange = useApplyShippingAddressChange();

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusBanner, setStatusBanner] = useState<BannerState>(null);
  const [activeSuggestionKey, setActiveSuggestionKey] = useState<string | null>(
    null,
  );
  const [panelOpen, setPanelOpen] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef('');

  const showBanner = useCallback(
    (tone: BannerTone, message: string) => {
      setStatusBanner({ tone, message });
    },
    [],
  );
  const clearBanner = useCallback(() => setStatusBanner(null), []);

  useEffect(() => {
    const trimmedValue = inputValue.trim();

    if (trimmedValue.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setPanelOpen(false);
      setIsSearching(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    setIsSearching(true);
    clearBanner();
    lastQueryRef.current = trimmedValue;

    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(buildLookupUrl(trimmedValue), {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
        const data = (await res.json()) as Location[];
        const next = Array.isArray(data) ? data.slice(0, MAX_RESULTS) : [];
        setSuggestions(next);
        setPanelOpen(next.length > 0);
      } catch (err) {
        if (abortRef.current?.signal.aborted) return;
        console.error('Lookup error', err);
        setSuggestions([]);
        setPanelOpen(false);
        showBanner('critical', 'We couldn’t fetch address suggestions. Try again shortly.');
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };


  }, [inputValue, clearBanner, showBanner]);

  const handleSelectSuggestion = useCallback(
    async (place: Location) => {
      if (!applyShippingAddressChange) {
        showBanner('critical', 'Address updates are not available right now.');
        return;
      }

      const selectionKey = suggestionKey(place);
      setActiveSuggestionKey(selectionKey);

      if (place.isContainer && place.container) {
        setIsSearching(true);

        try {
          const res = await fetch(
            buildLookupUrl(undefined, place.container),
          );

          if (!res.ok) {
            throw new Error(`Container lookup failed ${res.status}`);
          }

          const data = (await res.json()) as Location[];
          const next = Array.isArray(data) ? data.slice(0, MAX_RESULTS) : [];

          if (next.length === 0) {
            showBanner(
              'critical',
              'We couldn’t find addresses for that location. Try another suggestion.',
            );
          } else {
            setSuggestions(next);
            setPanelOpen(true);
          }
        } catch (error) {
          console.error('Container expansion failed', error);
          showBanner(
            'critical',
            'We couldn’t expand that result. Please try a different option.',
          );
        } finally {
          setIsSearching(false);
          setActiveSuggestionKey(null);
        }

        return;
      }

      var apt = undefined;
      var address = place.primary?.text ?? undefined;
      var company = undefined;

      if (place.type === 'address.residential.subbuilding.name') {
        [apt, address] = (place.primary?.text ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
      }

      if (place.type === 'address.business') {
        [company, address] = (place.primary?.text ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
      }

      const [city = '', zip = ''] = (place.secondary?.text ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

      try {
        await applyShippingAddressChange({
          type: 'updateShippingAddress',
          address: {
            address1: address,
            address2: apt,
            company,
            city,
            zip,
            countryCode: place.countryCode,
          },
        });

        setSuggestions([]);
        setPanelOpen(false);
        setInputValue('');
        showBanner('success', 'Address applied to the checkout.');
      } catch (error: unknown) {
        console.error('Error applying suggestion to checkout:', error);
        showBanner(
          'critical',
          'Something went wrong while applying the address. Please try again.',
        );
      } finally {
        setActiveSuggestionKey(null);
      }
    },
    [applyShippingAddressChange, clearBanner, showBanner],
  );

  const handleInput = (event: Event) => {
    const { value } = event.currentTarget as TextFieldElement;
    setInputValue(value ?? '');
    clearBanner();
  };

  const handleFocus = () => setPanelOpen(suggestions.length > 0);

  const handleClear = useCallback(() => {
    setInputValue('');
    setSuggestions([]);
    setPanelOpen(false);
    setActiveSuggestionKey(null);
    clearBanner();
  }, [clearBanner]);

  const trimmedQuery = inputValue.trim();
  const highlightQuery = trimmedQuery.length > 0 ? trimmedQuery : inputValue;
  const hasSuggestions = suggestions.length > 0;
  const showEmptyState =
    !isSearching && !hasSuggestions && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showClearAccessory = inputValue.length > 0;
  const renderedSuggestions = useMemo(
    () =>
      suggestions.map((suggestion, index) => {
        const suggestionId = suggestionKey(suggestion);
        const isActive = activeSuggestionKey === suggestionId;
        const isLast = index === suggestions.length - 1;

        return (
          <s-stack key={suggestionId} direction="block" gap="small-100">
            <s-clickable
              onClick={() => {
                void handleSelectSuggestion(suggestion);
              }}
              accessibilityLabel={`Use address ${suggestion.primary.text}`}
            >
              <s-box
                paddingInline="small-100"
                paddingBlock="none"
                borderRadius="base"
                background={isActive ? 'subdued' : 'transparent'}
              >
                <s-stack direction="block" gap="none">
                  <HighlightedText
                    text={suggestion.primary.text}
                    highlights={suggestion.primary.highlights}
                    fallbackQuery={highlightQuery}
                  />
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-text color="subdued">
                      {suggestion.secondary.text}
                    </s-text>
                    {isActive && (
                      <s-spinner size="small" accessibilityLabel="Applying address" />
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            </s-clickable>
            {!isLast && <s-divider />}
          </s-stack>
        );
      }),
    [activeSuggestionKey, handleSelectSuggestion, highlightQuery, suggestions],
  );

  return (
    <s-stack direction="block" gap="small">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">Swiftcomplete lookup</s-text>
      </s-stack>

      {statusBanner && (
        <s-banner
          tone={statusBanner.tone}
          heading={
            statusBanner.tone === 'success'
              ? 'Address updated'
              : 'Address lookup unavailable'
          }
          dismissible
          onDismiss={clearBanner}
        >
          <s-text>{statusBanner.message}</s-text>
        </s-banner>
      )}

      <s-stack direction="block" gap="small-200">
        <s-text-field
          label="Type your address, postcode, or what3words"
          value={inputValue}
          onInput={handleInput}
          onFocus={handleFocus}
          icon="search"
        >
          {showClearAccessory && (
            <s-clickable
              slot="accessory"
              onClick={handleClear}
              accessibilityLabel="Clear address search"
            >
              <s-icon type="x" size="small" aria-hidden="true" />
            </s-clickable>
          )}
        </s-text-field>
        {isSearching && !panelOpen && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-spinner size="base" accessibilityLabel="Searching addresses" />
            <s-text color="subdued">
              Searching for matches…
            </s-text>
          </s-stack>
        )}
      </s-stack>

      {panelOpen && (
        <s-box
          padding="small"
          border="base"
          borderRadius="base"
          background="base"
          aria-label="Address suggestions"
        >
          <s-stack direction="block" gap="small-200">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text type="strong">Suggested matches</s-text>
              <s-text color="subdued">
                Found {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}
              </s-text>
              <s-clickable
                onClick={() => setPanelOpen(false)}
                accessibilityLabel="Hide suggestions"
              >
                <s-text color="subdued">
                  Hide
                </s-text>
              </s-clickable>
            </s-stack>

            {isSearching ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-spinner size="base" accessibilityLabel="Searching addresses" />
                <s-text color="subdued">
                  Looking for nearby matches…
                </s-text>
              </s-stack>
            ) : (
              <s-stack direction="block" gap="small-200">
                {renderedSuggestions}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      )}

      {!panelOpen && showEmptyState && (
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">No matches yet</s-text>
          <s-text color="subdued">
            Add a street name or confirm the spelling to try again.
          </s-text>
        </s-stack>
      )}
    </s-stack>
  );
}

export default async () => {
  render(<AddressLookupExtension />, document.body);
};

export { };
