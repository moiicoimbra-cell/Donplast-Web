-- DONPLAST: pegar completo en Supabase > SQL Editor > Run (una sola vez)
create extension if not exists pgcrypto;

create table profiles(id uuid primary key references auth.users on delete cascade,
 full_name text, phone text, role text not null default 'client' check(role in('admin','staff','warehouse','client')),
 active boolean not null default true, can_discount boolean not null default false, can_verify_qr boolean not null default false,
 created_at timestamptz not null default now());
create table products(id uuid primary key default gen_random_uuid(), sku text unique not null, name text not null,
 category text, unit text default 'unidad', cost numeric(12,2) not null default 0 check(cost>=0),
 price_retail numeric(12,2) not null default 0 check(price_retail>=0), price_wholesale numeric(12,2) not null default 0 check(price_wholesale>=0),
 stock numeric(12,2) not null default 0 check(stock>=0), min_stock numeric(12,2) not null default 0,
 image_url text, active boolean not null default true, created_at timestamptz not null default now());
create table inventory_movements(id uuid primary key default gen_random_uuid(), product_id uuid not null references products,
 qty numeric(12,2) not null, type text not null check(type in('entrada','venta','anulacion','ajuste','dano')),
 reason text, ref uuid, created_by uuid, created_at timestamptz not null default now());
create table customers(id uuid primary key default gen_random_uuid(), name text not null, doc text, phone text, address text,
 type text not null default 'minorista' check(type in('minorista','mayorista','empresa')),
 credit_limit numeric(12,2) not null default 0 check(credit_limit>=0), balance numeric(12,2) not null default 0 check(balance>=0),
 created_at timestamptz not null default now());
create table sales(id uuid primary key default gen_random_uuid(), number bigint generated always as identity,
 customer_id uuid references customers, seller_id uuid references profiles, status text not null default 'confirmada' check(status in('confirmada','anulada')),
 subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 paid numeric(12,2) not null default 0, balance numeric(12,2) not null default 0, idempotency_key text unique, created_at timestamptz not null default now());
create table sale_items(id uuid primary key default gen_random_uuid(), sale_id uuid not null references sales, product_id uuid not null references products,
 qty numeric(12,2) not null check(qty>0), unit_price numeric(12,2) not null, unit_cost numeric(12,2) not null, subtotal numeric(12,2) not null);
create table payments(id uuid primary key default gen_random_uuid(), sale_id uuid references sales, customer_id uuid references customers,
 method text not null check(method in('efectivo','qr')), amount numeric(12,2) not null check(amount>0),
 status text not null default 'pendiente' check(status in('pendiente','confirmado','rechazado')), reference text,
 verified_by uuid, created_by uuid, created_at timestamptz not null default now());
create table business_settings(key text primary key, value text);
insert into business_settings values('nombre','DONPLAST'),('whatsapp','59100000000'),('facebook',''),('instagram',''),('tiktok',''),('moneda','BOB');

create or replace function my_role() returns text language sql stable security definer set search_path=public as $$
 select role from profiles where id=auth.uid() and active $$;
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
create or replace function protect_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin if auth.uid() is not null and coalesce(my_role(),'')<>'admin' and (new.role<>old.role or new.active<>old.active or new.can_discount<>old.can_discount or new.can_verify_qr<>old.can_verify_qr)
 then raise exception 'No permitido'; end if; return new; end $$;
create trigger protect_profile_t before update on profiles for each row execute function protect_profile();

create or replace function confirmar_venta(p_items jsonb,p_customer uuid,p_payments jsonb,p_discount numeric,p_key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r text:=my_role(); v_id uuid; v_type text:='minorista'; v_lim numeric:=0; v_bal numeric:=0; it jsonb; pay jsonb; pr products;
 q numeric; up numeric; sub numeric:=0; tot numeric; psum numeric:=0; cred numeric:=0; paid numeric:=0; a numeric; m text;
begin
 if r not in('admin','staff') then raise exception 'Sin permiso'; end if;
 select id into v_id from sales where idempotency_key=p_key; if found then return v_id; end if;
 if p_customer is not null then select type,credit_limit,balance into v_type,v_lim,v_bal from customers where id=p_customer for update; end if;
 if coalesce(p_discount,0)>0 and r<>'admin' and not exists(select 1 from profiles where id=auth.uid() and can_discount) then raise exception 'Sin permiso para descuentos'; end if;
 insert into sales(customer_id,seller_id,idempotency_key) values(p_customer,auth.uid(),p_key) returning id into v_id;
 for it in select * from jsonb_array_elements(p_items) loop
  q:=(it->>'qty')::numeric; if q<=0 then raise exception 'Cantidad inválida'; end if;
  select * into pr from products where id=(it->>'id')::uuid and active for update;
  if not found or pr.stock<q then raise exception 'Stock insuficiente: %',coalesce(pr.name,'producto'); end if;
  up:=case when v_type<>'minorista' and pr.price_wholesale>0 then pr.price_wholesale else pr.price_retail end;
  sub:=sub+up*q;
  insert into sale_items(sale_id,product_id,qty,unit_price,unit_cost,subtotal) values(v_id,pr.id,q,up,pr.cost,up*q);
  update products set stock=stock-q where id=pr.id;
  insert into inventory_movements(product_id,qty,type,reason,ref,created_by) values(pr.id,-q,'venta','Venta',v_id,auth.uid());
 end loop;
 tot:=sub-coalesce(p_discount,0); if tot<0 then raise exception 'Descuento inválido'; end if;
 for pay in select * from jsonb_array_elements(p_payments) loop
  m:=pay->>'method'; a:=(pay->>'amount')::numeric; if a<=0 then continue; end if; psum:=psum+a;
  if m='credito' then cred:=cred+a;
  else insert into payments(sale_id,customer_id,method,amount,status,reference,created_by)
   values(v_id,p_customer,m,a,case when m='efectivo' then 'confirmado' else 'pendiente' end,pay->>'reference',auth.uid());
   if m='efectivo' then paid:=paid+a; end if; end if;
 end loop;
 if abs(psum-tot)>0.001 then raise exception 'Los pagos no suman el total'; end if;
 if cred>0 then
  if p_customer is null then raise exception 'El crédito requiere cliente'; end if;
  if v_bal+cred>v_lim and r<>'admin' then raise exception 'Excede el límite de crédito'; end if;
  update customers set balance=balance+cred where id=p_customer; end if;
 update sales set subtotal=sub,discount=coalesce(p_discount,0),total=tot,paid=paid,balance=cred where id=v_id;
 return v_id;
end $$;

create or replace function registrar_abono(p_customer uuid,p_amount numeric,p_method text) returns void
language plpgsql security definer set search_path=public as $$
declare b numeric;
begin
 if my_role() not in('admin','staff') then raise exception 'Sin permiso'; end if;
 select balance into b from customers where id=p_customer for update;
 if p_amount<=0 or p_amount>b then raise exception 'Abono inválido (saldo: %)',b; end if;
 insert into payments(customer_id,method,amount,status,reference,created_by)
  values(p_customer,p_method,p_amount,case when p_method='efectivo' then 'confirmado' else 'pendiente' end,'abono',auth.uid());
 if p_method='efectivo' then update customers set balance=balance-p_amount where id=p_customer; end if;
end $$;

create or replace function verificar_pago(p_id uuid,p_ok boolean) returns void
language plpgsql security definer set search_path=public as $$
declare p payments;
begin
 if not (my_role()='admin' or exists(select 1 from profiles where id=auth.uid() and can_verify_qr and active)) then raise exception 'Sin permiso'; end if;
 select * into p from payments where id=p_id for update;
 if p.status<>'pendiente' then raise exception 'El pago ya fue procesado'; end if;
 update payments set status=case when p_ok then 'confirmado' else 'rechazado' end,verified_by=auth.uid() where id=p_id;
 if p_ok then
  if p.sale_id is not null then update sales set paid=paid+p.amount where id=p.sale_id;
  else update customers set balance=greatest(balance-p.amount,0) where id=p.customer_id; end if;
 end if;
end $$;

create or replace function anular_venta(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare s sales; i sale_items;
begin
 if my_role()<>'admin' then raise exception 'Solo el administrador puede anular'; end if;
 if coalesce(p_reason,'')='' then raise exception 'Indique el motivo'; end if;
 select * into s from sales where id=p_id for update;
 if s.status='anulada' then raise exception 'Ya está anulada'; end if;
 for i in select * from sale_items where sale_id=p_id loop
  update products set stock=stock+i.qty where id=i.product_id;
  insert into inventory_movements(product_id,qty,type,reason,ref,created_by) values(i.product_id,i.qty,'anulacion',p_reason,p_id,auth.uid());
 end loop;
 if s.balance>0 and s.customer_id is not null then update customers set balance=greatest(balance-s.balance,0) where id=s.customer_id; end if;
 update sales set status='anulada' where id=p_id;
end $$;

create or replace function ajustar_stock(p_id uuid,p_qty numeric,p_type text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if my_role() not in('admin','warehouse') then raise exception 'Sin permiso'; end if;
 if p_type not in('entrada','ajuste','dano') or coalesce(p_reason,'')='' then raise exception 'Datos inválidos'; end if;
 update products set stock=stock+p_qty where id=p_id;
 insert into inventory_movements(product_id,qty,type,reason,created_by) values(p_id,p_qty,p_type,p_reason,auth.uid());
end $$;

create or replace function admin_set_role(p_id uuid,p_role text,p_discount boolean,p_qr boolean,p_active boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if my_role()<>'admin' then raise exception 'Solo el administrador'; end if;
 update profiles set role=p_role,can_discount=p_discount,can_verify_qr=p_qr,active=p_active where id=p_id;
end $$;

create view products_public as select id,sku,name,category,unit,price_retail,price_wholesale,stock,image_url from products where active;
grant select on products_public to anon,authenticated;

alter table profiles enable row level security; alter table products enable row level security;
alter table inventory_movements enable row level security; alter table customers enable row level security;
alter table sales enable row level security; alter table sale_items enable row level security;
alter table payments enable row level security; alter table business_settings enable row level security;
create policy p_sel on profiles for select using(id=auth.uid() or my_role()='admin');
create policy p_upd on profiles for update using(id=auth.uid() or my_role()='admin');
create policy pr_sel on products for select using(my_role() in('admin','staff','warehouse'));
create policy pr_ins on products for insert with check(my_role()='admin');
create policy pr_upd on products for update using(my_role()='admin');
create policy im_sel on inventory_movements for select using(my_role() in('admin','warehouse'));
create policy c_sel on customers for select using(my_role() in('admin','staff'));
create policy c_ins on customers for insert with check(my_role()='admin' or (my_role()='staff' and credit_limit=0 and balance=0));
create policy c_upd on customers for update using(my_role()='admin');
create policy s_sel on sales for select using(my_role()='admin' or seller_id=auth.uid());
create policy si_sel on sale_items for select using(exists(select 1 from sales s where s.id=sale_id and (my_role()='admin' or s.seller_id=auth.uid())));
create policy pay_sel on payments for select using(my_role()='admin' or created_by=auth.uid() or my_role()='staff');
create policy bs_sel on business_settings for select using(true);
create policy bs_all on business_settings for all using(my_role()='admin') with check(my_role()='admin');
