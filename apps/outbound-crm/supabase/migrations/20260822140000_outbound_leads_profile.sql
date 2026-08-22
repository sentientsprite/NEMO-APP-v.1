-- Lead GBP / Places profile snapshot + pre-call report activity type
alter table public.outbound_leads
  add column if not exists profile jsonb;

comment on column public.outbound_leads.profile is
  'Structured Maps/GBP snapshot: website, maps_url, address, rating, review_count, place_id, types, maps_query, hours, photo_count';

do $$ begin
  alter type outbound_activity_type add value if not exists 'pre_call_report';
exception
  when duplicate_object then null;
end $$;
