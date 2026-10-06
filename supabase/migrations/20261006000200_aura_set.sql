-- По просьбе владельца: @awiny — 0 AURA, @fedonko — 99999 AURA (разница записывается бонусом, история сохраняется)
insert into public.aura_bonus (user_id, amount, reason)
select a.user_id, 0 - a.aura, 'Обнулено по решению владельца'
from public.aura_table() a join public.profiles p on p.id = a.user_id
where p.username = 'awiny' and a.aura <> 0;

insert into public.aura_bonus (user_id, amount, reason)
select a.user_id, 99999 - a.aura, 'Выставлено 99999 по решению владельца'
from public.aura_table() a join public.profiles p on p.id = a.user_id
where p.username = 'fedonko' and a.aura <> 99999;
