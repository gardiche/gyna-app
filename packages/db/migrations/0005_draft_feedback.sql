-- Retours des associés sur les brouillons, relus par les agents (outil MCP get_feedback) :
-- texte proposé par l'agent (figé), texte final corrigé par un associé, raison du refus.
alter table drafts add column if not exists original_body text;
alter table drafts add column if not exists rejection_reason text;
update drafts set original_body = body where original_body is null;
alter table drafts alter column original_body set not null;

-- Le texte d'origine est celui de l'insertion et ne change plus.
create or replace function drafts_keep_original() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.original_body := coalesce(new.original_body, new.body);
  else
    new.original_body := old.original_body;
  end if;
  return new;
end $$;

drop trigger if exists drafts_keep_original on drafts;
create trigger drafts_keep_original before insert or update on drafts
for each row execute function drafts_keep_original();

revoke execute on function drafts_keep_original() from public, anon, authenticated;

create index if not exists drafts_decided_idx on drafts (org_id, decided_at desc) where decided_at is not null;
