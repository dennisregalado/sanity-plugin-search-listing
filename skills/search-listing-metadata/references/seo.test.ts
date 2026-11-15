import { describe, expect, test } from 'vitest';
import { firstImage, firstText, hasImage, sizeImageUrl, toDescription } from './seo';

describe('firstText', () => {
	test('returns the first value with text, as plain text', () => {
		expect(firstText(null, '  ', '<p>Hand-thrown&nbsp;vase</p>', 'later')).toBe('Hand-thrown vase');
		expect(firstText(undefined, '')).toBeUndefined();
	});
});

describe('toDescription', () => {
	test('clips long copy at a word boundary', () => {
		const description = toDescription('word '.repeat(60))!;
		expect(description.length).toBeLessThanOrEqual(160);
		expect(description.endsWith('word…')).toBe(true);
	});

	test('leaves short copy alone', () => {
		expect(toDescription('<p>Short</p>')).toBe('Short');
	});
});

describe('firstImage', () => {
	const sanityImage = { _type: 'image', asset: { _ref: 'image-a-1x1-png' } };
	const shopifyImage = { url: 'https://cdn.shopify.com/a.jpg', altText: 'Vase' };

	test('skips empty images, such as one with only a _type', () => {
		expect(firstImage({ _type: 'image' }, null, shopifyImage)).toBe(shopifyImage);
		expect(firstImage(sanityImage, shopifyImage)).toBe(sanityImage);
		expect(hasImage({ url: '' })).toBe(false);
	});
});

describe('sizeImageUrl', () => {
	test('crops Shopify images to the sharing size', () => {
		expect(sizeImageUrl('https://cdn.shopify.com/a.jpg?v=1')).toBe(
			'https://cdn.shopify.com/a.jpg?v=1&width=1200&height=630&crop=center'
		);
		expect(sizeImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
	});
});
