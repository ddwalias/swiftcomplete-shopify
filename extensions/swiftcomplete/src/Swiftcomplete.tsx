import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals'
import { useApplyShippingAddressChange } from '@shopify/ui-extensions/checkout/preact';
import { Location } from './type';
import { getLocationKey } from './location';
import {
  DEBOUNCE_MS,
  LOOKUP_ENDPOINT,
  LOOKUP_PARAMS,
  MIN_QUERY_LENGTH,
} from './config';
import SuggestionList from './SuggestionList';

type BannerTone = 'success' | 'critical';
type BannerState = { tone: BannerTone; message: string } | null;

type SelectionState =
  | { status: 'idle'; key: null }
  | { status: 'pending' | 'settled'; key: string };

function createSelectionState(): SelectionState {
  return { status: 'idle', key: null };
}

type LookupParams = {
  maxResults?: number;
  query?: string;
  container?: string;
};

function buildLookupUrl({
  maxResults = 5,
  query,
  container,
}: LookupParams = {}) {
  const params = new URLSearchParams(LOOKUP_PARAMS);
  params.set('maxResults', String(maxResults));
  if (query) {
    params.set('text', query);
  }
  if (container) {
    params.set('container', container);
  }
  return `${LOOKUP_ENDPOINT}?${params.toString()}`;
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
  return type === 'address.residential.subbuilding.name';
}

function isBusinessLocation(type?: string | null) {
  return type === 'address.business';
}

function Swiftcomplete() {
  const applyShippingAddressChange = useApplyShippingAddressChange();

  const inputValue = useSignal('');
  const suggestions = useSignal<Location[]>([]);
  const isSearching = useSignal(false);
  const statusBanner = useSignal<BannerState | null>(null);
  const selectionState = useSignal<SelectionState>(
    createSelectionState(),
  );
  const panelOpen = useSignal(false);

  const abortRef = useRef<AbortController | null>(null);

  const showBanner = (tone: BannerTone, message: string) => { statusBanner.value = { tone, message }; };
  const clearBanner = () => statusBanner.value = null;

  const resetSelectionState = () => selectionState.value = createSelectionState();

  useSignalEffect(() => {
    const trimmedValue = inputValue.value.trim();
    let disposed = false;
    abortRef.current?.abort();
    abortRef.current = null;

    if (trimmedValue.length < MIN_QUERY_LENGTH) {
      suggestions.value = [];
      panelOpen.value = false;
      isSearching.value = false;
      resetSelectionState();
      return;
    }

    isSearching.value = true;
    clearBanner();

    const timeoutId = setTimeout(async () => {
      if (disposed) return;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(buildLookupUrl({ query: trimmedValue }), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
        const data = (await res.json()) as Location[];
        if (disposed || controller.signal.aborted) {
          return;
        }
        suggestions.value = data;
        panelOpen.value = data.length > 0;
      } catch (err) {
        if (disposed || controller.signal.aborted) {
          return;
        }

        console.error('Lookup error', err);
        suggestions.value = [];
        panelOpen.value = false;
        showBanner('critical', 'We couldn’t fetch address suggestions. Try again shortly.');
      } finally {
        if (!disposed && abortRef.current === controller) {
          isSearching.value = false;
          abortRef.current = null;
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      disposed = true;
      clearTimeout(timeoutId)
      abortRef.current?.abort();
      abortRef.current = null;
    };
  });

  const handleSelectSuggestion =
    async (place: Location) => {
      if (!applyShippingAddressChange) {
        showBanner('critical', 'Address updates are not available right now.');
        return;
      }

      const selectionKey = getLocationKey(place);
      selectionState.value = { status: 'pending', key: selectionKey };

      if (place.isContainer && place.container) {
        isSearching.value = true;

        try {
          const res = await fetch(
            buildLookupUrl({ maxResults: 100, container: place.container }),
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
            suggestions.value = data;
            panelOpen.value = true;
          }
        } catch (error) {
          console.error('Container expansion failed', error);
          showBanner(
            'critical',
            'We couldn’t expand that result. Please try a different option.',
          );
        } finally {
          isSearching.value = false;
          resetSelectionState();
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
        selectionState.value = { status: 'settled', key: selectionKey };
      }
    };

  const handleInput = (event: Event) => {
    const { value } = event.currentTarget as HTMLInputElement;
    inputValue.value = value;
    resetSelectionState();
    clearBanner();
  };

  const handleFocus = () => panelOpen.value = suggestions.value.length > 0;

  const handleClear = () => {
    inputValue.value = '';
    suggestions.value = [];
    panelOpen.value = false;
    resetSelectionState();
    clearBanner();
  };

  const activeSuggestionKey =
    selectionState.value.status === 'pending' ? selectionState.value.key : null;
  const selectedSuggestionKey =
    selectionState.value.status === 'idle' ? null : selectionState.value.key;

  const trimmedQuery = inputValue.value.trim();
  const hasSuggestions = suggestions.value.length > 0;
  const showEmptyState =
    !isSearching.value && !hasSuggestions && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showClearAccessory = inputValue.value.length > 0;
  return (
    <s-stack direction="block" gap="small">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">Swiftcomplete lookup</s-text>
      </s-stack>

      {statusBanner.value && (
        <s-banner
          tone={statusBanner.value.tone}
          heading={
            statusBanner.value.tone === 'success'
              ? 'Address updated'
              : 'Address lookup unavailable'
          }
          dismissible
          onDismiss={clearBanner}
        >
          <s-text>{statusBanner.value.message}</s-text>
        </s-banner>
      )}

      <s-stack direction="block" gap="small-200">
        <s-text-field
          label="Type your address, postcode, or what3words"
          value={inputValue.value}
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
        {isSearching.value && !panelOpen.value && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-spinner size="base" accessibilityLabel="Searching addresses" />
            <s-text color="subdued">
              Searching for matches…
            </s-text>
          </s-stack>
        )}
      </s-stack>

      {panelOpen.value && (
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
                  Found {suggestions.value.length} result{suggestions.value.length !== 1 ? 's' : ''}
                </s-text>
              </s-stack>
              <s-clickable
                onClick={() => panelOpen.value = false}
                accessibilityLabel="Hide suggestions"
              >
                <s-icon type="x" size="small" aria-hidden="true" />
              </s-clickable>
            </s-stack>

            {isSearching.value ? (
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
                    suggestions={suggestions.value}
                    activeSuggestionKey={activeSuggestionKey}
                    selectedSuggestionKey={selectedSuggestionKey}
                    onSelect={handleSelectSuggestion}
                  />
                );
                const shouldClampHeight =
                  suggestions.value.length > 5;

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

      {!panelOpen.value && showEmptyState && (
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
  render(<Swiftcomplete />, document.body);
};
