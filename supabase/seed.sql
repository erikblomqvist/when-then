-- Local seed, applied by `supabase db reset` (and `supabase start` on a fresh stack).
--
-- Production is the source of truth for cards and categories; this file only holds
-- synthetic data for local development and tests, never real content. To work with real
-- data locally, run `vpr db:pull` instead.
--
-- Written as postgres, so the audit log records these rows with no actor.

insert into public.categories (id, position, icon, colour) values
    ('00000000-0000-4000-8000-000000000001', 1, 'zap', 'red'),
    ('00000000-0000-4000-8000-000000000002', 2, 'user', 'blue'),
    ('00000000-0000-4000-8000-000000000003', 3, 'lightbulb', 'amber'),
    ('00000000-0000-4000-8000-000000000004', 4, 'map-pin', 'green');

insert into public.category_translations (category_id, locale, name) values
    ('00000000-0000-4000-8000-000000000001', 'en', 'Events'),
    ('00000000-0000-4000-8000-000000000001', 'sv', 'Händelser'),
    ('00000000-0000-4000-8000-000000000001', 'nb', 'Hendelser'),
    ('00000000-0000-4000-8000-000000000002', 'en', 'People'),
    ('00000000-0000-4000-8000-000000000002', 'sv', 'Personer'),
    ('00000000-0000-4000-8000-000000000002', 'nb', 'Personer'),
    ('00000000-0000-4000-8000-000000000003', 'en', 'Inventions'),
    ('00000000-0000-4000-8000-000000000003', 'sv', 'Prylar'),
    ('00000000-0000-4000-8000-000000000003', 'nb', 'Oppfinnelser'),
    ('00000000-0000-4000-8000-000000000004', 'en', 'Places'),
    ('00000000-0000-4000-8000-000000000004', 'sv', 'Platser'),
    ('00000000-0000-4000-8000-000000000004', 'nb', 'Steder');

-- Made-up cards, one per precision.
insert into public.cards (id, category_id, decade, year, month, day) values
    ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', -499, null, null, null),
    ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000003', 1490, 1493, null, null),
    ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000002', 1960, 1967, 4, 12);

insert into public.card_translations (card_id, locale, text, status) values
    ('00000000-0000-4000-9000-000000000001', 'en', 'The town of Exampleton holds its first harvest race', 'reviewed'),
    ('00000000-0000-4000-9000-000000000002', 'en', 'A made-up clockmaker builds a clock that runs backwards', 'reviewed'),
    ('00000000-0000-4000-9000-000000000003', 'en', 'A fictional poet reads the longest poem ever recited aloud', 'reviewed');
