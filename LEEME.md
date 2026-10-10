# DONPLAST: pasos
## Supabase
1. Cree un proyecto en supabase.com.
2. Authentication > Providers > Email: desactive "Confirm email".
3. Authentication > Users > Add user: cree su correo y contraseña de administrador (marque Auto Confirm).
4. SQL Editor: pegue todo `supabase/01_schema.sql` y presione Run.
5. SQL Editor: edite el correo en `supabase/02_admin_inicial.sql` y ejecútelo.
6. Project Settings > API: copie "Project URL" y la clave "anon / publishable".
(No necesita buckets: esta versión usa enlaces de foto.)
## Netlify
1. Suba la carpeta a GitHub y en Netlify use "Import from Git".
2. Site settings > Environment variables: agregue VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (valores del paso 6).
3. Deploy. Entre a /login con su correo de administrador.
Desde Usuarios puede crear vendedores y personal de almacén.
