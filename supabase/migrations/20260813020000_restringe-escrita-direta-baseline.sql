-- Aplicar somente depois que a versão que usa as RPCs save/clear_week_baseline
-- estiver publicada. Assim, clientes com a versão anterior não ficam sem ação
-- de comprometer/reabrir semana durante o deploy.

REVOKE INSERT, UPDATE, DELETE ON public.week_baseline FROM authenticated;
GRANT SELECT ON public.week_baseline TO authenticated;

NOTIFY pgrst, 'reload schema';
