-- Execute este SQL no Supabase para ativar os novos dados pessoais do perfil.

alter table public.profiles
add column if not exists hometown text,
add column if not exists birth_date date,
add column if not exists relationship_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_relationship_status_check'
  ) then
    alter table public.profiles
    add constraint profiles_relationship_status_check
    check (
      relationship_status is null
      or relationship_status in (
        'relacionamento_serio',
        'casada',
        'solteira',
        'noiva',
        'prefere_nao_dizer'
      )
    );
  end if;
end $$;

notify pgrst, 'reload schema';
