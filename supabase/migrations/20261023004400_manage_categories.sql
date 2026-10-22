-- Category management (#44): create and edit (names per locale, icon, colour), reorder,
-- archive and unarchive, delete when empty. Admin only, so every function checks the actor
-- with public.require_admin (from the card lifecycle migration, #38) and names it for the
-- audit triggers (#37) before writing.
-- The server calls these with the service client and turns the raised codes into messages.

-- CSV import (#48) matches categories by English name, so no two may share one.
create unique index category_translations_en_name_key
    on public.category_translations (lower(btrim(name)))
    where locale = 'en';

-- Serialises writes that hand out or shuffle positions, so concurrent creates and reorders
-- never collide on categories_position_key.
create function public.lock_category_positions()
returns void
language sql
volatile
set search_path = ''
as $$
    select pg_advisory_xact_lock(hashtext('public.categories.position'));
$$;

-- Creates (no category_id) or edits a category. `category` holds icon and colour. `names`
-- maps a locale to its name: English is required, and a locale given as null or blank loses
-- its name. Locales left out are kept. Names written here count as reviewed.
create function public.save_category(
    actor uuid,
    category jsonb,
    names jsonb,
    category_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    saved_id uuid;
    entry record;
    name text;
begin
    perform public.require_admin(actor, 'Only admins manage categories.');
    perform public.set_actor(actor);

    if nullif(btrim(names ->> 'en'), '') is null then
        raise exception 'english_name_required';
    end if;

    if category_id is null then
        perform public.lock_category_positions();
        insert into public.categories (position, icon, colour)
        values (
            (select coalesce(max(c.position), 0) + 1 from public.categories as c),
            category ->> 'icon',
            category ->> 'colour'
        )
        returning id into saved_id;
    else
        update public.categories as c
        set icon = category ->> 'icon',
            colour = category ->> 'colour'
        where c.id = save_category.category_id
        returning c.id into saved_id;

        if saved_id is null then
            raise exception 'no_category' using errcode = 'P0002';
        end if;
    end if;

    for entry in select key, value from jsonb_each(coalesce(names, '{}'::jsonb)) loop
        name := nullif(btrim(entry.value #>> '{}'), '');
        if name is null then
            delete from public.category_translations as t
            where t.category_id = saved_id and t.locale = entry.key::public.card_locale;
        else
            insert into public.category_translations as t (category_id, locale, name, status)
            values (saved_id, entry.key::public.card_locale, name, 'reviewed')
            on conflict on constraint category_translations_pkey do update
            set name = excluded.name,
                status = excluded.status;
        end if;
    end loop;

    return saved_id;
end;
$$;

-- Puts the given categories in this order, using the positions they hold between them, so
-- the categories left out (archived, or added by someone else meanwhile) keep theirs. Ids of
-- categories deleted meanwhile are skipped.
create function public.reorder_categories(actor uuid, ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.require_admin(actor, 'Only admins manage categories.');
    perform public.set_actor(actor);
    perform public.lock_category_positions();

    if cardinality(ids) <> (select count(distinct i) from unnest(ids) as i) then
        raise exception 'duplicate_ids';
    end if;

    set constraints public.categories_position_key deferred;

    update public.categories as c
    set position = target.position
    from (
        select wanted.id, held.position
        from (
            select w.id, row_number() over (order by w.n) as n
            from unnest(ids) with ordinality as w (id, n)
            where exists (select 1 from public.categories as c2 where c2.id = w.id)
        ) as wanted
        join (
            select c3.position, row_number() over (order by c3.position) as n
            from public.categories as c3
            where c3.id = any(ids)
        ) as held using (n)
    ) as target
    where c.id = target.id and c.position <> target.position;

    set constraints public.categories_position_key immediate;
end;
$$;

-- Archived categories leave the category draw; their cards stay attached.
create function public.set_category_archived(actor uuid, category_id uuid, archived boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.require_admin(actor, 'Only admins manage categories.');
    perform public.set_actor(actor);

    update public.categories as c
    set archived_at = case when archived then coalesce(c.archived_at, now()) end,
        archived_by = case when archived then coalesce(c.archived_by, actor) end
    where c.id = set_category_archived.category_id;

    if not found then
        raise exception 'no_category' using errcode = 'P0002';
    end if;
end;
$$;

-- Only a category without cards can go; otherwise archive it.
create function public.delete_category(actor uuid, category_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.require_admin(actor, 'Only admins manage categories.');
    perform public.set_actor(actor);

    if exists (select 1 from public.cards as k where k.category_id = delete_category.category_id)
    then
        raise exception 'category_has_cards';
    end if;

    delete from public.categories as c where c.id = delete_category.category_id;

    if not found then
        raise exception 'no_category' using errcode = 'P0002';
    end if;
end;
$$;

revoke execute on function
    public.lock_category_positions(),
    public.save_category(uuid, jsonb, jsonb, uuid),
    public.reorder_categories(uuid, uuid[]),
    public.set_category_archived(uuid, uuid, boolean),
    public.delete_category(uuid, uuid)
from anon, authenticated, public;

grant execute on function
    public.lock_category_positions(),
    public.save_category(uuid, jsonb, jsonb, uuid),
    public.reorder_categories(uuid, uuid[]),
    public.set_category_archived(uuid, uuid, boolean),
    public.delete_category(uuid, uuid)
to service_role;