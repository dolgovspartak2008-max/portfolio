create table if not exists public.projects (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  category text not null check (length(btrim(category)) > 0),
  live_url text,
  image_url text,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

revoke insert, update, delete on table public.projects from anon, authenticated;
grant select on table public.projects to anon, authenticated;

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects"
on public.projects
for select
to anon, authenticated
using (published = true);

create index if not exists projects_public_order_idx
on public.projects (sort_order asc, created_at desc)
where published = true;
