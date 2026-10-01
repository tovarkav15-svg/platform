-- Гости читают опубликованные статьи: проверка «владелец ли это» для них просто возвращает false
grant execute on function public.is_platform_owner() to anon;
