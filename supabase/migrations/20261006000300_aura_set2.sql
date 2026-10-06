-- По просьбе владельца: @awiny — −99999 AURA, @fedonko — 2 000 000 000 (максимум с запасом: AURA хранится как int, предел ≈ 2,147 млрд)
alter table public.aura_bonus drop constraint if exists aura_bonus_amount_check;
alter table public.aura_bonus add constraint aura_bonus_amount_check check (amount between -2000000000 and 2000000000);

insert into public.aura_bonus (user_id, amount, reason)
select a.user_id, -99999 - a.aura, 'Выставлено −99999 по решению владельца'
from public.aura_table() a join public.profiles p on p.id = a.user_id
where p.username = 'awiny' and a.aura <> -99999;

insert into public.aura_bonus (user_id, amount, reason)
select a.user_id, 2000000000 - a.aura, 'Выставлено 2 000 000 000 по решению владельца'
from public.aura_table() a join public.profiles p on p.id = a.user_id
where p.username = 'fedonko' and a.aura <> 2000000000;
