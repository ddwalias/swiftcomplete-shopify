import type { CountryCode } from '@shopify/ui-extensions/checkout';

export interface Location {
  type?: string | null;
  container?: string;
  primary: HighlightableText;
  secondary: Text;
  countryCode: CountryCode;
  populatedRecord?: PopulatedRecord;
}

export interface HighlightableText extends Text {
  highlights: number[];
}

export interface Text {
  text: string;
}

export interface PopulatedRecord {
  data: PopulatedRecordData;
}

export interface PopulatedRecordData {
  postalCode: PopulatedPostalCode | null;
  business: PopulatedBusiness | null;
  subBuilding: PopulatedSubbuilding | null;
  building: PopulatedBuilding | null;
  road: PopulatedRoad | null;
  place: PopulatedPlace | null;
  poBox: PopulatedPoBox | null;
}

export interface PopulatedPostalCode extends PopulatedText { }

export interface PopulatedBusiness {
  name: PopulatedText | null;
}

export interface PopulatedBuilding {
  name: PopulatedText | null;
  number: PopulatedText | null;
}

export interface PopulatedSubbuilding {
  name: PopulatedText | null;
}

export interface PopulatedRoad {
  primary?: PopulatedText | null;
}

export interface PopulatedPlace {
  primary: PopulatedText | null;
}

export interface PopulatedNamedCode extends PopulatedText {
  code?: string | null;
}

export interface PopulatedPoBox {
  name: PopulatedText | null;
}

export interface PopulatedText extends Text { }
