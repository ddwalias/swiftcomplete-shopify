import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApplyShippingAddressChange } from '@shopify/ui-extensions/checkout/preact';
import { Location } from "./type"
import { DEBOUNCE_MS, LOOKUP_ENDPOINT, LOOKUP_PARAMS, MIN_QUERY_LENGTH } from './config';
import SuggestionList from './SuggestionList';

type BannerTone = 'success' | 'critical';
type BannerState = { tone: BannerTone; message: string } | null;

function buildLookupUrl(maxResult: number, query?: string, container?: string) {
  const params = new URLSearchParams(LOOKUP_PARAMS);
  params.set('maxResults', String(maxResult));
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

function splitPrimaryTextSegments(
  text?: string | null,
): [string | undefined, string | undefined] {
  if (!text) {
    return [undefined, undefined];
  }

  const [firstSegment, ...rest] = text.split(',');
  const leading = firstSegment?.trim();
  const remainder = rest
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ');

  return [leading || undefined, remainder || undefined];
}

function isSubbuildingLocation(type?: string | null) {
  return type = 'address.residential.subbuilding.name';
}

function isBusinessLocation(type?: string | null) {
  return type = 'address.business';
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
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(
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
      setActiveSuggestionKey(null);
      setSelectedSuggestionKey(null);
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
        const res = await fetch(buildLookupUrl(5, trimmedValue), {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
        const data = (await res.json()) as Location[];
        setSuggestions(data);
        setPanelOpen(data.length > 0);
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
      setSelectedSuggestionKey(selectionKey);

      if (place.isContainer && place.container) {
        setIsSearching(true);

        try {
          const res = await fetch(
            buildLookupUrl(100, undefined, place.container),
          );

          if (!res.ok) {
            throw new Error(`Container lookup failed ${res.status}`);
          }

          const data = (await res.json()) as Location[];

          if (data.length === 0) {
            showBanner(
              'critical',
              'We couldn’t find addresses for that location. Try another suggestion.',
            );
          } else {
            setSuggestions(data);
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
          setSelectedSuggestionKey(null);
        }

        return;
      }

      const primaryText = place.primary?.text;
      let address1 = primaryText?.trim();
      if (!address1) {
        address1 = primaryText;
      }
      let address2: string | undefined;
      let company: string | undefined;

      if (isSubbuildingLocation(place.type)) {
        const [beforeComma, remainder] = splitPrimaryTextSegments(primaryText);
        address2 = beforeComma ?? address2;
        if (remainder) {
          address1 = remainder;
        }
      } else if (isBusinessLocation(place.type)) {
        const [beforeComma, remainder] = splitPrimaryTextSegments(primaryText);
        company = beforeComma ?? company;
        if (remainder) {
          address1 = remainder;
        }
      }

      const [city = '', zip = ''] = (place.secondary?.text ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

      try {
        await applyShippingAddressChange({
          type: 'updateShippingAddress',
          address: {
            address1,
            address2,
            company,
            city,
            zip,
            countryCode: place.countryCode,
          },
        });

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
    const { value } = event.currentTarget as HTMLInputElement;
    setInputValue(value ?? '');
    setActiveSuggestionKey(null);
    setSelectedSuggestionKey(null);
    clearBanner();
  };

  const handleFocus = () => setPanelOpen(suggestions.length > 0);

  const handleClear = useCallback(() => {
    setInputValue('');
    setSuggestions([]);
    setPanelOpen(false);
    setActiveSuggestionKey(null);
    setSelectedSuggestionKey(null);
    clearBanner();
  }, [clearBanner]);

  const trimmedQuery = inputValue.trim();
  const hasSuggestions = suggestions.length > 0;
  const showEmptyState =
    !isSearching && !hasSuggestions && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showClearAccessory = inputValue.length > 0;
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
          border="base"
          borderRadius="base"
          background="base"
          aria-label="Address suggestions"
        >
          <s-stack direction="block">
            <s-stack
              padding='small-200'
              direction="inline"
              gap="small-200"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">Suggested matches</s-text>
                <s-text color="subdued">
                  Found {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}
                </s-text>
              </s-stack>
              <s-clickable
                onClick={() => setPanelOpen(false)}
                accessibilityLabel="Hide suggestions"
              >
                <s-icon type="x" size="small" aria-hidden="true" />
              </s-clickable>
            </s-stack>

            {isSearching ? (
              <s-stack padding='small-200' direction="inline" gap="small-200" alignItems="center">
                <s-spinner size="base" accessibilityLabel="Searching addresses" />
                <s-text color="subdued">
                  Looking for nearby matches…
                </s-text>
              </s-stack>
            ) : (
              (() => {
                const suggestionList = (
                  <SuggestionList
                    suggestions={suggestions}
                    activeSuggestionKey={activeSuggestionKey}
                    selectedSuggestionKey={selectedSuggestionKey}
                    onSelect={handleSelectSuggestion}
                  />
                );
                const shouldClampHeight =
                  suggestions.length > 5;

                if (!shouldClampHeight) {
                  return suggestionList;
                }

                return (
                  <s-scroll-box
                    maxBlockSize="324px"
                    overflow="auto"
                  >
                    {suggestionList}
                  </s-scroll-box>
                );
              })()
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
