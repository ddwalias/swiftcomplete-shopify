/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApplyShippingAddressChange } from '@shopify/ui-extensions/checkout/preact';
import type {
  CountryCode,
  ShippingAddressChangeFieldError,
} from '@shopify/ui-extensions/checkout';

type TextFieldElement = HTMLElement & { value?: string };

interface HighlightableText {
  text: string;
  highlights: number[];
}

interface Location {
  primary: HighlightableText;
  secondary: HighlightableText;
  countryCode: CountryCode;
}

/**
 * Represents a physical address.
 */
interface AddressPayload {
  address?: {
    address1: string;
    address2: string;
    company: string;
    city: string;
    zip: string;
    countryCode: CountryCode;
  };
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const startIndex = lowerText.indexOf(lowerQuery);

  if (startIndex === -1) {
    return <s-text>{text}</s-text>;
  }

  const endIndex = startIndex + query.length;
  const before = text.substring(0, startIndex);
  const highlighted = text.substring(startIndex, endIndex);
  const after = text.substring(endIndex);

  return (
    <s-stack direction="inline" gap="none">
      {before && <s-text>{before}</s-text>}
      <s-text type="strong">{highlighted}</s-text>
      {after && <s-text>{after}</s-text>}
    </s-stack>
  );
}

const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;
const DEBOUNCE_MS = 250;

const LOOKUP_ENDPOINT = 'https://api.swiftcomplete.com/v1/swiftlookup/';
const SELECT_ENDPOINT =
  'https://ecommerce.swiftcomplete.what3words.com/api/select_address';

type BannerTone = 'success' | 'critical';
type BannerState = { tone: BannerTone; message: string } | null;

const LOOKUP_PARAMS = new URLSearchParams({
  countries: 'GB',
  maxResults: String(MAX_RESULTS),
  origin: 'swiftcomplete-store.myshopify.com',
  key: '1564a0e7-5eea-4aaf-8a31-39ed0c62698d',
  searchFor: 'what3words,address',
});

const SELECT_PAYLOAD = {
  maxResults: 5,
  lineFormat1: 'AddressLine1',
  lineFormat2: 'SubBuilding',
  lineFormat3: 'TertiaryLocality, SecondaryLocality, PrimaryLocality',
  lineFormat4: 'PrimaryLocality',
  lineFormat5: 'POSTCODE',
  lineFormat6: 'PrimaryCountry',
  lineFormat7: 'what3words',
  populateIndex: 0,
} as const;

function buildLookupUrl(query: string) {
  const params = new URLSearchParams(LOOKUP_PARAMS);
  params.set('text', query);
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

    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(buildLookupUrl(trimmedValue), { signal: abortRef.current.signal });
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
      clearBanner();

      try {
        const response = await fetch(SELECT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...SELECT_PAYLOAD,
            text: place.primary.text,
            countries: place.countryCode,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Select address failed with status ${response.status}`,
          );
        }

        const data = (await response.json()) as AddressPayload;

        if (!data?.address) {
          throw new Error('Invalid select payload');
        }

        const {
          address1,
          address2,
          company,
          city,
          zip,
          countryCode,
        } = data.address;

        const applyResult = await applyShippingAddressChange({
          type: 'updateShippingAddress',
          address: {
            address1,
            address2,
            company,
            city,
            zip,
            countryCode,
          },
        });

        if (applyResult.type === 'error') {
          showBanner(
            'critical',
            'We couldn’t apply that address. Please choose a different option.',
          );
          return;
        }

        setSuggestions([]);
        setPanelOpen(false);
        setInputValue('');
        showBanner('success', 'Address applied to the checkout.');
      } catch (error: unknown) {
        console.error('Error fetching or processing place details:', error);
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
  const handleBlur = () => {
    // small timeout so clicks on items still register
    setTimeout(() => setPanelOpen(false), 80);
  };

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
  const renderedSuggestions = useMemo(
    () =>
      suggestions.map((suggestion, index) => {
        const suggestionId = suggestionKey(suggestion);
        const isActive = activeSuggestionKey === suggestionId;
        const threeWordAddress = suggestion.primary.text.startsWith('///')
          ? suggestion.primary.text.split(' ')[0]
          : null;
        const isLast = index === suggestions.length - 1;

        return (
          <s-stack key={suggestionId} direction="block" gap="extra-tight">
            <s-clickable
              onClick={() => {
                void handleSelectSuggestion(suggestion);
              }}
              accessibilityLabel={`Use address ${suggestion.primary.text}`}
            >
              <s-box
                paddingInline="small"
                paddingBlock="extra-tight"
                borderRadius="base"
                background={isActive ? 'subdued' : 'transparent'}
              >
                <s-stack direction="block" gap="extra-tight">
                  <HighlightedText text={suggestion.primary.text} query={highlightQuery} />
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text size="small" color="subdued">
                      {suggestion.secondary.text}
                    </s-text>
                    {threeWordAddress && (
                      <s-text size="small" color="subdued">
                        {threeWordAddress}
                      </s-text>
                    )}
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
      <s-stack direction="block" gap="extra-tight">
        <s-text type="strong">Swiftcomplete lookup</s-text>
        <s-text size="small" color="subdued">
          Find the right address without leaving checkout.
        </s-text>
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

      <s-stack direction="block" gap="extra-tight">
        <s-text-field
          inlineSize="fill"
          label="Type your address, postcode, or what3words"
          value={inputValue}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          icon="search"
        />
        <s-stack
          direction="inline"
          gap="small-200"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text size="small" color="subdued">
            Tip: add a building number, postcode, or ///what3words for faster matches.
          </s-text>
          {!!inputValue && (
            <s-clickable
              onClick={handleClear}
              accessibilityLabel="Clear address search"
            >
              <s-text size="small" color="subdued">
                Clear
              </s-text>
            </s-clickable>
          )}
        </s-stack>
        {isSearching && !panelOpen && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-spinner size="base" accessibilityLabel="Searching addresses" />
            <s-text size="small" color="subdued">
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
              <s-text size="small" color="subdued">
                {suggestions.length}/{MAX_RESULTS}
              </s-text>
              <s-clickable
                onClick={() => setPanelOpen(false)}
                accessibilityLabel="Hide suggestions"
              >
                <s-text size="small" color="subdued">
                  Hide
                </s-text>
              </s-clickable>
            </s-stack>

            {isSearching ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-spinner size="base" accessibilityLabel="Searching addresses" />
                <s-text size="small" color="subdued">
                  Looking for nearby matches…
                </s-text>
              </s-stack>
            ) : (
              <s-stack direction="block" gap="extra-tight">
                {renderedSuggestions}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      )}

      {!panelOpen && showEmptyState && (
        <s-stack direction="block" gap="extra-tight">
          <s-text type="strong">No matches yet</s-text>
          <s-text size="small" color="subdued">
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
