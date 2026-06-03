ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age SMALLINT CHECK (age IS NULL OR (age >= 8 AND age <= 120));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uname TEXT;
  dname TEXT;
  ugender public.user_gender;
  uage SMALLINT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  dname := COALESCE(NEW.raw_user_meta_data->>'display_name', uname);
  ugender := COALESCE((NEW.raw_user_meta_data->>'gender')::public.user_gender, 'unspecified'::public.user_gender);
  BEGIN
    uage := NULLIF(NEW.raw_user_meta_data->>'age','')::SMALLINT;
  EXCEPTION WHEN OTHERS THEN uage := NULL; END;
  IF uage IS NOT NULL AND (uage < 8 OR uage > 120) THEN uage := NULL; END IF;

  INSERT INTO public.profiles (id, username, display_name, gender, age)
  VALUES (NEW.id, uname, dname, ugender, uage)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;