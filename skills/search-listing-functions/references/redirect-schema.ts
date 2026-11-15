// The `redirect` document type auto-redirect writes. Paths start with `/`.
import { defineField, defineType } from 'sanity';

export const redirect = defineType({
	name: 'redirect',
	title: 'URL redirect',
	type: 'document',
	fields: [
		defineField({
			name: 'source',
			title: 'Redirect from',
			type: 'slug',
			validation: (rule) =>
				rule.required().custom((value) =>
					value?.current?.startsWith('/') ? true : 'Start the path with /'
				)
		}),
		defineField({
			name: 'destination',
			title: 'Redirect to',
			type: 'slug',
			validation: (rule) => rule.required()
		}),
		defineField({
			name: 'permanent',
			title: 'Permanent redirect',
			type: 'boolean',
			initialValue: true
		})
	],
	preview: {
		select: { title: 'source.current', subtitle: 'destination.current' }
	}
});
