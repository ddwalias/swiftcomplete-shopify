import type {
  CountryCode,
} from '@shopify/ui-extensions/checkout';

export interface Location {
  type?: string;
  isContainer?: boolean;
  container?: string;
  primary: HighlightableText;
  secondary: HighlightableText;
  countryCode: CountryCode;
}

export interface HighlightableText {
  text: string;
  highlights: number[];
}
