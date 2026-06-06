ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS font_family text;