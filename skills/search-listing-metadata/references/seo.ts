/**
 * Page metadata, resolved with the same fallbacks the Studio's search listing preview shows
 * (`sanity-plugin-search-listing`). Each route resolves its own metadata with these helpers;
 * the head component fills any gap from the site-wide listing (e.g. a settings document).
 */

/** A Sanity image (resolved with `urlFor`) or an image URL, such as a Shopify CDN image. */
export type SeoImage = Record<string, unknown> | { url: string; altText?: string | null };

export type SeoMetadata = {
	title?: string;
	description?: string;
	image?: SeoImage;
};

type Maybe<T> = T | null | undefined;

export const SEO_DESCRIPTION_LENGTH = 160;

/** The first value with content: fields in their fallback order. */
export function firstText(...values: Maybe<string>[]): string | undefined {
	for (const value of values) {
		const text = typeof value === 'string' ? toPlainText(value) : '';
		if (text) return text;
	}
	return undefined;
}

export function firstImage(...values: Maybe<SeoImage>[]): SeoImage | undefined {
	return values.find(hasImage) ?? undefined;
}

/** Plain text for a meta description: tags removed, whitespace collapsed, clipped at a word. */
export function toDescription(value: Maybe<string>, length = SEO_DESCRIPTION_LENGTH) {
	const text = firstText(value);
	if (!text || text.length <= length) return text;
	const clipped = text.slice(0, length - 1);
	return `${clipped.slice(0, clipped.lastIndexOf(' ') > 0 ? clipped.lastIndexOf(' ') : clipped.length)}…`;
}

export function hasImage(value: Maybe<SeoImage>): value is SeoImage {
	if (!value || typeof value !== 'object') return false;
	if (typeof value.url === 'string') return value.url.length > 0;
	return Boolean((value as { asset?: unknown }).asset);
}

/** A Shopify CDN URL cropped to the 1200×630 sharing size; other URLs are left alone. */
export function sizeImageUrl(url: string) {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== 'cdn.shopify.com') return url;
		parsed.searchParams.set('width', '1200');
		parsed.searchParams.set('height', '630');
		parsed.searchParams.set('crop', 'center');
		return parsed.href;
	} catch {
		return url;
	}
}

function toPlainText(value: string) {
	return value
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
}
