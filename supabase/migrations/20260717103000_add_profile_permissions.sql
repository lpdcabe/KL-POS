alter table public.profiles
  add column if not exists permissions text[] not null default '{}';

comment on column public.profiles.permissions is
  'Explicit workspace and settings permissions assigned by an owner administrator.';
