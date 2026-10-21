/** The four card categories. Class names in components.css are `cat-<category>`. */
export type Category = 'events' | 'people' | 'inventions' | 'places';

export const categories: readonly Category[] = ['events', 'people', 'inventions', 'places'];

export const categoryLabel: Record<Category, string> = {
	events: 'Events',
	people: 'People',
	inventions: 'Inventions',
	places: 'Places'
};

export type CardSize = 'sm' | 'md' | 'lg' | 'xl';
