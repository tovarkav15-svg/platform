-- Откат по просьбе владельца: как после первого шага (@fedonko +3700, @awiny без изменений)
delete from public.aura_bonus where reason like '%по решению владельца';
alter table public.aura_bonus drop constraint if exists aura_bonus_amount_check;
alter table public.aura_bonus add constraint aura_bonus_amount_check check (amount between -100000 and 100000);

-- Рекорд AURA (по нему считаются уровень и Coins) у @fedonko успел стать 2 млрд — возвращаем к текущей AURA
update public.wallets w set aura_peak = a.aura, updated_at = now()
from public.aura_table() a join public.profiles p on p.id = a.user_id
where w.user_id = a.user_id and p.username = 'fedonko' and w.aura_peak > a.aura;
