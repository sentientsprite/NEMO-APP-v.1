-- Conversion ladder milestones on outbound_activities
do $$ begin
  alter type outbound_activity_type add value if not exists 'audit_purchased';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type outbound_activity_type add value if not exists 'call_booked';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type outbound_activity_type add value if not exists 'retainer_signed';
exception when duplicate_object then null;
end $$;
