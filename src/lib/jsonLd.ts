/**
 * Safe JSON-LD Serializer
 * Prevents HTML parser script breakout (XSS) when embedding JSON-LD schemas
 * within `<script type="application/ld+json">` tags using `dangerouslySetInnerHTML`.
 *
 * In standard HTML parsing, any occurrence of `</script>` immediately closes the script tag.
 * By escaping `<` to Unicode `\u003c`, the JSON remains 100% compliant and valid for schema
 * validators while making script breakout impossible.
 */
export function serializeJsonLd(data: unknown): string {
  if (data === null || data === undefined) return '';
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
