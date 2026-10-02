-- Живые обновления для списков: биржа, заказы, лента, люди, отзывы, жалобы
do $$
declare t text;
begin
  foreach t in array array['jobs', 'orders', 'order_responses', 'works', 'projects', 'reviews', 'reports', 'friendships', 'profiles', 'profile_deco', 'project_milestones', 'goals'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
