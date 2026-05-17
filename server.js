'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const fs         = require('fs');
const { v4: uuid } = require('uuid');

// Honduras UTC-6 helper
function nowHN() {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}
function todayHN() {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().substring(0, 10);
}
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'metricpos_secret_2026_hn';
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'MPOS2026HN_LIC_KEY';
// PostgreSQL — sin archivo de BD local

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Pool PostgreSQL ─────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Helpers async PostgreSQL ──────────────────────────────────────────────────
async function run(sql, params=[]) {
  const pg = sql
    .replace(/\bINSERT OR IGNORE\b/gi, 'INSERT')
    .replace(/\bINSERT OR REPLACE\b/gi, 'INSERT')
    .replace(/datetime\('now',?[^)]*\)/gi, "NOW() AT TIME ZONE 'America/Tegucigalpa'")
    .replace(/date\('now'[^)]*\)/gi, "(NOW() AT TIME ZONE 'America/Tegucigalpa')::date")
    .replace(/\?/g, () => { let i=0; return sql.match(/\?/g).map((_,j)=>'$'+(j+1))[i++]; });
  // Numerar parámetros correctamente
  let n=0;
  const q = sql
    .replace(/\bINSERT OR IGNORE\b/gi,'INSERT')
    .replace(/\bINSERT OR REPLACE\b/gi,'INSERT')
    .replace(/datetime\('now',?[^)]*\)/gi,"NOW() AT TIME ZONE 'America/Tegucigalpa'")
    .replace(/date\('now'[^)]*\)/gi,"(NOW() AT TIME ZONE 'America/Tegucigalpa')::date")
    .replace(/\?/g, ()=>'$'+(++n));
  await pool.query(q, params.length ? params : undefined);
}

async function all(sql, params=[]) {
  let n=0;
  const q = sql
    .replace(/\bINSERT OR IGNORE\b/gi,'INSERT')
    .replace(/datetime\('now',?[^)]*\)/gi,"NOW() AT TIME ZONE 'America/Tegucigalpa'")
    .replace(/date\('now'[^)]*\)/gi,"(NOW() AT TIME ZONE 'America/Tegucigalpa')::date")
    .replace(/\?/g, ()=>'$'+(++n));
  const r = await pool.query(q, params.length ? params : undefined);
  return r.rows;
}

async function get(sql, params=[]) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function initDB() {
  console.log('🔌 Conectando a PostgreSQL...');
  await pool.query('SELECT 1');
  console.log('✅ PostgreSQL conectado');
  await createSchema();
  await seedData();
}

// ── LICENCIAS ──
const crypto=require('crypto');
const TIPOS_LICENCIA={mensual:30,trimestral:90,anual:365,vitalicia:36500,demo:7};

function generarClave(tipo,seed){
  // Formato: MPOS-TIPO-XXXX-XXXX-XXXX  (determinista por seed+tipo+secret)
  const base=`${LICENSE_SECRET}|${tipo}|${seed}`;
  const hash=crypto.createHash('sha256').update(base).digest('hex').toUpperCase();
  const p=t=>hash.substr(t,4);
  return `MPOS-${tipo.substring(0,3).toUpperCase()}-${p(0)}-${p(4)}-${p(8)}`;
}

function validarClave(clave){
  for(const tipo of Object.keys(TIPOS_LICENCIA)){
    for(let seed=1;seed<=9999;seed++){
      if(generarClave(tipo,seed)===clave.toUpperCase()) return tipo;
    }
  }
  return null;
}

async function getLicenciaActiva(){
  return await get(`SELECT * FROM licencias WHERE activa=1 AND fecha_vencimiento::date>=CURRENT_DATE ORDER BY id DESC`);
}

// Endpoint: verificar estado de licencia (público para el frontend antes de login)
app.get('/api/licencia/estado',async (req,res)=>{
  const lic=getLicenciaActiva();
  if(lic){
    const diasRestantes=Math.ceil((new Date(lic.fecha_vencimiento)-new Date())/(1000*60*60*24));
    res.json({activa:true,tipo:lic.tipo,vencimiento:lic.fecha_vencimiento,diasRestantes});
  } else {
    res.json({activa:false});
  }
});

// Endpoint: activar licencia
app.post('/api/licencia/activar',async (req,res)=>{
  const{clave}=req.body;
  if(!clave)return res.status(400).json({error:'Clave requerida'});
  // Verificar si ya fue usada
  const usada=await get(`SELECT id FROM licencias WHERE clave=?`,[clave.toUpperCase()]);
  if(usada)return res.status(400).json({error:'Esta clave ya fue utilizada'});
  const tipo=validarClave(clave);
  if(!tipo)return res.status(400).json({error:'Clave de licencia inválida'});
  const dias=TIPOS_LICENCIA[tipo];
  const hoy=new Date(); hoy.setHours(hoy.getHours()-6);
  const venc=new Date(hoy);
  venc.setDate(venc.getDate()+dias);
  const fechaAct=hoy.toISOString().substring(0,10);
  const fechaVenc=venc.toISOString().substring(0,10);
  // Desactivar licencias anteriores
  run(`UPDATE licencias SET activa=0`);
  run(`INSERT INTO licencias(clave,tipo,fecha_activacion,fecha_vencimiento,activa)VALUES(?,?,?,?,1)`,[clave.toUpperCase(),tipo,fechaAct,fechaVenc]); res.json({ok:true,tipo,vencimiento:fechaVenc,diasRestantes:dias});
});

// Endpoint: generar clave (solo para desarrollo/admin - protegido)
app.post('/api/licencia/generar',auth(['admin']),async (req,res)=>{
  const{tipo,seed}=req.body;
  if(!TIPOS_LICENCIA[tipo])return res.status(400).json({error:'Tipo inválido'});
  const s=seed||Math.floor(Math.random()*9000)+1000;
  res.json({clave:generarClave(tipo,s),tipo,dias:TIPOS_LICENCIA[tipo]});
});

async function createSchema(){
  // PostgreSQL — sin PRAGMA
  await pool.query(`CREATE TABLE IF NOT EXISTS sucursales(id TEXT PRIMARY KEY,nombre TEXT,direccion TEXT,telefono TEXT,rtn TEXT,cai TEXT,serie TEXT,rango_ini TEXT,rango_fin TEXT,fecha_limite TEXT,logo TEXT,activa INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS usuarios(id TEXT PRIMARY KEY,nombre TEXT,username TEXT UNIQUE,password TEXT,rol TEXT CHECK(rol IN('admin','supervisor','cajero')),sucursal_id TEXT,activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS categorias(id SERIAL PRIMARY KEY,nombre TEXT UNIQUE,activa INTEGER DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS productos(id TEXT PRIMARY KEY,codigo TEXT UNIQUE,nombre TEXT,categoria TEXT,precio_venta NUMERIC(15,2),costo NUMERIC(15,2) DEFAULT 0,gravado INTEGER DEFAULT 1,activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS inventario(id SERIAL PRIMARY KEY,producto_id TEXT,sucursal_id TEXT,stock INTEGER DEFAULT 0,stock_min INTEGER DEFAULT 0,UNIQUE(producto_id,sucursal_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kardex(id SERIAL PRIMARY KEY,producto_id TEXT,sucursal_id TEXT,tipo TEXT,cantidad INTEGER,costo_unit NUMERIC(15,2) DEFAULT 0,precio_unit NUMERIC(15,2) DEFAULT 0,saldo_stock INTEGER,referencia TEXT,motivo TEXT,usuario_id TEXT,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS clientes(id TEXT PRIMARY KEY,nombre TEXT,rtn TEXT,direccion TEXT,telefono TEXT,email TEXT,limite_credito NUMERIC(15,2) DEFAULT 0,saldo NUMERIC(15,2) DEFAULT 0,activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS proveedores(id TEXT PRIMARY KEY,nombre TEXT,rtn TEXT,direccion TEXT,telefono TEXT,email TEXT,contacto TEXT,limite_credito NUMERIC(15,2) DEFAULT 0,saldo NUMERIC(15,2) DEFAULT 0,activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ventas(id TEXT PRIMARY KEY,numero_factura TEXT,sucursal_id TEXT,cliente_id TEXT,usuario_id TEXT,subtotal NUMERIC(15,2),descuento NUMERIC(15,2) DEFAULT 0,importe_gravado NUMERIC(15,2) DEFAULT 0,importe_exento NUMERIC(15,2) DEFAULT 0,importe_exonerado NUMERIC(15,2) DEFAULT 0,isv15 NUMERIC(15,2) DEFAULT 0,isv18 NUMERIC(15,2) DEFAULT 0,total NUMERIC(15,2),exonerado INTEGER DEFAULT 0,orden_compra_exenta TEXT,constancia_registro TEXT,identificativo_sag TEXT,estado TEXT DEFAULT 'emitida',fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ventas_suc ON ventas(sucursal_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS venta_items(id SERIAL PRIMARY KEY,venta_id TEXT,producto_id TEXT,producto_codigo TEXT,producto_nombre TEXT,producto_categoria TEXT,cantidad INTEGER,precio_unit NUMERIC(15,2),costo_unit NUMERIC(15,2) DEFAULT 0,subtotal NUMERIC(15,2))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS devoluciones(id TEXT PRIMARY KEY,venta_id TEXT,sucursal_id TEXT,usuario_id TEXT,motivo TEXT,total NUMERIC(15,2) DEFAULT 0,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS devolucion_items(id SERIAL PRIMARY KEY,devolucion_id TEXT,producto_id TEXT,cantidad INTEGER,precio_unit NUMERIC(15,2),subtotal NUMERIC(15,2))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS compras(id TEXT PRIMARY KEY,proveedor_id TEXT,sucursal_id TEXT,usuario_id TEXT,numero_doc TEXT,subtotal NUMERIC(15,2),isv NUMERIC(15,2) DEFAULT 0,total NUMERIC(15,2),estado TEXT DEFAULT 'pendiente',notas TEXT,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS compra_items(id SERIAL PRIMARY KEY,compra_id TEXT,producto_id TEXT,producto_nombre TEXT,cantidad INTEGER,costo_unit NUMERIC(15,2),subtotal NUMERIC(15,2),cantidad_recibida INTEGER DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cxc(id TEXT PRIMARY KEY,cliente_id TEXT,sucursal_id TEXT,referencia TEXT,monto NUMERIC(15,2),saldo NUMERIC(15,2),fecha TEXT,vencimiento TEXT,estado TEXT DEFAULT 'pendiente',creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cxp(id TEXT PRIMARY KEY,proveedor_id TEXT,sucursal_id TEXT,referencia TEXT,monto NUMERIC(15,2),saldo NUMERIC(15,2),fecha TEXT,vencimiento TEXT,estado TEXT DEFAULT 'pendiente',creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pagos_cxc(id SERIAL PRIMARY KEY,cxc_id TEXT,monto NUMERIC(15,2),usuario_id TEXT,metodo TEXT DEFAULT 'efectivo',banco_id TEXT,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pagos_cxp(id SERIAL PRIMARY KEY,cxp_id TEXT,monto NUMERIC(15,2),usuario_id TEXT,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS config(clave TEXT PRIMARY KEY,valor TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS licencias(id SERIAL PRIMARY KEY,clave TEXT NOT NULL,tipo TEXT NOT NULL,fecha_activacion TEXT,fecha_vencimiento TEXT,activa INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_log(id SERIAL PRIMARY KEY,sucursal_id TEXT,tabla TEXT,operacion TEXT,registro_id TEXT,datos TEXT,fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'),sincronizado INTEGER DEFAULT 0)`);
  // ── BANCOS ──
  await pool.query(`CREATE TABLE IF NOT EXISTS bancos(id TEXT PRIMARY KEY,nombre TEXT NOT NULL,numero_cuenta TEXT,tipo TEXT DEFAULT 'corriente',moneda TEXT DEFAULT 'HNL',saldo_inicial NUMERIC(15,2) DEFAULT 0,saldo_actual NUMERIC(15,2) DEFAULT 0,activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bancos_movimientos(id TEXT PRIMARY KEY,banco_id TEXT NOT NULL,tipo TEXT NOT NULL CHECK(tipo IN('deposito','retiro','transferencia','nota_credito','nota_debito')),fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'),monto NUMERIC(15,2) NOT NULL,descripcion TEXT,referencia TEXT,saldo_anterior NUMERIC(15,2) DEFAULT 0,saldo_nuevo NUMERIC(15,2) DEFAULT 0,usuario_id TEXT,FOREIGN KEY(banco_id) REFERENCES bancos(id))`);
  // ── IMPUESTOS ──
  await pool.query(`CREATE TABLE IF NOT EXISTS impuestos(id TEXT PRIMARY KEY,nombre TEXT NOT NULL,tasa NUMERIC(15,2) NOT NULL,tipo TEXT DEFAULT 'porcentaje',aplica_a TEXT DEFAULT 'todos',activo INTEGER DEFAULT 1,creado TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'))`);
  // ── PERMISOS MÓDULOS POR USUARIO ──
  await pool.query(`CREATE TABLE IF NOT EXISTS permisos_modulos(id SERIAL PRIMARY KEY,usuario_id TEXT NOT NULL,modulo TEXT NOT NULL,bloqueado INTEGER DEFAULT 0,UNIQUE(usuario_id,modulo),FOREIGN KEY(usuario_id) REFERENCES usuarios(id))`);
  // ── TURNOS Y FONDO DE CAJA ──
  await pool.query(`CREATE TABLE IF NOT EXISTS turnos(
    id TEXT PRIMARY KEY,
    sucursal_id TEXT NOT NULL,
    usuario_id TEXT NOT NULL,
    fecha_apertura TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'),
    fecha_cierre TEXT,
    fondo_inicial NUMERIC(15,2) DEFAULT 0,
    sin_fondo INTEGER DEFAULT 0,
    total_ventas NUMERIC(15,2) DEFAULT 0,
    total_efectivo NUMERIC(15,2) DEFAULT 0,
    total_tarjeta NUMERIC(15,2) DEFAULT 0,
    total_transferencia NUMERIC(15,2) DEFAULT 0,
    total_egresos NUMERIC(15,2) DEFAULT 0,
    efectivo_esperado NUMERIC(15,2) DEFAULT 0,
    efectivo_contado NUMERIC(15,2) DEFAULT 0,
    diferencia NUMERIC(15,2) DEFAULT 0,
    estado TEXT DEFAULT 'abierto' CHECK(estado IN('abierto','cerrado')),
    notas TEXT,
    FOREIGN KEY(sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS movimientos_caja(
    id TEXT PRIMARY KEY,
    turno_id TEXT NOT NULL,
    sucursal_id TEXT NOT NULL,
    usuario_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN('ingreso','egreso')),
    concepto TEXT NOT NULL,
    monto NUMERIC(15,2) NOT NULL,
    fecha TEXT DEFAULT(NOW() AT TIME ZONE 'America/Tegucigalpa'),
    FOREIGN KEY(turno_id) REFERENCES turnos(id)
  )`);
  // Migrate ventas: add turno_id column if not exists
  try { await pool.query(`ALTER TABLE ventas ADD COLUMN turno_id TEXT`); } catch(e) {}
  // Migrate turnos: add columns missing from earlier incomplete versions
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN total_ventas NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN total_efectivo NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN total_tarjeta NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN total_transferencia NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN total_egresos NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN efectivo_esperado NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN efectivo_contado NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN diferencia NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN fecha_cierre TEXT`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN sin_fondo INTEGER DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE turnos ADD COLUMN notas TEXT`); } catch(e) {}
  // ── FORMA DE PAGO EN VENTAS ──
  // Migrate: add payment columns to ventas if not exist
  try { await pool.query(`ALTER TABLE ventas ADD COLUMN forma_pago TEXT DEFAULT 'efectivo'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE ventas ADD COLUMN monto_recibido NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE ventas ADD COLUMN cambio NUMERIC(15,2) DEFAULT 0`); } catch(e) {}
  // ── FORMA DE PAGO EN COMPRAS + BANCO ──
  try { await pool.query(`ALTER TABLE compras ADD COLUMN forma_pago TEXT DEFAULT 'efectivo'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE compras ADD COLUMN banco_id TEXT`); } catch(e) {}
  // ── METODO Y BANCO EN PAGOS CxC ──
  try { await pool.query(`ALTER TABLE pagos_cxc ADD COLUMN metodo TEXT DEFAULT 'efectivo'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE pagos_cxc ADD COLUMN banco_id TEXT`); } catch(e) {}
  // ── METODO Y BANCO EN PAGOS CxP ──
  try { await pool.query(`ALTER TABLE pagos_cxp ADD COLUMN metodo TEXT DEFAULT 'efectivo'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE pagos_cxp ADD COLUMN banco_id TEXT`); } catch(e) {}
  // ── VENTA_ID EN CxC PARA VENTAS A CREDITO ──
  try { await pool.query(`ALTER TABLE cxc ADD COLUMN venta_id TEXT`); } catch(e) {}
  // Asegurar categoría Servicios e impuesto Exento en instalaciones existentes
  try { await pool.query(`INSERT INTO categorias(nombre)VALUES('Servicios') ON CONFLICT DO NOTHING`); } catch(e){}
  try {
    const exento = await get(`SELECT id FROM impuestos WHERE nombre='Exento' LIMIT 1`);
    if(!exento){
      await pool.query(`INSERT INTO impuestos(id,nombre,tasa,tipo,aplica_a)VALUES($1,$2,$3,$4,$5)`,[uuid(),'Exento',0,'porcentaje','exentos']);
    }
  } catch(e){}
  console.log('✅ Esquema OK');
}

async function seedData(){
  if(await get(`SELECT id FROM sucursales LIMIT 1`)) return;
  const sid=uuid();
  await pool.query(`INSERT INTO sucursales(id,nombre,direccion,telefono,rtn,cai,serie,rango_ini,rango_fin,fecha_limite)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [sid,'Casa Matriz','Tegucigalpa, Honduras','2234-5678','08011985024566','6542H9-B3C8BC-7442C5-5BD634-5684F5-C0','002-001-01','002-001-01-00000001','002-001-01-00000050','2026-12-31']);
  const hash=bcrypt.hashSync('admin123',10);
  await pool.query(`INSERT INTO usuarios(id,nombre,username,password,rol,sucursal_id)VALUES($1,$2,$3,$4,$5,$6)`,
    [uuid(),'Administrador','admin',hash,'admin',sid]);
  const prods=[
    [uuid(),'PROD001','Arroz Premium 5lb','Alimentos',85,55,1],
    [uuid(),'PROD002','Aceite Vegetal 1L','Alimentos',65,40,1],
    [uuid(),'PROD003','Leche Entera 1L','Lácteos',35,22,1],
    [uuid(),'PROD004','Pan Blanco','Panadería',25,15,1],
    [uuid(),'PROD005','Detergente 1kg','Limpieza',95,60,1],
  ];
  for(const p of prods){
    await pool.query(`INSERT INTO productos(id,codigo,nombre,categoria,precio_venta,costo,gravado)VALUES($1,$2,$3,$4,$5,$6,$7)`,p);
    await pool.query(`INSERT INTO inventario(producto_id,sucursal_id,stock,stock_min)VALUES($1,$2,50,10)`,[p[0],sid]);
  }
  await pool.query(`INSERT INTO clientes(id,nombre,rtn)VALUES($1,$2,$3)`,[uuid(),'Consumidor Final','']);
  await pool.query(`INSERT INTO clientes(id,nombre,rtn,telefono,limite_credito)VALUES($1,$2,$3,$4,$5)`,[uuid(),'Empresa ABC S.A.','08011990123456','2240-1234',50000]);
  await pool.query(`INSERT INTO proveedores(id,nombre,rtn,telefono,email)VALUES($1,$2,$3,$4,$5)`,[uuid(),'Distribuidora Nacional','08019880001234','2211-0000','ventas@dist.hn']);
  for(const c of ['Alimentos','Lácteos','Panadería','Limpieza','Bebidas','Varios','Servicios']){
    await pool.query(`INSERT INTO categorias(nombre)VALUES($1) ON CONFLICT DO NOTHING`,[c]);
  }
  // Impuesto Exento (0%) para servicios
  const exentoExiste = await get(`SELECT id FROM impuestos WHERE nombre='Exento' LIMIT 1`);
  if(!exentoExiste){
    await pool.query(`INSERT INTO impuestos(id,nombre,tasa,tipo,aplica_a)VALUES($1,$2,$3,$4,$5)`,[uuid(),'Exento',0,'porcentaje','exentos']);
  } console.log('✅ Datos iniciales — admin/admin123');
}

function auth(roles=[]){
  return(req,res,next)=>{
    const t=req.headers.authorization?.split(' ')[1];
    if(!t)return res.status(401).json({error:'Token requerido'});
    try{
      const p=jwt.verify(t,JWT_SECRET);
      req.user=p;
      if(roles.length&&!roles.includes(p.rol))return res.status(403).json({error:'Sin permiso'});
      next();
    }catch{return res.status(401).json({error:'Token inválido'});}
  };
}

async function ajustarStock(pid,sid,qty,tipo,ref,motivo,uid,costo=0,precio=0){
  const inv=await get(`SELECT stock FROM inventario WHERE producto_id=$1 AND sucursal_id=$2`,[pid,sid]);
  const cur=inv?Number(inv.stock):0;
  const nuevo=(tipo==='entrada'||tipo==='compra')?cur+qty:Math.max(0,cur-qty);
  await pool.query(`INSERT INTO inventario(producto_id,sucursal_id,stock,stock_min)VALUES($1,$2,0,0) ON CONFLICT DO NOTHING`,[pid,sid]);
  await pool.query(`UPDATE inventario SET stock=$1 WHERE producto_id=$2 AND sucursal_id=$3`,[nuevo,pid,sid]);
  await pool.query(`INSERT INTO kardex(producto_id,sucursal_id,tipo,cantidad,costo_unit,precio_unit,saldo_stock,referencia,motivo,usuario_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[pid,sid,tipo,qty,costo,precio,nuevo,ref,motivo,uid]);
  return nuevo;
}

// ── AUTH ──
app.post('/api/auth/login',async (req,res)=>{
  const{username,password,sucursal_id}=req.body;
  if(!username||!password)return res.status(400).json({error:'Usuario y contraseña requeridos'});
  // Verificar licencia activa
  const lic=getLicenciaActiva();
  if(!lic)return res.status(403).json({error:'Sistema sin licencia activa. Por favor active una licencia.',sinLicencia:true});
  const u=await get(`SELECT * FROM usuarios WHERE username=? AND activo=1`,[username]);
  if(!u||!bcrypt.compareSync(password,u.password))return res.status(401).json({error:'Usuario o contraseña incorrectos'});
  // Para admin: usar la sucursal seleccionada si existe, sino la primera sucursal activa
  let sid=u.sucursal_id;
  if(u.rol==='admin'){
    const sucValida=sucursal_id?get(`SELECT id FROM sucursales WHERE id=? AND activa=1`,[sucursal_id]):null;
    if(sucValida)sid=sucursal_id;
    else{const primera=await get(`SELECT id FROM sucursales WHERE activa=1`);if(primera)sid=primera.id;}
  }
  const suc=await get(`SELECT * FROM sucursales WHERE id=?`,[sid])||get(`SELECT * FROM sucursales WHERE activa=1`);
  const token=jwt.sign({id:u.id,nombre:u.nombre,username:u.username,rol:u.rol,sucursal_id:sid||''},JWT_SECRET,{expiresIn:'12h'});
  res.json({token,user:{id:u.id,nombre:u.nombre,username:u.username,rol:u.rol,sucursal_id:sid},sucursal:suc});
});
app.get('/api/auth/me',auth(),async (req,res)=>res.json(get(`SELECT id,nombre,username,rol,sucursal_id FROM usuarios WHERE id=?`,[req.user.id])));

// ── USUARIOS ──
app.get('/api/usuarios',auth(['admin']),async (req,res)=>res.json(await all(`SELECT u.id,u.nombre,u.username,u.rol,u.activo,u.creado,s.nombre as sucursal_nombre FROM usuarios u LEFT JOIN sucursales s ON s.id=u.sucursal_id`)));
app.post('/api/usuarios',auth(['admin']),async (req,res)=>{
  const{nombre,username,password,rol,sucursal_id}=req.body;
  if(get(`SELECT id FROM usuarios WHERE username=?`,[username]))return res.status(400).json({error:'Username ya existe'});
  const sid=sucursal_id||null; const id=uuid(); run(`INSERT INTO usuarios(id,nombre,username,password,rol,sucursal_id)VALUES(?,?,?,?,?,?)`,[id,nombre,username,bcrypt.hashSync(password,10),rol,sid]); res.json({id});
});
app.put('/api/usuarios/:id',auth(['admin']),async (req,res)=>{
  const{nombre,rol,sucursal_id,activo,password}=req.body;
  const sid2=sucursal_id||null;
  if(password)run(`UPDATE usuarios SET nombre=?,rol=?,sucursal_id=?,activo=?,password=? WHERE id=?`,[nombre,rol,sid2,activo,bcrypt.hashSync(password,10),req.params.id]);
  else run(`UPDATE usuarios SET nombre=?,rol=?,sucursal_id=?,activo=? WHERE id=?`,[nombre,rol,sid2,activo,req.params.id]); res.json({ok:1});
});

// ── SUCURSALES ──
app.get('/api/sucursales',async (req,res)=>res.json(await all(`SELECT id,nombre FROM sucursales WHERE activa=1`)));
app.post('/api/sucursales',auth(['admin']),async (req,res)=>{
  const{nombre,direccion,telefono,rtn,cai,serie,rango_ini,rango_fin,fecha_limite}=req.body;
  const id=uuid(); run(`INSERT INTO sucursales(id,nombre,direccion,telefono,rtn,cai,serie,rango_ini,rango_fin,fecha_limite)VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,nombre,direccion,telefono,rtn,cai,serie,rango_ini,rango_fin,fecha_limite]); res.json({id});
});
app.put('/api/sucursales/:id',auth(['admin']),async (req,res)=>{
  try {
    const{nombre,direccion,telefono,rtn,cai,serie,rango_ini,rango_fin,fecha_limite,logo}=req.body;
    run(`UPDATE sucursales SET nombre=?,direccion=?,telefono=?,rtn=?,cai=?,serie=?,rango_ini=?,rango_fin=?,fecha_limite=?,logo=? WHERE id=?`,
      [nombre||'',direccion||'',telefono||'',rtn||'',cai||'',serie||'',rango_ini||'',rango_fin||'',fecha_limite||'',logo||null,req.params.id]); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete('/api/sucursales/:id',auth(['admin']),async (req,res)=>{
  try {
    // No eliminar si solo queda 1 sucursal activa
    const total = await get(`SELECT COUNT(*) as cnt FROM sucursales WHERE activa=1`);
    if(total?.cnt <= 1) return res.status(400).json({error:'No se puede eliminar la única sucursal activa'});
    run(`UPDATE sucursales SET activa=0 WHERE id=?`,[req.params.id]); res.json({ok:1});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── PRODUCTOS ──
app.get('/api/productos',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const q=req.query.q;
  let sql=`SELECT p.*,COALESCE(i.stock,0) as stock,COALESCE(i.stock_min,0) as stock_min FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id AND i.sucursal_id=? WHERE p.activo=1`;
  const params=[suc];
  if(q){sql+=` AND (p.nombre LIKE ? OR p.codigo LIKE ?)`; params.push(`%${q}%`,`%${q}%`);}
  sql+=` ORDER BY p.nombre`;
  res.json(await all(sql,params));
});
app.get('/api/productos/barcode/:codigo',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const p=await get(`SELECT p.*,COALESCE(i.stock,0) as stock FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id AND i.sucursal_id=? WHERE p.codigo=? AND p.activo=1`,[suc,req.params.codigo]);
  if(!p)return res.status(404).json({error:'No encontrado'}); res.json(p);
});
app.post('/api/productos',auth(['admin','supervisor']),async (req,res)=>{
  const{codigo,nombre,categoria,precio_venta,costo,gravado,stock,stock_min}=req.body;
  if(get(`SELECT id FROM productos WHERE codigo=?`,[codigo]))return res.status(400).json({error:'Código ya existe'});
  const id=uuid();
  run(`INSERT INTO productos(id,codigo,nombre,categoria,precio_venta,costo,gravado)VALUES(?,?,?,?,?,?,?)`,[id,codigo,nombre,categoria,precio_venta,costo||0,gravado!==false?1:0]);
  const suc=req.user.sucursal_id;
  const initStock=parseInt(stock)||0;
  const initMin=parseInt(stock_min)||0;
  await all(`SELECT id FROM sucursales WHERE activa=1`).forEach(s=>{
    run(`INSERT OR IGNORE INTO inventario(producto_id,sucursal_id,stock,stock_min)VALUES(?,?,0,0)`,[id,s.id]);
  });
  if(initStock>0){
    run(`UPDATE inventario SET stock=?,stock_min=? WHERE producto_id=? AND sucursal_id=?`,[initStock,initMin,id,suc]);
    run(`INSERT INTO kardex(producto_id,sucursal_id,tipo,cantidad,costo_unit,precio_unit,saldo_stock,referencia,motivo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,suc,'entrada',initStock,costo||0,precio_venta||0,initStock,'ALTA','Stock inicial',req.user.id]);
  } else if(initMin>0){
    run(`UPDATE inventario SET stock_min=? WHERE producto_id=? AND sucursal_id=?`,[initMin,id,suc]);
  } res.json({id});
});
app.put('/api/productos/:id',auth(['admin','supervisor']),async (req,res)=>{
  const{nombre,categoria,precio_venta,costo,gravado,stock_min}=req.body;
  run(`UPDATE productos SET nombre=?,categoria=?,precio_venta=?,costo=?,gravado=? WHERE id=?`,[nombre,categoria,precio_venta,costo||0,gravado!==false?1:0,req.params.id]);
  if(stock_min!==undefined){
    const suc=req.user.sucursal_id;
    run(`INSERT OR IGNORE INTO inventario(producto_id,sucursal_id,stock,stock_min)VALUES(?,?,0,0)`,[req.params.id,suc]);
    run(`UPDATE inventario SET stock_min=? WHERE producto_id=? AND sucursal_id=?`,[parseInt(stock_min)||0,req.params.id,suc]);
  } res.json({ok:1});
});
app.delete('/api/productos/:id',auth(['admin']),async (req,res)=>{ run(`UPDATE productos SET activo=0 WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── INVENTARIO/KARDEX ──
app.get('/api/inventario',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  res.json(await all(`SELECT p.id,p.codigo,p.nombre,p.categoria,p.precio_venta,p.costo,COALESCE(i.stock,0)as stock,COALESCE(i.stock_min,0)as stock_min FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id AND i.sucursal_id=? WHERE p.activo=1 ORDER BY p.categoria,p.nombre`,[suc]));
});
app.post('/api/inventario/ajuste',auth(['admin','supervisor']),async (req,res)=>{
  const{producto_id,sucursal_id,tipo,cantidad,motivo,costo}=req.body;
  const suc=sucursal_id||req.user.sucursal_id;
  const nuevo=await ajustarStock(producto_id,suc,cantidad,tipo,'AJUSTE',motivo,req.user.id,costo||0); res.json({stock:nuevo});
});
app.put('/api/inventario/stock_min',auth(['admin','supervisor']),async (req,res)=>{
  const{producto_id,sucursal_id,stock_min}=req.body;
  run(`UPDATE inventario SET stock_min=? WHERE producto_id=? AND sucursal_id=?`,[stock_min,producto_id,sucursal_id||req.user.sucursal_id]); res.json({ok:1});
});
app.get('/api/kardex/:pid',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  res.json(await all(`SELECT k.*,u.nombre as usuario_nombre FROM kardex k LEFT JOIN usuarios u ON u.id=k.usuario_id WHERE k.producto_id=? AND k.sucursal_id=? ORDER BY k.fecha DESC LIMIT 200`,[req.params.pid,suc]));
});

// ── CLIENTES ──
app.get('/api/clientes',auth(),async (req,res)=>res.json(await all(`SELECT * FROM clientes WHERE activo=1 ORDER BY nombre`)));
// ── IMPORTAR CLIENTES DESDE EXCEL ──
app.post('/api/clientes/importar_excel',auth(['admin','supervisor']),async (req,res)=>{
  const{clientes}=req.body;
  if(!Array.isArray(clientes)||clientes.length===0)return res.status(400).json({error:'Sin datos'});
  let creados=0,actualizados=0,errores=[];
  for(const c of clientes){
    try{
      const nombre=(c.nombre||'').toString().trim();
      if(!nombre){errores.push({nombre:'(vacío)',error:'Nombre requerido'});continue;}
      const exist=await get(`SELECT id FROM clientes WHERE nombre=? COLLATE NOCASE`,[nombre]);
      if(exist){
        run(`UPDATE clientes SET rtn=?,direccion=?,telefono=?,email=?,limite_credito=? WHERE id=?`,
          [(c.rtn||'').toString().trim(),(c.direccion||'').toString().trim(),
           (c.telefono||'').toString().trim(),(c.email||'').toString().trim(),
           parseFloat(c.limite_credito)||0,exist.id]);
        actualizados++;
      }else{
        run(`INSERT INTO clientes(id,nombre,rtn,direccion,telefono,email,limite_credito)VALUES(?,?,?,?,?,?,?)`,
          [uuid(),nombre,(c.rtn||'').toString().trim(),(c.direccion||'').toString().trim(),
           (c.telefono||'').toString().trim(),(c.email||'').toString().trim(),
           parseFloat(c.limite_credito)||0]);
        creados++;
      }
    }catch(e){errores.push({nombre:c.nombre,error:e.message});}
  } res.json({creados,actualizados,errores,total:clientes.length});
});

app.post('/api/clientes',auth(['admin','supervisor','cajero']),async (req,res)=>{
  const{nombre,rtn,direccion,telefono,email,limite_credito}=req.body;
  const id=uuid(); run(`INSERT INTO clientes(id,nombre,rtn,direccion,telefono,email,limite_credito)VALUES(?,?,?,?,?,?,?)`,[id,nombre,rtn||'',direccion||'',telefono||'',email||'',limite_credito||0]); res.json({id});
});
app.put('/api/clientes/:id',auth(['admin','supervisor']),async (req,res)=>{
  const{nombre,rtn,direccion,telefono,email,limite_credito}=req.body;
  run(`UPDATE clientes SET nombre=?,rtn=?,direccion=?,telefono=?,email=?,limite_credito=? WHERE id=?`,[nombre,rtn||'',direccion||'',telefono||'',email||'',limite_credito||0,req.params.id]); res.json({ok:1});
});
app.delete('/api/clientes/:id',auth(['admin']),async (req,res)=>{ run(`UPDATE clientes SET activo=0 WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── PROVEEDORES ──
app.get('/api/proveedores',auth(),async (req,res)=>res.json(await all(`SELECT * FROM proveedores WHERE activo=1 ORDER BY nombre`)));
// ── IMPORTAR PROVEEDORES DESDE EXCEL ──
app.post('/api/proveedores/importar_excel',auth(['admin','supervisor']),async (req,res)=>{
  const{proveedores}=req.body;
  if(!Array.isArray(proveedores)||proveedores.length===0)return res.status(400).json({error:'Sin datos'});
  let creados=0,actualizados=0,errores=[];
  for(const p of proveedores){
    try{
      const nombre=(p.nombre||'').toString().trim();
      if(!nombre){errores.push({nombre:'(vacío)',error:'Nombre requerido'});continue;}
      const exist=await get(`SELECT id FROM proveedores WHERE nombre=? COLLATE NOCASE`,[nombre]);
      if(exist){
        run(`UPDATE proveedores SET rtn=?,contacto=?,telefono=?,email=?,direccion=?,limite_credito=? WHERE id=?`,
          [(p.rtn||'').toString().trim(),(p.contacto||'').toString().trim(),
           (p.telefono||'').toString().trim(),(p.email||'').toString().trim(),
           (p.direccion||'').toString().trim(),parseFloat(p.limite_credito)||0,exist.id]);
        actualizados++;
      }else{
        run(`INSERT INTO proveedores(id,nombre,rtn,contacto,telefono,email,direccion,limite_credito)VALUES(?,?,?,?,?,?,?,?)`,
          [uuid(),nombre,(p.rtn||'').toString().trim(),(p.contacto||'').toString().trim(),
           (p.telefono||'').toString().trim(),(p.email||'').toString().trim(),
           (p.direccion||'').toString().trim(),parseFloat(p.limite_credito)||0]);
        creados++;
      }
    }catch(e){errores.push({nombre:p.nombre,error:e.message});}
  } res.json({creados,actualizados,errores,total:proveedores.length});
});

app.post('/api/proveedores',auth(['admin','supervisor']),async (req,res)=>{
  const{nombre,rtn,direccion,telefono,email,contacto,limite_credito}=req.body;
  const id=uuid(); run(`INSERT INTO proveedores(id,nombre,rtn,direccion,telefono,email,contacto,limite_credito)VALUES(?,?,?,?,?,?,?,?)`,[id,nombre,rtn||'',direccion||'',telefono||'',email||'',contacto||'',limite_credito||0]); res.json({id});
});
app.put('/api/proveedores/:id',auth(['admin','supervisor']),async (req,res)=>{
  const{nombre,rtn,direccion,telefono,email,contacto,limite_credito}=req.body;
  run(`UPDATE proveedores SET nombre=?,rtn=?,direccion=?,telefono=?,email=?,contacto=?,limite_credito=? WHERE id=?`,[nombre,rtn||'',direccion||'',telefono||'',email||'',contacto||'',limite_credito||0,req.params.id]); res.json({ok:1});
});
app.delete('/api/proveedores/:id',auth(['admin']),async (req,res)=>{ run(`UPDATE proveedores SET activo=0 WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── VENTAS ──
app.get('/api/ventas',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin,limite}=req.query;
  let sql=`SELECT v.*,c.nombre as cliente_nombre,c.rtn as cliente_rtn,u.nombre as usuario_nombre FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN usuarios u ON u.id=v.usuario_id WHERE v.sucursal_id=?`;
  const params=[suc];
  if(fecha_ini){sql+=` AND v.fecha::date>=?`;params.push(fecha_ini);}
  if(fecha_fin){sql+=` AND v.fecha::date<=?`;params.push(fecha_fin);}
  sql+=` ORDER BY v.fecha DESC LIMIT ?`;params.push(parseInt(limite)||500);
  res.json(await all(sql,params));
});
app.get('/api/ventas/:id/items',auth(),async (req,res)=>res.json(await all(`SELECT * FROM venta_items WHERE venta_id=?`,[req.params.id])));
app.post('/api/ventas',auth(),async (req,res)=>{
  const{cliente_id,items,subtotal,descuento,importe_gravado,importe_exento,importe_exonerado,isv15,isv18,total,exonerado,orden_compra_exenta,constancia_registro,identificativo_sag,forma_pago,monto_recibido,cambio,turno_id,banco_id}=req.body;
  const suc=req.user.sucursal_id;
  const sucursal=await get(`SELECT * FROM sucursales WHERE id=?`,[suc]);
  if(!sucursal)return res.status(400).json({error:'Sucursal no encontrada'});
  const lastF=await get(`SELECT numero_factura FROM ventas WHERE sucursal_id=? ORDER BY fecha DESC LIMIT 1`,[suc]);
  let nextNum=1;
  if(lastF){const p=lastF.numero_factura.split('-');nextNum=parseInt(p[p.length-1])+1;}
  const numero_factura=`${sucursal.serie}-${String(nextNum).padStart(8,'0')}`;
  const id=uuid();
  await pool.query(`INSERT INTO ventas(id,numero_factura,sucursal_id,cliente_id,usuario_id,subtotal,descuento,importe_gravado,importe_exento,importe_exonerado,isv15,isv18,total,exonerado,orden_compra_exenta,constancia_registro,identificativo_sag,forma_pago,monto_recibido,cambio,turno_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[id,numero_factura,suc,cliente_id,req.user.id,subtotal,descuento||0,importe_gravado||0,importe_exento||0,importe_exonerado||0,isv15||0,isv18||0,total,exonerado?1:0,orden_compra_exenta||'',constancia_registro||'',identificativo_sag||'',forma_pago||'efectivo',monto_recibido||0,cambio||0,turno_id||null]);
  for(const item of items){
    const prod=await get(`SELECT costo FROM productos WHERE id=?`,[item.id]);
    await pool.query(`INSERT INTO venta_items(venta_id,producto_id,producto_codigo,producto_nombre,producto_categoria,cantidad,precio_unit,costo_unit,subtotal)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,item.id,item.codigo,item.nombre,item.categoria||'',item.cantidad,item.precio,prod?.costo||0,item.cantidad*item.precio]);
    await ajustarStock(item.id,suc,item.cantidad,'venta',numero_factura,'Venta POS',req.user.id,prod?.costo||0,item.precio);
  }
  // Si la venta es a crédito, crear CxC automáticamente
  if ((forma_pago||'efectivo') === 'credito' && cliente_id) {
    const hoy = todayHN();
    const venc = new Date(); venc.setDate(venc.getDate() + 30);
    const vencStr = venc.toISOString().substring(0,10);
    const cxcId = uuid();
    await pool.query(`INSERT INTO cxc(id,cliente_id,sucursal_id,referencia,monto,saldo,fecha,vencimiento,venta_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [cxcId, cliente_id, suc, numero_factura, total, total, hoy, vencStr, id]);
    // Actualizar saldo del cliente
    await pool.query(`UPDATE clientes SET saldo=saldo+? WHERE id=?`,[total, cliente_id]);
  }
  // Si el pago es por transferencia o tarjeta, registrar movimiento en banco
  if((forma_pago==='transferencia'||forma_pago==='tarjeta')&&banco_id){
    const banco=await get(`SELECT * FROM bancos WHERE id=?`,[banco_id]);
    if(banco){
      const saldo_ant=banco.saldo_actual;
      const saldo_nuevo=saldo_ant+total;
      const mid=uuid();
      run(`INSERT INTO bancos_movimientos(id,banco_id,tipo,fecha,monto,descripcion,referencia,saldo_anterior,saldo_nuevo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [mid,banco_id,'deposito',nowHN(),total,`Venta ${forma_pago} — ${numero_factura}`,numero_factura,saldo_ant,saldo_nuevo,req.user.id]);
      run(`UPDATE bancos SET saldo_actual=? WHERE id=?`,[saldo_nuevo,banco_id]);
    }
  } res.json({id,numero_factura});
});
app.post('/api/ventas/:id/anular',auth(['admin','supervisor']),async (req,res)=>{
  const v=await get(`SELECT * FROM ventas WHERE id=?`,[req.params.id]);
  if(!v)return res.status(404).json({error:'No encontrada'});
  if(v.estado==='anulada')return res.status(400).json({error:'Ya anulada'});
  const vitems = await all(`SELECT * FROM venta_items WHERE venta_id=$1`,[req.params.id]);
  for(const i of vitems){ await ajustarStock(i.producto_id,v.sucursal_id,i.cantidad,'entrada',`ANULACION-${v.numero_factura}`,'Anulación',req.user.id,i.costo_unit||0,i.precio_unit||0); }
  await pool.query(`UPDATE ventas SET estado='anulada' WHERE id=$1`,[req.params.id]); res.json({ok:1});
});

// ── DEVOLUCIONES ──
app.get('/api/devoluciones',auth(),async (req,res)=>{
  const suc=req.user.sucursal_id;
  res.json(await all(`SELECT d.*,v.numero_factura,u.nombre as usuario_nombre FROM devoluciones d JOIN ventas v ON v.id=d.venta_id LEFT JOIN usuarios u ON u.id=d.usuario_id WHERE d.sucursal_id=? ORDER BY d.fecha DESC`,[suc]));
});
app.post('/api/devoluciones',auth(['admin','supervisor']),async (req,res)=>{
  const{venta_id,items,motivo}=req.body;
  const v=await get(`SELECT * FROM ventas WHERE id=?`,[venta_id]);
  if(!v)return res.status(404).json({error:'Venta no encontrada'});
  const id=uuid();
  const total=items.reduce((s,i)=>s+i.cantidad*i.precio_unit,0);
  run(`INSERT INTO devoluciones(id,venta_id,sucursal_id,usuario_id,motivo,total)VALUES(?,?,?,?,?,?)`,[id,venta_id,v.sucursal_id,req.user.id,motivo,total]);
  for(const item of items){
    run(`INSERT INTO devolucion_items(devolucion_id,producto_id,cantidad,precio_unit,subtotal)VALUES(?,?,?,?,?)`,[id,item.producto_id,item.cantidad,item.precio_unit,item.cantidad*item.precio_unit]);
    await ajustarStock(item.producto_id,v.sucursal_id,item.cantidad,'devolucion',`DEV-${id}`,motivo,req.user.id,0,item.precio_unit);
  }
  run(`UPDATE ventas SET estado='devolucion_parcial' WHERE id=?`,[venta_id]); res.json({id,total});
});
app.get('/api/devoluciones/:id/items',auth(),async (req,res)=>res.json(await all(`SELECT * FROM devolucion_items WHERE devolucion_id=?`,[req.params.id])));

// ── COMPRAS ──
app.get('/api/compras',auth(),async (req,res)=>{
  const suc=req.user.sucursal_id;
  res.json(await all(`SELECT c.*,p.nombre as proveedor_nombre,u.nombre as usuario_nombre FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE c.sucursal_id=? ORDER BY c.fecha DESC`,[suc]));
});
app.get('/api/compras/:id/items',auth(),async (req,res)=>res.json(await all(`SELECT * FROM compra_items WHERE compra_id=?`,[req.params.id])));
app.post('/api/compras',auth(['admin','supervisor']),async (req,res)=>{
  const{proveedor_id,items,numero_doc,notas,forma_pago,banco_id,vencimiento}=req.body;
  const suc=req.user.sucursal_id;
  const id=uuid();
  const subtotal=items.reduce((s,i)=>s+i.cantidad*i.costo_unit,0);
  run(`INSERT INTO compras(id,proveedor_id,sucursal_id,usuario_id,numero_doc,subtotal,isv,total,notas,forma_pago,banco_id)VALUES(?,?,?,?,?,?,0,?,?,?,?)`,[id,proveedor_id,suc,req.user.id,numero_doc||'',subtotal,subtotal,notas||'',forma_pago||'efectivo',banco_id||null]);
  for(const item of items){
    const pn=await get(`SELECT nombre FROM productos WHERE id=?`,[item.producto_id]);
    run(`INSERT INTO compra_items(compra_id,producto_id,producto_nombre,cantidad,costo_unit,subtotal,cantidad_recibida)VALUES(?,?,?,?,?,?,0)`,[id,item.producto_id,pn?.nombre||'',item.cantidad,item.costo_unit,item.cantidad*item.costo_unit]);
  }
  // Si la compra es a crédito, crear CxP automáticamente
  if((forma_pago||'efectivo')==='credito'){
    const hoy=todayHN();
    const venc=vencimiento||new Date(new Date().setDate(new Date().getDate()+30)).toISOString().substring(0,10);
    const cxpId=uuid();
    run(`INSERT INTO cxp(id,proveedor_id,sucursal_id,referencia,monto,saldo,fecha,vencimiento)VALUES(?,?,?,?,?,?,?,?)`,
      [cxpId,proveedor_id,suc,numero_doc||id,subtotal,subtotal,hoy,venc]);
    run(`UPDATE proveedores SET saldo=saldo+? WHERE id=?`,[subtotal,proveedor_id]);
  }
  // Si paga con transferencia o tarjeta y hay banco, registrar movimiento
  if((forma_pago==='transferencia'||forma_pago==='tarjeta')&&banco_id){
    const banco=await get(`SELECT * FROM bancos WHERE id=?`,[banco_id]);
    if(banco){
      const saldo_ant=banco.saldo_actual;
      const saldo_nuevo=saldo_ant-subtotal;
      const mid=uuid();
      run(`INSERT INTO bancos_movimientos(id,banco_id,tipo,fecha,monto,descripcion,referencia,saldo_anterior,saldo_nuevo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [mid,banco_id,'retiro',nowHN(),subtotal,`Compra ${forma_pago} — ${numero_doc||id}`,numero_doc||'',saldo_ant,saldo_nuevo,req.user.id]);
      run(`UPDATE bancos SET saldo_actual=? WHERE id=?`,[saldo_nuevo,banco_id]);
    }
  } res.json({id,subtotal});
});
app.post('/api/compras/:id/recibir',auth(['admin','supervisor']),async (req,res)=>{
  const{items}=req.body;
  const compra=await get(`SELECT * FROM compras WHERE id=?`,[req.params.id]);
  if(!compra)return res.status(404).json({error:'No encontrada'});
  for(const item of items){
    const ci=await get(`SELECT * FROM compra_items WHERE id=?`,[item.compra_item_id]);
    if(!ci)continue;
    run(`UPDATE compra_items SET cantidad_recibida=? WHERE id=?`,[(ci.cantidad_recibida||0)+item.cantidad_recibida,item.compra_item_id]);
    run(`UPDATE productos SET costo=? WHERE id=?`,[ci.costo_unit,ci.producto_id]);
    await ajustarStock(ci.producto_id,compra.sucursal_id,item.cantidad_recibida,'compra',`COMPRA-${req.params.id}`,'Recepción compra',req.user.id,ci.costo_unit);
  }
  const pend=await all(`SELECT * FROM compra_items WHERE compra_id=? AND cantidad_recibida < cantidad`,[req.params.id]);
  run(`UPDATE compras SET estado=? WHERE id=?`,[pend.length===0?'recibida':'parcial',req.params.id]); res.json({ok:1});
});

// ── CxC ──
app.get('/api/cxc',auth(),async (req,res)=>{
  const suc=req.user.sucursal_id;
  res.json(await all(`SELECT cxc.*,c.nombre as cliente_nombre,c.rtn as cliente_rtn FROM cxc LEFT JOIN clientes c ON c.id=cxc.cliente_id WHERE cxc.sucursal_id=? ORDER BY cxc.vencimiento`,[suc]));
});
app.post('/api/cxc',auth(),async (req,res)=>{
  const{cliente_id,referencia,monto,vencimiento}=req.body;
  const id=uuid(); run(`INSERT INTO cxc(id,cliente_id,sucursal_id,referencia,monto,saldo,fecha,vencimiento)VALUES(?,?,?,?,?,?,(NOW() AT TIME ZONE 'America/Tegucigalpa')::date,?)`,[id,cliente_id,req.user.sucursal_id,referencia||'',monto,monto,vencimiento]); res.json({id});
});
app.post('/api/cxc/:id/pagar',auth(),async (req,res)=>{
  try {
  const{monto,metodo,banco_id}=req.body;
  if(!monto||monto<=0)return res.status(400).json({error:'Monto inválido'});
  const c=await get(`SELECT * FROM cxc WHERE id=?`,[req.params.id]);
  if(!c)return res.status(404).json({error:'No encontrada'});
  const ns=Math.max(0,parseFloat((c.saldo-monto).toFixed(2)));
  run(`UPDATE cxc SET saldo=?,estado=? WHERE id=?`,[ns,ns===0?'pagado':'pendiente',req.params.id]);
  try { run(`INSERT INTO pagos_cxc(cxc_id,monto,usuario_id,metodo,banco_id)VALUES(?,?,?,?,?)`,[req.params.id,monto,req.user.id,metodo||'efectivo',banco_id||null]); } catch(e) {
    // Si falla por columnas faltantes, intentar con columnas básicas
    run(`INSERT INTO pagos_cxc(cxc_id,monto,usuario_id)VALUES(?,?,?)`,[req.params.id,monto,req.user.id]);
  }
  run(`UPDATE clientes SET saldo=MAX(0,saldo-?) WHERE id=?`,[monto,c.cliente_id]);
  // Si el pago es por transferencia, registrar movimiento en banco
  if((metodo==='transferencia'||metodo==='tarjeta')&&banco_id){
    const banco=await get(`SELECT * FROM bancos WHERE id=?`,[banco_id]);
    if(banco){
      const saldo_ant=banco.saldo_actual;
      const saldo_nuevo=saldo_ant+monto;
      const mid=uuid();
      run(`INSERT INTO bancos_movimientos(id,banco_id,tipo,fecha,monto,descripcion,referencia,saldo_anterior,saldo_nuevo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [mid,banco_id,'deposito',nowHN(),monto,`Abono CxC — ${c.referencia||c.id}`,c.referencia||'',saldo_ant,saldo_nuevo,req.user.id]);
      run(`UPDATE bancos SET saldo_actual=? WHERE id=?`,[saldo_nuevo,banco_id]);
    }
  } res.json({saldo:ns});
  } catch(e) { console.error('CxC pagar error:',e); res.status(500).json({error:'Error al registrar pago: '+e.message}); }
});
app.delete('/api/cxc/:id',auth(['admin']),async (req,res)=>{ run(`DELETE FROM cxc WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── CxP ──
app.get('/api/cxp',auth(),async (req,res)=>{
  const suc=req.user.sucursal_id;
  res.json(await all(`SELECT cxp.*,p.nombre as proveedor_nombre FROM cxp LEFT JOIN proveedores p ON p.id=cxp.proveedor_id WHERE cxp.sucursal_id=? ORDER BY cxp.vencimiento`,[suc]));
});
app.post('/api/cxp',auth(['admin','supervisor']),async (req,res)=>{
  const{proveedor_id,referencia,monto,vencimiento}=req.body;
  const id=uuid(); run(`INSERT INTO cxp(id,proveedor_id,sucursal_id,referencia,monto,saldo,fecha,vencimiento)VALUES(?,?,?,?,?,?,(NOW() AT TIME ZONE 'America/Tegucigalpa')::date,?)`,[id,proveedor_id,req.user.sucursal_id,referencia||'',monto,monto,vencimiento]); res.json({id});
});
app.post('/api/cxp/:id/pagar',auth(['admin','supervisor']),async (req,res)=>{
  const{monto,metodo,banco_id}=req.body;
  const c=await get(`SELECT * FROM cxp WHERE id=?`,[req.params.id]);
  if(!c)return res.status(404).json({error:'No encontrada'});
  const ns=Math.max(0,c.saldo-monto);
  run(`UPDATE cxp SET saldo=?,estado=? WHERE id=?`,[ns,ns===0?'pagado':'pendiente',req.params.id]);
  run(`INSERT INTO pagos_cxp(cxp_id,monto,usuario_id,metodo,banco_id)VALUES(?,?,?,?,?)`,[req.params.id,monto,req.user.id,metodo||'efectivo',banco_id||null]);
  run(`UPDATE proveedores SET saldo=MAX(0,saldo-?) WHERE id=?`,[monto,c.proveedor_id]);
  // Si el pago es por transferencia o tarjeta, registrar retiro en banco
  if((metodo==='transferencia'||metodo==='tarjeta')&&banco_id){
    const banco=await get(`SELECT * FROM bancos WHERE id=?`,[banco_id]);
    if(banco){
      const saldo_ant=banco.saldo_actual;
      const saldo_nuevo=saldo_ant-monto;
      const mid=uuid();
      run(`INSERT INTO bancos_movimientos(id,banco_id,tipo,fecha,monto,descripcion,referencia,saldo_anterior,saldo_nuevo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [mid,banco_id,'retiro',nowHN(),monto,`Pago CxP — ${c.referencia||c.id}`,c.referencia||'',saldo_ant,saldo_nuevo,req.user.id]);
      run(`UPDATE bancos SET saldo_actual=? WHERE id=?`,[saldo_nuevo,banco_id]);
    }
  } res.json({saldo:ns});
});
app.delete('/api/cxp/:id',auth(['admin']),async (req,res)=>{ run(`DELETE FROM cxp WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── REPORTES ──
app.get('/api/reportes/ventas_resumen',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin}=req.query;
  let w=`WHERE v.sucursal_id=? AND v.estado='emitida'`;const p=[suc];
  if(fecha_ini){w+=` AND v.fecha::date>=?`;p.push(fecha_ini);}
  if(fecha_fin){w+=` AND v.fecha::date<=?`;p.push(fecha_fin);}
  res.json(get(`SELECT COUNT(*)as total_ventas,SUM(subtotal)as subtotal,SUM(descuento)as descuentos,SUM(isv15)as isv15,SUM(total)as total FROM ventas v ${w}`,p));
});
app.get('/api/reportes/ventas_por_categoria',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin}=req.query;
  let w=`WHERE v.sucursal_id=? AND v.estado='emitida'`;const p=[suc];
  if(fecha_ini){w+=` AND v.fecha::date>=?`;p.push(fecha_ini);}
  if(fecha_fin){w+=` AND v.fecha::date<=?`;p.push(fecha_fin);}
  res.json(await all(`SELECT vi.producto_categoria as categoria,SUM(vi.cantidad)as unidades,SUM(vi.subtotal)as total FROM venta_items vi JOIN ventas v ON v.id=vi.venta_id ${w} GROUP BY vi.producto_categoria ORDER BY total DESC`,p));
});
app.get('/api/reportes/ventas_por_mes',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  res.json(await all(`SELECT TO_CHAR(v.fecha::date,'YYYY-MM') as mes,COUNT(*)as ventas,SUM(v.isv15)as isv,SUM(v.total)as total FROM ventas v WHERE v.sucursal_id=$1 AND v.estado='emitida' GROUP BY TO_CHAR(v.fecha::date,'YYYY-MM') ORDER BY mes DESC LIMIT 24`,[suc]));
});
app.get('/api/reportes/articulos_por_dia',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin}=req.query;
  let w=`WHERE v.sucursal_id=? AND v.estado='emitida'`;const p=[suc];
  if(fecha_ini){w+=` AND v.fecha::date>=?`;p.push(fecha_ini);}
  if(fecha_fin){w+=` AND v.fecha::date<=?`;p.push(fecha_fin);}
  res.json(await all(`SELECT v.fecha::date as dia,vi.producto_codigo,vi.producto_nombre,vi.producto_categoria,SUM(vi.cantidad)as unidades,SUM(vi.subtotal)as total FROM venta_items vi JOIN ventas v ON v.id=vi.venta_id ${w} GROUP BY v.fecha::date,vi.producto_id,vi.producto_codigo,vi.producto_nombre,vi.producto_categoria ORDER BY dia DESC,total DESC`,p));
});
app.get('/api/reportes/inventario',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  res.json(await all(`SELECT p.codigo,p.nombre,p.categoria,p.precio_venta,p.costo,COALESCE(i.stock,0)as stock,COALESCE(i.stock_min,0)as stock_min,COALESCE(i.stock,0)*p.costo as valor_costo,COALESCE(i.stock,0)*p.precio_venta as valor_venta FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id AND i.sucursal_id=? WHERE p.activo=1 ORDER BY p.categoria,p.nombre`,[suc]));
});

// ── DASHBOARD ──
app.get('/api/dashboard',auth(),async (req,res)=>{
  const suc = req.query.sucursal_id || req.user.sucursal_id;
  const hoy = new Date(); hoy.setHours(hoy.getHours()-6);
  const fechaHoy = hoy.toISOString().substring(0,10);
  const mesIni  = fechaHoy.substring(0,8)+'01';

  const ventasHoy  = await get(`SELECT COUNT(*)as total,COALESCE(SUM(total),0)as monto FROM ventas WHERE sucursal_id=$1 AND estado='emitida' AND fecha::date=$2::date`,[suc,fechaHoy]);
  const ventasMes  = await get(`SELECT COUNT(*)as total,COALESCE(SUM(total),0)as monto FROM ventas WHERE sucursal_id=$1 AND estado='emitida' AND fecha::date>=$2::date`,[suc,mesIni]);
  const totalProds = await get(`SELECT COUNT(*)as total FROM productos WHERE activo=1`);
  const stockBajo  = await get(`SELECT COUNT(*)as total FROM inventario i JOIN productos p ON p.id=i.producto_id WHERE i.sucursal_id=? AND i.stock<=i.stock_min AND i.stock_min>0 AND p.activo=1`,[suc]);
  const totalClientes = await get(`SELECT COUNT(*)as total FROM clientes WHERE activo=1`);
  const cxcPendiente  = await get(`SELECT COALESCE(SUM(saldo),0)as monto FROM cxc WHERE estado='pendiente'`);
  const ultVentas = await all(`SELECT v.numero_factura,v.fecha,v.total,v.forma_pago,c.nombre as cliente_nombre FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id WHERE v.sucursal_id=? AND v.estado='emitida' ORDER BY v.fecha DESC LIMIT 8`,[suc]);
  const topProds = await all(`SELECT vi.producto_nombre,SUM(vi.cantidad)as unidades,SUM(vi.subtotal)as total FROM venta_items vi JOIN ventas v ON v.id=vi.venta_id WHERE v.sucursal_id=$1 AND v.estado='emitida' AND v.fecha::date>=($2)::date GROUP BY vi.producto_id,vi.producto_nombre ORDER BY total DESC LIMIT 6`,[suc,mesIni]);
  const ventasPorDia = await all(`SELECT fecha::date as dia,COUNT(*)as ventas,COALESCE(SUM(total),0)as total FROM ventas WHERE sucursal_id=$1 AND estado='emitida' AND fecha::date>=(NOW() AT TIME ZONE 'America/Tegucigalpa')::date - INTERVAL '6 days' GROUP BY fecha::date ORDER BY dia`,[suc]);

  res.json({ventasHoy,ventasMes,totalProds,stockBajo,totalClientes,cxcPendiente,ultVentas,topProds,ventasPorDia,fechaHoy});
});

// ── CONFIG ──
app.get('/api/config',auth(),async (req,res)=>{const r={};await all(`SELECT * FROM config`).forEach(x=>r[x.clave]=x.valor);res.json(r);});
app.put('/api/config',auth(['admin']),async (req,res)=>{for(const[k,v]of Object.entries(req.body))run(`INSERT OR REPLACE INTO config(clave,valor)VALUES(?,?)`,[k,v]); res.json({ok:1});});

// ── SYNC ──
app.get('/api/sync/pendiente/:sid',auth(['admin']),async (req,res)=>res.json(await all(`SELECT * FROM sync_log WHERE sucursal_id!=? AND sincronizado=0 ORDER BY fecha ASC LIMIT 500`,[req.params.sid])));
app.post('/api/sync/confirmar',auth(['admin']),async (req,res)=>{(req.body.ids||[]).forEach(id=>run(`UPDATE sync_log SET sincronizado=1 WHERE id=?`,[id])); res.json({ok:1});});
app.get('/api/sync/estado',auth(['admin']),async (req,res)=>res.json({pendientes:get(`SELECT COUNT(*)as total FROM sync_log WHERE sincronizado=0`).total,sucursales:await all(`SELECT id,nombre FROM sucursales WHERE activa=1`)}));

// ── TURNOS Y FONDO DE CAJA ──
app.get('/api/turnos/activo',auth(),async (req,res)=>{
  try {
    const suc=req.user.sucursal_id;
    const turno=await get(`SELECT t.*,u.nombre as usuario_nombre FROM turnos t LEFT JOIN usuarios u ON u.id=t.usuario_id WHERE t.sucursal_id=? AND t.estado='abierto' ORDER BY t.fecha_apertura DESC LIMIT 1`,[suc]);
    res.json(turno||null);
  } catch(e){ console.error('turnos/activo:',e.message); res.status(500).json({error:e.message}); }
});
app.get('/api/turnos',auth(['admin','supervisor']),async (req,res)=>{
  try {
    const suc=req.query.sucursal_id||req.user.sucursal_id;
    const{fecha_ini,fecha_fin}=req.query;
    let w=`WHERE t.sucursal_id=?`;const p=[suc];
    if(fecha_ini){w+=` AND date(t.fecha_apertura)>=?`;p.push(fecha_ini);}
    if(fecha_fin){w+=` AND date(t.fecha_apertura)<=?`;p.push(fecha_fin);}
    res.json(await all(`SELECT t.*,u.nombre as usuario_nombre FROM turnos t LEFT JOIN usuarios u ON u.id=t.usuario_id ${w} ORDER BY t.fecha_apertura DESC LIMIT 200`,p));
  } catch(e){ console.error('turnos GET:',e.message); res.status(500).json({error:e.message}); }
});
app.post('/api/turnos/abrir',auth(),async (req,res)=>{
  try {
    const suc=req.user.sucursal_id;
    const existente=await get(`SELECT id FROM turnos WHERE sucursal_id=? AND estado='abierto'`,[suc]);
    if(existente)return res.status(400).json({error:'Ya hay un turno abierto en esta sucursal'});
    const{fondo_inicial,sin_fondo,notas}=req.body;
    const id=uuid();
    run(`INSERT INTO turnos(id,sucursal_id,usuario_id,fondo_inicial,sin_fondo,notas)VALUES(?,?,?,?,?,?)`,[id,suc,req.user.id,fondo_inicial||0,sin_fondo?1:0,notas||'']); res.json({id});
  } catch(e){ console.error('turnos/abrir:',e.message); res.status(500).json({error:e.message}); }
});
app.post('/api/turnos/:id/cerrar',auth(),async (req,res)=>{
  try {
    const turno=await get(`SELECT * FROM turnos WHERE id=? AND estado='abierto'`,[req.params.id]);
    if(!turno)return res.status(404).json({error:'Turno no encontrado o ya cerrado'});
    const{efectivo_contado,notas}=req.body;
    const resumen=await get(`SELECT COALESCE(SUM(total),0)as total_ventas,COALESCE(SUM(CASE WHEN forma_pago='efectivo' THEN total ELSE 0 END),0)as total_efectivo,COALESCE(SUM(CASE WHEN forma_pago='tarjeta' THEN total ELSE 0 END),0)as total_tarjeta,COALESCE(SUM(CASE WHEN forma_pago='transferencia' THEN total ELSE 0 END),0)as total_transferencia FROM ventas WHERE turno_id=? AND estado='emitida'`,[req.params.id])||{};
    const egresos=await get(`SELECT COALESCE(SUM(monto),0)as total FROM movimientos_caja WHERE turno_id=? AND tipo='egreso'`,[req.params.id])||{};
    const efectivo_esp=(turno.fondo_inicial||0)+(resumen.total_efectivo||0)-(egresos.total||0);
    const contado=parseFloat(efectivo_contado)||0;
    const diferencia=contado-efectivo_esp;
    run(`UPDATE turnos SET estado='cerrado',fecha_cierre=NOW() AT TIME ZONE 'America/Tegucigalpa',total_ventas=?,total_efectivo=?,total_tarjeta=?,total_transferencia=?,total_egresos=?,efectivo_esperado=?,efectivo_contado=?,diferencia=?,notas=? WHERE id=?`,
      [resumen.total_ventas||0,resumen.total_efectivo||0,resumen.total_tarjeta||0,resumen.total_transferencia||0,egresos.total||0,efectivo_esp,contado,diferencia,notas||turno.notas||'',req.params.id]); res.json({ok:1,total_ventas:resumen.total_ventas||0,total_efectivo:resumen.total_efectivo||0,total_tarjeta:resumen.total_tarjeta||0,total_transferencia:resumen.total_transferencia||0,fondo_inicial:turno.fondo_inicial||0,egresos:egresos.total||0,efectivo_esperado:efectivo_esp,diferencia});
  } catch(e){ console.error('turnos/cerrar:',e.message); res.status(500).json({error:e.message}); }
});
app.get('/api/turnos/:id/resumen',auth(),async (req,res)=>{
  try {
    const turno=await get(`SELECT t.*,u.nombre as usuario_nombre FROM turnos t LEFT JOIN usuarios u ON u.id=t.usuario_id WHERE t.id=?`,[req.params.id]);
    if(!turno)return res.status(404).json({error:'No encontrado'});
    const ventas=await all(`SELECT * FROM ventas WHERE turno_id=? AND estado='emitida' ORDER BY fecha ASC`,[req.params.id]);
    const movimientos=await all(`SELECT * FROM movimientos_caja WHERE turno_id=? ORDER BY fecha ASC`,[req.params.id]);
    res.json({turno,ventas,movimientos});
  } catch(e){ console.error('turnos/resumen:',e.message); res.status(500).json({error:e.message}); }
});
app.post('/api/turnos/:id/movimiento',auth(),async (req,res)=>{
  try {
    const{tipo,concepto,monto}=req.body;
    const turno=await get(`SELECT id,sucursal_id FROM turnos WHERE id=? AND estado='abierto'`,[req.params.id]);
    if(!turno)return res.status(404).json({error:'Turno no encontrado o cerrado'});
    const id=uuid();
    run(`INSERT INTO movimientos_caja(id,turno_id,sucursal_id,usuario_id,tipo,concepto,monto)VALUES(?,?,?,?,?,?,?)`,[id,req.params.id,turno.sucursal_id,req.user.id,tipo,concepto,monto]); res.json({id});
  } catch(e){ console.error('turnos/movimiento:',e.message); res.status(500).json({error:e.message}); }
});

// ── BANCOS ──
app.get('/api/bancos',auth(),async (req,res)=>res.json(await all(`SELECT * FROM bancos WHERE activo=1 ORDER BY nombre`)));
app.get('/api/bancos/consolidacion',auth(),async (req,res)=>{
  const bancos=await all(`SELECT * FROM bancos WHERE activo=1`);
  const total=bancos.reduce((s,b)=>s+b.saldo_actual,0);
  res.json({bancos,total_consolidado:total});
});
app.post('/api/bancos',auth(['admin']),async (req,res)=>{
  const{nombre,numero_cuenta,tipo,moneda,saldo_inicial}=req.body;
  const id=uuid();
  run(`INSERT INTO bancos(id,nombre,numero_cuenta,tipo,moneda,saldo_inicial,saldo_actual)VALUES(?,?,?,?,?,?,?)`,[id,nombre,numero_cuenta||'',tipo||'corriente',moneda||'HNL',saldo_inicial||0,saldo_inicial||0]); res.json({id});
});
app.put('/api/bancos/:id',auth(['admin']),async (req,res)=>{
  const{nombre,numero_cuenta,tipo,moneda}=req.body;
  run(`UPDATE bancos SET nombre=?,numero_cuenta=?,tipo=?,moneda=? WHERE id=?`,[nombre,numero_cuenta||'',tipo||'corriente',moneda||'HNL',req.params.id]); res.json({ok:1});
});
app.delete('/api/bancos/:id',auth(['admin']),async (req,res)=>{ run(`UPDATE bancos SET activo=0 WHERE id=?`,[req.params.id]); res.json({ok:1}); });
app.get('/api/bancos/:id/movimientos',auth(),async (req,res)=>{
  const{fecha_ini,fecha_fin}=req.query;
  let sql=`SELECT bm.*,u.nombre as usuario_nombre FROM bancos_movimientos bm LEFT JOIN usuarios u ON u.id=bm.usuario_id WHERE bm.banco_id=?`;
  const p=[req.params.id];
  if(fecha_ini){sql+=` AND date(bm.fecha)>=?`;p.push(fecha_ini);}
  if(fecha_fin){sql+=` AND date(bm.fecha)<=?`;p.push(fecha_fin);}
  sql+=` ORDER BY bm.fecha DESC LIMIT 500`;
  res.json(await all(sql,p));
});
app.post('/api/bancos/:id/movimientos',auth(['admin','supervisor']),async (req,res)=>{
  const{tipo,monto,descripcion,referencia,fecha}=req.body;
  const banco=await get(`SELECT * FROM bancos WHERE id=?`,[req.params.id]);
  if(!banco)return res.status(404).json({error:'Banco no encontrado'});
  const saldo_ant=banco.saldo_actual;
  const nuevo_saldo=(tipo==='deposito'||tipo==='nota_credito')?saldo_ant+monto:saldo_ant-monto;
  const id=uuid();
  run(`INSERT INTO bancos_movimientos(id,banco_id,tipo,fecha,monto,descripcion,referencia,saldo_anterior,saldo_nuevo,usuario_id)VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,req.params.id,tipo,fecha||nowHN(),monto,descripcion||'',referencia||'',saldo_ant,nuevo_saldo,req.user.id]);
  run(`UPDATE bancos SET saldo_actual=? WHERE id=?`,[nuevo_saldo,req.params.id]); res.json({id,saldo_actual:nuevo_saldo});
});

// ── IMPUESTOS ──
app.get('/api/impuestos',auth(),async (req,res)=>res.json(await all(`SELECT * FROM impuestos WHERE activo=1 ORDER BY nombre`)));
app.post('/api/impuestos',auth(['admin']),async (req,res)=>{
  const{nombre,tasa,tipo,aplica_a}=req.body;
  const id=uuid();
  run(`INSERT INTO impuestos(id,nombre,tasa,tipo,aplica_a)VALUES(?,?,?,?,?)`,[id,nombre,tasa,tipo||'porcentaje',aplica_a||'todos']); res.json({id});
});
app.put('/api/impuestos/:id',auth(['admin']),async (req,res)=>{
  const{nombre,tasa,tipo,aplica_a,activo}=req.body;
  run(`UPDATE impuestos SET nombre=?,tasa=?,tipo=?,aplica_a=?,activo=? WHERE id=?`,[nombre,tasa,tipo||'porcentaje',aplica_a||'todos',activo!==false?1:0,req.params.id]); res.json({ok:1});
});
app.delete('/api/impuestos/:id',auth(['admin']),async (req,res)=>{ run(`UPDATE impuestos SET activo=0 WHERE id=?`,[req.params.id]); res.json({ok:1}); });

// ── PERMISOS MÓDULOS ──
app.get('/api/usuarios/:id/permisos',auth(['admin']),async (req,res)=>{
  const permisos=await all(`SELECT modulo,bloqueado FROM permisos_modulos WHERE usuario_id=?`,[req.params.id]);
  res.json(permisos);
});
app.put('/api/usuarios/:id/permisos',auth(['admin']),async (req,res)=>{
  const{modulo,bloqueado}=req.body;
  run(`INSERT OR REPLACE INTO permisos_modulos(usuario_id,modulo,bloqueado)VALUES(?,?,?)`,[req.params.id,modulo,bloqueado?1:0]); res.json({ok:1});
});

// ── CARGA EXCEL DE PRODUCTOS ──
app.post('/api/productos/importar_excel',auth(['admin','supervisor']),async (req,res)=>{
  const{productos}=req.body;
  if(!Array.isArray(productos)||productos.length===0)return res.status(400).json({error:'Sin productos'});
  let creados=0,actualizados=0,errores=[];
  for(const p of productos){
    try{
      const{codigo,nombre,categoria,precio_venta,costo,gravado}=p;
      if(!codigo||!nombre||!precio_venta)continue;
      const exist=await get(`SELECT id FROM productos WHERE codigo=?`,[codigo]);
      if(exist){
        run(`UPDATE productos SET nombre=?,categoria=?,precio_venta=?,costo=?,gravado=? WHERE id=?`,[nombre,categoria||'General',parseFloat(precio_venta)||0,parseFloat(costo)||0,gravado!==false&&gravado!=='0'?1:0,exist.id]);
        actualizados++;
      }else{
        const id=uuid();
        run(`INSERT INTO productos(id,codigo,nombre,categoria,precio_venta,costo,gravado)VALUES(?,?,?,?,?,?,?)`,[id,codigo,nombre,categoria||'General',parseFloat(precio_venta)||0,parseFloat(costo)||0,gravado!==false&&gravado!=='0'?1:0]);
        await all(`SELECT id FROM sucursales WHERE activa=1`).forEach(s=>run(`INSERT OR IGNORE INTO inventario(producto_id,sucursal_id,stock,stock_min)VALUES(?,?,0,0)`,[id,s.id]));
        creados++;
      }
    }catch(e){errores.push({codigo:p.codigo,error:e.message});}
  } res.json({creados,actualizados,errores,total:productos.length});
});

// ── IMPORTAR MOVIMIENTOS DE INVENTARIO DESDE EXCEL ──
app.post('/api/inventario/importar_excel',auth(['admin','supervisor']),async (req,res)=>{
  const{movimientos,sucursal_id}=req.body;
  if(!Array.isArray(movimientos)||movimientos.length===0)return res.status(400).json({error:'Sin datos'});
  const suc=sucursal_id||req.user.sucursal_id;
  let procesados=0,errores=[];
  for(const m of movimientos){
    try{
      const codigo=(m.codigo||'').toString().trim();
      const tipo=(m.tipo||'entrada').toString().toLowerCase().trim();
      const cantidad=parseInt(m.cantidad)||0;
      if(!codigo||cantidad<=0){errores.push({codigo,error:'Código o cantidad inválida'});continue;}
      if(!['entrada','ajuste'].includes(tipo)){errores.push({codigo,error:`Tipo inválido: ${tipo} (use entrada o ajuste)`});continue;}
      const prod=await get(`SELECT id FROM productos WHERE codigo=? AND activo=1`,[codigo]);
      if(!prod){errores.push({codigo,error:'Producto no encontrado'});continue;}
      // Para servicios no se aplica movimiento
      const categ=await get(`SELECT categoria FROM productos WHERE id=?`,[prod.id]);
      if((categ?.categoria||'').toLowerCase()==='servicios'){errores.push({codigo,error:'Servicios no manejan inventario'});continue;}
      const costo=parseFloat(m.costo_unit)||0;
      const motivo=(m.motivo||'Importación masiva Excel').toString().trim();
      if(tipo==='ajuste'){
        // Ajuste: establece stock exacto
        const inv=await get(`SELECT stock FROM inventario WHERE producto_id=? AND sucursal_id=?`,[prod.id,suc]);
        const cur=inv?inv.stock:0;
        const diff=cantidad-cur;
        await ajustarStock(prod.id,suc,diff,'ajuste','IMP-EXCEL',motivo,req.user.id,costo,0);
      }else{
        // Entrada: suma al stock existente
        await ajustarStock(prod.id,suc,cantidad,'entrada','IMP-EXCEL',motivo,req.user.id,costo,0);
      }
      procesados++;
    }catch(e){errores.push({codigo:m.codigo,error:e.message});}
  } res.json({procesados,errores,total:movimientos.length});
});

// ── REPORTE LIBRO FISCAL ──
app.get('/api/reportes/libro_fiscal',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin}=req.query;
  let w=`WHERE v.sucursal_id=? AND v.estado='emitida'`;const p=[suc];
  if(fecha_ini){w+=` AND v.fecha::date>=?`;p.push(fecha_ini);}
  if(fecha_fin){w+=` AND v.fecha::date<=?`;p.push(fecha_fin);}
  const ventas=await all(`SELECT v.*,c.nombre as cliente_nombre,c.rtn as cliente_rtn FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id ${w} ORDER BY v.fecha ASC`,p);
  res.json(ventas);
});

// ── REPORTE VALORIZACIÓN DE INVENTARIO ──
app.get('/api/reportes/valorizacion',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  res.json(await all(`SELECT p.codigo,p.nombre,p.categoria,p.precio_venta,p.costo,
    COALESCE(i.stock,0) as stock,COALESCE(i.stock_min,0) as stock_min,
    COALESCE(i.stock,0)*p.costo as valor_costo,
    COALESCE(i.stock,0)*p.precio_venta as valor_venta,
    (COALESCE(i.stock,0)*p.precio_venta)-(COALESCE(i.stock,0)*p.costo) as margen
    FROM productos p LEFT JOIN inventario i ON i.producto_id=p.id AND i.sucursal_id=?
    WHERE p.activo=1 ORDER BY p.categoria,p.nombre`,[suc]));
});

// ── REPORTE CORTE CAJA CON HORA ──
app.get('/api/reportes/corte_caja_detalle',auth(),async (req,res)=>{
  const suc=req.query.sucursal_id||req.user.sucursal_id;
  const{fecha_ini,fecha_fin,hora_ini,hora_fin}=req.query;
  let w=`WHERE v.sucursal_id=? AND v.estado!='anulada'`;const p=[suc];
  if(fecha_ini&&hora_ini){w+=` AND datetime(v.fecha)>=?`;p.push(`${fecha_ini} ${hora_ini}`);}
  else if(fecha_ini){w+=` AND v.fecha::date>=?`;p.push(fecha_ini);}
  if(fecha_fin&&hora_fin){w+=` AND datetime(v.fecha)<=?`;p.push(`${fecha_fin} ${hora_fin}`);}
  else if(fecha_fin){w+=` AND v.fecha::date<=?`;p.push(fecha_fin);}
  const ventas=await all(`SELECT v.*,c.nombre as cliente_nombre FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id ${w} ORDER BY v.fecha ASC`,p);
  const resumen=await get(`SELECT COUNT(*)as total_ventas,SUM(subtotal)as subtotal,SUM(descuento)as descuentos,SUM(isv15)as isv15,SUM(isv18)as isv18,SUM(total)as total,
    SUM(CASE WHEN forma_pago='efectivo' THEN total ELSE 0 END) as total_efectivo,
    SUM(CASE WHEN forma_pago='tarjeta' THEN total ELSE 0 END) as total_tarjeta,
    SUM(CASE WHEN forma_pago='transferencia' THEN total ELSE 0 END) as total_transferencia
    FROM ventas v ${w}`,p)||{};
  res.json({ventas,resumen});
});

// ── SPA fallback ──
app.get('/{*path}',async (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

initDB().then(()=>{
  app.listen(PORT,'0.0.0.0',()=>{
    console.log(`\n🚀 MetricPOS Premium (PostgreSQL) → http://0.0.0.0:${PORT}`);
  console.log(`   BD: PostgreSQL (${process.env.DATABASE_URL?.split('@')[1] || 'local'})`);
    console.log(`   Login: admin / admin123\n`);
  });
}).catch(err=>{console.error(err);process.exit(1);});
