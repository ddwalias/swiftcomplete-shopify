/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  useApi,
  useApplyShippingAddressChange,
} from '@shopify/ui-extensions/checkout/preact';
import type {
  CountryCode,
  ShippingAddress,
  ShippingAddressChangeFieldError,
} from '@shopify/ui-extensions/checkout';

type TextFieldElement = HTMLElement & { value?: string };

/**
 * Represents a highlightable text object with primary and secondary text components.
 */
interface HighlightableText {
  text: string;
  highlights: number[];
}

/**
 * Defines the possible types for a location.
 */
type LocationType =
  | "address.residential.building.name"
  | "road.namedroad";

/**
 * Represents a geographical location with various details.
 */
interface Location {
  primary: HighlightableText;
  secondary: HighlightableText;
  type: LocationType;
  isContainer: boolean;
  container?: string;
  countryCode: "GB";
}

/**
 * Represents a physical address.
 */
interface Address {
  address1: string;
  address2: string;
  company: string;
  city: string;
  zip: string;
  provinceCode: string;
  what3words: string;
  countryCode: string;
}

/**
 * Represents the root object containing the address.
 */
interface AddressPayload {
  address: Address;
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
    // Using s-inline-stack ensures parts of the text render on the same line.
    <s-stack gap="none">
      {before && <s-text>{before}</s-text>}
      <s-text type="strong">{highlighted}</s-text>
      {after && <s-text>{after}</s-text>}
    </s-stack>
  );
}

function AddressLookupExtension() {
  const { query } = useApi();
  const applyShippingAddressChange = useApplyShippingAddressChange();

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Location[]>([]);

  useEffect(() => {
    if (inputValue.length < 3) {
      setSuggestions([]);
      return;
    }

    const fetchUrl = `https://api.swiftcomplete.com/v1/swiftlookup/?text=${encodeURIComponent(inputValue)}&countries=GB&maxResults=5&origin=swiftcomplete-store.myshopify.com&key=1564a0e7-5eea-4aaf-8a31-39ed0c62698d&searchFor=what3words%2Caddress`
    void (async () => {
      try {
        const response = await fetch(fetchUrl);
        const data = await response.json() as Location[];

        if (data) {
          setSuggestions(data);
        }
      } catch (error: unknown) {
        console.error('Error fetching suggestions:', error);
      }
    })();
  }, [inputValue, query]);

  const handleSelectSuggestion = async (text: string, place: Location) => {
    if (!applyShippingAddressChange) {
      console.error('applyShippingAddressChange API is unavailable in this context.');
      return;
    }

    const detailsUrl = `https://ecommerce.swiftcomplete.what3words.com/api/select_address`;

    try {
      const response = await fetch(detailsUrl, {
        method: 'POST',
        body: JSON.stringify({ text: text, countries: place.countryCode, maxResults: 5, lineFormat1: "AddressLine1", lineFormat2: "SubBuilding", lineFormat3: "TertiaryLocality, SecondaryLocality, PrimaryLocality", lineFormat4: "PrimaryLocality", lineFormat5: "POSTCODE", lineFormat6: "PrimaryCountry", lineFormat7: "what3words", populateIndex: 0 }),
      });
      const data = await response.json() as AddressPayload;

      if (!data || !data.address) {
        throw new Error('Invalid data structure from place-details API');
      }

      const result = data.address;

      const address: ShippingAddress = {
        address1: result.address1,
        address2: result.address2,
        company: result.company,
        city: result.city,
        zip: result.zip,
        countryCode: result.countryCode as CountryCode,
      };

      const applyResult = await applyShippingAddressChange({
        type: 'updateShippingAddress',
        address,
      });

      if (applyResult.type === 'error') {
        console.error('Error applying shipping address:');
        applyResult.errors.forEach((error: ShippingAddressChangeFieldError) => {
          console.error(error.message);
        });
      }

      setSuggestions([]);
      setInputValue('');
    } catch (error: unknown) {
      console.error('Error fetching or processing place details:', error);
    }
  };

  const handleInput = (event: Event) => {
    const { value } = event.currentTarget as TextFieldElement;
    setInputValue(value ?? '');
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text-field
        label="Address Search"
        value={inputValue}
        onInput={handleInput}
      />
      {suggestions.length > 0 && (
        <s>
          {suggestions.map((suggestion) => (
            <s-list-item
              key={`${suggestion.primary.text}-${suggestion.secondary.text}`}
              onClick={() => {
                void handleSelectSuggestion(suggestion);
              }}
            >
              <s-stack gap="xtight">
                <HighlightedText text={suggestion.primary.text} query={inputValue} />
                <s-text>, {suggestion.secondary.text}</s-text>
              </s-stack>
            </s-list-item>
          ))}
        </s>
      )}
    </s-stack>
  );
}

export default async () => {
  render(<AddressLookupExtension />, document.body)
};


export { };
