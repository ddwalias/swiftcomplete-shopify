/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
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
const LOOKUP_ENDPOINT = 'https://api.swiftcomplete.com/v1/swiftlookup/';
const SELECT_ENDPOINT =
  'https://ecommerce.swiftcomplete.what3words.com/api/select_address';

type BannerTone = 'success' | 'critical';
type BannerState = { tone: BannerTone; message: string } | null;

const LOOKUP_PARAMS = new URLSearchParams({
  countries: 'GB',
  maxResults: '5',
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
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    setIsSearching(true);
    clearBanner();

    void (async () => {
      try {
        const response = await fetch(buildLookupUrl(trimmedValue), {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Lookup failed with status ${response.status}`);
        }

        const data = (await response.json()) as Location[];
        const nextSuggestions = Array.isArray(data) ? data : [];
        setSuggestions(nextSuggestions);
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
        showBanner(
          'critical',
          'We couldn’t fetch address suggestions. Try again shortly.',
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    })();
    return () => abortController.abort();
  }, [inputValue, clearBanner, showBanner]);

  const handleSelectSuggestion = useCallback(
    async (place: Location) => {
      if (!applyShippingAddressChange) {
        console.error(
          'applyShippingAddressChange API is unavailable in this context.',
        );
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

        if (!data || !data.address) {
          throw new Error('Invalid data structure from place-details API');
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
          console.error('Error applying shipping address:');
          applyResult.errors.forEach(
            (error: ShippingAddressChangeFieldError) => {
              console.error(error.message);
            },
          );
          showBanner(
            'critical',
            'We couldn’t apply that address. Please choose a different option.',
          );
          return;
        }

        setSuggestions([]);
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

  const trimmedQuery = inputValue.trim();
  const hasSuggestions = suggestions.length > 0;
  const showEmptyState =
    !isSearching && !hasSuggestions && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const renderedSuggestions = useMemo(
    () =>
      suggestions.map((suggestion) => {
        const suggestionId = suggestionKey(suggestion);
        const isActive = activeSuggestionKey === suggestionId;

        return (
          <s-box
            key={suggestionId}
            padding="small"
            borderRadius="base"
            background={isActive ? 'subdued' : 'transparent'}
          >
            <s-button
              variant="secondary"
              tone="auto"
              onClick={() => {
                void handleSelectSuggestion(suggestion);
              }}
              accessibilityLabel={`Use address ${suggestion.primary.text}`}
            >
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-stack direction="block" gap="small-200">
                  <HighlightedText
                    text={suggestion.primary.text}
                    query={inputValue}
                  />
                  <s-text color="subdued">{suggestion.secondary.text}</s-text>
                </s-stack>
                {isActive && (
                  <s-spinner
                    size="base"
                    accessibilityLabel="Applying address"
                  />
                )}
              </s-stack>
            </s-button>
          </s-box>
        );
      }),
    [activeSuggestionKey, handleSelectSuggestion, inputValue, suggestions],
  );

  return (
    <s-stack direction="block" gap="base">
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

      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
        background="base"
      >
        <s-stack direction="block" gap="small">
          <s-text-field
            label="Type your address or postcode or what3words"
            value={inputValue}
            onInput={handleInput}
            icon="search"
          />

          {isSearching && (
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-spinner
                size="base"
                accessibilityLabel="Searching addresses"
              />
              <s-text color="subdued">Searching for matches…</s-text>
            </s-stack>
          )}

          {hasSuggestions && (
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Select an address</s-text>
              <s-stack direction="block" gap="small">
                {renderedSuggestions}
              </s-stack>
            </s-stack>
          )}

          {showEmptyState && (
            <s-text color="subdued">
              No matches yet. Refine your search or check the spelling.
            </s-text>
          )}
        </s-stack>
      </s-box>
    </s-stack>
  );
}

export default async () => {
  render(<AddressLookupExtension />, document.body);
};

export { };
