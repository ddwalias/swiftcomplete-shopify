import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Swiftcomplete.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/type.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/location.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/config.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/SuggestionList.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/HighlightedText.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}
