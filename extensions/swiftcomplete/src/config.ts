export const MIN_QUERY_LENGTH = 3;
export const DEBOUNCE_MS = 250;

export const LOOKUP_ENDPOINT = 'https://api.swiftcomplete.com/v1/swiftlookup/';

export const LOOKUP_PARAMS = new URLSearchParams({
  countries: 'GB',
  origin: 'swiftcomplete-store.myshopify.com',
  key: '1564a0e7-5eea-4aaf-8a31-39ed0c62698d',
  searchFor: 'what3words,address',
});

