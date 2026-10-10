-- 1) Cree primero el usuario en Supabase > Authentication > Users > Add user (correo y contraseña, marque Auto Confirm).
-- 2) Cambie el correo de abajo por el que creó y ejecute este script.
update profiles set role='admin', full_name='Administrador', can_discount=true, can_verify_qr=true
where id=(select id from auth.users where email='CAMBIAR@CORREO.COM');
