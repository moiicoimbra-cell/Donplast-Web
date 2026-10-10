import {createContext,useContext,useEffect,useState} from 'react'
import {Routes,Route,Navigate,NavLink,Outlet,useNavigate} from 'react-router-dom'
import {createClient} from '@supabase/supabase-js'
import {sb,bob,URL_SB,KEY_SB} from './lib/supabase'

const Ctx = createContext<any>(null)
const useAuth = () => useContext(Ctx)
const hoy = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString() }

function Auth({children}:any){
  const [s,setS]=useState<any>(null),[p,setP]=useState<any>(null),[ready,setR]=useState(false)
  useEffect(()=>{
    sb.auth.getSession().then(({data})=>{setS(data.session); if(!data.session) setR(true)})
    const {data}=sb.auth.onAuthStateChange((_e,x)=>setS(x))
    return ()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{
    if(!s){setP(null);return}
    sb.from('profiles').select('*').eq('id',s.user.id).single().then(({data})=>{setP(data);setR(true)})
  },[s])
  return <Ctx.Provider value={{s,p,ready}}>{children}</Ctx.Provider>
}

export default function App(){
  return <Auth><Routes>
    <Route path="/" element={<Store/>}/>
    <Route path="/login" element={<Login/>}/>
    <Route path="/admin" element={<Admin/>}>
      <Route index element={<Dashboard/>}/>
      <Route path="pos" element={<POS/>}/>
      <Route path="ventas" element={<Ventas/>}/>
      <Route path="productos" element={<Productos/>}/>
      <Route path="clientes" element={<Clientes/>}/>
      <Route path="pagos" element={<Pagos/>}/>
      <Route path="usuarios" element={<Usuarios/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/"/>}/>
  </Routes></Auth>
}

function Login(){
  const nav=useNavigate(),[e,setE]=useState(''),[pw,setPw]=useState(''),[err,setErr]=useState('')
  const go=async()=>{const {error}=await sb.auth.signInWithPassword({email:e,password:pw}); error?setErr('Correo o contraseña incorrectos'):nav('/admin')}
  return <div className="wrap" style={{maxWidth:380}}><h2 style={{color:'#D71920'}}>DONPLAST</h2>
    <p>Ingreso del personal</p>
    <input placeholder="Correo" value={e} onChange={x=>setE(x.target.value)}/><br/><br/>
    <input type="password" placeholder="Contraseña" value={pw} onChange={x=>setPw(x.target.value)}/><br/><br/>
    {err&&<p className="low">{err}</p>}<button onClick={go}>Ingresar</button></div>
}

function Store(){
  const [items,setI]=useState<any[]>([]),[q,setQ]=useState(''),[cart,setC]=useState<any>({}),[wa,setWa]=useState('')
  useEffect(()=>{sb.from('products_public').select('*').order('name').then(({data})=>setI(data||[]))
    sb.from('business_settings').select('*').then(({data})=>setWa((data||[]).find((x:any)=>x.key==='whatsapp')?.value||''))},[])
  const list=items.filter(i=>i.name.toLowerCase().includes(q.toLowerCase()))
  const tot=items.reduce((a,i)=>a+(cart[i.id]||0)*i.price_retail,0)
  const msg=()=>{const l=items.filter(i=>cart[i.id]).map(i=>`- ${cart[i.id]} x ${i.name} (${bob(i.price_retail)})`)
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent('Hola DONPLAST, quiero pedir:\n'+l.join('\n')+'\nTotal: '+bob(tot))}`)}
  return <><div className="bar"><span className="logo">DONPLAST</span><span style={{flex:1}}/><a href="/login">Personal</a></div>
    <div className="wrap"><h2>Productos plásticos para tu hogar y negocio</h2>
      <input placeholder="Buscar producto…" value={q} onChange={e=>setQ(e.target.value)}/><br/><br/>
      <div className="grid">{list.map(i=><div className="card" key={i.id}>
        {i.image_url&&<img src={i.image_url} style={{width:'100%',height:110,objectFit:'cover'}}/>}
        <b>{i.name}</b><div>{bob(i.price_retail)}</div>
        <div className="tag">{i.stock>0?'Disponible':'Agotado'}</div><br/>
        <div className="row"><button className="lite" onClick={()=>setC({...cart,[i.id]:Math.max((cart[i.id]||0)-1,0)})}>−</button>
          <span style={{textAlign:'center'}}>{cart[i.id]||0}</span>
          <button disabled={i.stock<=(cart[i.id]||0)} onClick={()=>setC({...cart,[i.id]:(cart[i.id]||0)+1})}>+</button></div></div>)}
      </div>{list.length===0&&<p>No hay productos para mostrar.</p>}</div>
    {tot>0&&<div className="bar" style={{position:'sticky',bottom:0}}><b style={{flex:1}}>Total {bob(tot)}</b><button onClick={msg}>Pedir por WhatsApp</button></div>}
    {wa&&<a className="wa" href={`https://wa.me/${wa}`}>WhatsApp</a>}</>
}

function Admin(){
  const {s,p,ready}=useAuth(),nav=useNavigate()
  if(!ready) return <p className="wrap">Cargando…</p>
  if(!s) return <Navigate to="/login"/>
  if(!p||!p.active||p.role==='client') return <div className="wrap"><p>Tu cuenta no tiene acceso al panel.</p><button onClick={()=>sb.auth.signOut().then(()=>nav('/'))}>Salir</button></div>
  const r=p.role
  const L=[['/admin','Panel',['admin','staff','warehouse']],['/admin/pos','Vender',['admin','staff']],['/admin/ventas','Ventas',['admin','staff']],
    ['/admin/productos','Productos',['admin','staff','warehouse']],['/admin/clientes','Clientes',['admin','staff']],
    ['/admin/pagos','Pagos QR',['admin','staff']],['/admin/usuarios','Usuarios',['admin']]] as any[]
  return <><div className="bar"><span className="logo">DONPLAST</span>
    {L.filter(l=>l[2].includes(r)).map(l=><NavLink key={l[0]} to={l[0]} end className={({isActive})=>isActive?'on':''}>{l[1]}</NavLink>)}
    <span style={{flex:1}}/><button className="sec" onClick={()=>sb.auth.signOut().then(()=>nav('/login'))}>Salir</button></div>
    <div className="wrap"><Outlet/></div></>
}

function Dashboard(){
  const [d,setD]=useState<any>({})
  useEffect(()=>{(async()=>{
    const v=await sb.from('sales').select('total').eq('status','confirmada').gte('created_at',hoy())
    const c=await sb.from('payments').select('amount').eq('status','confirmado').gte('created_at',hoy())
    const cl=await sb.from('customers').select('balance')
    const pr=await sb.from('products').select('name,stock,min_stock')
    setD({v:(v.data||[]).reduce((a:any,x:any)=>a+x.total,0),n:(v.data||[]).length,c:(c.data||[]).reduce((a:any,x:any)=>a+x.amount,0),
      cr:(cl.data||[]).reduce((a:any,x:any)=>a+x.balance,0),low:(pr.data||[]).filter((x:any)=>x.stock<=x.min_stock)})})()},[])
  return <><h3>Resumen de hoy</h3><div className="grid">
    <div className="kpi">Vendido<b>{bob(d.v)}</b>{d.n||0} ventas</div>
    <div className="kpi">Cobrado confirmado<b>{bob(d.c)}</b></div>
    <div className="kpi">Por cobrar (crédito)<b>{bob(d.cr)}</b></div></div>
    <h3>Stock bajo</h3>{(d.low||[]).length===0?<p>Sin alertas.</p>:<table><tbody>{d.low.map((x:any)=><tr key={x.name}><td>{x.name}</td><td className="low">{x.stock}</td></tr>)}</tbody></table>}</>
}

function POS(){
  const [prods,setP]=useState<any[]>([]),[cus,setCus]=useState<any[]>([]),[q,setQ]=useState(''),[cart,setC]=useState<any>({}),
    [cid,setCid]=useState(''),[desc,setDesc]=useState(0),[ef,setEf]=useState(0),[qr,setQr]=useState(0),[cr,setCr]=useState(0),[ref,setRef]=useState(''),
    [msg,setMsg]=useState(''),[done,setDone]=useState<any>(null),[key,setKey]=useState(()=>crypto.randomUUID())
  const load=()=>{sb.from('products').select('*').eq('active',true).order('name').then(({data})=>setP(data||[]))
    sb.from('customers').select('*').order('name').then(({data})=>setCus(data||[]))}
  useEffect(load,[])
  const cu=cus.find(c=>c.id===cid), pm=(i:any)=>cu&&cu.type!=='minorista'&&i.price_wholesale>0?i.price_wholesale:i.price_retail
  const lines=prods.filter(i=>cart[i.id]), sub=lines.reduce((a,i)=>a+pm(i)*cart[i.id],0), tot=Math.max(sub-desc,0)
  const set=(i:any,n:number)=>{setC({...cart,[i.id]:Math.max(Math.min(n,i.stock),0)});setEf(0);setQr(0);setCr(0)}
  const efR = qr+cr===0&&ef===0?tot:ef
  const cobrar=async()=>{
    setMsg('')
    const {data,error}=await sb.rpc('confirmar_venta',{p_items:lines.map(i=>({id:i.id,qty:cart[i.id]})),p_customer:cid||null,
      p_payments:[{method:'efectivo',amount:efR},{method:'qr',amount:qr,reference:ref},{method:'credito',amount:cr}],p_discount:desc,p_key:key})
    if(error) return setMsg(error.message)
    const s=await sb.from('sales').select('number,total,created_at').eq('id',data).single()
    setDone({...s.data,lines:lines.map(i=>({n:i.name,q:cart[i.id],p:pm(i)})),cliente:cu?.name,ef:efR,qr,cr,desc})
    setC({});setDesc(0);setEf(0);setQr(0);setCr(0);setKey(crypto.randomUUID());load()}
  if(done) return <div><h3>Recibo interno N° {done.number}</h3><p>{new Date(done.created_at).toLocaleString()} — {done.cliente||'Cliente general'}</p>
    <table><tbody>{done.lines.map((l:any)=><tr key={l.n}><td>{l.q} x {l.n}</td><td>{bob(l.q*l.p)}</td></tr>)}</tbody></table>
    <p>Descuento: {bob(done.desc)} · <b>Total: {bob(done.total)}</b></p>
    <p>Efectivo {bob(done.ef)} · QR {bob(done.qr)} (por verificar) · Crédito {bob(done.cr)}</p>
    <p><i>Recibo interno sin validez fiscal.</i></p>
    <div className="row noprint"><button onClick={()=>window.print()}>Imprimir</button><button className="sec" onClick={()=>setDone(null)}>Nueva venta</button></div></div>
  return <><h3>Punto de venta</h3>
    <input placeholder="Buscar producto o código…" value={q} onChange={e=>setQ(e.target.value)}/><br/><br/>
    <div className="grid">{prods.filter(i=>(i.name+i.sku).toLowerCase().includes(q.toLowerCase())).map(i=><div className="card" key={i.id}>
      <b>{i.name}</b><div>{bob(pm(i))}</div><div className={i.stock<=i.min_stock?'low':''}>Stock: {i.stock}</div>
      <div className="row"><button className="lite" onClick={()=>set(i,(cart[i.id]||0)-1)}>−</button><span style={{textAlign:'center'}}>{cart[i.id]||0}</span>
      <button onClick={()=>set(i,(cart[i.id]||0)+1)}>+</button></div></div>)}</div>
    <div className="card" style={{marginTop:14}}><h3>Cobro</h3>
      <select value={cid} onChange={e=>{setCid(e.target.value);setEf(0);setQr(0);setCr(0)}}><option value="">Cliente general</option>
        {cus.map(c=><option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}</select><br/><br/>
      <p>Subtotal {bob(sub)} · <b>Total {bob(tot)}</b></p>
      <div className="row"><label>Descuento<input type="number" value={desc} onChange={e=>setDesc(+e.target.value)}/></label>
        <label>Efectivo<input type="number" value={efR} onChange={e=>setEf(+e.target.value)}/></label>
        <label>QR<input type="number" value={qr} onChange={e=>setQr(+e.target.value)}/></label>
        <label>Crédito<input type="number" value={cr} onChange={e=>setCr(+e.target.value)}/></label></div>
      {qr>0&&<><br/><input placeholder="Referencia del QR" value={ref} onChange={e=>setRef(e.target.value)}/></>}
      {cu&&cu.credit_limit>0&&<p>Crédito disponible: {bob(cu.credit_limit-cu.balance)}</p>}
      {msg&&<p className="low">{msg}</p>}<br/>
      <button disabled={!lines.length||Math.abs(efR+qr+cr-tot)>0.001} onClick={cobrar}>Cobrar {bob(tot)}</button></div></>
}

function Ventas(){
  const {p}=useAuth(),[v,setV]=useState<any[]>([])
  const load=()=>sb.from('sales').select('*,customers(name)').order('created_at',{ascending:false}).limit(100).then(({data})=>setV(data||[]))
  useEffect(()=>{load()},[])
  const anular=async(id:string)=>{const m=prompt('Motivo de la anulación:');if(!m)return;const {error}=await sb.rpc('anular_venta',{p_id:id,p_reason:m});error?alert(error.message):load()}
  return <><h3>Ventas</h3><table><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Cobrado</th><th>Crédito</th><th></th></tr></thead>
    <tbody>{v.map(x=><tr key={x.id}><td>{x.number}</td><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.customers?.name||'General'}</td>
      <td>{bob(x.total)}</td><td>{bob(x.paid)}</td><td>{bob(x.balance)}</td>
      <td>{x.status==='anulada'?<span className="tag">Anulada</span>:p.role==='admin'&&<button className="sec" onClick={()=>anular(x.id)}>Anular</button>}</td></tr>)}</tbody></table></>
}

function Productos(){
  const {p}=useAuth(),[l,setL]=useState<any[]>([]),[f,setF]=useState<any>({sku:'',name:'',cost:0,price_retail:0,price_wholesale:0,min_stock:0,image_url:''})
  const load=()=>sb.from('products').select('*').order('name').then(({data})=>setL(data||[]))
  useEffect(()=>{load()},[])
  const add=async()=>{const {error}=await sb.from('products').insert(f);error?alert(error.message):(setF({...f,sku:'',name:''}),load())}
  const mov=async(i:any)=>{const t=prompt('Tipo: entrada, ajuste o dano');const q=+(prompt('Cantidad (negativa para restar en ajuste/daño)')||0);const m=prompt('Motivo');if(!t||!q||!m)return
    const {error}=await sb.rpc('ajustar_stock',{p_id:i.id,p_qty:q,p_type:t,p_reason:m});error?alert(error.message):load()}
  const canMov=['admin','warehouse'].includes(p.role)
  return <><h3>Productos e inventario</h3>
    {p.role==='admin'&&<div className="card"><div className="row">
      <input placeholder="Código" value={f.sku} onChange={e=>setF({...f,sku:e.target.value})}/><input placeholder="Nombre" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
      <input type="number" placeholder="Costo" onChange={e=>setF({...f,cost:+e.target.value})}/><input type="number" placeholder="Precio minorista" onChange={e=>setF({...f,price_retail:+e.target.value})}/>
      <input type="number" placeholder="Precio mayorista" onChange={e=>setF({...f,price_wholesale:+e.target.value})}/><input type="number" placeholder="Stock mínimo" onChange={e=>setF({...f,min_stock:+e.target.value})}/>
      <input placeholder="URL de foto (opcional)" onChange={e=>setF({...f,image_url:e.target.value})}/><button onClick={add}>Agregar producto</button></div></div>}
    <br/><table><thead><tr><th>Código</th><th>Producto</th><th>Minorista</th><th>Mayorista</th><th>Stock</th><th></th></tr></thead>
    <tbody>{l.map(i=><tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{bob(i.price_retail)}</td><td>{bob(i.price_wholesale)}</td>
      <td className={i.stock<=i.min_stock?'low':''}>{i.stock}</td><td>{canMov&&<button className="sec" onClick={()=>mov(i)}>Movimiento</button>}</td></tr>)}</tbody></table></>
}

function Clientes(){
  const {p}=useAuth(),[l,setL]=useState<any[]>([]),[f,setF]=useState<any>({name:'',phone:'',type:'minorista',credit_limit:0})
  const load=()=>sb.from('customers').select('*').order('name').then(({data})=>setL(data||[]))
  useEffect(()=>{load()},[])
  const add=async()=>{const d=p.role==='admin'?f:{...f,credit_limit:0};const {error}=await sb.from('customers').insert(d);error?alert(error.message):(setF({...f,name:'',phone:''}),load())}
  const abono=async(c:any)=>{const a=+(prompt('Monto del abono (efectivo)')||0);if(!a)return;const {error}=await sb.rpc('registrar_abono',{p_customer:c.id,p_amount:a,p_method:'efectivo'});error?alert(error.message):load()}
  return <><h3>Clientes y créditos</h3><div className="card"><div className="row">
    <input placeholder="Nombre" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/><input placeholder="Teléfono" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/>
    <select value={f.type} onChange={e=>setF({...f,type:e.target.value})}><option>minorista</option><option>mayorista</option><option>empresa</option></select>
    {p.role==='admin'&&<input type="number" placeholder="Límite de crédito" onChange={e=>setF({...f,credit_limit:+e.target.value})}/>}
    <button onClick={add}>Agregar cliente</button></div></div><br/>
    <table><thead><tr><th>Cliente</th><th>Tipo</th><th>Límite</th><th>Saldo</th><th></th></tr></thead>
    <tbody>{l.map(c=><tr key={c.id}><td>{c.name}<br/><small>{c.phone}</small></td><td>{c.type}</td><td>{bob(c.credit_limit)}</td>
      <td className={c.credit_limit>0&&c.balance>=c.credit_limit*0.8?'low':''}>{bob(c.balance)}</td><td>{c.balance>0&&<button onClick={()=>abono(c)}>Abonar</button>}</td></tr>)}</tbody></table></>
}

function Pagos(){
  const [l,setL]=useState<any[]>([])
  const load=()=>sb.from('payments').select('*').eq('status','pendiente').order('created_at').then(({data})=>setL(data||[]))
  useEffect(()=>{load()},[])
  const ver=async(id:string,ok:boolean)=>{const {error}=await sb.rpc('verificar_pago',{p_id:id,p_ok:ok});error?alert(error.message):load()}
  return <><h3>Pagos QR por verificar</h3>{l.length===0&&<p>No hay pagos pendientes.</p>}
    <table><tbody>{l.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString()}</td><td>{bob(x.amount)}</td><td>{x.reference||'-'}</td>
      <td><button onClick={()=>ver(x.id,true)}>Confirmar</button> <button className="sec" onClick={()=>ver(x.id,false)}>Rechazar</button></td></tr>)}</tbody></table>
    <p><small>Confirme solo cuando el dinero ya aparezca en su cuenta bancaria.</small></p></>
}

function Usuarios(){
  const [l,setL]=useState<any[]>([]),[f,setF]=useState({name:'',email:'',pw:'',role:'staff'}),[m,setM]=useState('')
  const load=()=>sb.from('profiles').select('*').order('created_at').then(({data})=>setL(data||[]))
  useEffect(()=>{load()},[])
  const crear=async()=>{
    const tmp=createClient(URL_SB,KEY_SB,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'tmp-signup'}})
    const {data,error}=await tmp.auth.signUp({email:f.email,password:f.pw,options:{data:{full_name:f.name}}})
    if(error||!data.user) return setM(error?.message||'No se pudo crear')
    const r=await sb.rpc('admin_set_role',{p_id:data.user.id,p_role:f.role,p_discount:false,p_qr:false,p_active:true})
    setM(r.error?r.error.message:'Usuario creado'); setF({name:'',email:'',pw:'',role:'staff'}); load()}
  const upd=async(u:any,ch:any)=>{const n={...u,...ch};const {error}=await sb.rpc('admin_set_role',{p_id:u.id,p_role:n.role,p_discount:n.can_discount,p_qr:n.can_verify_qr,p_active:n.active});error?alert(error.message):load()}
  return <><h3>Usuarios</h3><div className="card"><div className="row">
    <input placeholder="Nombre" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/><input placeholder="Correo" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/>
    <input type="password" placeholder="Contraseña (mín. 6)" value={f.pw} onChange={e=>setF({...f,pw:e.target.value})}/>
    <select value={f.role} onChange={e=>setF({...f,role:e.target.value})}><option value="staff">Vendedor/Cajero</option><option value="warehouse">Almacén</option><option value="admin">Administrador</option></select>
    <button onClick={crear}>Crear usuario</button></div>{m&&<p>{m}</p>}</div><br/>
    <table><thead><tr><th>Nombre</th><th>Rol</th><th>Descuentos</th><th>Verifica QR</th><th>Activo</th></tr></thead>
    <tbody>{l.map(u=><tr key={u.id}><td>{u.full_name}</td>
      <td><select value={u.role} onChange={e=>upd(u,{role:e.target.value})}><option value="admin">admin</option><option value="staff">staff</option><option value="warehouse">warehouse</option><option value="client">client</option></select></td>
      <td><input type="checkbox" checked={u.can_discount} onChange={e=>upd(u,{can_discount:e.target.checked})}/></td>
      <td><input type="checkbox" checked={u.can_verify_qr} onChange={e=>upd(u,{can_verify_qr:e.target.checked})}/></td>
      <td><input type="checkbox" checked={u.active} onChange={e=>upd(u,{active:e.target.checked})}/></td></tr>)}</tbody></table></>
}
