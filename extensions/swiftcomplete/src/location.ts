import type { Location } from './type';

export function getLocationKey({
  primary,
  secondary,
}: Pick<Location, 'primary' | 'secondary'>) {
  return `${primary.text}-${secondary.text}`;
}
