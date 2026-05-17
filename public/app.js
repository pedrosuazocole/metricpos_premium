// ═══════════════════════════════════════════════════════════════════════════
// METRIC POS v7.3 (Servicios) — Frontend App (REST API Mode)
// ═══════════════════════════════════════════════════════════════════════════
const API = '';
let TOKEN = localStorage.getItem('mp_token');
let USER  = JSON.parse(localStorage.getItem('mp_user')||'null');
let BRANCH= JSON.parse(localStorage.getItem('mp_branch')||'null');

// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + '/api' + path, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
const GET    = (p, q='') => api('GET', p + (q ? '?' + q : ''));
const POST   = (p, b)    => api('POST', p, b);
const PUT    = (p, b)    => api('PUT', p, b);
const DELETE = (p)       => api('DELETE', p);

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fL = n => 'L. ' + (parseFloat(n)||0).toFixed(2);
const fD = d => d ? new Date(d+'T06:00:00Z').toLocaleDateString('es-HN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Tegucigalpa'}) : '—';
const fDT= d => d ? new Date(d).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'}) : '—';
const today = () => { const d=new Date(); return new Date(d.getTime()-6*3600000).toISOString().split('T')[0]; };
// Honduras UTC-6 helpers
function nowHN() { const d=new Date(); return new Date(d.getTime()-6*3600000).toISOString().replace('T',' ').substring(0,19); }
function todayHN() { const d=new Date(); return new Date(d.getTime()-6*3600000).toISOString().substring(0,10); }
function nowHNDate() { return new Date(new Date().getTime()-6*3600000); }
const closeModal = id => document.getElementById(id).classList.remove('open');
const openModal  = id => document.getElementById(id).classList.add('open');

function toast(id, ms=3000) {
  const el = document.getElementById(id);
  if(el) { el.style.display='flex'; setTimeout(()=>el.style.display='none',ms); }
}

function numberToWords(n) {
  const ones=['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const tens=['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const hunds=['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  if(n===0)return'CERO';let r='';
  if(Math.floor(n/1000000)>0){r+=(Math.floor(n/1000000)===1?'UN MILLÓN ':numberToWords(Math.floor(n/1000000))+' MILLONES ');n%=1000000;}
  if(Math.floor(n/1000)>0){r+=(Math.floor(n/1000)===1?'MIL ':numberToWords(Math.floor(n/1000))+' MIL ');n%=1000;}
  if(Math.floor(n/100)>0){r+=(n===100?'CIEN ':hunds[Math.floor(n/100)]+' ');n%=100;}
  if(n>0){if(n<20)r+=ones[n]+' ';else{r+=tens[Math.floor(n/10)]+' ';if(n%10>0)r+='Y '+ones[n%10]+' ';}}
  return r.trim();
}
function moneyToWords(a){const i=Math.floor(a),d=Math.round((a-i)*100);return numberToWords(i)+' LEMPIRAS CON '+String(d).padStart(2,'0')+'/100';}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function loadSucursales() {
  const sel = document.getElementById('login-suc');
  sel.innerHTML = '<option value="">Cargando...</option>';
  // Intentar hasta 5 veces con 1 segundo entre intentos
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(API + '/api/sucursales');
      const data = await r.json().catch(()=>[]);
      if (Array.isArray(data) && data.length) {
        sel.innerHTML = data.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
        return; // éxito, salir
      }
    } catch(e) { /* servidor no listo aún */ }
    await new Promise(res => setTimeout(res, 1000)); // esperar 1 segundo
  }
  // Si después de 5 intentos no hay datos, mostrar error
  sel.innerHTML = '<option value="">⚠ Error al cargar sucursales</option>';
  document.getElementById('login-error').textContent = 'No se puede conectar al servidor. Verifica que node server.js esté ejecutándose.';
}

document.addEventListener('DOMContentLoaded', () => {
  // Registrar eventos del login INMEDIATAMENTE
  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('login-pass').onkeydown = e => { if(e.key === 'Enter') doLogin(); };
  document.getElementById('login-user').onkeydown  = e => { if(e.key === 'Enter') doLogin(); };

  // Mostrar login o app segun token guardado
  if (TOKEN && USER) {
    showApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    // Verificar estado de licencia
    verificarLicencia();
  }

  // Cargar sucursales en segundo plano, no bloquea el login
  loadSucursales();
});

async function verificarLicencia() {
  try {
    const r = await fetch('/api/licencia/estado');
    const data = await r.json();
    const badge = document.getElementById('lic-badge');
    const inner = document.getElementById('lic-badge-inner');
    badge.style.display = 'block';
    if (data.activa) {
      const tipo = {mensual:'Mensual',trimestral:'Trimestral',anual:'Anual',vitalicia:'Vitalicia'}[data.tipo] || data.tipo;
      if (data.diasRestantes <= 7) {
        inner.style.cssText = 'display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa';
        inner.textContent = `⚠️ Licencia ${tipo} — vence en ${data.diasRestantes} día(s)`;
      } else {
        inner.style.cssText = 'display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0';
        inner.textContent = `✅ Licencia ${tipo} activa — ${data.diasRestantes} días restantes`;
      }
    } else {
      inner.style.cssText = 'display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#fef2f2;color:#991b1b;border:1px solid #fecaca';
      inner.textContent = '🔒 Sin licencia activa';
      // Modal automático desactivado — el usuario puede ingresar sin licencia
    }
  } catch(e) { /* servidor no disponible */ }
}

function abrirModalLicencia(cancelable=true) {
  document.getElementById('licencia-modal').style.display = 'flex';
  document.getElementById('lic-cancel-btn').style.display = cancelable ? 'block' : 'none';
  document.getElementById('lic-clave').value = '';
  document.getElementById('lic-error').textContent = '';
  setTimeout(()=>document.getElementById('lic-clave').focus(), 100);
}

async function activarLicencia() {
  const clave = document.getElementById('lic-clave').value.trim();
  const errEl = document.getElementById('lic-error');
  errEl.textContent = '';
  if (!clave) { errEl.textContent = 'Ingrese la clave de licencia'; return; }
  try {
    const r = await fetch('/api/licencia/activar', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({clave})
    });
    const data = await r.json();
    if (!r.ok) { errEl.textContent = data.error || 'Error al activar'; return; }
    const tipos = {mensual:'Mensual',trimestral:'Trimestral',anual:'Anual',vitalicia:'Vitalicia'};
    document.getElementById('licencia-modal').style.display = 'none';
    // Mostrar confirmación
    const badge = document.getElementById('lic-badge');
    const inner = document.getElementById('lic-badge-inner');
    badge.style.display = 'block';
    inner.style.cssText = 'display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0';
    inner.textContent = `✅ Licencia ${tipos[data.tipo]||data.tipo} activada — ${data.diasRestantes} días`;
    alert(`🎉 ¡Licencia activada exitosamente!\n\nTipo: ${tipos[data.tipo]||data.tipo}\nVálida hasta: ${data.vencimiento}`);
  } catch(e) {
    errEl.textContent = 'Error de conexión con el servidor';
  }
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const sucursal_id = document.getElementById('login-suc').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const r = await POST('/auth/login', { username, password, sucursal_id });
    TOKEN  = r.token;
    USER   = r.user;
    BRANCH = r.sucursal;
    localStorage.setItem('mp_token', TOKEN);
    localStorage.setItem('mp_user', JSON.stringify(USER));
    localStorage.setItem('mp_branch', JSON.stringify(BRANCH));
    showApp();
  } catch(e) {
    err.textContent = e.message || 'Error al iniciar sesión';
  }
}

function doLogout() {
  TOKEN = null; USER = null; BRANCH = null;
  localStorage.removeItem('mp_token');
  localStorage.removeItem('mp_user');
  localStorage.removeItem('mp_branch');
  location.reload();
}

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  document.getElementById('top-user').textContent = USER.nombre;
  document.getElementById('top-role').textContent = USER.rol;
  document.getElementById('top-branch').textContent = BRANCH ? BRANCH.nombre : '—';
  document.getElementById('company-name-footer').textContent = BRANCH ? BRANCH.nombre : '';
  document.getElementById('company-rtn-footer').textContent = BRANCH ? 'RTN: ' + (BRANCH.rtn||'') : '';
  await cargarPermisos();
  buildNav();
  navigateTo('dashboard');
  setupEvents();
}

// ─── NAVEGACIÓN ──────────────────────────────────────────────────────────────
const NAV = [
  { view:'dashboard',    label:'📈 Dashboard',         roles:['admin','supervisor','cajero'] },
  { view:'facturacion',  label:'Facturación',         roles:['admin','supervisor','cajero'] },
  { view:'products',     label:'Productos',           roles:['admin','supervisor','cajero'] },
  { view:'clients',      label:'Clientes',            roles:['admin','supervisor','cajero'] },
  { view:'suppliers',    label:'Proveedores',         roles:['admin','supervisor'] },
  { view:'sales',        label:'Ventas',              roles:['admin','supervisor','cajero'] },
  { view:'inventory',    label:'Inventario',          roles:['admin','supervisor'] },
  { view:'kardex',       label:'Kardex / Costos',     roles:['admin','supervisor'] },
  { view:'purchases',    label:'Compras',             roles:['admin','supervisor'] },
  { view:'returns',      label:'Devoluciones',        roles:['admin','supervisor'] },
  { view:'cxc',          label:'Cuentas x Cobrar',    roles:['admin','supervisor','cajero'] },
  { view:'cxp',          label:'Cuentas x Pagar',     roles:['admin','supervisor'] },
  { view:'bancos',       label:'Bancos',              roles:['admin','supervisor'] },
  { view:'impuestos',    label:'Impuestos',           roles:['admin'] },
  { view:'reports',      label:'Reportes',            roles:['admin','supervisor'] },
  { view:'users',        label:'Usuarios',            roles:['admin'] },
  { view:'branches',     label:'Sucursales',          roles:['admin'] },
  { view:'sync',         label:'Sincronización',      roles:['admin'] },
  { view:'config',       label:'Configuración',       roles:['admin'] },
];

let PERMISOS_BLOQUEADOS = {};   // {modulo: true} → bloqueado

async function cargarPermisos() {
  try {
    const permisos = await GET(`/usuarios/${USER.id}/permisos`);
    PERMISOS_BLOQUEADOS = {};
    permisos.forEach(p => { if(p.bloqueado) PERMISOS_BLOQUEADOS[p.modulo] = true; });
  } catch(e) { PERMISOS_BLOQUEADOS = {}; }
}

function buildNav() {
  const nav = document.getElementById('nav-menu');
  const items = NAV.filter(n =>
    n.roles.includes(USER.rol) && !PERMISOS_BLOQUEADOS[n.view]
  );
  nav.innerHTML = items.map(n => `<button class="nav-item" data-view="${n.view}">${n.label}</button>`).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));
}

let currentView = 'dashboard';
function navigateTo(view) {
  // Verificar permiso — dashboard y facturacion siempre accesibles
  if (view !== 'dashboard' && view !== 'facturacion' && PERMISOS_BLOQUEADOS[view]) {
    alert('⚠️ No tienes permiso para acceder a este módulo.');
    return;
  }
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(view + '-view');
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  renderView(view);
}

function renderView(view) {
  switch(view) {
    case 'dashboard':   renderDashboard(); break;
    case 'facturacion': renderFacturacion(); break;
    case 'products':  renderProducts(); break;
    case 'clients':   renderClients(); break;
    case 'suppliers': renderSuppliers(); break;
    case 'sales':     renderSales(); break;
    case 'inventory': renderInventory(); break;
    case 'kardex':    renderKardexPage(); break;
    case 'purchases': renderPurchases(); break;
    case 'returns':   renderReturns(); break;
    case 'cxc':       renderCxC(); break;
    case 'cxp':       renderCxP(); break;
    case 'reports':   renderReports(); break;
    case 'users':     renderUsers(); break;
    case 'branches':  renderBranches(); break;
    case 'sync':      loadSync(); break;
    case 'bancos':    renderBancos(); break;
    case 'impuestos': renderImpuestos(); break;
    case 'config':    renderConfig(); break;
  }
}

// ─── BARCODE READER ──────────────────────────────────────────────────────────
let barcodeBuffer = '';
let barcodeTimeout = null;

function setupBarcodeReader() {
  document.addEventListener('keydown', e => {
    // No interceptar si el foco está en un input, textarea o select
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Enter' && barcodeBuffer.length > 3 && currentView === 'facturacion') {
      const code = barcodeBuffer;
      barcodeBuffer = '';
      GET('/productos/barcode/' + code).then(p => {
        if (p && p.id) facAddToCart(p);
      }).catch(() => {});
      return;
    }
    if (e.key.length === 1 && currentView === 'facturacion') {
      barcodeBuffer += e.key;
      clearTimeout(barcodeTimeout);
      barcodeTimeout = setTimeout(() => { barcodeBuffer = ''; }, 150);
    }
  });
}

// ─── PRODUCTOS ───────────────────────────────────────────────────────────────
let editingProduct = null;

let _prodView = 'table'; // 'table' | 'grid'

function setProdView(v) {
  _prodView = v;
  document.getElementById('prod-table-container').style.display = v === 'table' ? '' : 'none';
  document.getElementById('prod-grid-container').style.display  = v === 'grid'  ? '' : 'none';
  document.getElementById('prod-view-table').style.cssText = v === 'table'
    ? 'border:none;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.1)'
    : 'border:none;background:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px';
  document.getElementById('prod-view-grid').style.cssText = v === 'grid'
    ? 'border:none;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.1)'
    : 'border:none;background:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px';
  _renderProductsFiltered();
}

function _getProductsFiltered() {
  const q    = (document.getElementById('prod-search')||{}).value?.toLowerCase()||'';
  const cat  = (document.getElementById('prod-filter-cat')||{}).value||'';
  const stk  = (document.getElementById('prod-filter-stock')||{}).value||'';
  return products_cache.filter(p => {
    const matchQ   = !q   || p.nombre.toLowerCase().includes(q) || (p.codigo||'').toLowerCase().includes(q);
    const matchCat = !cat || p.categoria === cat;
    const stock = parseInt(p.stock)||0;
    const min   = parseInt(p.stock_min)||0;
    const matchStk = !stk
      || (stk === 'ok'     && stock > min)
      || (stk === 'bajo'   && stock > 0 && stock <= min)
      || (stk === 'agotado'&& stock <= 0);
    return matchQ && matchCat && matchStk;
  });
}

function _renderProductsFiltered() {
  const f = _getProductsFiltered();
  const empty = document.getElementById('prod-empty');

  if (f.length === 0) {
    if(empty) empty.style.display = '';
    document.getElementById('products-table-body').innerHTML = '';
    const gc = document.getElementById('prod-card-grid');
    if (gc) gc.innerHTML = '';
    return;
  }
  if(empty) empty.style.display = 'none';

  if (_prodView === 'table') {
    document.getElementById('products-table-body').innerHTML = f.map(p => {
      const stock  = parseInt(p.stock)||0;
      const min    = parseInt(p.stock_min)||0;
      const precio = parseFloat(p.precio_venta)||0;
      const costo  = parseFloat(p.costo)||0;
      const margen = precio > 0 ? ((precio - costo) / precio * 100) : 0;
      const agotado = stock <= 0;
      const bajo    = stock > 0 && stock <= min;
      const stockColor = agotado ? '#dc2626' : bajo ? '#d97706' : '#16a34a';
      const stockBadge = agotado
        ? '<span style="background:#fef2f2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">Agotado</span>'
        : bajo
          ? '<span style="background:#fffbeb;color:#d97706;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">Stock bajo</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">OK</span>';
      return `<tr>
        <td><span style="font-family:monospace;font-size:11px;color:#94a3b8">${p.codigo||''}</span></td>
        <td style="font-weight:600">${p.nombre}</td>
        <td><span class="badge badge-blue">${p.categoria||'—'}</span></td>
        <td style="text-align:right;font-weight:600">L. ${precio.toFixed(2)}</td>
        <td style="text-align:right;color:#64748b">L. ${costo.toFixed(2)}</td>
        <td style="text-align:right;color:${margen>=30?'#16a34a':margen>=15?'#d97706':'#dc2626'};font-weight:600">${margen.toFixed(1)}%</td>
        <td style="text-align:center">${p.gravado!==0?'<span class="badge badge-amber">ISV</span>':'<span class="badge badge-gray">Exento</span>'}</td>
        <td style="text-align:right;font-weight:700;color:${stockColor}">${stock}</td>
        <td style="text-align:right;color:#94a3b8">${min}</td>
        <td style="text-align:center">${stockBadge}</td>
        <td><div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="action-btn edit" onclick="openProductModal('${p.id}')">✏️</button>
          <button class="action-btn delete" onclick="deleteProduct('${p.id}')">🗑️</button>
        </div></td>
      </tr>`;
    }).join('');
  } else {
    const gc = document.getElementById('prod-card-grid');
    if (!gc) return;
    gc.innerHTML = f.map(p => {
      const stock  = parseInt(p.stock)||0;
      const min    = parseInt(p.stock_min)||0;
      const precio = parseFloat(p.precio_venta)||0;
      const costo  = parseFloat(p.costo)||0;
      const margen = precio > 0 ? ((precio - costo) / precio * 100) : 0;
      const agotado = stock <= 0;
      const bajo    = stock > 0 && stock <= min;
      const borderColor = agotado ? '#fca5a5' : bajo ? '#fde68a' : '#bbf7d0';
      const stockColor  = agotado ? '#dc2626' : bajo ? '#d97706' : '#16a34a';
      return `<div style="background:#fff;border:1px solid ${borderColor};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.3">${p.nombre}</div>
            <div style="font-size:11px;color:#94a3b8;font-family:monospace;margin-top:2px">${p.codigo||''}</div>
          </div>
          <span class="badge badge-blue" style="white-space:nowrap;flex-shrink:0">${p.categoria||'—'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:20px;font-weight:800;color:#1e3a5f">L. ${precio.toFixed(2)}</div>
          <div style="font-size:11px;color:#64748b">Costo: L. ${costo.toFixed(2)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9;padding-top:8px">
          <div style="font-size:12px">
            <span style="color:#64748b">Stock: </span>
            <span style="font-weight:700;color:${stockColor}">${stock}</span>
            ${min>0?`<span style="color:#94a3b8;font-size:10px"> / mín ${min}</span>`:''}
          </div>
          <div style="font-size:11px;color:${margen>=30?'#16a34a':margen>=15?'#d97706':'#dc2626'};font-weight:700">
            ${margen.toFixed(1)}% margen
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:2px">
          <button class="btn-primary" style="flex:1;padding:6px;font-size:12px;justify-content:center" onclick="openProductModal('${p.id}')">✏️ Editar</button>
          <button class="action-btn delete" onclick="deleteProduct('${p.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }
}

async function renderProducts() {
  try { products_cache = await GET('/productos', `sucursal_id=${USER.sucursal_id}`); } catch(e) {}

  // KPIs
  const total     = products_cache.length;
  const cats      = new Set(products_cache.map(p => p.categoria)).size;
  const conStock  = products_cache.filter(p => (parseInt(p.stock)||0) > (parseInt(p.stock_min)||0)).length;
  const bajoStock = products_cache.filter(p => { const s=parseInt(p.stock)||0; const m=parseInt(p.stock_min)||0; return s<=0 || (s>0&&s<=m); }).length;
  const valorInv  = products_cache.reduce((s,p)=>s+(parseFloat(p.costo)||0)*(parseInt(p.stock)||0), 0);
  const avgPrecio = total > 0 ? products_cache.reduce((s,p)=>s+(parseFloat(p.precio_venta)||0),0)/total : 0;

  const setKPI = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setKPI('kpi-total', total);
  setKPI('kpi-cats', cats);
  setKPI('kpi-con-stock', conStock);
  setKPI('kpi-bajo-stock', bajoStock);
  setKPI('kpi-valor', fL(valorInv));
  setKPI('kpi-avg-precio', fL(avgPrecio));
  setKPI('prod-count', total + ' productos · ' + cats + ' categorías');

  // Llenar filtro de categorías
  const catSel = document.getElementById('prod-filter-cat');
  if (catSel) {
    const currentCat = catSel.value;
    const uniqueCats = [...new Set(products_cache.map(p=>p.categoria).filter(Boolean))].sort();
    catSel.innerHTML = '<option value="">Todas las categorías</option>'
      + uniqueCats.map(c=>`<option value="${c}"${c===currentCat?' selected':''}>${c}</option>`).join('');
  }

  // Asignar listeners de filtro solo la primera vez
  if (!renderProducts._listenersSet) {
    renderProducts._listenersSet = true;
    ['prod-search','prod-filter-cat','prod-filter-stock'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', _renderProductsFiltered);
      if (el) el.addEventListener('change', _renderProductsFiltered);
    });
  }

  _renderProductsFiltered();
}

function openProductModal(id) {
  const p = id ? products_cache.find(x => x.id === id) : null;
  editingProduct = p;
  document.getElementById('prod-modal-title').textContent = p ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('prod-codigo').value     = p?.codigo || '';
  document.getElementById('prod-nombre').value     = p?.nombre || '';
  document.getElementById('prod-categoria').value  = p?.categoria || '';
  document.getElementById('prod-precio').value     = p?.precio_venta || '';
  document.getElementById('prod-costo').value      = p?.costo || 0;
  document.getElementById('prod-gravado').checked  = p?.gravado !== 0;
  const stockEl    = document.getElementById('prod-stock');
  const stockMinEl = document.getElementById('prod-stock-min');
  if (stockEl)    stockEl.value    = p?.stock     ?? 0;
  if (stockMinEl) stockMinEl.value = p?.stock_min ?? 0;
  openModal('prod-modal');
}

async function saveProduct(e) {
  e.preventDefault();
  const stockEl    = document.getElementById('prod-stock');
  const stockMinEl = document.getElementById('prod-stock-min');
  const data = {
    codigo:      document.getElementById('prod-codigo').value,
    nombre:      document.getElementById('prod-nombre').value,
    categoria:   document.getElementById('prod-categoria').value,
    precio_venta:parseFloat(document.getElementById('prod-precio').value),
    costo:       parseFloat(document.getElementById('prod-costo').value) || 0,
    gravado:     document.getElementById('prod-gravado').checked,
    stock:       stockEl    ? (parseInt(stockEl.value)    || 0) : undefined,
    stock_min:   stockMinEl ? (parseInt(stockMinEl.value) || 0) : undefined,
  };
  // Limpiar campos undefined
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
  try {
    if (editingProduct) await PUT('/productos/' + editingProduct.id, data);
    else await POST('/productos', data);
    closeModal('prod-modal');
    renderProducts();
  } catch(e) { alert(e.message); }
}

async function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try { await DELETE('/productos/' + id); renderProducts(); } catch(e) { alert(e.message); }
}

// ─── CLIENTES ────────────────────────────────────────────────────────────────
let editingClient = null;

async function renderClients() {
  try { clients_cache = await GET('/clientes'); } catch(e) {}
  document.getElementById('client-count').textContent = clients_cache.length + ' clientes';
  document.getElementById('clients-cards').innerHTML = clients_cache.map(c => `
    <div class="client-card">
      <div class="client-card-header">
        <div class="client-avatar">${c.nombre[0]}</div>
        <div style="display:flex;gap:4px">
          <button class="action-btn edit" onclick="openClientModal('${c.id}')">✏️</button>
          <button class="action-btn delete" onclick="deleteClient('${c.id}')">🗑️</button>
        </div>
      </div>
      <div class="client-name">${c.nombre}</div>
      ${c.rtn ? `<div class="client-rtn">RTN: ${c.rtn}</div>` : ''}
      ${c.telefono ? `<div class="client-info">${c.telefono}</div>` : ''}
      ${c.saldo > 0 ? `<div class="client-info" style="color:#dc2626;font-weight:600">Saldo: ${fL(c.saldo)}</div>` : ''}
    </div>
  `).join('');
}

function openClientModal(id) {
  const c = id ? clients_cache.find(x => x.id === id) : null;
  editingClient = c;
  document.getElementById('client-modal-title').textContent = c ? 'Editar Cliente' : 'Nuevo Cliente';
  ['nombre','rtn','direccion','telefono','email'].forEach(k => document.getElementById('client-'+k).value = c?.[k]||'');
  document.getElementById('client-credito').value = c?.limite_credito || 0;
  openModal('client-modal');
}

async function saveClient(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('client-nombre').value,
    rtn: document.getElementById('client-rtn').value,
    direccion: document.getElementById('client-direccion').value,
    telefono: document.getElementById('client-telefono').value,
    email: document.getElementById('client-email').value,
    limite_credito: parseFloat(document.getElementById('client-credito').value) || 0,
  };
  try {
    if (editingClient) await PUT('/clientes/' + editingClient.id, data);
    else await POST('/clientes', data);
    closeModal('client-modal');
    renderClients();
  } catch(e) { alert(e.message); }
}

async function deleteClient(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  try { await DELETE('/clientes/' + id); renderClients(); } catch(e) { alert(e.message); }
}

// ─── PROVEEDORES ─────────────────────────────────────────────────────────────
let suppliers_cache = [];
let editingSupplier = null;

async function renderSuppliers() {
  try { suppliers_cache = await GET('/proveedores'); } catch(e) {}
  document.getElementById('supplier-count').textContent = suppliers_cache.length + ' proveedores';
  document.getElementById('suppliers-table-body').innerHTML = suppliers_cache.map(s => `
    <tr>
      <td style="font-weight:600">${s.nombre}</td>
      <td style="font-family:monospace;font-size:11px">${s.rtn||'—'}</td>
      <td>${s.contacto||'—'}</td>
      <td>${s.telefono||'—'}</td>
      <td style="text-align:right;color:${s.saldo>0?'#dc2626':'#16a34a'};font-weight:600">${fL(s.saldo)}</td>
      <td><div style="display:flex;gap:4px;justify-content:flex-end">
        <button class="action-btn edit" onclick="openSupplierModal('${s.id}')">✏️</button>
        <button class="action-btn delete" onclick="deleteSupplier('${s.id}')">🗑️</button>
      </div></td>
    </tr>
  `).join('');
}

function openSupplierModal(id) {
  const s = id ? suppliers_cache.find(x => x.id === id) : null;
  editingSupplier = s;
  document.getElementById('supplier-modal-title').textContent = s ? 'Editar Proveedor' : 'Nuevo Proveedor';
  ['nombre','rtn','contacto','telefono','email','direccion'].forEach(k => document.getElementById('sup-'+k).value = s?.[k]||'');
  document.getElementById('sup-credito').value = s?.limite_credito || 0;
  openModal('supplier-modal');
}

async function saveSupplier(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('sup-nombre').value,
    rtn: document.getElementById('sup-rtn').value,
    contacto: document.getElementById('sup-contacto').value,
    telefono: document.getElementById('sup-telefono').value,
    email: document.getElementById('sup-email').value,
    direccion: document.getElementById('sup-direccion').value,
    limite_credito: parseFloat(document.getElementById('sup-credito').value)||0,
  };
  try {
    if(editingSupplier) await PUT('/proveedores/'+editingSupplier.id, data);
    else await POST('/proveedores', data);
    closeModal('supplier-modal'); renderSuppliers();
  } catch(e) { alert(e.message); }
}

async function deleteSupplier(id) {
  if(!confirm('¿Eliminar este proveedor?')) return;
  try { await DELETE('/proveedores/'+id); renderSuppliers(); } catch(e) { alert(e.message); }
}

// ─── VENTAS ──────────────────────────────────────────────────────────────────
let sales_cache = [];

async function renderSales() {
  try { sales_cache = await GET('/ventas', `sucursal_id=${USER.sucursal_id}`); } catch(e) {}
  document.getElementById('sales-count').textContent = sales_cache.length + ' facturas';
  const container = document.getElementById('sales-list');
  if (!sales_cache.length) { container.innerHTML = `<div class="empty-state"><p>No hay ventas registradas</p></div>`; return; }
  container.innerHTML = sales_cache.map(s => `
    <div class="sale-card">
      <div>
        <div class="sale-num">${s.numero_factura}</div>
        <div class="sale-meta">${fDT(s.fecha)} · ${s.cliente_nombre||'—'}</div>
        <div class="sale-items-count">Usuario: ${s.usuario_nombre||'—'} ${s.exonerado?'<span class="badge badge-amber">Exonerado</span>':''} ${s.estado==='anulada'?'<span class="badge badge-red">Anulada</span>':''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="sale-amount">${fL(s.total)}</div>
        ${s.estado!=='anulada'?`<button class="btn-print-inv" onclick="printSaleById('${s.id}')">🖨️</button>`:''}
        ${USER.rol!=='cajero'&&s.estado==='emitida'?`<button class="action-btn delete" onclick="anularVenta('${s.id}')">✕</button>`:''}
      </div>
    </div>
  `).join('');
}

async function printSaleById(id) {
  const sale = sales_cache.find(s => s.id === id);
  if (!sale) return;
  try {
    const items = await GET('/ventas/'+id+'/items');
    const cl = { nombre: sale.cliente_nombre, rtn: sale.cliente_rtn };
    const mapped = items.map(i => ({ nombre: i.producto_nombre, precio: i.precio_unit, cantidad: i.cantidad }));
    const saleObj = {
      numero_factura: sale.numero_factura, fecha: sale.fecha, cliente: cl, items: mapped,
      subtotal: sale.subtotal, descuento: sale.descuento||0,
      importeGravado: sale.importe_gravado||0, importeExento: sale.importe_exento||0,
      isv: sale.isv15||0, isv18: sale.isv18||0, total: sale.total,
      exonerado: sale.exonerado, ordenCompraExenta: sale.orden_compra_exenta||'',
      constanciaRegistro: sale.constancia_registro||'', identificativoSAG: sale.identificativo_sag||''
    };
    printInvoice(saleObj);
  } catch(e) { alert(e.message); }
}

async function anularVenta(id) {
  if (!confirm('¿Anular esta venta? El stock se restaurará.')) return;
  try { await POST('/ventas/'+id+'/anular', {}); renderSales(); } catch(e) { alert(e.message); }
}

// ─── INVENTARIO ──────────────────────────────────────────────────────────────
async function renderInventory() {
  let inv = [];
  try { inv = await GET('/inventario', `sucursal_id=${USER.sucursal_id}`); } catch(e) {}
  const q = (document.getElementById('inv-search')||{}).value?.toLowerCase()||'';
  const f = inv.filter(p => p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q));
  const total = inv.reduce((s,p) => s+(p.stock||0)*(p.precio_venta||0), 0);
  const low = inv.filter(p => (p.stock||0) <= (p.stock_min||0));
  document.getElementById('inv-total-value').textContent = fL(total);
  document.getElementById('inv-low-count').textContent = low.length + ' bajo mínimo';
  document.getElementById('inv-table-body').innerHTML = f.map(p => {
    const bajo = (p.stock||0) <= (p.stock_min||0);
    return `<tr>
      <td><span style="font-family:monospace;font-size:11px;color:#94a3b8">${p.codigo}</span></td>
      <td style="font-weight:600">${p.nombre}</td>
      <td><span class="badge badge-blue">${p.categoria}</span></td>
      <td style="text-align:right">${p.stock||0}</td>
      <td style="text-align:right">${p.stock_min||0}</td>
      <td style="text-align:right">L. ${(p.costo||0).toFixed(2)}</td>
      <td style="text-align:right">L. ${(p.precio_venta||0).toFixed(2)}</td>
      <td style="text-align:center">${bajo?'<span class="badge badge-red">⚠ Bajo</span>':'<span class="badge badge-green">OK</span>'}</td>
      <td><button class="btn-primary" style="padding:5px 10px;font-size:11px" onclick="openAjusteModal('${p.id}','${p.nombre.replace(/'/g,"\\'")}',${p.stock||0})">Ajustar</button></td>
    </tr>`;
  }).join('');
}

function openAjusteModal(id, nombre, stock) {
  document.getElementById('ajuste-prod-name').textContent = nombre + ' (Stock actual: ' + stock + ')';
  document.getElementById('ajuste-prod-id').value = id;
  document.getElementById('ajuste-cantidad').value = '';
  document.getElementById('ajuste-costo').value = 0;
  document.getElementById('ajuste-motivo').value = '';
  openModal('ajuste-modal');
}

async function saveAjuste(e) {
  e.preventDefault();
  const id = document.getElementById('ajuste-prod-id').value;
  try {
    await POST('/inventario/ajuste', {
      producto_id: id, sucursal_id: USER.sucursal_id,
      tipo: document.getElementById('ajuste-tipo').value,
      cantidad: parseInt(document.getElementById('ajuste-cantidad').value)||0,
      costo: parseFloat(document.getElementById('ajuste-costo').value)||0,
      motivo: document.getElementById('ajuste-motivo').value
    });
    closeModal('ajuste-modal'); renderInventory();
  } catch(e) { alert(e.message); }
}

// ─── KARDEX ──────────────────────────────────────────────────────────────────
async function renderKardexPage() {
  let inv = [];
  try { inv = await GET('/inventario', `sucursal_id=${USER.sucursal_id}`); } catch(e) {}
  const sel = document.getElementById('kardex-prod-sel');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Seleccionar producto —</option>' +
    inv.map(p => `<option value="${p.id}">${p.codigo} — ${p.nombre}</option>`).join('');
  if (cur) sel.value = cur;
  document.getElementById('kardex-table-body').innerHTML = '';
}

async function loadKardex() {
  const id = document.getElementById('kardex-prod-sel').value;
  if (!id) return;
  try {
    const rows = await GET('/kardex/'+id, `sucursal_id=${USER.sucursal_id}`);
    document.getElementById('kardex-table-body').innerHTML = rows.map(r => `
      <tr>
        <td style="font-size:11px">${fDT(r.fecha)}</td>
        <td><span class="kardex-tipo kt-${r.tipo}">${r.tipo}</span></td>
        <td style="font-size:11px;font-family:monospace">${r.referencia||'—'}</td>
        <td style="font-size:11px">${r.motivo||'—'}</td>
        <td style="text-align:right;font-weight:600;color:${r.tipo==='venta'||r.tipo==='salida'?'#dc2626':'#16a34a'}">${r.cantidad}</td>
        <td style="text-align:right">L. ${(r.costo_unit||0).toFixed(2)}</td>
        <td style="text-align:right">L. ${(r.precio_unit||0).toFixed(2)}</td>
        <td style="text-align:right;font-weight:600">${r.saldo_stock}</td>
        <td style="font-size:11px">${r.usuario_nombre||'—'}</td>
      </tr>
    `).join('');
  } catch(e) { alert(e.message); }
}

// ─── COMPRAS ─────────────────────────────────────────────────────────────────
let purchases_cache = [];
let purchaseItems = [];

async function renderPurchases() {
  try { purchases_cache = await GET('/compras'); } catch(e) {}
  document.getElementById('purchases-count').textContent = purchases_cache.length + ' órdenes';
  const fpLabels = {efectivo:'💵 Efectivo',tarjeta:'💳 Tarjeta',transferencia:'🏦 Transfer.',credito:'📋 Crédito'};
  document.getElementById('purchases-table-body').innerHTML = purchases_cache.map(c => `
    <tr>
      <td style="font-size:11px">${fD(c.fecha)}</td>
      <td style="font-weight:600">${c.proveedor_nombre||'—'}</td>
      <td style="font-family:monospace;font-size:11px">${c.numero_doc||'—'}</td>
      <td style="text-align:right;font-weight:600">${fL(c.total)}</td>
      <td style="font-size:11px">${fpLabels[c.forma_pago]||c.forma_pago||'💵 Efectivo'}</td>
      <td><span class="badge ${c.estado==='recibida'?'badge-green':c.estado==='parcial'?'badge-amber':'badge-blue'}">${c.estado}</span></td>
      <td style="font-size:11px">${c.usuario_nombre||'—'}</td>
      <td>${c.estado!=='recibida'?`<button class="btn-primary" style="padding:5px 10px;font-size:11px" onclick="recibirCompra('${c.id}')">Recibir</button>`:''}</td>
    </tr>
  `).join('');
}

let purFormaPago = 'efectivo';

function setPurFormaPago(fp) {
  purFormaPago = fp;
  ['efectivo','tarjeta','transferencia','credito'].forEach(x => {
    const btn = document.getElementById('pur-fp-'+x);
    if (!btn) return;
    const isActive = x === fp;
    btn.style.background = isActive ? '#2563eb' : '#fff';
    btn.style.color = isActive ? '#fff' : '#475569';
    btn.style.border = isActive ? '2px solid #2563eb' : '1px solid #e2e8f0';
  });
  const bancoRow = document.getElementById('pur-banco-row');
  if (bancoRow) bancoRow.style.display = (fp==='transferencia'||fp==='tarjeta') ? 'block' : 'none';
  const creditoRow = document.getElementById('pur-credito-row');
  if (creditoRow) creditoRow.style.display = fp==='credito' ? 'block' : 'none';
}

async function openPurchaseModal() {
  try { suppliers_cache = await GET('/proveedores'); products_cache = await GET('/productos', `sucursal_id=${USER.sucursal_id}`); } catch(e) {}
  // Cargar bancos para el selector
  let bancos = [];
  try { bancos = await GET('/bancos'); } catch(e) {}
  const bancosEl = document.getElementById('pur-banco');
  if (bancosEl) {
    bancosEl.innerHTML = '<option value="">— Seleccionar banco —</option>' +
      bancos.map(b=>`<option value="${b.id}">${b.nombre} — ${b.numero_cuenta||''} (L. ${(b.saldo_actual||0).toFixed(2)})</option>`).join('');
  }
  document.getElementById('pur-proveedor').innerHTML = suppliers_cache.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
  purchaseItems = [];
  document.getElementById('pur-items-list').innerHTML = '';
  document.getElementById('pur-total').textContent = 'Total: L. 0.00';
  document.getElementById('pur-doc').value = '';
  document.getElementById('pur-notas').value = '';
  // Reset forma de pago a efectivo
  purFormaPago = 'efectivo';
  setPurFormaPago('efectivo');
  // Default vencimiento a 30 días
  const vencEl = document.getElementById('pur-vencimiento');
  if (vencEl) { const d = new Date(); d.setDate(d.getDate()+30); vencEl.value = d.toISOString().substring(0,10); }
  openModal('purchase-modal');
}

function addPurchaseItem() {
  const idx = purchaseItems.length;
  purchaseItems.push({ producto_id: '', cantidad: 1, costo_unit: 0 });
  const div = document.createElement('div');
  div.id = `pur-item-${idx}`;
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML = `
    <select onchange="updatePurItem(${idx},'producto_id',this.value)" style="border:1px solid #e2e8f0;border-radius:6px;padding:6px;font-size:12px;outline:none">
      <option value="">— Producto —</option>
      ${products_cache.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}
    </select>
    <input type="number" min="1" value="1" placeholder="Cant." onchange="updatePurItem(${idx},'cantidad',+this.value)" style="border:1px solid #e2e8f0;border-radius:6px;padding:6px;font-size:12px;outline:none">
    <input type="number" step="0.01" min="0" value="0" placeholder="Costo" onchange="updatePurItem(${idx},'costo_unit',+this.value)" style="border:1px solid #e2e8f0;border-radius:6px;padding:6px;font-size:12px;outline:none">
    <button onclick="removePurItem(${idx})" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:6px 10px;color:#dc2626;cursor:pointer">✕</button>
  `;
  document.getElementById('pur-items-list').appendChild(div);
}

function updatePurItem(idx, key, val) { purchaseItems[idx][key] = val; calcPurTotal(); }
function removePurItem(idx) {
  purchaseItems.splice(idx, 1);
  renderPurchases();
  openPurchaseModal();
}
function calcPurTotal() {
  const total = purchaseItems.reduce((s,i) => s + i.cantidad * i.costo_unit, 0);
  document.getElementById('pur-total').textContent = 'Total: ' + fL(total);
}

async function savePurchase(e) {
  e.preventDefault();
  const items = purchaseItems.filter(i => i.producto_id);
  if (!items.length) { alert('Agrega al menos un artículo'); return; }
  const banco_id = (purFormaPago==='transferencia'||purFormaPago==='tarjeta') ? (document.getElementById('pur-banco')?.value||null) : null;
  if ((purFormaPago==='transferencia'||purFormaPago==='tarjeta') && !banco_id) { alert('Seleccione el banco para el pago'); return; }
  const vencimiento = purFormaPago==='credito' ? (document.getElementById('pur-vencimiento')?.value||null) : null;
  try {
    await POST('/compras', {
      proveedor_id: document.getElementById('pur-proveedor').value,
      items, numero_doc: document.getElementById('pur-doc').value,
      notas: document.getElementById('pur-notas').value,
      forma_pago: purFormaPago,
      banco_id,
      vencimiento
    });
    closeModal('purchase-modal'); renderPurchases();
  } catch(e) { alert(e.message); }
}

async function recibirCompra(id) {
  try {
    const items = await GET('/compras/'+id+'/items');
    const pendientes = items.filter(i => i.cantidad_recibida < i.cantidad);
    if (!pendientes.length) { alert('Ya fue totalmente recibida'); return; }
    const receiveItems = pendientes.map(i => {
      const cant = parseInt(prompt(`${i.producto_nombre}: pendiente ${i.cantidad - (i.cantidad_recibida||0)} unidades. ¿Cuántas recibe ahora?`, i.cantidad - (i.cantidad_recibida||0)));
      return { compra_item_id: i.id, cantidad_recibida: isNaN(cant)?0:cant };
    }).filter(i => i.cantidad_recibida > 0);
    if (!receiveItems.length) return;
    await POST('/compras/'+id+'/recibir', { items: receiveItems });
    renderPurchases();
  } catch(e) { alert(e.message); }
}

// ─── DEVOLUCIONES ─────────────────────────────────────────────────────────────
let returns_cache = [];
let retSale = null;

async function renderReturns() {
  try { returns_cache = await GET('/devoluciones'); } catch(e) {}
  document.getElementById('returns-count').textContent = returns_cache.length + ' devoluciones';
  document.getElementById('returns-table-body').innerHTML = returns_cache.map(r => `
    <tr>
      <td style="font-size:11px">${fD(r.fecha)}</td>
      <td style="font-family:monospace;font-size:11px;font-weight:600">${r.numero_factura||'—'}</td>
      <td>${r.motivo||'—'}</td>
      <td style="text-align:right;font-weight:600">${fL(r.total)}</td>
      <td style="font-size:11px">${r.usuario_nombre||'—'}</td>
    </tr>
  `).join('');
}

function openReturnModal() {
  retSale = null;
  document.getElementById('ret-factura').value = '';
  document.getElementById('ret-sale-info').style.display = 'none';
  document.getElementById('ret-items-list').innerHTML = '';
  document.getElementById('ret-motivo').value = '';
  openModal('return-modal');
}

async function searchReturnSale() {
  const num = document.getElementById('ret-factura').value.trim();
  if (!num) return;
  try {
    const sales = await GET('/ventas', `sucursal_id=${USER.sucursal_id}`);
    retSale = sales.find(s => s.numero_factura === num);
    if (!retSale) { alert('Factura no encontrada'); return; }
    const items = await GET('/ventas/'+retSale.id+'/items');
    retSale._items = items;
    document.getElementById('ret-sale-info').style.display = 'block';
    document.getElementById('ret-sale-info').innerHTML = `<strong>${retSale.numero_factura}</strong> · ${retSale.cliente_nombre} · Total: ${fL(retSale.total)}`;
    document.getElementById('ret-items-list').innerHTML = items.map(i => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="flex:1;font-size:12px">${i.producto_nombre}</span>
        <span style="font-size:12px;color:#64748b">× ${i.cantidad} · L.${(i.precio_unit||0).toFixed(2)}</span>
        <input type="number" id="ret-qty-${i.id}" min="0" max="${i.cantidad}" value="${i.cantidad}" style="width:60px;border:1px solid #e2e8f0;border-radius:6px;padding:4px;font-size:12px;outline:none">
      </div>
    `).join('');
  } catch(e) { alert(e.message); }
}

async function saveReturn(e) {
  e.preventDefault();
  if (!retSale) { alert('Busca primero una factura'); return; }
  const items = retSale._items.map(i => ({
    producto_id: i.producto_id,
    cantidad: parseInt(document.getElementById('ret-qty-'+i.id)?.value)||0,
    precio_unit: i.precio_unit
  })).filter(i => i.cantidad > 0);
  if (!items.length) { alert('Selecciona al menos un artículo'); return; }
  try {
    await POST('/devoluciones', { venta_id: retSale.id, items, motivo: document.getElementById('ret-motivo').value });
    closeModal('return-modal'); renderReturns();
  } catch(e) { alert(e.message); }
}

// ─── CxC ─────────────────────────────────────────────────────────────────────
let cxc_cache = [];


async function renderCxC() {
  try { cxc_cache = await GET('/cxc'); } catch(e) {}
  const total = cxc_cache.filter(c=>c.estado!=='pagado').reduce((s,c)=>s+(parseFloat(c.saldo)||0),0);
  const venc = cxc_cache.filter(c=>c.estado!=='pagado'&&new Date(c.vencimiento)<new Date());
  document.getElementById('cxc-total').textContent = fL(total);
  document.getElementById('cxc-vencidas').textContent = venc.length + ' vencidas';
  const tbody = document.getElementById('cxc-table-body');
  if (cxc_cache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8">No hay cuentas por cobrar</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  cxc_cache.forEach(c => {
    const vencida = c.estado!=='pagado' && new Date(c.vencimiento)<new Date();
    const badge = vencida ? '<span class="badge badge-red">Vencida</span>'
      : c.estado==='pagado' ? '<span class="badge badge-green">Pagada</span>'
      : '<span class="badge badge-amber">Pendiente</span>';
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.dataset.saldo = parseFloat(c.saldo)||0;
    tr.innerHTML = '<td style="font-weight:600">' + (c.cliente_nombre||'—') + '</td>'
      + '<td style="font-size:11px;font-family:monospace">' + (c.referencia||'—') + '</td>'
      + '<td style="font-size:11px">' + fD(c.fecha) + '</td>'
      + '<td style="font-size:11px">' + fD(c.vencimiento) + '</td>'
      + '<td style="text-align:right">' + fL(c.monto) + '</td>'
      + '<td style="text-align:right;color:' + (c.saldo>0?'#dc2626':'#16a34a') + ';font-weight:600">' + fL(c.saldo) + '</td>'
      + '<td>' + badge + '</td>'
      + '<td><div style="display:flex;gap:4px"></div></td>';
    const acciones = tr.querySelector('div');
    if (c.estado !== 'pagado') {
      const btnPagar = document.createElement('button');
      btnPagar.className = 'btn-primary';
      btnPagar.style.cssText = 'padding:5px 10px;font-size:11px';
      btnPagar.textContent = 'Pagar';
      btnPagar.addEventListener('click', () => pagarCxC(c.id, parseFloat(c.saldo)||0));
      acciones.appendChild(btnPagar);
    }
    if (USER.rol === 'admin') {
      const btnDel = document.createElement('button');
      btnDel.className = 'action-btn delete';
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', () => deleteCxC(c.id));
      acciones.appendChild(btnDel);
    }
    tbody.appendChild(tr);
  });
}
async function openCxCModal() {
  try { clients_cache = await GET('/clientes'); } catch(e) {}
  document.getElementById('cxc-cliente-sel').innerHTML = clients_cache.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  ['cxc-monto','cxc-vencimiento','cxc-referencia'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  openModal('cxc-modal');
}

async function saveCxC(e) {
  e.preventDefault();
  try {
    await POST('/cxc', {
      cliente_id: document.getElementById('cxc-cliente-sel').value,
      referencia: document.getElementById('cxc-referencia').value,
      monto: parseFloat(document.getElementById('cxc-monto').value)||0,
      vencimiento: document.getElementById('cxc-vencimiento').value,
    });
    closeModal('cxc-modal'); renderCxC();
  } catch(e) { alert(e.message); }
}

async function pagarCxC(id, saldo) {
  saldo = parseFloat(saldo) || 0;
  let bancos = [];
  try { bancos = await GET('/bancos'); } catch(e) {}
  const existing = document.getElementById('pago-cxc-modal');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'pago-cxc-modal';
  div.className = 'modal-overlay active';
  // Construir HTML sin template literals anidados
  const saldoFmt = fL(saldo);
  const saldoVal = saldo.toFixed(2);
  let bancosHtml = '<option value="">— Seleccionar banco —</option>';
  bancos.forEach(b => {
    bancosHtml += '<option value="' + b.id + '">' + b.nombre + (b.numero_cuenta ? ' — ' + b.numero_cuenta : '') + ' (L. ' + (b.saldo_actual||0).toFixed(2) + ')</option>';
  });
  div.innerHTML = '<div class="modal" style="max-width:420px">'
    + '<div class="modal-header"><h3>💰 Registrar Abono — CxC</h3>'
    + '<button id="cxc-modal-cerrar" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button></div>'
    + '<div style="padding:20px;display:flex;flex-direction:column;gap:14px">'
    + '<div><label style="font-size:12px;font-weight:600;color:#64748b">Saldo pendiente</label>'
    + '<div style="font-size:20px;font-weight:700;color:#dc2626">' + saldoFmt + '</div></div>'
    + '<div><label style="font-size:12px;font-weight:600;color:#64748b">Monto a abonar</label>'
    + '<input type="number" id="cxc-pago-monto" step="0.01" min="0.01" max="' + saldoVal + '" value="' + saldoVal + '"'
    + ' style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px;outline:none;box-sizing:border-box;margin-top:4px"></div>'
    + '<div><label style="font-size:12px;font-weight:600;color:#64748b">Método de pago</label>'
    + '<div style="display:flex;gap:6px;margin-top:6px">'
    + '<button type="button" id="cxc-m-efectivo" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:2px solid #2563eb;cursor:pointer;background:#2563eb;color:#fff">💵 Efectivo</button>'
    + '<button type="button" id="cxc-m-tarjeta" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:#fff;color:#475569">💳 Tarjeta</button>'
    + '<button type="button" id="cxc-m-transferencia" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:#fff;color:#475569">🏦 Transferencia</button>'
    + '</div></div>'
    + '<div id="cxc-banco-row" style="display:none"><label style="font-size:12px;font-weight:600;color:#64748b">Banco receptor</label>'
    + '<select id="cxc-pago-banco" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;outline:none;margin-top:4px;box-sizing:border-box">'
    + bancosHtml + '</select></div>'
    + '<button id="cxc-confirmar-btn" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;width:100%">✅ Confirmar Abono</button>'
    + '</div></div>';
  document.body.appendChild(div);
  // Event listeners directos — sin onclick inline
  let metodoActual = 'efectivo';
  div.querySelector('#cxc-modal-cerrar').addEventListener('click', () => div.remove());
  const btnEfectivo = div.querySelector('#cxc-m-efectivo');
  const btnTarjeta = div.querySelector('#cxc-m-tarjeta');
  const btnTransferencia = div.querySelector('#cxc-m-transferencia');
  const styleActivo = 'background:#2563eb;color:#fff;border:2px solid #2563eb';
  const styleInactivo = 'background:#fff;color:#475569;border:1px solid #e2e8f0';
  function setMetodo(m) {
    metodoActual = m;
    btnEfectivo.style.cssText = (m==='efectivo' ? styleActivo : styleInactivo);
    btnTarjeta.style.cssText = (m==='tarjeta' ? styleActivo : styleInactivo);
    btnTransferencia.style.cssText = (m==='transferencia' ? styleActivo : styleInactivo);
    div.querySelector('#cxc-banco-row').style.display = m==='transferencia' ? 'block' : 'none';
  }
  btnEfectivo.addEventListener('click', () => setMetodo('efectivo'));
  btnTarjeta.addEventListener('click', () => setMetodo('tarjeta'));
  btnTransferencia.addEventListener('click', () => setMetodo('transferencia'));
  div.querySelector('#cxc-confirmar-btn').addEventListener('click', async () => {
    const monto = parseFloat(div.querySelector('#cxc-pago-monto').value);
    if (!monto || monto <= 0) { alert('Ingrese un monto válido'); return; }
    const banco_id = metodoActual === 'transferencia' ? (div.querySelector('#cxc-pago-banco')?.value || null) : null;
    if (metodoActual === 'transferencia' && !banco_id) { alert('Seleccione el banco para la transferencia'); return; }
    try {
      await POST('/cxc/' + id + '/pagar', { monto, metodo: metodoActual, banco_id });
      div.remove();
      renderCxC();
    } catch(err) { alert('Error al registrar pago: ' + err.message); }
  });
}

function setCxCMetodo(m) { /* legacy — ya no se usa */ }
async function confirmarPagoCxC(id) { /* legacy — ya no se usa */ }

async function deleteCxC(id) {
  if(!confirm('¿Eliminar esta cuenta?')) return;
  try { await DELETE('/cxc/'+id); renderCxC(); } catch(e) { alert(e.message); }
}

async function estadoCuentaCxC() {
  // Asegurarse que el cache esté actualizado
  try { cxc_cache = await GET('/cxc'); } catch(e) {}
  try { clients_cache = await GET('/clientes'); } catch(e) {}

  const pendientes = cxc_cache.filter(c => c.estado !== 'pagado');
  if (pendientes.length === 0) { alert('No hay cuentas pendientes por cobrar.'); return; }

  // Agrupar por cliente
  const porCliente = {};
  pendientes.forEach(c => {
    const key = c.cliente_id;
    if (!porCliente[key]) porCliente[key] = { nombre: c.cliente_nombre || '—', id: c.cliente_id, cuentas: [] };
    porCliente[key].cuentas.push(c);
  });

  const clientesList = Object.values(porCliente);

  // Eliminar modal anterior si existe
  const existing = document.getElementById('estado-cxc-modal');
  if (existing) existing.remove();

  // Crear modal con selector de cliente
  const div = document.createElement('div');
  div.id = 'estado-cxc-modal';
  div.className = 'modal-overlay active';

  const opcionesClientes = clientesList.map(cl =>
    `<option value="${cl.id}">${cl.nombre} (${cl.cuentas.length} cuenta${cl.cuentas.length>1?'s':''})</option>`
  ).join('');

  div.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h3>📋 Estado de Cuenta — CxC</h3>
        <button onclick="document.getElementById('estado-cxc-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:6px">SELECCIONAR CLIENTE</label>
          <select id="estado-cxc-cliente" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:13px;outline:none;font-family:inherit">
            <option value="__todos__">— Todos los clientes —</option>
            ${opcionesClientes}
          </select>
        </div>
        <div id="estado-cxc-preview" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;min-height:80px;font-size:13px"></div>
        <div style="display:flex;gap:8px">
          <button id="estado-cxc-imprimir" style="flex:1;background:#0891b2;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🖨️ Ver / Imprimir</button>
          <button onclick="document.getElementById('estado-cxc-modal').remove()" style="flex:1;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(div);

  function buildPreview(clienteId) {
    const clientes = clienteId === '__todos__' ? clientesList : clientesList.filter(cl => cl.id === clienteId);
    const preview = document.getElementById('estado-cxc-preview');
    if (clientes.length === 0) { preview.innerHTML = '<span style="color:#94a3b8">Sin datos</span>'; return; }
    let html = '';
    let total = 0;
    clientes.forEach(cl => {
      const sub = cl.cuentas.reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
      total += sub;
      html += `<div style="font-weight:700;color:#1e3a5f;margin-bottom:4px">👤 ${cl.nombre}</div>`;
      cl.cuentas.forEach(c => {
        const vencida = new Date(c.vencimiento) < new Date();
        html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:${vencida?'#dc2626':'#475569'}">
          <span>${c.referencia||'—'} · Vence ${fD(c.vencimiento)}${vencida?' ⚠️':''}</span>
          <span style="font-weight:600">${fL(c.saldo)}</span>
        </div>`;
      });
      html += `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#0369a1;border-top:1px solid #e2e8f0;margin:6px 0 10px;padding-top:4px">
        <span>Subtotal</span><span>${fL(sub)}</span>
      </div>`;
    });
    html += `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#1e3a5f;border-top:2px solid #1e3a5f;padding-top:8px;margin-top:4px">
      <span>TOTAL PENDIENTE</span><span>${fL(total)}</span>
    </div>`;
    preview.innerHTML = html;
  }

  // Mostrar preview inicial
  buildPreview('__todos__');

  div.querySelector('#estado-cxc-cliente').addEventListener('change', e => buildPreview(e.target.value));

  div.querySelector('#estado-cxc-imprimir').addEventListener('click', () => {
    const clienteId = div.querySelector('#estado-cxc-cliente').value;
    const clientes = clienteId === '__todos__' ? clientesList : clientesList.filter(cl => cl.id === clienteId);
    const hoy = new Date().toLocaleDateString('es-HN');
    const titulo = clienteId === '__todos__' ? 'Todos los Clientes' : clientes[0]?.nombre || '—';
    let filas = '';
    let totalGeneral = 0;
    clientes.forEach(cl => {
      const subtotal = cl.cuentas.reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
      totalGeneral += subtotal;
      filas += `<tr style="background:#f0f9ff"><td colspan="5" style="font-weight:700;color:#1e3a5f;padding:8px 12px;font-size:13px">👤 ${cl.nombre}</td></tr>`;
      cl.cuentas.forEach(c => {
        const vencida = new Date(c.vencimiento) < new Date();
        filas += `<tr>
          <td style="padding:6px 12px;font-size:12px;font-family:monospace">${c.referencia||'—'}</td>
          <td style="padding:6px 12px;font-size:12px">${fD(c.fecha)}</td>
          <td style="padding:6px 12px;font-size:12px;color:${vencida?'#dc2626':'#475569'}">${fD(c.vencimiento)}${vencida?' ⚠️':''}</td>
          <td style="padding:6px 12px;font-size:12px;text-align:right">${fL(c.monto)}</td>
          <td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:700;color:#dc2626">${fL(c.saldo)}</td>
        </tr>`;
      });
      filas += `<tr style="background:#e0f2fe"><td colspan="4" style="padding:6px 12px;font-size:12px;font-weight:700;text-align:right;color:#0369a1">Subtotal ${cl.nombre}</td><td style="padding:6px 12px;font-size:13px;font-weight:700;text-align:right;color:#0369a1">${fL(subtotal)}</td></tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Estado de Cuenta CxC — ${titulo}</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;margin:0;padding:24px;color:#1e293b}
      h1{font-size:20px;color:#1e3a5f;margin-bottom:2px}
      h2{font-size:14px;font-weight:600;color:#0369a1;margin-bottom:4px}
      .sub{font-size:12px;color:#64748b;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#1e3a5f;color:#fff;padding:8px 12px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.4px}
      tr:nth-child(even){background:#f8fafc}
      .total-row td{background:#1e3a5f;color:#fff;font-weight:700;padding:10px 12px;font-size:14px}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>📋 Estado de Cuenta — Cuentas por Cobrar</h1>
    <h2>${titulo}</h2>
    <div class="sub">Generado: ${hoy} &nbsp;|&nbsp; Solo cuentas pendientes</div>
    <table>
      <thead><tr><th>Referencia</th><th>Fecha</th><th>Vencimiento</th><th style="text-align:right">Monto</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="total-row"><td colspan="4" style="text-align:right">TOTAL GENERAL PENDIENTE</td><td style="text-align:right">${fL(totalGeneral)}</td></tr></tfoot>
    </table>
    </body></html>`;
    div.remove();
    openPrint(html, 'Estado_Cuenta_CxC');
  });
}


async function estadoCuentaCxP() {
  try { cxp_cache = await GET('/cxp'); } catch(e) {}

  const pendientes = cxp_cache.filter(c => c.estado !== 'pagado');
  if (pendientes.length === 0) { alert('No hay cuentas pendientes por pagar.'); return; }

  // Agrupar por proveedor
  const porProveedor = {};
  pendientes.forEach(c => {
    const key = c.proveedor_id || c.proveedor_nombre || 'Sin proveedor';
    if (!porProveedor[key]) porProveedor[key] = { nombre: c.proveedor_nombre || '—', id: key, cuentas: [] };
    porProveedor[key].cuentas.push(c);
  });

  const provList = Object.values(porProveedor);

  const existing = document.getElementById('estado-cxp-modal');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'estado-cxp-modal';
  div.className = 'modal-overlay active';

  const opcionesProv = provList.map(p =>
    `<option value="${p.id}">${p.nombre} (${p.cuentas.length} cuenta${p.cuentas.length>1?'s':''})</option>`
  ).join('');

  div.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h3>📋 Estado de Cuenta — CxP</h3>
        <button onclick="document.getElementById('estado-cxp-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:6px">SELECCIONAR PROVEEDOR</label>
          <select id="estado-cxp-proveedor" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:13px;outline:none;font-family:inherit">
            <option value="__todos__">— Todos los proveedores —</option>
            ${opcionesProv}
          </select>
        </div>
        <div id="estado-cxp-preview" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;min-height:80px;font-size:13px"></div>
        <div style="display:flex;gap:8px">
          <button id="estado-cxp-imprimir" style="flex:1;background:#0891b2;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🖨️ Ver / Imprimir</button>
          <button onclick="document.getElementById('estado-cxp-modal').remove()" style="flex:1;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(div);

  function buildPreview(provId) {
    const lista = provId === '__todos__' ? provList : provList.filter(p => p.id === provId);
    const preview = document.getElementById('estado-cxp-preview');
    if (lista.length === 0) { preview.innerHTML = '<span style="color:#94a3b8">Sin datos</span>'; return; }
    let html = '';
    let total = 0;
    lista.forEach(p => {
      const sub = p.cuentas.reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
      total += sub;
      html += `<div style="font-weight:700;color:#92400e;margin-bottom:4px">🏢 ${p.nombre}</div>`;
      p.cuentas.forEach(c => {
        const vencida = new Date(c.vencimiento) < new Date();
        html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:${vencida?'#dc2626':'#475569'}">
          <span>${c.referencia||'—'} · Vence ${fD(c.vencimiento)}${vencida?' ⚠️':''}</span>
          <span style="font-weight:600">${fL(c.saldo)}</span>
        </div>`;
      });
      html += `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#92400e;border-top:1px solid #e2e8f0;margin:6px 0 10px;padding-top:4px">
        <span>Subtotal</span><span>${fL(sub)}</span>
      </div>`;
    });
    html += `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#92400e;border-top:2px solid #92400e;padding-top:8px;margin-top:4px">
      <span>TOTAL PENDIENTE</span><span>${fL(total)}</span>
    </div>`;
    preview.innerHTML = html;
  }

  buildPreview('__todos__');

  div.querySelector('#estado-cxp-proveedor').addEventListener('change', e => buildPreview(e.target.value));

  div.querySelector('#estado-cxp-imprimir').addEventListener('click', () => {
    const provId = div.querySelector('#estado-cxp-proveedor').value;
    const lista = provId === '__todos__' ? provList : provList.filter(p => p.id === provId);
    const hoy = new Date().toLocaleDateString('es-HN');
    const titulo = provId === '__todos__' ? 'Todos los Proveedores' : lista[0]?.nombre || '—';
    let filas = '';
    let totalGeneral = 0;
    lista.forEach(p => {
      const subtotal = p.cuentas.reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
      totalGeneral += subtotal;
      filas += `<tr style="background:#fff7ed"><td colspan="5" style="font-weight:700;color:#92400e;padding:8px 12px;font-size:13px">🏢 ${p.nombre}</td></tr>`;
      p.cuentas.forEach(c => {
        const vencida = new Date(c.vencimiento) < new Date();
        filas += `<tr>
          <td style="padding:6px 12px;font-size:12px;font-family:monospace">${c.referencia||'—'}</td>
          <td style="padding:6px 12px;font-size:12px">${fD(c.fecha)}</td>
          <td style="padding:6px 12px;font-size:12px;color:${vencida?'#dc2626':'#475569'}">${fD(c.vencimiento)}${vencida?' ⚠️':''}</td>
          <td style="padding:6px 12px;font-size:12px;text-align:right">${fL(c.monto)}</td>
          <td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:700;color:#ea580c">${fL(c.saldo)}</td>
        </tr>`;
      });
      filas += `<tr style="background:#fed7aa"><td colspan="4" style="padding:6px 12px;font-size:12px;font-weight:700;text-align:right;color:#92400e">Subtotal ${p.nombre}</td><td style="padding:6px 12px;font-size:13px;font-weight:700;text-align:right;color:#92400e">${fL(subtotal)}</td></tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Estado de Cuenta CxP — ${titulo}</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;margin:0;padding:24px;color:#1e293b}
      h1{font-size:20px;color:#92400e;margin-bottom:2px}
      h2{font-size:14px;font-weight:600;color:#92400e;margin-bottom:4px}
      .sub{font-size:12px;color:#64748b;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#92400e;color:#fff;padding:8px 12px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.4px}
      tr:nth-child(even){background:#f8fafc}
      .total-row td{background:#92400e;color:#fff;font-weight:700;padding:10px 12px;font-size:14px}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>📋 Estado de Cuenta — Cuentas por Pagar</h1>
    <h2>${titulo}</h2>
    <div class="sub">Generado: ${hoy} &nbsp;|&nbsp; Solo cuentas pendientes</div>
    <table>
      <thead><tr><th>Referencia</th><th>Fecha</th><th>Vencimiento</th><th style="text-align:right">Monto</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="total-row"><td colspan="4" style="text-align:right">TOTAL GENERAL PENDIENTE</td><td style="text-align:right">${fL(totalGeneral)}</td></tr></tfoot>
    </table>
    </body></html>`;
    div.remove();
    openPrint(html, 'Estado_Cuenta_CxP');
  });
}


async function reporteCorteCaja() {
  const data = await GET('/reportes/ventas_resumen', getRepParams());
  const ventas = await GET('/ventas', getRepParams()+'&limite=200');
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const b = BRANCH || {};
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}@media print{@page{size:80mm auto;margin:0}}
.c{text-align:center}.b{font-weight:700}.sep{border-top:1px dashed #999;margin:5px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}td:last-child{text-align:right}
</style></head><body>
<div class="c b" style="font-size:14px">CORTE DE CAJA</div>
<div class="c">${b.nombre||''}</div>
<div class="c" style="font-size:10px">RTN: ${b.rtn||''}</div>
<div class="sep"></div>
<div>Período: ${fD(ini)} al ${fD(fin)}</div>
<div>Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
<div class="sep"></div>
<table>
  <tr><td>N° Ventas</td><td>${data.total_ventas||0}</td></tr>
  <tr><td>Descuentos</td><td>-${fL(data.descuentos||0)}</td></tr>
  <tr><td>ISV 15%</td><td>${fL(data.isv15||0)}</td></tr>
  <tr><td class="b" style="font-size:14px">TOTAL</td><td class="b" style="font-size:14px">${fL(data.total||0)}</td></tr>
</table>
<div class="sep"></div>
${ventas.slice(0,30).map(s=>`<div style="font-size:10px">${s.numero_factura} | ${(s.cliente_nombre||'').substring(0,14)} | ${fL(s.total)}</div>`).join('')}
<div class="sep"></div>
<div class="c" style="font-size:10px">Powered by Metric POS</div>
<div style="height:10mm"></div></body></html>`, "Corte de Caja");
}

async function reporteMasterVentas() {
  const sales = await GET('/ventas', getRepParams()+'&limite=500');
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const b = BRANCH || {};
  const total = sales.reduce((s,x)=>s+x.total,0);
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:11px;padding:20px}
@media print{@page{size:letter landscape;margin:10mm}body{padding:0}}
table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
<div><strong style="font-size:18px;color:#1e3a5f">MASTER DE VENTAS</strong><br><span style="color:#64748b">RTN: ${b.rtn||''} | ${b.direccion||''}</span></div>
<div style="text-align:right"><span style="color:#64748b">Período: ${fD(ini)} al ${fD(fin)}</span></div>
</div>
<table><thead><tr><th>N° Factura</th><th>Fecha</th><th>Cliente</th><th>RTN</th><th style="text-align:right">Gravado</th><th style="text-align:right">ISV</th><th style="text-align:right">Desc.</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${sales.map(s=>`<tr><td style="font-family:monospace">${s.numero_factura}</td><td>${fD(s.fecha)}</td><td>${s.cliente_nombre||'—'}</td><td>${s.cliente_rtn||'—'}</td><td style="text-align:right">${fL(s.importe_gravado||0)}</td><td style="text-align:right">${fL(s.isv15||0)}</td><td style="text-align:right">${fL(s.descuento||0)}</td><td style="text-align:right;font-weight:700">${fL(s.total)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td colspan="4">TOTALES (${sales.length} facturas)</td><td style="text-align:right">${fL(sales.reduce((s,x)=>s+(x.importe_gravado||0),0))}</td><td style="text-align:right">${fL(sales.reduce((s,x)=>s+(x.isv15||0),0))}</td><td style="text-align:right">${fL(sales.reduce((s,x)=>s+(x.descuento||0),0))}</td><td style="text-align:right">${fL(total)}</td></tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div></body></html>`, "Master de Ventas");
}

async function reporteVentasCategoria() {
  const rows = await GET('/reportes/ventas_por_categoria', getRepParams());
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const totalGen = rows.reduce((s,r)=>s+r.total,0);
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:12px;padding:20px}@media print{@page{size:letter;margin:10mm}}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #f1f5f9}tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}.bar{height:10px;background:#2563eb;border-radius:3px;display:inline-block}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
<strong style="font-size:18px;color:#1e3a5f">VENTAS POR CATEGORÍA</strong>
<span style="color:#64748b">Período: ${fD(ini)} al ${fD(fin)}</span>
</div>
<table><thead><tr><th>Categoría</th><th style="text-align:right">Unidades</th><th style="text-align:right">Total</th><th style="text-align:right">%</th><th>Barra</th></tr></thead>
<tbody>${rows.map(r=>`<tr><td style="font-weight:600">${r.categoria||'Sin categoría'}</td><td style="text-align:right">${r.unidades}</td><td style="text-align:right;font-weight:700">${fL(r.total)}</td><td style="text-align:right">${totalGen>0?((r.total/totalGen)*100).toFixed(1)+'%':'0%'}</td><td><div class="bar" style="width:${totalGen>0?Math.round((r.total/totalGen)*100):0}px"></div></td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td>TOTAL</td><td style="text-align:right">${rows.reduce((s,r)=>s+r.unidades,0)}</td><td style="text-align:right">${fL(totalGen)}</td><td colspan="2"></td></tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div></body></html>`, "Ventas por Categoría");
}

async function reporteAnalisisMes() {
  const rows = await GET('/reportes/ventas_por_mes', `sucursal_id=${USER.sucursal_id}`);
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:12px;padding:20px}@media print{@page{size:letter;margin:10mm}}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #f1f5f9}tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
<strong style="font-size:18px;color:#1e3a5f">ANÁLISIS DE VENTAS POR MES</strong>
<span style="color:#64748b">Generado: ${fDT(new Date().toISOString())}</span>
</div>
<table><thead><tr><th>Mes</th><th style="text-align:right">N° Ventas</th><th style="text-align:right">ISV 15%</th><th style="text-align:right">Total</th><th style="text-align:right">Promedio/Venta</th></tr></thead>
<tbody>${rows.map(r=>`<tr><td style="font-weight:600">${r.mes}</td><td style="text-align:right">${r.ventas}</td><td style="text-align:right">${fL(r.isv||0)}</td><td style="text-align:right;font-weight:700">${fL(r.total||0)}</td><td style="text-align:right">${fL(r.ventas>0?r.total/r.ventas:0)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td>TOTAL</td><td style="text-align:right">${rows.reduce((s,r)=>s+r.ventas,0)}</td><td style="text-align:right">${fL(rows.reduce((s,r)=>s+(r.isv||0),0))}</td><td style="text-align:right">${fL(rows.reduce((s,r)=>s+(r.total||0),0))}</td><td></td></tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div></body></html>`, "Análisis de Ventas por Mes");
}

async function reporteInventario() {
  const inv = await GET('/reportes/inventario', `sucursal_id=${USER.sucursal_id}`);
  const b = BRANCH || {};
  const totalVal = inv.reduce((s,p)=>s+(p.valor_venta||0),0);
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:11px;padding:20px}@media print{@page{size:letter;margin:10mm}}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
.firma-row{display:flex;justify-content:space-around;margin-top:40px}.firma{border-top:1px solid #333;width:160px;text-align:center;font-size:10px;padding-top:4px}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
<div><strong style="font-size:18px;color:#1e3a5f">INVENTARIO FÍSICO</strong><br><span style="font-size:10px;color:#64748b">RTN: ${b.rtn||''}</span></div>
<div style="text-align:right;color:#64748b;font-size:11px">Fecha: ${fD(today())}<br>Hora: ${new Date().toLocaleTimeString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
</div>
<table><thead><tr><th>Código</th><th>Descripción</th><th>Categoría</th><th style="text-align:right">S.Mín</th><th style="text-align:right">S.Actual</th><th style="text-align:right">Conteo Físico</th><th style="text-align:right">Precio</th><th style="text-align:right">Valor</th></tr></thead>
<tbody>${inv.map(p=>`<tr><td style="font-family:monospace">${p.codigo}</td><td style="font-weight:600">${p.nombre}</td><td>${p.categoria}</td><td style="text-align:right">${p.stock_min||0}</td><td style="text-align:right;${(p.stock||0)<=(p.stock_min||0)?'color:#dc2626;font-weight:700':''}">${p.stock||0}</td><td style="text-align:right;border-bottom:1px solid #999">___</td><td style="text-align:right">${fL(p.precio_venta||0)}</td><td style="text-align:right;font-weight:600">${fL(p.valor_venta||0)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td colspan="7">VALOR TOTAL DEL INVENTARIO</td><td style="text-align:right">${fL(totalVal)}</td></tr></tfoot></table>
<div class="firma-row"><div class="firma">Elaborado por</div><div class="firma">Revisado por</div><div class="firma">Autorizado por</div></div>
<div style="margin-top:20px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div></body></html>`, "Inventario Físico");
}

async function reporteVentasArticulo() {
  const rows = await GET('/reportes/articulos_por_dia', getRepParams());
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:11px;padding:20px}@media print{@page{size:letter landscape;margin:10mm}}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px;text-align:left}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
<strong style="font-size:18px;color:#1e3a5f">VENTAS DE ARTÍCULO POR DÍA</strong>
<span style="color:#64748b">Período: ${fD(ini)} al ${fD(fin)}</span>
</div>
<table><thead><tr><th>Fecha</th><th>Código</th><th>Artículo</th><th>Categoría</th><th style="text-align:right">Unidades</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows.map(r=>`<tr><td>${fD(r.dia)}</td><td style="font-family:monospace">${r.producto_codigo||'—'}</td><td style="font-weight:600">${r.producto_nombre}</td><td>${r.producto_categoria||'—'}</td><td style="text-align:right">${r.unidades}</td><td style="text-align:right;font-weight:700">${fL(r.total)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td colspan="4">TOTAL</td><td style="text-align:right">${rows.reduce((s,r)=>s+r.unidades,0)}</td><td style="text-align:right">${fL(rows.reduce((s,r)=>s+r.total,0))}</td></tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div></body></html>`, "Ventas de Artículo por Día");
}


// ─── REPORTE CxC ─────────────────────────────────────────────────────────────
async function reporteCxC() {
  const cxc = await GET('/cxc');
  const b = BRANCH || {};
  const pendientes = cxc.filter(c => c.estado !== 'pagado');
  const totalPend = pendientes.reduce((s,c) => s + (c.saldo||0), 0);
  const totalMonto = pendientes.reduce((s,c) => s + (c.monto||0), 0);
  const vencidas = pendientes.filter(c => new Date(c.vencimiento) < new Date());
  const totalVenc = vencidas.reduce((s,c) => s + (c.saldo||0), 0);

  const filas = cxc.map(c => {
    const vencida = c.estado !== 'pagado' && new Date(c.vencimiento) < new Date();
    const colorFila = c.estado === 'pagado' ? '' : vencida ? 'background:#fef2f2' : '';
    const colorSaldo = c.estado === 'pagado' ? 'color:#16a34a' : vencida ? 'color:#dc2626;font-weight:700' : 'color:#d97706;font-weight:700';
    return `<tr style="${colorFila}">
      <td style="font-weight:600">${c.cliente_nombre||'—'}</td>
      <td style="font-family:monospace;font-size:10px">${c.referencia||'—'}</td>
      <td style="font-family:monospace;font-size:10px">${c.cliente_rtn||'—'}</td>
      <td>${fD(c.creado)}</td>
      <td style="${vencida?'color:#dc2626;font-weight:600':''}">${fD(c.vencimiento)}</td>
      <td style="text-align:right">${fL(c.monto||0)}</td>
      <td style="text-align:right">${fL((c.monto||0)-(c.saldo||0))}</td>
      <td style="text-align:right;${colorSaldo}">${fL(c.saldo||0)}</td>
      <td style="text-align:center"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;${c.estado==='pagado'?'background:#f0fdf4;color:#16a34a':vencida?'background:#fef2f2;color:#dc2626':'background:#fffbeb;color:#d97706'}">${c.estado==='pagado'?'Pagado':vencida?'Vencida':'Pendiente'}</span></td>
    </tr>`;
  }).join('');

  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
    body{font-size:11px;padding:20px}
    @media print{@page{size:letter landscape;margin:10mm}body{padding:0}}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px;text-align:left}
    td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px;vertical-align:middle}
    .total-row td{background:#1e3a5f;color:#fff;font-weight:700}
    .resumen{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
    .res-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
    .res-label{font-size:10px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
    .res-val{font-size:16px;font-weight:700;color:#1e3a5f}
    .res-val.red{color:#dc2626}.res-val.amber{color:#d97706}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
    <div>
      <div style="font-size:20px;font-weight:700;color:#1e3a5f">CUENTAS POR COBRAR</div>
      <div style="font-size:11px;color:#64748b">${b.nombre||''} &nbsp;|&nbsp; RTN: ${b.rtn||''}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#64748b">
      Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}<br>
      Usuario: ${USER?.nombre||''}
    </div>
  </div>
  <div class="resumen">
    <div class="res-card"><div class="res-label">Total Cuentas</div><div class="res-val">${cxc.length}</div></div>
    <div class="res-card"><div class="res-label">Monto Original</div><div class="res-val">${fL(totalMonto)}</div></div>
    <div class="res-card"><div class="res-label">Saldo Pendiente</div><div class="res-val amber">${fL(totalPend)}</div></div>
    <div class="res-card"><div class="res-label">Saldo Vencido</div><div class="res-val red">${fL(totalVenc)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Cliente</th><th>Referencia</th><th>RTN</th><th>Fecha</th><th>Vencimiento</th>
      <th style="text-align:right">Monto</th><th style="text-align:right">Abonado</th>
      <th style="text-align:right">Saldo</th><th style="text-align:center">Estado</th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="5">TOTALES (${cxc.length} cuentas — ${vencidas.length} vencidas)</td>
      <td style="text-align:right">${fL(totalMonto)}</td>
      <td style="text-align:right">${fL(totalMonto - totalPend)}</td>
      <td style="text-align:right">${fL(totalPend)}</td>
      <td></td>
    </tr></tfoot>
  </table>
  <div style="margin-top:16px;display:flex;justify-content:space-around">
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Elaborado por</div>
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Revisado por</div>
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Autorizado por</div>
  </div>
  <div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
  </body></html>`, "Cuentas por Cobrar");
}

// ─── REPORTE CxP ─────────────────────────────────────────────────────────────
async function reporteCxP() {
  const cxp = await GET('/cxp');
  const b = BRANCH || {};
  const pendientes = cxp.filter(c => c.estado !== 'pagado');
  const totalPend = pendientes.reduce((s,c) => s + (c.saldo||0), 0);
  const totalMonto = pendientes.reduce((s,c) => s + (c.monto||0), 0);
  const vencidas = pendientes.filter(c => new Date(c.vencimiento) < new Date());
  const totalVenc = vencidas.reduce((s,c) => s + (c.saldo||0), 0);
  const proximas = pendientes.filter(c => {
    const dias = (new Date(c.vencimiento) - new Date()) / (1000*60*60*24);
    return dias >= 0 && dias <= 7;
  });

  const filas = cxp.map(c => {
    const vencida = c.estado !== 'pagado' && new Date(c.vencimiento) < new Date();
    const proxima = !vencida && c.estado !== 'pagado' && (new Date(c.vencimiento) - new Date()) / (1000*60*60*24) <= 7;
    const colorFila = c.estado === 'pagado' ? '' : vencida ? 'background:#fef2f2' : proxima ? 'background:#fffbeb' : '';
    const colorSaldo = c.estado === 'pagado' ? 'color:#16a34a' : vencida ? 'color:#dc2626;font-weight:700' : 'color:#d97706;font-weight:700';
    return `<tr style="${colorFila}">
      <td style="font-weight:600">${c.proveedor_nombre||'—'}</td>
      <td style="font-family:monospace;font-size:10px">${c.referencia||'—'}</td>
      <td style="font-family:monospace;font-size:10px">${c.proveedor_rtn||'—'}</td>
      <td>${fD(c.creado)}</td>
      <td style="${vencida?'color:#dc2626;font-weight:600':proxima?'color:#d97706;font-weight:600':''}">${fD(c.vencimiento)}</td>
      <td style="text-align:right">${fL(c.monto||0)}</td>
      <td style="text-align:right">${fL((c.monto||0)-(c.saldo||0))}</td>
      <td style="text-align:right;${colorSaldo}">${fL(c.saldo||0)}</td>
      <td style="text-align:center"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;${c.estado==='pagado'?'background:#f0fdf4;color:#16a34a':vencida?'background:#fef2f2;color:#dc2626':proxima?'background:#fffbeb;color:#d97706':'background:#eff6ff;color:#2563eb'}">${c.estado==='pagado'?'Pagado':vencida?'Vencida':proxima?'Próxima':'Pendiente'}</span></td>
    </tr>`;
  }).join('');

  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
    body{font-size:11px;padding:20px}
    @media print{@page{size:letter landscape;margin:10mm}body{padding:0}}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px;text-align:left}
    td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px;vertical-align:middle}
    .total-row td{background:#1e3a5f;color:#fff;font-weight:700}
    .resumen{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
    .res-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
    .res-label{font-size:10px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
    .res-val{font-size:16px;font-weight:700;color:#1e3a5f}
    .res-val.red{color:#dc2626}.res-val.amber{color:#d97706}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
    <div>
      <div style="font-size:20px;font-weight:700;color:#1e3a5f">CUENTAS POR PAGAR</div>
      <div style="font-size:11px;color:#64748b">${b.nombre||''} &nbsp;|&nbsp; RTN: ${b.rtn||''}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#64748b">
      Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}<br>
      Usuario: ${USER?.nombre||''}
    </div>
  </div>
  <div class="resumen">
    <div class="res-card"><div class="res-label">Total Cuentas</div><div class="res-val">${cxp.length}</div></div>
    <div class="res-card"><div class="res-label">Monto Original</div><div class="res-val">${fL(totalMonto)}</div></div>
    <div class="res-card"><div class="res-label">Saldo Pendiente</div><div class="res-val amber">${fL(totalPend)}</div></div>
    <div class="res-card"><div class="res-label">Vence en 7 días</div><div class="res-val red">${fL(proximas.reduce((s,c)=>s+(c.saldo||0),0))}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Proveedor</th><th>Referencia</th><th>RTN</th><th>Fecha</th><th>Vencimiento</th>
      <th style="text-align:right">Monto</th><th style="text-align:right">Abonado</th>
      <th style="text-align:right">Saldo</th><th style="text-align:center">Estado</th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="5">TOTALES (${cxp.length} cuentas — ${vencidas.length} vencidas)</td>
      <td style="text-align:right">${fL(totalMonto)}</td>
      <td style="text-align:right">${fL(totalMonto - totalPend)}</td>
      <td style="text-align:right">${fL(totalPend)}</td>
      <td></td>
    </tr></tfoot>
  </table>
  <div style="margin-top:16px;display:flex;justify-content:space-around">
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Elaborado por</div>
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Revisado por</div>
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px">Autorizado por</div>
  </div>
  <div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
  </body></html>`, "Cuentas por Pagar");
}

// ─── USUARIOS ────────────────────────────────────────────────────────────────
let users_cache = [];
let editingUser = null;

async function renderUsers() {
  try { [users_cache, suppliers_cache] = await Promise.all([GET('/usuarios'), GET('/sucursales')]); } catch(e) {}
  document.getElementById('users-count').textContent = users_cache.length + ' usuarios';
  document.getElementById('users-table-body').innerHTML = users_cache.map(u => `
    <tr>
      <td style="font-weight:600">${u.nombre}</td>
      <td style="font-family:monospace;font-size:11px">${u.username}</td>
      <td><span class="badge ${u.rol==='admin'?'badge-blue':u.rol==='supervisor'?'badge-amber':'badge-gray'}">${u.rol}</span></td>
      <td>${u.sucursal_nombre||'—'}</td>
      <td><span class="badge ${u.activo?'badge-green':'badge-red'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td><div style="display:flex;gap:4px;justify-content:flex-end">
        <button class="action-btn edit" onclick="openUserModal('${u.id}')">✏️</button>
        <button class="action-btn" style="background:#fff7ed;color:#d97706;border:1px solid #fde68a" title="Bloqueo de módulos" onclick="openPermisosModal('${u.id}','${u.nombre.replace(/'/g,"\\'")}')">🔒</button>
      </div></td>
    </tr>
  `).join('');
}

async function openUserModal(id) {
  const u = id ? users_cache.find(x => x.id === id) : null;
  editingUser = u;
  let sucursales = [];
  try { sucursales = await GET('/sucursales'); } catch(e) {}
  document.getElementById('user-modal-title').textContent = u ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('u-nombre').value = u?.nombre||'';
  document.getElementById('u-username').value = u?.username||'';
  document.getElementById('u-password').value = '';
  document.getElementById('u-rol').value = u?.rol||'cajero';
  document.getElementById('u-sucursal').innerHTML = sucursales.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
  if (u?.sucursal_id) document.getElementById('u-sucursal').value = u.sucursal_id;
  document.getElementById('u-activo').value = u?.activo !== false ? '1' : '0';
  openModal('user-modal');
}

async function saveUser(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('u-nombre').value,
    username: document.getElementById('u-username').value,
    rol: document.getElementById('u-rol').value,
    sucursal_id: document.getElementById('u-sucursal').value,
    activo: document.getElementById('u-activo').value === '1',
  };
  const pwd = document.getElementById('u-password').value;
  if (pwd) data.password = pwd;
  if (!editingUser && !pwd) { alert('La contraseña es requerida para nuevos usuarios'); return; }
  try {
    if (editingUser) await PUT('/usuarios/'+editingUser.id, data);
    else await POST('/usuarios', { ...data, password: pwd });
    closeModal('user-modal'); renderUsers();
  } catch(e) { alert(e.message); }
}

// ─── SUCURSALES ──────────────────────────────────────────────────────────────
let branches_cache = [];
let editingBranch = null;

async function renderBranches() {
  try { branches_cache = await GET('/sucursales'); } catch(e) {}
  document.getElementById('branches-count').textContent = branches_cache.length + ' sucursales';
  document.getElementById('branches-cards').innerHTML = branches_cache.map(b => `
    <div class="client-card">
      <div class="client-card-header">
        <div class="client-avatar">${b.nombre[0]}</div>
        <button class="action-btn edit" onclick="openBranchModal('${b.id}')">✏️</button>
      </div>
      <div class="client-name">${b.nombre}</div>
      ${b.rtn?`<div class="client-rtn">RTN: ${b.rtn}</div>`:''}
      ${b.direccion?`<div class="client-info">${b.direccion}</div>`:''}
      ${b.cai?`<div class="client-info" style="font-family:monospace;font-size:10px">CAI: ${b.cai.substring(0,20)}...</div>`:''}
    </div>
  `).join('');
}

function openBranchModal(id) {
  const b = id ? branches_cache.find(x => x.id === id) : null;
  editingBranch = b;
  document.getElementById('branch-modal-title').textContent = b ? 'Editar Sucursal' : 'Nueva Sucursal';
  ['nombre','rtn','telefono','direccion','cai'].forEach(k => document.getElementById('br-'+k).value = b?.[k]||'');
  document.getElementById('br-serie').value = b?.serie||'';
  document.getElementById('br-rango-ini').value = b?.rango_ini||'';
  document.getElementById('br-rango-fin').value = b?.rango_fin||'';
  document.getElementById('br-fecha-limite').value = b?.fecha_limite||'';
  // Mostrar botón Eliminar solo cuando se edita (no en nueva sucursal)
  const btnDel = document.getElementById('branch-modal-delete');
  if (btnDel) btnDel.style.display = b ? 'inline-block' : 'none';
  openModal('branch-modal');
}

async function saveBranch(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('br-nombre').value,
    rtn: document.getElementById('br-rtn').value,
    telefono: document.getElementById('br-telefono').value,
    direccion: document.getElementById('br-direccion').value,
    cai: document.getElementById('br-cai').value,
    serie: document.getElementById('br-serie').value,
    rango_ini: document.getElementById('br-rango-ini').value,
    rango_fin: document.getElementById('br-rango-fin').value,
    fecha_limite: document.getElementById('br-fecha-limite').value,
  };
  try {
    if(editingBranch) await PUT('/sucursales/'+editingBranch.id, data);
    else await POST('/sucursales', data);
    closeModal('branch-modal'); renderBranches();
  } catch(e) { alert(e.message); }
}

// ─── SYNC ────────────────────────────────────────────────────────────────────
async function loadSync() {
  try {
    const r = await GET('/sync/estado');
    document.getElementById('sync-status').innerHTML = `
      <div style="margin-bottom:12px"><strong>Estado de Sincronización</strong></div>
      <div style="font-size:13px;margin-bottom:8px">Registros pendientes de sincronizar: <strong style="color:${r.pendientes>0?'#f59e0b':'#16a34a'}">${r.pendientes}</strong></div>
      <div style="font-size:12px;color:#64748b">Sucursales activas: ${(r.sucursales||[]).map(s=>s.nombre).join(', ')}</div>
    `;
  } catch(e) { document.getElementById('sync-status').innerHTML = '<div style="color:#dc2626">Error al cargar estado de sincronización</div>'; }
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
async function renderConfig() {
  const b = BRANCH || {};
  document.getElementById('cfg-nombre').value = b.nombre||'';
  document.getElementById('cfg-rtn').value = b.rtn||'';
  document.getElementById('cfg-telefono').value = b.telefono||'';
  document.getElementById('cfg-direccion').value = b.direccion||'';
  document.getElementById('cfg-cai').value = b.cai||'';
  document.getElementById('cfg-serie').value = b.serie||'';
  document.getElementById('cfg-rango-ini').value = b.rango_ini||'';
  document.getElementById('cfg-rango-fin').value = b.rango_fin||'';
  document.getElementById('cfg-fecha-limite').value = b.fecha_limite||'';
}

async function saveConfig(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('cfg-nombre').value,
    rtn: document.getElementById('cfg-rtn').value,
    telefono: document.getElementById('cfg-telefono').value,
    direccion: document.getElementById('cfg-direccion').value,
    cai: document.getElementById('cfg-cai').value,
    serie: document.getElementById('cfg-serie').value,
    rango_ini: document.getElementById('cfg-rango-ini').value,
    rango_fin: document.getElementById('cfg-rango-fin').value,
    fecha_limite: document.getElementById('cfg-fecha-limite').value,
  };
  try {
    await PUT('/sucursales/' + USER.sucursal_id, data);
    BRANCH = { ...BRANCH, ...data };
    localStorage.setItem('mp_branch', JSON.stringify(BRANCH));
    document.getElementById('top-branch').textContent = BRANCH.nombre;
    document.getElementById('company-name-footer').textContent = BRANCH.nombre;
    toast('config-toast');
  } catch(e) { alert(e.message); }
}

// ─── IMPRESIÓN FACTURAS ──────────────────────────────────────────────────────
function printInvoice(sale) { _pendingSale = sale; openModal('print-modal'); }
function closePrintModal() { closeModal('print-modal'); _pendingSale = null; }

function doPrint(format) {
  closeModal('print-modal');
  const sale = _pendingSale; if(!sale) return;
  _pendingSale = null;
  if(format==='carta') printCarta(sale); else printTicket(sale);
}

function printCarta(sale) {
  const b = BRANCH || {};
  const logoSrc = b.logo || '';
  const fecha = new Date(sale.fecha);
  const fechaStr = fecha.toLocaleDateString('es-HN',{day:'2-digit',month:'2-digit',year:'numeric'});
  const itemsHTML = sale.items.map(i=>`<tr>
    <td style="border:1px solid #ddd;padding:7px 10px;text-align:center">${i.cantidad}</td>
    <td style="border:1px solid #ddd;padding:7px 10px">${i.nombre}</td>
    <td style="border:1px solid #ddd;padding:7px 10px;text-align:right">L. ${(i.precio||0).toFixed(2)}</td>
    <td style="border:1px solid #ddd;padding:7px 10px;text-align:right">L. ${((i.precio||0)*(i.cantidad||0)).toFixed(2)}</td>
  </tr>`).join('');
  openPrint(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Factura ${sale.numero_factura}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:13px;padding:20px}
@media print{@page{size:letter portrait;margin:10mm}body{padding:0}}
.invoice-box{max-width:750px;margin:0 auto;border:2px solid #1e3a5f;border-radius:8px;overflow:hidden}
.header{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e3a5f}
.company-info{font-size:11px;color:#555;line-height:1.6;margin-top:6px}
.invoice-badge .title{font-size:22px;font-weight:700;color:#1e3a5f;letter-spacing:2px}
.invoice-badge .number{background:#dc2626;color:#fff;padding:4px 14px;border-radius:4px;font-size:13px;font-weight:700;margin-top:4px;display:inline-block;font-family:monospace}
.client-section{padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.field-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b}
.field-value{font-size:13px;border-bottom:1px solid #94a3b8;padding-bottom:2px;min-width:130px}
table{width:100%;border-collapse:collapse}
th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
.totals-section{display:flex;justify-content:flex-end;padding:12px 20px;border-top:2px solid #e2e8f0}
.totals-table{width:260px}
.totals-table tr td{padding:4px 0;border:none;font-size:12px}
.totals-table tr td:last-child{text-align:right;font-weight:600}
.total-row td{font-size:16px;font-weight:700;color:#1e3a5f;border-top:2px solid #1e3a5f;padding-top:6px}
.footer{padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;color:#64748b}
.amount-words{padding:8px 20px;font-size:11px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="invoice-box">
  <div class="header">
    <div>${logoSrc?`<img src="${logoSrc}" style="max-height:60px;max-width:200px;object-fit:contain"/>`:''}<div class="company-info">RTN: ${b.rtn||''}<br>${b.direccion||''}<br>Tel: ${b.telefono||''}</div></div>
    <div class="invoice-badge" style="text-align:center"><div class="title">FACTURA</div><div class="number">N° ${sale.numero_factura}</div><div style="font-size:12px;margin-top:8px;color:#555">Fecha: ${fechaStr}</div></div>
  </div>
  <div class="client-section">
    <div><div class="field-label">Cliente</div><div class="field-value">${sale.cliente.nombre||'—'}</div></div>
    <div><div class="field-label">RTN</div><div class="field-value">${sale.cliente.rtn||'—'}</div></div>
    <div><div class="field-label">Dirección</div><div class="field-value">${sale.cliente.direccion||'—'}</div></div>
  </div>
  <table><thead><tr><th style="width:60px;text-align:center">Cant.</th><th>Descripción</th><th style="width:90px;text-align:right">Precio</th><th style="width:90px;text-align:right">Total</th></tr></thead>
  <tbody>${itemsHTML}</tbody></table>
  <div class="totals-section"><table class="totals-table">
    <tr><td>Total Neto</td><td>L. ${((sale.subtotal||0)-(sale.isv||0)-(sale.isv18||0)).toFixed(2)}</td></tr>
    <tr><td>Descuentos y Rebajas</td><td>L. ${(sale.descuento||0).toFixed(2)}</td></tr>
    <tr><td>Importe Gravado</td><td>L. ${(sale.importeGravado||0).toFixed(2)}</td></tr>
    <tr><td>Importe Exento/ISV TO</td><td>L. ${(sale.importeExento||0).toFixed(2)}</td></tr>
    <tr><td>Importe Exonerado</td><td>L. ${(sale.exonerado?(sale.importeExento||0):0).toFixed(2)}</td></tr>
    <tr><td>ISV 15%</td><td>L. ${(sale.isv||0).toFixed(2)}</td></tr>
    <tr><td>ISV 18%</td><td>L. ${(sale.isv18||0).toFixed(2)}</td></tr>
    <tr class="total-row"><td>TOTAL</td><td>L. ${(sale.total||0).toFixed(2)}</td></tr>
    ${sale.formaPago?`<tr><td>Forma de Pago</td><td>${sale.formaPago==='efectivo'?'Efectivo':sale.formaPago==='tarjeta'?'Tarjeta':sale.formaPago==='credito'?'Crédito':'Transferencia'}</td></tr>`:''}
    ${sale.formaPago==='efectivo'&&sale.cambio>0?`<tr><td>Cambio</td><td>L. ${(sale.cambio||0).toFixed(2)}</td></tr>`:''}
  </table></div>
  <div class="amount-words"><strong>Cantidad en Letras:</strong> ${moneyToWords(sale.total||0)}</div>
  <div class="footer">
    <div style="font-family:monospace">CAI: ${b.cai||''}</div>
    <div>Rango Autorización: ${b.rango_ini||''} AL ${b.rango_fin||''}</div>
    <div>Fecha Límite de Emisión: ${fD(b.fecha_limite||'')}</div>
    <div style="margin-top:6px">Copia Cliente / Copia Emisor &nbsp;·&nbsp; <strong>Powered by Metric POS</strong></div>
  </div>
</div></body></html>`, "Factura");
}

function printTicket(sale) {
  const b = BRANCH || {};
  const fecha = new Date(sale.fecha);
  const fechaStr = fecha.toLocaleDateString('es-HN',{day:'2-digit',month:'2-digit',year:'numeric'});
  const horaStr = fecha.toLocaleTimeString('es-HN',{hour:'2-digit',minute:'2-digit'});
  const itemsRows = sale.items.map(i => {
    const name = (i.nombre||'').length > 22 ? (i.nombre||'').substring(0,22)+'.' : (i.nombre||'');
    return `<tr><td colspan="2" style="padding:2px 0;font-size:11px">${name}</td></tr>
    <tr><td style="padding:0 0 4px;font-size:11px;color:#555">${i.cantidad} x L.${(i.precio||0).toFixed(2)}</td>
    <td style="padding:0 0 4px;font-size:11px;text-align:right;font-weight:600">L.${((i.precio||0)*(i.cantidad||0)).toFixed(2)}</td></tr>`;
  }).join('');
  const sep = `<tr><td colspan="2"><div style="border-top:1px dashed #999;margin:6px 0"></div></td></tr>`;
  const logoSrc = b.logo || '';
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket ${sale.numero_factura}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}
@media print{@page{size:80mm auto;margin:0}body{padding:3mm;width:80mm}}
.c{text-align:center}.b{font-weight:700}.sep{border-top:1px dashed #999;margin:5px 0}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:1px 0}
.total-line td{font-size:13px;font-weight:700;padding-top:4px}
</style></head><body>
${logoSrc?`<div style="text-align:center;margin-bottom:6px"><img src="${logoSrc}" style="max-width:60mm;max-height:20mm;object-fit:contain"/></div>`:''}
<div class="c b" style="font-size:13px">${b.nombre||'METRIC POS'}</div>
<div class="c" style="font-size:10px">RTN: ${b.rtn||''}</div>
<div class="c" style="font-size:10px">${b.direccion||''}</div>
<div class="c" style="font-size:10px">Tel: ${b.telefono||''}</div>
<div class="sep"></div>
<div class="c b" style="font-size:15px">FACTURA</div>
<div class="c" style="font-family:monospace;font-size:11px">${sale.numero_factura}</div>
<div class="c" style="font-size:10px">${fechaStr} ${horaStr}</div>
<div class="sep"></div>
<div style="font-size:11px"><span class="b">Cliente:</span> ${sale.cliente?.nombre||'—'}</div>
${sale.cliente?.rtn?`<div style="font-size:11px"><span class="b">RTN:</span> ${sale.cliente.rtn}</div>`:''}
<div class="sep"></div>
<table>${itemsRows}${sep}
<tr><td style="font-size:11px">Total Neto</td><td style="font-size:11px;text-align:right">L. ${((sale.subtotal||0)-(sale.isv||0)-(sale.isv18||0)).toFixed(2)}</td></tr>
${(sale.descuento||0)>0?`<tr><td style="font-size:11px">Desc. y Rebajas</td><td style="font-size:11px;text-align:right">-L. ${(sale.descuento||0).toFixed(2)}</td></tr>`:''}
<tr><td style="font-size:11px">Imp. Gravado</td><td style="font-size:11px;text-align:right">L. ${(sale.importeGravado||0).toFixed(2)}</td></tr>
<tr><td style="font-size:11px">Imp. Exento</td><td style="font-size:11px;text-align:right">L. ${(sale.importeExento||0).toFixed(2)}</td></tr>
<tr><td style="font-size:11px">Imp. Exonerado</td><td style="font-size:11px;text-align:right">L. ${(sale.exonerado?(sale.importeExento||0):0).toFixed(2)}</td></tr>
${(sale.isv||0)>0?`<tr><td style="font-size:11px">ISV 15%</td><td style="font-size:11px;text-align:right">L. ${(sale.isv||0).toFixed(2)}</td></tr>`:''}
${(sale.isv18||0)>0?`<tr><td style="font-size:11px">ISV 18%</td><td style="font-size:11px;text-align:right">L. ${(sale.isv18||0).toFixed(2)}</td></tr>`:''}
${sep}
<tr class="total-line"><td>TOTAL</td><td style="text-align:right">L. ${(sale.total||0).toFixed(2)}</td></tr>
${sep}
<tr><td style="font-size:10px">F. Pago</td><td style="font-size:10px;text-align:right">${sale.formaPago==='efectivo'?'Efectivo':sale.formaPago==='tarjeta'?'Tarjeta':sale.formaPago==='credito'?'Crédito':'Transferencia'}</td></tr>
${sale.formaPago==='efectivo'&&(sale.montoRecibido||0)>0?`<tr><td style="font-size:10px">Recibido</td><td style="font-size:10px;text-align:right">L. ${(sale.montoRecibido||0).toFixed(2)}</td></tr><tr><td style="font-size:10px;font-weight:700">Cambio</td><td style="font-size:10px;text-align:right;font-weight:700">L. ${(sale.cambio||0).toFixed(2)}</td></tr>`:''}
</table>
<div style="font-size:10px;text-align:center">${moneyToWords(sale.total||0)}</div>
<div class="sep"></div>
<div style="font-size:10px">CAI: ${b.cai||''}</div>
<div style="font-size:10px">Rango: ${b.rango_ini||''}</div>
<div style="font-size:10px">     AL ${b.rango_fin||''}</div>
<div style="font-size:10px">F.Limite: ${fD(b.fecha_limite||'')}</div>
<div class="sep"></div>
<div class="c" style="font-size:10px">Copia Cliente / Copia Emisor</div>
<div class="c b" style="font-size:10px;margin-top:4px">Powered by Metric POS</div>
<div style="height:10mm"></div></body></html>`, "Ticket de Venta");
}



// ─── FACTURACIÓN NORMAL ───────────────────────────────────────────────────────
// Estado independiente del POS
let facCart = [];
let facDiscount = 0;
let facDiscountType = 'porcentaje';
let facExonerado = false;
let facFormaPago = 'efectivo';
let facMontoRecibido = 0;
let facSelClientId = null;
let facOrdenCompra = '';
let facConstancia = '';
let facSAG = '';

async function renderFacturacion() {
  try {
    [products_cache, clients_cache, impuestos_cache] = await Promise.all([
      GET('/productos', `sucursal_id=${USER.sucursal_id}`),
      GET('/clientes'),
      GET('/impuestos').catch(() => []),
    ]);
  } catch(e) { products_cache = []; clients_cache = []; }

  // Poblar selector de categorías
  const catSel = document.getElementById('fac-cat-filter');
  if (catSel) {
    const cats = [...new Set(products_cache.map(p => p.categoria).filter(Boolean))].sort();
    catSel.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    catSel.onchange = renderFacProductGrid;
  }

  renderFacProductGrid();
  renderFacClientSelect();
  renderFacCart();

  const search = document.getElementById('fac-search');
  if (search) {
    search.oninput = renderFacProductGrid;
    search.value = '';
  }
  _on('fac-discount', 'input', e => { facDiscount = parseFloat(e.target.value)||0; renderFacCart(); });
  _on('fac-discount-type', 'change', e => { facDiscountType = e.target.value; renderFacCart(); });
  _on('fac-exonerado', 'change', e => { facExonerado = e.target.checked; renderFacCart(); });
  _on('fac-orden-compra', 'input', e => { facOrdenCompra = e.target.value; });
  _on('fac-constancia', 'input', e => { facConstancia = e.target.value; });
  _on('fac-sag', 'input', e => { facSAG = e.target.value; });
  _on('fac-client', 'change', e => { facSelClientId = e.target.value; renderFacClientSelect(); });
  _on('fac-btn-invoice', 'click', processFacInvoice);
}

function renderFacProductGrid() {
  const q   = (document.getElementById('fac-search')||{}).value?.toLowerCase()||'';
  const cat = (document.getElementById('fac-cat-filter')||{}).value||'';
  const grid = document.getElementById('fac-products-grid');
  const resBox = document.getElementById('fac-results-box');
  const resTbody = document.getElementById('fac-results-body');
  if (!grid) return;

  const esServicio = p => (p.categoria||'').toLowerCase() === 'servicios';

  let f = products_cache.filter(p =>
    (!q || p.nombre.toLowerCase().includes(q) ||
           p.codigo.toLowerCase().includes(q) ||
           (p.categoria||'').toLowerCase().includes(q)) &&
    (!cat || p.categoria === cat)
  );

  if (q || cat) {
    // Modo búsqueda: tabla de resultados
    if (resBox) resBox.style.display = 'block';
    grid.style.display = 'none';
    if (resTbody) {
      resTbody.innerHTML = f.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">Sin resultados para "<b>${q||cat}</b>"</td></tr>`
        : f.map(p => {
            const srv      = esServicio(p);
            const sinStock = !srv && (p.stock||0) <= 0;
            const isvTag   = !p.gravado || srv
              ? `<span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">Exento</span>`
              : `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">ISV 15%</span>`;
            const stkTag   = srv
              ? `<span style="color:#94a3b8;font-size:11px">Servicio</span>`
              : sinStock
                ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">Sin stock</span>`
                : `<span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${p.stock} uds</span>`;
            const btnOk = srv || !sinStock;
            return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
              <td style="padding:9px 12px;font-family:monospace;font-size:12px;color:#64748b">${p.codigo}</td>
              <td style="padding:9px 12px;font-weight:600;color:#1e3a5f;font-size:13px">${p.nombre}</td>
              <td style="padding:9px 12px;font-size:12px;color:#64748b">${p.categoria||'—'}</td>
              <td style="padding:9px 12px;text-align:right;font-weight:700;color:#2563eb;font-size:13px">L. ${(p.precio_venta||0).toFixed(2)}</td>
              <td style="padding:9px 12px;text-align:center">${isvTag}</td>
              <td style="padding:9px 12px;text-align:center">${stkTag}</td>
              <td style="padding:9px 12px;text-align:center">
                <button onclick="facAddToCartById('${p.id}')" ${btnOk?'':'disabled'}
                  style="padding:5px 14px;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:${btnOk?'pointer':'not-allowed'};background:${btnOk?'#2563eb':'#e2e8f0'};color:${btnOk?'#fff':'#94a3b8'};transition:background .15s">
                  + Agregar
                </button>
              </td>
            </tr>`;
          }).join('');
    }
  } else {
    // Sin búsqueda: grid de tarjetas
    if (resBox) resBox.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = f.map(p => {
      const srv      = esServicio(p);
      const sinStock = !srv && (p.stock||0) <= 0;
      const badge    = srv
        ? `<span class="badge" style="background:#eff6ff;color:#2563eb;font-size:10px">Servicio · Exento</span>`
        : sinStock
          ? `<span class="badge badge-red">Sin stock</span>`
          : `<span class="badge badge-gray">${p.stock} uds</span>`;
      return `<button class="product-card" onclick="facAddToCartById('${p.id}')"
        style="${sinStock&&!srv?'opacity:0.5;cursor:not-allowed;':''}">
        <div class="prod-code">${p.codigo}</div>
        <div class="prod-name">${p.nombre}</div>
        <div class="prod-footer">
          <span class="prod-price">L. ${(p.precio_venta||0).toFixed(2)}</span>${badge}
        </div>
      </button>`;
    }).join('');
  }
}

function renderFacClientSelect() {
  const sel = document.getElementById('fac-client');
  if (!sel) return;
  sel.innerHTML = clients_cache.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  if (!facSelClientId && clients_cache.length) facSelClientId = clients_cache[0].id;
  if (facSelClientId) sel.value = facSelClientId;
  const cl = clients_cache.find(c => c.id === facSelClientId);
  const rtnEl = document.getElementById('fac-client-rtn');
  if (rtnEl) rtnEl.textContent = cl?.rtn ? 'RTN: ' + cl.rtn : '';
}

function facAddToCartById(id) {
  const p = products_cache.find(x => x.id === id);
  if (p) facAddToCart(p);
}

function facAddToCart(p) {
  const enCarrito = facCart.find(i => i.id === p.id);
  const cantidadEnCarrito = enCarrito ? enCarrito.cantidad : 0;
  const esServ = (p.categoria||'').toLowerCase() === 'servicios';
  const stockDisponible = p.stock || 0;
  if (!esServ && stockDisponible <= 0) {
    alert(`⚠️ "${p.nombre}" no tiene existencia en inventario.`);
    return;
  }
  if (!esServ && cantidadEnCarrito >= stockDisponible) {
    alert(`⚠️ "${p.nombre}" solo tiene ${stockDisponible} unidad(es) disponible(s).`);
    return;
  }
  let tasaIsv = 0;
  let isv18Flag = false;
  // Servicios son siempre exentos de ISV
  if (p.gravado && !esServ) {
    const impActivo = (typeof impuestos_cache !== 'undefined' && impuestos_cache.length > 0)
      ? impuestos_cache.find(i => i.activo && (i.aplica_a === 'todos' || i.aplica_a === 'gravados'))
      : null;
    tasaIsv = impActivo ? impActivo.tasa : 15;
    isv18Flag = (tasaIsv === 18);
  }
  if (enCarrito) {
    enCarrito.cantidad++;
  } else {
    facCart.push({
      id: p.id, codigo: p.codigo, nombre: p.nombre,
      categoria: p.categoria, precio: p.precio_venta || 0,
      costo: p.costo || 0, cantidad: 1,
      gravado: esServ ? false : p.gravado,
      isv18: isv18Flag, tasaIsv,
      stockMax: esServ ? 9999 : stockDisponible
    });
  }
  renderFacCart();
}

function facRemoveFromCart(id) { facCart = facCart.filter(i => i.id !== id); renderFacCart(); }

function facUpdateQty(id, qty) {
  if (qty <= 0) { facRemoveFromCart(id); return; }
  const item = facCart.find(i => i.id === id);
  if (item && item.stockMax !== undefined && qty > item.stockMax) {
    alert(`⚠️ Solo hay ${item.stockMax} unidad(es) disponible(s) de "${item.nombre}".`);
    return;
  }
  facCart = facCart.map(i => i.id===id ? {...i, cantidad: qty} : i);
  renderFacCart();
}

function renderFacCart() {
  const cartEl = document.getElementById('fac-cart-items');
  if (!cartEl) return;
  if (facCart.length === 0) {
    cartEl.innerHTML = `<div class="cart-empty"><p>Carrito vacío</p></div>`;
  } else {
    cartEl.innerHTML = facCart.map(item => `
      <div class="cart-item">
        <div class="cart-item-header">
          <span class="cart-item-name">${item.nombre}</span>
          <button class="cart-item-remove" onclick="facRemoveFromCart('${item.id}')">✕</button>
        </div>
        <div class="cart-item-footer">
          <div class="qty-controls">
            <button class="qty-btn" onclick="facUpdateQty('${item.id}',${item.cantidad-1})">−</button>
            <span class="qty-num">${item.cantidad}</span>
            <button class="qty-btn" onclick="facUpdateQty('${item.id}',${item.cantidad+1})">+</button>
          </div>
          <span class="cart-item-total">L. ${(item.precio*item.cantidad).toFixed(2)}</span>
        </div>
      </div>
    `).join('');
  }

  const subtotal = facCart.reduce((s,i) => s+i.precio*i.cantidad, 0);
  const discAmt = facDiscountType==='porcentaje' ? subtotal*(facDiscount/100) : facDiscount;
  const afterDisc = subtotal - discAmt;

  let isv15 = 0, isv18 = 0, isvOtros = 0;
  if (!facExonerado) {
    facCart.forEach(item => {
      if (!item.gravado) return;
      const tasa = item.tasaIsv || 15;
      const base = item.precio * item.cantidad;
      const isvItem = base - base / (1 + tasa / 100);
      if (tasa === 15) isv15 += isvItem;
      else if (tasa === 18) isv18 += isvItem;
      else isvOtros += isvItem;
    });
  }

  // Total Neto = suma de precios base sin ISV
  let baseNeta = 0;
  facCart.forEach(item => {
    const linea = item.precio * item.cantidad;
    if (item.gravado && item.tasaIsv > 0) {
      baseNeta += linea / (1 + item.tasaIsv / 100);
    } else {
      baseNeta += linea;
    }
  });
  const totalNetoConDesc = baseNeta - (facDiscountType==='porcentaje' ? baseNeta*(facDiscount/100) : facDiscount);
  let rowsHTML = `<div class="total-row-item"><span>Total Neto</span><span>L. ${totalNetoConDesc.toFixed(2)}</span></div>`;
  if (discAmt > 0) rowsHTML += `<div class="total-row-item discount"><span>Descuento</span><span>-L. ${discAmt.toFixed(2)}</span></div>`;
  if (!facExonerado && isv15 > 0)   rowsHTML += `<div class="total-row-item"><span>ISV 15%</span><span>L. ${isv15.toFixed(2)}</span></div>`;
  if (!facExonerado && isv18 > 0)   rowsHTML += `<div class="total-row-item"><span>ISV 18%</span><span>L. ${isv18.toFixed(2)}</span></div>`;
  if (!facExonerado && isvOtros > 0) {
    const otras = [...new Set(facCart.filter(i=>i.gravado&&i.tasaIsv&&i.tasaIsv!==15&&i.tasaIsv!==18).map(i=>i.tasaIsv))];
    otras.forEach(t => {
      const sub = facCart.filter(i=>i.gravado&&i.tasaIsv===t).reduce((s,i)=>s+i.precio*i.cantidad,0);
      const isvT = sub - sub/(1+t/100);
      if (isvT > 0) rowsHTML += `<div class="total-row-item"><span>ISV ${t}%</span><span>L. ${isvT.toFixed(2)}</span></div>`;
    });
  }
  rowsHTML += `<div class="total-row-item grand-total"><span>Total</span><span>L. ${afterDisc.toFixed(2)}</span></div>`;

  // Forma de pago
  rowsHTML += `<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px">
    <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px">FORMA DE PAGO</div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button type="button" onclick="setFacFormaPago('efectivo')" style="flex:1;padding:7px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:${facFormaPago==='efectivo'?'#2563eb':'#fff'};color:${facFormaPago==='efectivo'?'#fff':'#475569'}">💵 Efectivo</button>
      <button type="button" onclick="setFacFormaPago('tarjeta')" style="flex:1;padding:7px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:${facFormaPago==='tarjeta'?'#2563eb':'#fff'};color:${facFormaPago==='tarjeta'?'#fff':'#475569'}">💳 Tarjeta</button>
      <button type="button" onclick="setFacFormaPago('transferencia')" style="flex:1;padding:7px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:${facFormaPago==='transferencia'?'#2563eb':'#fff'};color:${facFormaPago==='transferencia'?'#fff':'#475569'}">🏦 Transfer.</button>
      <button type="button" onclick="setFacFormaPago('credito')" style="flex:1;padding:7px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:${facFormaPago==='credito'?'#dc2626':'#fff'};color:${facFormaPago==='credito'?'#fff':'#475569'}">📋 Crédito</button>
    </div>
    ${facFormaPago==='credito'?`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px;font-size:11px;color:#dc2626;font-weight:600">⚠️ Se abrirá cuenta en Cuentas por Cobrar para el cliente seleccionado</div>`:''}
    ${(facFormaPago==='transferencia'||facFormaPago==='tarjeta')?`<div style="margin-top:4px"><label style="font-size:11px;font-weight:600;color:#64748b">🏦 Banco receptor</label><select id="fac-banco-sel" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;box-sizing:border-box"><option value="">— Seleccionar banco —</option>${fac_bancos_cache.map(b=>`<option value="${b.id}">${b.nombre}${b.numero_cuenta?' — '+b.numero_cuenta:''} (L. ${(b.saldo_actual||0).toFixed(2)})</option>`).join('')}</select></div>`:''}
    ${facFormaPago==='efectivo'?`<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <label style="font-size:11px;color:#64748b;white-space:nowrap">Recibido:</label>
      <input type="number" id="fac-monto-recibido" value="${facMontoRecibido||afterDisc.toFixed(2)}" step="0.01" min="${afterDisc.toFixed(2)}" onchange="calcFacCambio(${afterDisc})" style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:12px;outline:none">
    </div>
    <div style="font-size:12px;font-weight:700;color:#059669">Cambio: L. ${Math.max(0,(facMontoRecibido||afterDisc)-afterDisc).toFixed(2)}</div>`:''}
  </div>`;

  document.getElementById('fac-totals-rows').innerHTML = rowsHTML;
  const exFields = document.getElementById('fac-exonerado-fields');
  if (exFields) exFields.className = 'exonerado-fields' + (facExonerado ? ' visible' : '');
  document.getElementById('fac-btn-invoice').disabled = facCart.length === 0;
}

let fac_bancos_cache = [];
async function setFacFormaPago(fp) {
  facFormaPago = fp;
  if(fp!=='efectivo') facMontoRecibido=0;
  if(fp==='transferencia'||fp==='tarjeta') {
    try { fac_bancos_cache = await GET('/bancos'); } catch(e) { fac_bancos_cache=[]; }
  }
  renderFacCart();
}
function calcFacCambio(total) { facMontoRecibido = parseFloat(document.getElementById('fac-monto-recibido')?.value)||total; renderFacCart(); }

async function processFacInvoice() {
  if (facCart.length === 0) return;
  const cl = clients_cache.find(c => c.id === facSelClientId) || clients_cache[0];
  // Validar que crédito no se use con Consumidor Final
  if (facFormaPago === 'credito') {
    if (!facSelClientId || cl.nombre === 'Consumidor Final') {
      alert('⚠️ Para ventas a Crédito debe seleccionar un cliente registrado (no Consumidor Final).');
      return;
    }
  }
  const subtotal = facCart.reduce((s,i) => s+i.precio*i.cantidad, 0);
  const discAmt = facDiscountType==='porcentaje' ? subtotal*(facDiscount/100) : facDiscount;
  const afterDisc = subtotal - discAmt;

  let isv15 = 0, isv18 = 0, importeGravado = 0;
  if (!facExonerado) {
    facCart.forEach(item => {
      if (!item.gravado) return;
      const tasa = item.tasaIsv || 15;
      const base = item.precio * item.cantidad;
      const isvItem = base - base / (1 + tasa / 100);
      importeGravado += base / (1 + tasa / 100);
      if (tasa === 18) isv18 += isvItem;
      else isv15 += isvItem;
    });
  }
  const importeExento = facExonerado ? afterDisc : 0;
  const recibido = facFormaPago==='efectivo' ? (parseFloat(document.getElementById('fac-monto-recibido')?.value)||afterDisc) : afterDisc;
  const cambio = facFormaPago==='efectivo' ? Math.max(0, recibido - afterDisc) : 0;
  const fac_banco_id = (facFormaPago==='transferencia'||facFormaPago==='tarjeta') ? (document.getElementById('fac-banco-sel')?.value||null) : null;
  if ((facFormaPago==='transferencia'||facFormaPago==='tarjeta') && !fac_banco_id) { alert('⚠️ Debe seleccionar un banco para el pago.'); return; }

  try {
    const r = await POST('/ventas', {
      cliente_id: cl.id,
      items: facCart.map(i => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, categoria: i.categoria, precio: i.precio, cantidad: i.cantidad })),
      subtotal, descuento: discAmt,
      importe_gravado: importeGravado, importe_exento: importeExento, importe_exonerado: 0,
      isv15, isv18, total: afterDisc, exonerado: facExonerado,
      forma_pago: facFormaPago, monto_recibido: recibido, cambio, banco_id: fac_banco_id,
      orden_compra_exenta: facOrdenCompra, constancia_registro: facConstancia, identificativo_sag: facSAG,
      turno_id: null
    });

    // Siempre imprime en carta
    const saleForPrint = {
      id: r.id, numero_factura: r.numero_factura, fecha: nowHN(),
      cliente: cl, items: facCart.map(i=>({...i})),
      subtotal, descuento: discAmt, importeGravado, importeExento,
      isv: isv15, isv18, total: afterDisc, exonerado: facExonerado,
      formaPago: facFormaPago, montoRecibido: recibido, cambio,
      ordenCompraExenta: facOrdenCompra, constanciaRegistro: facConstancia, identificativoSAG: facSAG
    };
    printInvoice(saleForPrint);  // v7: ahora muestra selector de formato (ticket/carta)

    // Limpiar estado
    facCart = []; facDiscount = 0; facExonerado = false;
    facFormaPago = 'efectivo'; facMontoRecibido = 0;
    facOrdenCompra = ''; facConstancia = ''; facSAG = '';
    document.getElementById('fac-discount').value = '';
    document.getElementById('fac-exonerado').checked = false;
    renderFacCart();
    toast('fac-invoice-toast');
    products_cache = await GET('/productos', `sucursal_id=${USER.sucursal_id}`).catch(()=>products_cache);
    renderFacProductGrid();
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── BANCOS ───────────────────────────────────────────────────────────────────
let bancos_cache = [];
let editingBanco = null;

async function renderBancos() {
  try { bancos_cache = await GET('/bancos'); } catch(e) {}
  const total = bancos_cache.reduce((s,b) => s+(b.saldo_actual||0), 0);
  document.getElementById('bancos-subtitle').textContent = `${bancos_cache.length} cuentas · Total consolidado: L. ${total.toFixed(2)}`;
  document.getElementById('bancos-cards').innerHTML = bancos_cache.map(b => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;min-width:200px;flex:1;max-width:280px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="font-size:20px">${b.tipo==='ahorro'?'🏦':'💳'}</div>
        <button class="action-btn edit" onclick="openBancoModal('${b.id}')">✏️</button>
      </div>
      <div style="font-weight:700;color:#1e293b;margin-bottom:2px">${b.nombre}</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${b.numero_cuenta||'Sin número'} · ${b.tipo}</div>
      <div style="font-size:18px;font-weight:700;color:#2563eb">L. ${(b.saldo_actual||0).toFixed(2)}</div>
      <div style="font-size:10px;color:#94a3b8">${b.moneda||'HNL'}</div>
    </div>
  `).join('');
  // Populate bank selector
  const sel = document.getElementById('banco-sel-mov');
  sel.innerHTML = '<option value="">— Seleccionar Banco —</option>' + bancos_cache.map(b=>`<option value="${b.id}">${b.nombre}</option>`).join('');
  const selMov = document.getElementById('mov-banco-id');
  if(selMov) selMov.innerHTML = bancos_cache.map(b=>`<option value="${b.id}">${b.nombre} (L. ${(b.saldo_actual||0).toFixed(2)})</option>`).join('');
}

function openBancoModal(id) {
  const b = id ? bancos_cache.find(x=>x.id===id) : null;
  editingBanco = b;
  document.getElementById('banco-modal-title').textContent = b ? 'Editar Banco' : 'Nueva Cuenta Bancaria';
  document.getElementById('banco-nombre').value = b?.nombre||'';
  document.getElementById('banco-cuenta').value = b?.numero_cuenta||'';
  document.getElementById('banco-tipo').value = b?.tipo||'corriente';
  document.getElementById('banco-moneda').value = b?.moneda||'HNL';
  document.getElementById('banco-saldo-ini').value = b?.saldo_inicial||0;
  openModal('banco-modal');
}

async function saveBanco(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('banco-nombre').value,
    numero_cuenta: document.getElementById('banco-cuenta').value,
    tipo: document.getElementById('banco-tipo').value,
    moneda: document.getElementById('banco-moneda').value,
    saldo_inicial: parseFloat(document.getElementById('banco-saldo-ini').value)||0,
  };
  try {
    if(editingBanco) await PUT('/bancos/'+editingBanco.id, data);
    else await POST('/bancos', data);
    closeModal('banco-modal'); renderBancos();
  } catch(e) { alert(e.message); }
}

async function loadMovimientosBanco() {
  const bid = document.getElementById('banco-sel-mov').value;
  if(!bid) return alert('Seleccione un banco');
  const fi = document.getElementById('banco-fecha-ini').value;
  const ff = document.getElementById('banco-fecha-fin').value;
  let qs = '';
  if(fi) qs += `&fecha_ini=${fi}`;
  if(ff) qs += `&fecha_fin=${ff}`;
  const movs = await GET(`/bancos/${bid}/movimientos`, qs.replace('&',''));
  const tipoLabels = {deposito:'💰 Depósito',retiro:'⬆️ Retiro',transferencia:'↔️ Transferencia',nota_credito:'✅ N.Crédito',nota_debito:'❌ N.Débito'};
  document.getElementById('banco-mov-body').innerHTML = movs.length ? movs.map(m=>`
    <tr>
      <td style="font-size:11px">${fDT(m.fecha)}</td>
      <td><span class="badge ${m.tipo==='deposito'||m.tipo==='nota_credito'?'badge-green':'badge-red'}">${tipoLabels[m.tipo]||m.tipo}</span></td>
      <td>${m.descripcion||'—'}</td>
      <td style="font-family:monospace;font-size:11px">${m.referencia||'—'}</td>
      <td style="text-align:right;font-weight:600;color:${m.tipo==='deposito'||m.tipo==='nota_credito'?'#16a34a':'#dc2626'}">L. ${(m.monto||0).toFixed(2)}</td>
      <td style="text-align:right">L. ${(m.saldo_anterior||0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:700">L. ${(m.saldo_nuevo||0).toFixed(2)}</td>
      <td style="font-size:11px">${m.usuario_nombre||'—'}</td>
    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px">Sin movimientos</td></tr>';
}

function openMovimientoModal() {
  const now = new Date();
  const local = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('mov-fecha').value = local;
  const sel = document.getElementById('mov-banco-id');
  sel.innerHTML = bancos_cache.map(b=>`<option value="${b.id}">${b.nombre} (L. ${(b.saldo_actual||0).toFixed(2)})</option>`).join('');
  openModal('movimiento-modal');
}

async function saveMovimiento(e) {
  e.preventDefault();
  const data = {
    tipo: document.getElementById('mov-tipo').value,
    fecha: document.getElementById('mov-fecha').value,
    monto: parseFloat(document.getElementById('mov-monto').value)||0,
    descripcion: document.getElementById('mov-descripcion').value,
    referencia: document.getElementById('mov-referencia').value,
  };
  const bid = document.getElementById('mov-banco-id').value;
  if(!bid) return alert('Seleccione un banco');
  try {
    await POST(`/bancos/${bid}/movimientos`, data);
    closeModal('movimiento-modal'); renderBancos();
  } catch(e) { alert(e.message); }
}

async function reporteConsolidacionBancaria() {
  const r = await GET('/bancos/consolidacion');
  const b = BRANCH||{};
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:12px;padding:20px}@media print{@page{size:letter;margin:10mm}}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #f1f5f9}tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}</style></head><body>
  <div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
    <div><strong style="font-size:18px;color:#1e3a5f">CONSOLIDACIÓN BANCARIA</strong><br><span style="color:#64748b">${b.nombre||''} — RTN: ${b.rtn||''}</span></div>
    <div style="text-align:right;color:#64748b">Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
  </div>
  <table><thead><tr><th>Banco</th><th>N° Cuenta</th><th>Tipo</th><th>Moneda</th><th style="text-align:right">Saldo Inicial</th><th style="text-align:right">Saldo Actual</th></tr></thead>
  <tbody>${(r.bancos||[]).map(b=>`<tr><td style="font-weight:600">${b.nombre}</td><td style="font-family:monospace">${b.numero_cuenta||'—'}</td><td>${b.tipo}</td><td>${b.moneda}</td><td style="text-align:right">L. ${(b.saldo_inicial||0).toFixed(2)}</td><td style="text-align:right;font-weight:700">L. ${(b.saldo_actual||0).toFixed(2)}</td></tr>`).join('')}</tbody>
  <tfoot><tr class="total-row"><td colspan="5">TOTAL CONSOLIDADO</td><td style="text-align:right">L. ${(r.total_consolidado||0).toFixed(2)}</td></tr></tfoot></table>
  <div style="margin-top:20px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
  </body></html>`, "Consolidación Bancaria");
}

// ─── IMPUESTOS ────────────────────────────────────────────────────────────────
let impuestos_cache = [];
let editingImpuesto = null;

async function renderImpuestos() {
  try { impuestos_cache = await GET('/impuestos'); } catch(e) {}
  document.getElementById('imp-count').textContent = impuestos_cache.length + ' impuestos';
  document.getElementById('imp-table-body').innerHTML = impuestos_cache.map(imp=>`
    <tr>
      <td style="font-weight:600">${imp.nombre}</td>
      <td>${imp.tasa}${imp.tipo==='porcentaje'?'%':' L.'}</td>
      <td>${imp.tipo==='porcentaje'?'Porcentaje':'Monto Fijo'}</td>
      <td>${imp.aplica_a}</td>
      <td><span class="badge ${imp.activo?'badge-green':'badge-red'}">${imp.activo?'Activo':'Inactivo'}</span></td>
      <td><div style="display:flex;gap:4px;justify-content:flex-end">
        <button class="action-btn edit" onclick="openImpuestoModal('${imp.id}')">✏️</button>
        <button class="action-btn delete" onclick="deleteImpuesto('${imp.id}')">🗑️</button>
      </div></td>
    </tr>`).join('');
}

function openImpuestoModal(id) {
  const imp = id ? impuestos_cache.find(x=>x.id===id) : null;
  editingImpuesto = imp;
  document.getElementById('imp-modal-title').textContent = imp ? 'Editar Impuesto' : 'Crear Impuesto';
  document.getElementById('imp-nombre').value = imp?.nombre||'';
  document.getElementById('imp-tasa').value = imp?.tasa||'';
  document.getElementById('imp-tipo').value = imp?.tipo||'porcentaje';
  document.getElementById('imp-aplica').value = imp?.aplica_a||'todos';
  openModal('impuesto-modal');
}

async function saveImpuesto(e) {
  e.preventDefault();
  const data = {
    nombre: document.getElementById('imp-nombre').value,
    tasa: parseFloat(document.getElementById('imp-tasa').value)||0,
    tipo: document.getElementById('imp-tipo').value,
    aplica_a: document.getElementById('imp-aplica').value,
  };
  try {
    if(editingImpuesto) await PUT('/impuestos/'+editingImpuesto.id, data);
    else await POST('/impuestos', data);
    closeModal('impuesto-modal'); renderImpuestos();
  } catch(e) { alert(e.message); }
}

async function deleteImpuesto(id) {
  if(!confirm('¿Eliminar este impuesto?')) return;
  try { await DELETE('/impuestos/'+id); renderImpuestos(); } catch(e) { alert(e.message); }
}

// ─── IMPORTAR EXCEL ───────────────────────────────────────────────────────────
// ── Importar Productos Excel (usa SheetJS igual que Clientes/Proveedores) ──
function openExcelModal() {
  document.getElementById('excel-file-input').value = '';
  document.getElementById('excel-preview').style.display = 'none';
  document.getElementById('excel-result').style.display  = 'none';
  document.getElementById('excel-import-btn').style.display = 'none';
  openModal('excel-modal');
}

// Listener del input de archivo
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('excel-file-input');
  if(input) input.addEventListener('change', async e => {
    try {
      const rows = await leerExcel('excel-file-input');
      mostrarPreviewProductos(rows);
    } catch(err) { alert('Error: '+err.message); }
  });
});

function mostrarPreviewProductos(rows) {
  if(!rows.length) return;
  const prev = document.getElementById('excel-preview');
  const muestra = rows.slice(0,5);
  prev.style.display = 'block';
  prev.innerHTML = '<div style="font-weight:700;color:#475569;margin-bottom:6px">Vista previa (' + rows.length + ' registros):</div>' +
    muestra.map((r,i) =>
      '<div style="padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:11px">' +
      (i+1) + '. <b>Código:</b> ' + (r.codigo||'—') + ' | <b>Nombre:</b> ' + (r.nombre||'—') + ' | <b>Precio:</b> ' + (r.precio_venta||'—') +
      '</div>'
    ).join('') +
    (rows.length>5 ? '<div style="color:#94a3b8;font-size:11px;margin-top:4px">...y ' + (rows.length-5) + ' más</div>' : '');
  document.getElementById('excel-import-btn').style.display = 'inline-block';
  window._excelProdCache = rows;
}

async function importarProductosExcel() {
  const rows = window._excelProdCache;
  if(!rows||!rows.length) return;
  const btn = document.getElementById('excel-import-btn');
  btn.disabled = true; btn.textContent = 'Importando...';
  try {
    const productos = rows.map(r => ({
      codigo:       (r.codigo||'').toString().trim(),
      nombre:       (r.nombre||'').toString().trim(),
      categoria:    (r.categoria||'General').toString().trim(),
      precio_venta: parseFloat(r.precio_venta)||0,
      costo:        parseFloat(r.costo)||0,
      gravado:      r.gravado===0||r.gravado==='0'?0:1,
    })).filter(p => p.codigo && p.nombre);
    const r = await POST('/productos/importar_excel', {productos});
    mostrarResultado('excel-result', r);
    window._excelProdCache = null;
    setTimeout(() => { closeModal('excel-modal'); if(currentView==='products') renderProducts(); }, 2000);
  } catch(err) { alert('Error: '+err.message); }
  btn.disabled = false; btn.textContent = '📥 Importar';
}

// ─── PERMISOS DE MÓDULOS ──────────────────────────────────────────────────────
const MODULOS_BLOQUEABLES = [
  {id:'bancos',label:'Bancos'},
  {id:'cxp',label:'Cuentas por Pagar'},
  {id:'cxc',label:'Cuentas por Cobrar'},
  {id:'inventory',label:'Inventario'},
  {id:'purchases',label:'Compras'},
];

let permisosUserId = null;

async function openPermisosModal(userId, userName) {
  permisosUserId = userId;
  document.getElementById('permisos-user-nombre').textContent = `Usuario: ${userName}`;
  const permisos = await GET(`/usuarios/${userId}/permisos`).catch(()=>[]);
  const bloqueados = {};
  permisos.forEach(p => bloqueados[p.modulo] = p.bloqueado);
  document.getElementById('permisos-lista').innerHTML = MODULOS_BLOQUEABLES.map(m=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border-radius:8px">
      <div>
        <div style="font-weight:600;color:#1e293b">${m.label}</div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <span style="font-size:12px;color:${bloqueados[m.id]?'#dc2626':'#16a34a'}">${bloqueados[m.id]?'Bloqueado':'Activo'}</span>
        <input type="checkbox" ${bloqueados[m.id]?'checked':''} onchange="toggleModuloPermiso('${m.id}',this.checked,'${userName}')" style="width:16px;height:16px;cursor:pointer">
      </label>
    </div>`).join('');
  openModal('permisos-modal');
}

async function toggleModuloPermiso(modulo, bloqueado, userName) {
  try {
    await PUT(`/usuarios/${permisosUserId}/permisos`, {modulo, bloqueado});
    // Refresh labels
    await openPermisosModal(permisosUserId, userName);
  } catch(e) { alert(e.message); }
}

// ─── REPORTES NUEVOS ──────────────────────────────────────────────────────────
async function reporteLibroFiscal() {
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const ventas = await GET('/reportes/libro_fiscal', `sucursal_id=${USER.sucursal_id}&fecha_ini=${ini}&fecha_fin=${fin}`);
  const b = BRANCH||{};
  const totGrav = ventas.reduce((s,v)=>s+(v.importe_gravado||0),0);
  const totExento = ventas.reduce((s,v)=>s+(v.importe_exento||0),0);
  const totIsv15 = ventas.reduce((s,v)=>s+(v.isv15||0),0);
  const totIsv18 = ventas.reduce((s,v)=>s+(v.isv18||0),0);
  const totDesc = ventas.reduce((s,v)=>s+(v.descuento||0),0);
  const totTotal = ventas.reduce((s,v)=>s+(v.total||0),0);
  const fpLabel = {efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transf.'};
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:10px;padding:15px}
@media print{@page{size:legal landscape;margin:8mm}body{padding:0}}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e3a5f;color:#fff;padding:5px 6px;font-size:9px;text-align:left}
td{padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:9px}
tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:3px solid #1e3a5f;padding-bottom:10px">
  <div><div style="font-size:16px;font-weight:700;color:#1e3a5f">LIBRO DE VENTAS FISCALES</div>
  <div style="font-size:10px;color:#64748b">${b.nombre||''} · RTN: ${b.rtn||''} · CAI: ${b.cai||''}</div></div>
  <div style="text-align:right;font-size:10px;color:#64748b">Período: ${fD(ini)} al ${fD(fin)}<br>Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
</div>
<table><thead><tr>
  <th>#</th><th>Fecha</th><th>N° Factura</th><th>Cliente</th><th>RTN Cliente</th>
  <th style="text-align:right">Imp.Gravado</th><th style="text-align:right">Imp.Exento</th>
  <th style="text-align:right">ISV 15%</th><th style="text-align:right">ISV 18%</th>
  <th style="text-align:right">Descuento</th><th style="text-align:right">Total</th>
  <th>F.Pago</th><th>Estado</th>
</tr></thead>
<tbody>${ventas.map((v,i)=>`<tr ${v.estado==='anulada'?'style="text-decoration:line-through;color:#94a3b8"':''}>
  <td>${i+1}</td><td>${fDT(v.fecha)}</td>
  <td style="font-family:monospace;font-weight:600">${v.numero_factura}</td>
  <td>${v.cliente_nombre||'Consumidor Final'}</td>
  <td style="font-family:monospace">${v.cliente_rtn||'—'}</td>
  <td style="text-align:right">${fL(v.importe_gravado||0)}</td>
  <td style="text-align:right">${fL(v.importe_exento||0)}</td>
  <td style="text-align:right">${fL(v.isv15||0)}</td>
  <td style="text-align:right">${fL(v.isv18||0)}</td>
  <td style="text-align:right">${fL(v.descuento||0)}</td>
  <td style="text-align:right;font-weight:700">${fL(v.total||0)}</td>
  <td>${fpLabel[v.forma_pago]||v.forma_pago||'Efect.'}</td>
  <td><span style="padding:1px 5px;border-radius:8px;font-size:8px;font-weight:700;background:${v.estado==='emitida'?'#f0fdf4':'#fef2f2'};color:${v.estado==='emitida'?'#16a34a':'#dc2626'}">${v.estado}</span></td>
</tr>`).join('')}</tbody>
<tfoot><tr class="total-row">
  <td colspan="5">TOTALES (${ventas.length} facturas)</td>
  <td style="text-align:right">${fL(totGrav)}</td><td style="text-align:right">${fL(totExento)}</td>
  <td style="text-align:right">${fL(totIsv15)}</td><td style="text-align:right">${fL(totIsv18)}</td>
  <td style="text-align:right">${fL(totDesc)}</td><td style="text-align:right">${fL(totTotal)}</td>
  <td colspan="2"></td>
</tr></tfoot></table>
<div style="margin-top:12px;font-size:9px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
</body></html>`, "Libro de Ventas Fiscales");
}

async function reporteValorizacion() {
  const inv = await GET('/reportes/valorizacion', `sucursal_id=${USER.sucursal_id}`);
  const b = BRANCH||{};
  const totCosto = inv.reduce((s,p)=>s+(p.valor_costo||0),0);
  const totVenta = inv.reduce((s,p)=>s+(p.valor_venta||0),0);
  const totMargen = inv.reduce((s,p)=>s+(p.margen||0),0);
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:11px;padding:20px}
@media print{@page{size:letter landscape;margin:10mm}body{padding:0}}
table{width:100%;border-collapse:collapse;margin-top:14px}
th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:10px}
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
  <div><strong style="font-size:18px;color:#1e3a5f">VALORIZACIÓN DE INVENTARIO</strong><br><span style="font-size:10px;color:#64748b">RTN: ${b.rtn||''}</span></div>
  <div style="text-align:right;font-size:11px;color:#64748b">Fecha: ${fD(today())}<br>Hora: ${new Date().toLocaleTimeString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
</div>
<div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap">
  ${[['Valor a Costo','#eff6ff',fL(totCosto)],['Valor a Precio Venta','#f0fdf4',fL(totVenta)],['Margen Potencial','#fff7ed',fL(totMargen)]].map(([l,bg,v])=>`<div style="flex:1;min-width:160px;background:${bg};border-radius:10px;padding:12px 16px;text-align:center"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">${l}</div><div style="font-size:17px;font-weight:700;color:#1e3a5f;margin-top:4px">${v}</div></div>`).join('')}
</div>
<table><thead><tr>
  <th>Código</th><th>Nombre</th><th>Categoría</th>
  <th style="text-align:right">Stock</th><th style="text-align:right">Costo Unit.</th>
  <th style="text-align:right">Precio Venta</th><th style="text-align:right">Val.Costo</th>
  <th style="text-align:right">Val.Venta</th><th style="text-align:right">Margen</th>
</tr></thead>
<tbody>${inv.map(p=>`<tr>
  <td style="font-family:monospace;font-size:10px">${p.codigo}</td>
  <td style="font-weight:600">${p.nombre}</td><td>${p.categoria||'—'}</td>
  <td style="text-align:right;${(p.stock||0)<=(p.stock_min||0)?'color:#dc2626;font-weight:700':''}">${p.stock||0}</td>
  <td style="text-align:right">${fL(p.costo||0)}</td>
  <td style="text-align:right">${fL(p.precio_venta||0)}</td>
  <td style="text-align:right">${fL(p.valor_costo||0)}</td>
  <td style="text-align:right;font-weight:600">${fL(p.valor_venta||0)}</td>
  <td style="text-align:right;color:#059669;font-weight:600">${fL(p.margen||0)}</td>
</tr>`).join('')}</tbody>
<tfoot><tr class="total-row">
  <td colspan="6">TOTALES (${inv.length} productos)</td>
  <td style="text-align:right">${fL(totCosto)}</td>
  <td style="text-align:right">${fL(totVenta)}</td>
  <td style="text-align:right">${fL(totMargen)}</td>
</tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
</body></html>`, "Valorización de Inventario");
}

// ─── REPORTE CORTE CAJA CON FILTRO HORA ──────────────────────────────────────
async function reporteCorteCajaDetalle() {
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const hi = document.getElementById('rep-hora-ini')?.value||'00:00:00';
  const hf = document.getElementById('rep-hora-fin')?.value||'23:59:59';
  const data = await GET('/reportes/corte_caja_detalle', `sucursal_id=${USER.sucursal_id}&fecha_ini=${ini}&fecha_fin=${fin}&hora_ini=${hi}&hora_fin=${hf}`, "Corte de Caja Detalle");
  const {ventas, resumen} = data;
  const b = BRANCH||{};
  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}
@media print{@page{size:80mm auto;margin:0}}
.c{text-align:center}.b{font-weight:700}.sep{border-top:1px dashed #999;margin:5px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 0}td:last-child{text-align:right}
</style></head><body>
<div class="c b" style="font-size:14px">CORTE DE CAJA</div>
<div class="c">${b.nombre||''}</div>
<div class="c" style="font-size:10px">RTN: ${b.rtn||''}</div>
<div class="sep"></div>

<div>Período: ${fD(ini)} ${hi} al ${fD(fin)} ${hf}</div>
<div>Generado: ${new Date().toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'})}</div>
<div class="sep"></div>
<table>
  <tr><td>N° Ventas</td><td>${resumen.total_ventas||0}</td></tr>
  <tr><td>Descuentos</td><td>-${fL(resumen.descuentos||0)}</td></tr>
  <tr><td>ISV 15%</td><td>${fL(resumen.isv15||0)}</td></tr>
  <tr><td>ISV 18%</td><td>${fL(resumen.isv18||0)}</td></tr>
  <tr><td class="b">Efectivo</td><td class="b">${fL(resumen.total_efectivo||0)}</td></tr>
  <tr><td class="b">Tarjeta</td><td class="b">${fL(resumen.total_tarjeta||0)}</td></tr>
  <tr><td class="b">Transferencia</td><td class="b">${fL(resumen.total_transferencia||0)}</td></tr>
  <tr><td class="b" style="font-size:14px">TOTAL</td><td class="b" style="font-size:14px">${fL(resumen.total||0)}</td></tr>
</table>
<div class="sep"></div>
${ventas.slice(0,30).map(s=>`<div style="font-size:10px">${s.numero_factura} | ${(s.cliente_nombre||'').substring(0,12)} | ${fL(s.total)}</div>`).join('')}
<div class="sep"></div>
<div class="c" style="font-size:10px">Powered by Metric POS</div>
<div style="height:10mm"></div></body></html>`;
  openPrint(printHTML, "Corte de Caja Detalle");
}

async function reporteCorteCajaCartaDetalle() {
  const ini = document.getElementById('rep-fecha-ini').value;
  const fin = document.getElementById('rep-fecha-fin').value;
  const hi = document.getElementById('rep-hora-ini')?.value||'00:00:00';
  const hf = document.getElementById('rep-hora-fin')?.value||'23:59:59';
  const data = await GET('/reportes/corte_caja_detalle', `sucursal_id=${USER.sucursal_id}&fecha_ini=${ini}&fecha_fin=${fin}&hora_ini=${hi}&hora_fin=${hf}`);
  const {ventas, resumen} = data;
  const b = BRANCH||{};
  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}body{font-size:11px;padding:20px}
@media print{@page{size:letter portrait;margin:10mm}body{padding:0}}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e3a5f;color:#fff;padding:6px 8px;font-size:10px;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
tr:nth-child(even) td{background:#f8fafc}.total-row td{background:#1e3a5f;color:#fff;font-weight:700}
.res{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
.rc{background:#f8fafc;border-radius:8px;padding:10px;text-align:center}
.rl{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700}
.rv{font-size:14px;font-weight:700;color:#1e3a5f;margin-top:3px}
</style></head><body>
<div style="display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:2px solid #1e3a5f;padding-bottom:10px">
  <div><strong style="font-size:18px;color:#1e3a5f">CORTE DE CAJA</strong><br>
  <span style="font-size:10px;color:#64748b">${b.nombre||''} · RTN: ${b.rtn||''}</span></div>
  <div style="text-align:right;font-size:10px;color:#64748b">Período: ${fD(ini)} ${hi}<br>hasta: ${fD(fin)} ${hf}</div>
</div>
<div class="res">
  <div class="rc"><div class="rl">Efectivo</div><div class="rv">${fL(resumen.total_efectivo||0)}</div></div>
  <div class="rc"><div class="rl">Tarjeta</div><div class="rv">${fL(resumen.total_tarjeta||0)}</div></div>
  <div class="rc"><div class="rl">Transferencia</div><div class="rv">${fL(resumen.total_transferencia||0)}</div></div>
  <div class="rc"><div class="rl">ISV 15%</div><div class="rv">${fL(resumen.isv15||0)}</div></div>
  <div class="rc"><div class="rl">ISV 18%</div><div class="rv">${fL(resumen.isv18||0)}</div></div>
  <div class="rc" style="background:#1e3a5f"><div class="rl" style="color:#93c5fd">TOTAL</div><div class="rv" style="color:#fff;font-size:17px">${fL(resumen.total||0)}</div></div>
</div>
<table><thead><tr><th>N° Factura</th><th>Fecha/Hora</th><th>Cliente</th><th>F.Pago</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${ventas.map(v=>`<tr><td style="font-family:monospace">${v.numero_factura}</td><td>${fDT(v.fecha)}</td><td>${(v.cliente_nombre||'').substring(0,20)}</td><td>${v.forma_pago||'efectivo'}</td><td style="text-align:right;font-weight:600">${fL(v.total||0)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td colspan="4">TOTAL (${ventas.length} facturas)</td><td style="text-align:right">${fL(resumen.total||0)}</td></tr></tfoot></table>
<div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">Powered by Metric POS</div>
</body></html>`, "Corte de Caja Carta");
}

// ─── EDITOR DE REPORTES ───────────────────────────────────────────────────────
const REPORT_TEMPLATES_KEY = 'mp_report_templates';

function getReportTemplates() {
  try { return JSON.parse(localStorage.getItem(REPORT_TEMPLATES_KEY)||'{}'); } catch(e) { return {}; }
}

function saveReportTemplate(key, html) {
  const t = getReportTemplates();
  t[key] = html;
  localStorage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(t));
}

function getDefaultTemplate(key) {
  const defaults = {
    corte_caja: '<!-- Template Corte de Caja -->\n<!-- Variables: {empresa}, {rtn}, {periodo}, {ventas}, {total} -->\n<!-- Edita el HTML a tu gusto y guarda -->',
    libro_fiscal: '<!-- Template Libro Fiscal -->\n<!-- Se generará el libro fiscal con las columnas estándar SAR Honduras -->',
    valorizacion: '<!-- Template Valorización de Inventario -->\n<!-- Muestra valor a costo, precio venta y margen -->',
    inventario_fisico: '<!-- Template Inventario Físico -->\n<!-- Lista de productos con espacio para conteo manual -->',
  };
  return defaults[key]||'<!-- Template vacío -->';
}

function cargarEditorReporte() {
  const key = document.getElementById('editor-rep-sel').value;
  const templates = getReportTemplates();
  document.getElementById('editor-reporte-textarea').value = templates[key]||getDefaultTemplate(key);
}

function guardarEditorReporte() {
  const key = document.getElementById('editor-rep-sel').value;
  const html = document.getElementById('editor-reporte-textarea').value;
  saveReportTemplate(key, html);
  alert('Template guardado correctamente.');
}

function resetEditorReporte() {
  if(!confirm('¿Restaurar el template por defecto? Se perderá la personalización.')) return;
  const key = document.getElementById('editor-rep-sel').value;
  const templates = getReportTemplates();
  delete templates[key];
  localStorage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(templates));
  cargarEditorReporte();
}

function previewEditorReporte() {
  const html = document.getElementById('editor-reporte-textarea').value;
  openPrint(html, "Corte de Caja Carta");
}

// ─── SETUP EVENTS ─────────────────────────────────────────────────────────────
function _on(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}
function setupEvents() {
  // inv-search (existe en HTML)
  _on('inv-search', 'input', () => { if(currentView==='inventory') renderInventory(); });
  // Productos
  _on('btn-new-product', 'click', () => openProductModal(null));
  _on('prod-modal-form', 'submit', saveProduct);
  _on('prod-modal-cancel', 'click', () => closeModal('prod-modal'));
  // Clientes
  _on('btn-new-client', 'click', () => openClientModal(null));
  _on('client-modal-form', 'submit', saveClient);
  _on('client-modal-cancel', 'click', () => closeModal('client-modal'));
  // Proveedores
  _on('btn-new-supplier', 'click', () => openSupplierModal(null));
  _on('supplier-modal-form', 'submit', saveSupplier);
  _on('supplier-modal-cancel', 'click', () => closeModal('supplier-modal'));
  // Ajuste
  _on('ajuste-form', 'submit', saveAjuste);
  _on('ajuste-cancel', 'click', () => closeModal('ajuste-modal'));
  // CxC
  _on('btn-new-cxc', 'click', openCxCModal);
  _on('cxc-form', 'submit', saveCxC);
  _on('cxc-modal-cancel', 'click', () => closeModal('cxc-modal'));
  // CxP
  _on('btn-new-cxp', 'click', openCxPModal);
  _on('cxp-form', 'submit', saveCxP);
  _on('cxp-modal-cancel', 'click', () => closeModal('cxp-modal'));
  // Usuarios
  _on('btn-new-user', 'click', () => openUserModal(null));
  _on('user-modal-form', 'submit', saveUser);
  _on('user-modal-cancel', 'click', () => closeModal('user-modal'));
  // Sucursales
  _on('btn-new-branch', 'click', () => openBranchModal(null));
  _on('branch-modal-form', 'submit', saveBranch);
  _on('branch-modal-cancel', 'click', () => closeModal('branch-modal'));
  _on('branch-modal-delete', 'click', async () => {
    if (!editingBranch) return;
    if (!confirm('Eliminar la sucursal ' + editingBranch.nombre + '? Esta accion no se puede deshacer.')) return;
    try {
      await DELETE('/sucursales/' + editingBranch.id);
      closeModal('branch-modal');
      branches_cache = await GET('/sucursales');
      renderBranches();
    } catch(e) { alert('Error: ' + e.message); }
  });
  // Compras
  _on('btn-new-purchase', 'click', openPurchaseModal);
  _on('purchase-modal-form', 'submit', savePurchase);
  _on('purchase-modal-cancel', 'click', () => closeModal('purchase-modal'));
  // Devoluciones
  _on('btn-new-return', 'click', openReturnModal);
  _on('return-modal-form', 'submit', saveReturn);
  _on('return-modal-cancel', 'click', () => closeModal('return-modal'));
  // Config
  _on('config-form', 'submit', saveConfig);
  // Bancos
  _on('btn-new-banco', 'click', () => openBancoModal(null));
  _on('banco-modal-form', 'submit', saveBanco);
  _on('banco-modal-cancel', 'click', () => closeModal('banco-modal'));
  _on('movimiento-modal-form', 'submit', saveMovimiento);
  _on('movimiento-modal-cancel', 'click', () => closeModal('movimiento-modal'));
  // Impuestos
  _on('btn-new-impuesto', 'click', () => openImpuestoModal(null));
  _on('impuesto-modal-form', 'submit', saveImpuesto);
  _on('imp-modal-cancel', 'click', () => closeModal('impuesto-modal'));
  // Permisos
  _on('permisos-modal-cancel', 'click', () => closeModal('permisos-modal'));
  // Excel
  _on('excel-modal-cancel', 'click', () => { closeModal('excel-modal'); window._excelProdCache=null; document.getElementById('excel-preview').style.display='none'; document.getElementById('excel-result').style.display='none'; document.getElementById('excel-import-btn').style.display='none'; });
  // Editor Reportes
  _on('editor-reporte-cancel', 'click', () => closeModal('editor-reporte-modal'));
  // Movimiento Caja (módulo de turnos eliminado)
}

// ═══════════════════════════════════════════════════════════════════════════
// METRIC POS v7 — FUNCIONES FALTANTES (CORREGIDAS)
// ═══════════════════════════════════════════════════════════════════════════

// ─── openPrint: abre ventana emergente para imprimir ─────────────────────
function openPrint(html, title) {
  const w = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
  if (!w) {
    alert('⚠️ El navegador bloqueó la ventana emergente.\nPor favor permite las ventanas emergentes para este sitio e intenta de nuevo.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch(e) {}
  }, 400);
}

// ─── getRepParams: construye query-string de fechas/sucursal ──────────────
function getRepParams() {
  const ini = (document.getElementById('rep-fecha-ini') || {}).value || todayHN();
  const fin = (document.getElementById('rep-fecha-fin') || {}).value || todayHN();
  return `sucursal_id=${USER.sucursal_id}&fecha_ini=${ini}&fecha_fin=${fin}`;
}

// ─── renderReports: inicializa fechas del módulo de reportes ─────────────
function renderReports() {
  const hoy = todayHN();
  const iniEl = document.getElementById('rep-fecha-ini');
  const finEl = document.getElementById('rep-fecha-fin');
  if (iniEl && !iniEl.value) iniEl.value = hoy.substring(0, 8) + '01'; // primer día del mes
  if (finEl && !finEl.value) finEl.value = hoy;
  // Rellenar hora por defecto si existen los campos
  const hiEl = document.getElementById('rep-hora-ini');
  const hfEl = document.getElementById('rep-hora-fin');
  if (hiEl && !hiEl.value) hiEl.value = '00:00:00';
  if (hfEl && !hfEl.value) hfEl.value = '23:59:59';
}

// ─── CxP cache ────────────────────────────────────────────────────────────
let cxp_cache = [];

// ─── renderCxP ────────────────────────────────────────────────────────────
async function renderCxP() {
  try { cxp_cache = await GET('/cxp'); } catch(e) {}
  const total = cxp_cache.filter(c => c.estado !== 'pagado').reduce((s, c) => s + (parseFloat(c.saldo) || 0), 0);
  const venc  = cxp_cache.filter(c => c.estado !== 'pagado' && new Date(c.vencimiento) < new Date());

  const totalEl = document.getElementById('cxp-total');
  if (totalEl) totalEl.textContent = fL(total);
  const vencEl = document.getElementById('cxp-vencidas');
  if (vencEl) vencEl.textContent = venc.length + ' vencidas';

  const tbody = document.getElementById('cxp-table-body');
  if (!tbody) return;

  if (cxp_cache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8">No hay cuentas por pagar</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  cxp_cache.forEach(c => {
    const vencida = c.estado !== 'pagado' && new Date(c.vencimiento) < new Date();
    const badge = vencida
      ? '<span class="badge badge-red">Vencida</span>'
      : c.estado === 'pagado'
        ? '<span class="badge badge-green">Pagada</span>'
        : '<span class="badge badge-amber">Pendiente</span>';

    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.innerHTML =
      '<td style="font-weight:600">' + (c.proveedor_nombre || '—') + '</td>' +
      '<td style="font-size:11px;font-family:monospace">' + (c.referencia || '—') + '</td>' +
      '<td style="font-size:11px">' + fD(c.fecha) + '</td>' +
      '<td style="font-size:11px">' + fD(c.vencimiento) + '</td>' +
      '<td style="text-align:right">' + fL(c.monto) + '</td>' +
      '<td style="text-align:right;color:' + (parseFloat(c.saldo) > 0 ? '#dc2626' : '#16a34a') + ';font-weight:600">' + fL(c.saldo) + '</td>' +
      '<td>' + badge + '</td>' +
      '<td><div style="display:flex;gap:4px"></div></td>';

    const acciones = tr.querySelector('div');
    if (c.estado !== 'pagado') {
      const btnPagar = document.createElement('button');
      btnPagar.className = 'btn-primary';
      btnPagar.style.cssText = 'padding:5px 10px;font-size:11px';
      btnPagar.textContent = 'Pagar';
      btnPagar.addEventListener('click', () => pagarCxP(c.id, parseFloat(c.saldo) || 0));
      acciones.appendChild(btnPagar);
    }
    if (USER.rol === 'admin') {
      const btnDel = document.createElement('button');
      btnDel.className = 'action-btn delete';
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', () => deleteCxP(c.id));
      acciones.appendChild(btnDel);
    }
    tbody.appendChild(tr);
  });
}

// ─── openCxPModal ─────────────────────────────────────────────────────────
async function openCxPModal() {
  let provs = [];
  try { provs = await GET('/proveedores'); } catch(e) {}
  const sel = document.getElementById('cxp-prov-sel');
  if (sel) sel.innerHTML = provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  ['cxp-monto', 'cxp-vencimiento', 'cxp-referencia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('cxp-modal');
}

// ─── saveCxP ──────────────────────────────────────────────────────────────
async function saveCxP(e) {
  e.preventDefault();
  try {
    await POST('/cxp', {
      proveedor_id: document.getElementById('cxp-prov-sel').value,
      referencia:   (document.getElementById('cxp-referencia') || {}).value || '',
      monto:        parseFloat(document.getElementById('cxp-monto').value) || 0,
      vencimiento:  document.getElementById('cxp-vencimiento').value,
    });
    closeModal('cxp-modal');
    renderCxP();
  } catch(e) { alert(e.message); }
}

// ─── pagarCxP ─────────────────────────────────────────────────────────────
async function pagarCxP(id, saldo) {
  saldo = parseFloat(saldo) || 0;
  let bancos = [];
  try { bancos = await GET('/bancos'); } catch(e) {}

  const existing = document.getElementById('pago-cxp-modal');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'pago-cxp-modal';
  div.className = 'modal-overlay active';

  const saldoFmt = fL(saldo);
  const saldoVal = saldo.toFixed(2);
  let bancosHtml = '<option value="">— Seleccionar banco —</option>';
  bancos.forEach(b => {
    bancosHtml += '<option value="' + b.id + '">' + b.nombre +
      (b.numero_cuenta ? ' — ' + b.numero_cuenta : '') +
      ' (L. ' + (b.saldo_actual || 0).toFixed(2) + ')</option>';
  });

  div.innerHTML =
    '<div class="modal" style="max-width:420px">' +
      '<div class="modal-header"><h3>💳 Registrar Abono — CxP</h3>' +
        '<button id="cxp-modal-cerrar" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button></div>' +
      '<div style="padding:20px;display:flex;flex-direction:column;gap:14px">' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b">Saldo pendiente</label>' +
          '<div style="font-size:20px;font-weight:700;color:#dc2626">' + saldoFmt + '</div></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b">Monto a abonar</label>' +
          '<input type="number" id="cxp-pago-monto" step="0.01" min="0.01" max="' + saldoVal + '" value="' + saldoVal + '"' +
          ' style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px;outline:none;box-sizing:border-box;margin-top:4px"></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b">Método de pago</label>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button type="button" id="cxp-m-efectivo" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:2px solid #2563eb;cursor:pointer;background:#2563eb;color:#fff">💵 Efectivo</button>' +
            '<button type="button" id="cxp-m-tarjeta" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:#fff;color:#475569">💳 Tarjeta</button>' +
            '<button type="button" id="cxp-m-transferencia" style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;background:#fff;color:#475569">🏦 Transferencia</button>' +
          '</div></div>' +
        '<div id="cxp-banco-row" style="display:none"><label style="font-size:12px;font-weight:600;color:#64748b">Banco origen</label>' +
          '<select id="cxp-pago-banco" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;outline:none;margin-top:4px;box-sizing:border-box">' +
            bancosHtml + '</select></div>' +
        '<button id="cxp-confirmar-btn" style="background:#ea580c;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;width:100%">✅ Confirmar Pago</button>' +
      '</div></div>';

  document.body.appendChild(div);

  let metodoActual = 'efectivo';
  div.querySelector('#cxp-modal-cerrar').addEventListener('click', () => div.remove());

  const btnEf  = div.querySelector('#cxp-m-efectivo');
  const btnTj  = div.querySelector('#cxp-m-tarjeta');
  const btnTr  = div.querySelector('#cxp-m-transferencia');
  const activo   = 'background:#2563eb;color:#fff;border:2px solid #2563eb';
  const inactivo = 'background:#fff;color:#475569;border:1px solid #e2e8f0';

  function setMetodoCxP(m) {
    metodoActual = m;
    btnEf.style.cssText = 'flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer;' + (m === 'efectivo'      ? activo : inactivo);
    btnTj.style.cssText = 'flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer;' + (m === 'tarjeta'       ? activo : inactivo);
    btnTr.style.cssText = 'flex:1;padding:8px 4px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer;' + (m === 'transferencia' ? activo : inactivo);
    div.querySelector('#cxp-banco-row').style.display = m === 'transferencia' ? 'block' : 'none';
  }

  btnEf.addEventListener('click', () => setMetodoCxP('efectivo'));
  btnTj.addEventListener('click', () => setMetodoCxP('tarjeta'));
  btnTr.addEventListener('click', () => setMetodoCxP('transferencia'));

  div.querySelector('#cxp-confirmar-btn').addEventListener('click', async () => {
    const monto = parseFloat(div.querySelector('#cxp-pago-monto').value);
    if (!monto || monto <= 0) { alert('Ingrese un monto válido'); return; }
    const banco_id = metodoActual === 'transferencia'
      ? (div.querySelector('#cxp-pago-banco')?.value || null) : null;
    if (metodoActual === 'transferencia' && !banco_id) {
      alert('Seleccione el banco para la transferencia'); return;
    }
    try {
      await POST('/cxp/' + id + '/pagar', { monto, metodo: metodoActual, banco_id });
      div.remove();
      renderCxP();
    } catch(err) { alert('Error al registrar pago: ' + err.message); }
  });
}

// ─── deleteCxP ────────────────────────────────────────────────────────────
async function deleteCxP(id) {
  if (!confirm('¿Eliminar esta cuenta por pagar?')) return;
  try { await DELETE('/cxp/' + id); renderCxP(); } catch(e) { alert(e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORTACIÓN EXCEL — Clientes, Proveedores e Inventario
// Requiere SheetJS (ya incluido desde CDN en index.html)
// ════════════════════════════════════════════════════════════════════════════

// ── Utilidad: leer Excel con SheetJS ─────────────────────────────────────────
function leerExcel(inputId) {
  return new Promise((resolve, reject) => {
    const input = document.getElementById(inputId);
    if (!input || !input.files || !input.files[0]) {
      reject(new Error('No se seleccionó ningún archivo'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof XLSX === 'undefined') {
          reject(new Error('La librería Excel (SheetJS) no está cargada'));
          return;
        }
        const wb   = XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch(err) {
        reject(new Error('Error al leer el archivo: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Error al abrir el archivo'));
    reader.readAsBinaryString(input.files[0]);
  });
}

function mostrarPreview(containerId, rows, cols) {
  const el = document.getElementById(containerId);
  if (!el || !rows.length) return;
  const muestra = rows.slice(0, 5);
  el.style.display = 'block';
  el.innerHTML = `<div style="font-weight:700;color:#475569;margin-bottom:6px">
    Vista previa (${rows.length} registros encontrados):</div>` +
    muestra.map((r, i) =>
      `<div style="padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:11px">
        ${i+1}. ${cols.map(c => `<b>${c}:</b> ${r[c]||'—'}`).join(' &nbsp;|&nbsp; ')}
      </div>`
    ).join('') +
    (rows.length > 5 ? `<div style="color:#94a3b8;font-size:11px;margin-top:4px">... y ${rows.length-5} más</div>` : '');
}

function mostrarResultado(containerId, result) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.style.display = 'block';
  const ok  = result.errores === 0;
  el.innerHTML = `
    <div style="background:${ok?'#f0fdf4':'#fff7ed'};border:1px solid ${ok?'#bbf7d0':'#fed7aa'};
      border-radius:8px;padding:10px 14px;font-size:13px">
      <div style="font-weight:700;color:${ok?'#15803d':'#c2410c'};margin-bottom:6px">
        ${ok?'✅':'⚠️'} Importación completada
      </div>
      <div style="color:#475569">
        ✔ Creados: <b>${result.creados||0}</b> &nbsp;|&nbsp;
        ↺ Actualizados: <b>${result.actualizados||0}</b> &nbsp;|&nbsp;
        ❌ Errores: <b>${result.errores?.length||result.errores||0}</b>
      </div>
      ${Array.isArray(result.errores) && result.errores.length ?
        `<div style="margin-top:6px;font-size:11px;color:#dc2626">${result.errores.slice(0,5).map(e=>typeof e==='object'?JSON.stringify(e):e).join('<br>')}</div>` : ''}
    </div>`;
}

// ── IMPORTAR CLIENTES ─────────────────────────────────────────────────────────
function abrirImportarClientes() {
  document.getElementById('import-clientes-file').value = '';
  document.getElementById('import-clientes-preview').style.display = 'none';
  document.getElementById('import-clientes-result').style.display  = 'none';
  openModal('import-clientes-modal');
}

async function procesarImportarClientes() {
  try {
    const rows = await leerExcel('import-clientes-file');
    if (!rows.length) { alert('El archivo está vacío o no tiene datos'); return; }
    mostrarPreview('import-clientes-preview', rows, ['nombre','rtn','telefono','email']);
    const r = await POST('/clientes/importar_excel', { clientes: rows });
    mostrarResultado('import-clientes-result', r);
    if ((r.creados||0) + (r.actualizados||0) > 0) {
      clients_cache = await GET('/clientes');
      renderClients();
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// ── IMPORTAR PROVEEDORES ──────────────────────────────────────────────────────
function abrirImportarProveedores() {
  document.getElementById('import-proveedores-file').value = '';
  document.getElementById('import-proveedores-preview').style.display = 'none';
  document.getElementById('import-proveedores-result').style.display  = 'none';
  openModal('import-proveedores-modal');
}

async function procesarImportarProveedores() {
  try {
    const rows = await leerExcel('import-proveedores-file');
    if (!rows.length) { alert('El archivo está vacío o no tiene datos'); return; }
    mostrarPreview('import-proveedores-preview', rows, ['nombre','rtn','contacto','telefono']);
    const r = await POST('/proveedores/importar_excel', { proveedores: rows });
    mostrarResultado('import-proveedores-result', r);
    if ((r.creados||0) + (r.actualizados||0) > 0) renderSuppliers();
  } catch(e) { alert('Error: ' + e.message); }
}

// ── IMPORTAR INVENTARIO ───────────────────────────────────────────────────────
function abrirImportarInventario() {
  document.getElementById('import-inventario-file').value = '';
  document.getElementById('import-inventario-preview').style.display = 'none';
  document.getElementById('import-inventario-result').style.display  = 'none';
  openModal('import-inventario-modal');
}

async function procesarImportarInventario() {
  try {
    const rows = await leerExcel('import-inventario-file');
    if (!rows.length) { alert('El archivo está vacío o no tiene datos'); return; }
    mostrarPreview('import-inventario-preview', rows, ['codigo','tipo','cantidad','costo_unit']);
    const sucursal_id = USER?.sucursal_id || '';
    const r = await POST('/inventario/importar_excel', { movimientos: rows, sucursal_id });
    mostrarResultado('import-inventario-result', r);
    if ((r.procesados||0) > 0) renderInventory();
  } catch(e) { alert('Error: ' + e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function renderDashboard() {
  if (!USER) return;
  const suc = USER.sucursal_id || '';

  try {
    const d = await GET('/dashboard', suc ? `sucursal_id=${suc}` : '');

    // ── Fecha subtitle ─────────────────────────────────────────────────────
    const sub = document.getElementById('dash-fecha-sub');
    if (sub) sub.textContent = `Resumen del día — ${d.fechaHoy}`;

    // ── KPIs ───────────────────────────────────────────────────────────────
    const kpi = (label, valor, color, icono, sub2 = '') => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:4px">
        <div style="font-size:22px">${icono}</div>
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${color}">${valor}</div>
        ${sub2 ? `<div style="font-size:11px;color:#94a3b8">${sub2}</div>` : ''}
      </div>`;

    document.getElementById('dash-kpis').innerHTML =
      kpi('Ventas Hoy',       d.ventasHoy?.total||0,  '#2563eb', '🧾', 'facturas emitidas') +
      kpi('Monto Hoy',        fL(d.ventasHoy?.monto||0), '#15803d', '💵', 'total cobrado hoy') +
      kpi('Ventas del Mes',   d.ventasMes?.total||0,  '#7c3aed', '📅', 'facturas del mes') +
      kpi('Monto del Mes',    fL(d.ventasMes?.monto||0), '#059669','💰', 'ingreso mensual') +
      kpi('Productos',        d.totalProds?.total||0, '#1e3a5f', '📦', 'en catálogo') +
      kpi('Stock Bajo',       d.stockBajo?.total||0,  d.stockBajo?.total>0?'#dc2626':'#15803d', '⚠️', 'bajo mínimo') +
      kpi('Clientes',         d.totalClientes?.total||0,'#0891b2','👥', 'registrados') +
      kpi('CxC Pendiente',    fL(d.cxcPendiente?.monto||0), '#d97706','📋','por cobrar');

    // ── Últimas ventas ──────────────────────────────────────────────────────
    const ultV = d.ultVentas || [];
    const fpIcon = {efectivo:'💵',tarjeta:'💳',transferencia:'🏦',credito:'📋'};
    document.getElementById('dash-ult-ventas').innerHTML = ultV.length
      ? ultV.map(v => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #f1f5f9">
          <div>
            <div style="font-size:12px;font-weight:700;color:#1e3a5f;font-family:monospace">${v.numero_factura}</div>
            <div style="font-size:11px;color:#64748b">${v.cliente_nombre||'Consumidor Final'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:700;color:#15803d">${fL(v.total)}</div>
            <div style="font-size:11px;color:#94a3b8">${fpIcon[v.forma_pago]||'💵'} ${v.forma_pago||''}</div>
          </div>
        </div>`).join('')
      : '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">Sin ventas registradas hoy</div>';

    // ── Top productos del mes ───────────────────────────────────────────────
    const topP = d.topProds || [];
    document.getElementById('dash-top-prods').innerHTML = topP.length
      ? topP.map((p, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f1f5f9">
          <div style="width:24px;height:24px;border-radius:50%;background:${['#1e3a5f','#2563eb','#059669','#7c3aed','#d97706','#dc2626'][i]||'#94a3b8'};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.producto_nombre}</div>
            <div style="font-size:11px;color:#94a3b8">${p.unidades} unidades</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#15803d;flex-shrink:0">${fL(p.total)}</div>
        </div>`).join('')
      : '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">Sin ventas en el mes actual</div>';

    // ── Gráfico de barras — últimos 7 días ────────────────────────────────
    const dias7 = d.ventasPorDia || [];
    const maxMonto = Math.max(...dias7.map(x=>x.total), 1);
    document.getElementById('dash-grafico-7dias').innerHTML = dias7.length
      ? `<div style="display:flex;align-items:flex-end;gap:8px;height:120px">
          ${dias7.map(x => {
            const pct = Math.max((x.total / maxMonto) * 100, 2);
            const diaN = new Date(x.dia+'T12:00:00').toLocaleDateString('es-HN',{weekday:'short',day:'numeric'});
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="font-size:10px;font-weight:700;color:#1e3a5f">${fL(x.total).replace('L. ','')}</div>
              <div style="width:100%;background:#2563eb;border-radius:4px 4px 0 0;height:${pct}%;min-height:4px;transition:height .3s"></div>
              <div style="font-size:10px;color:#64748b;text-align:center;white-space:nowrap">${diaN}</div>
              <div style="font-size:9px;color:#94a3b8">${x.ventas} ftrs</div>
            </div>`;
          }).join('')}
        </div>`
      : '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:20px">Sin datos de ventas en los últimos 7 días</div>';

  } catch(e) {
    console.error('Dashboard error:', e.message);
    document.getElementById('dash-kpis').innerHTML =
      '<div style="color:#dc2626;font-size:13px;padding:10px">Error cargando el dashboard: '+e.message+'</div>';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DESCARGAR PLANTILLAS EXCEL
// ════════════════════════════════════════════════════════════════════════════
function descargarPlantilla(tipo) {
  if (typeof XLSX === 'undefined') {
    alert('La librería Excel no está disponible. Recarga la página.');
    return;
  }

  const configs = {
    productos: {
      nombre: 'Plantilla_Productos.xlsx',
      encabezados: ['codigo','nombre','categoria','precio_venta','costo','gravado'],
      ejemplos: [
        ['PROD001','Aceite de Oliva 1L','Alimentos','55.00','35.00','1'],
        ['PROD002','Arroz Premium 5lb','Alimentos','85.00','55.00','1'],
        ['SERV001','Servicio de Entrega','Servicios','150.00','0','0'],
      ],
      notas: [
        [''],
        ['INSTRUCCIONES:'],
        ['codigo       → Código único del producto (requerido)'],
        ['nombre       → Nombre del producto (requerido)'],
        ['categoria    → Categoría: Alimentos, Bebidas, Servicios, Limpieza, etc.'],
        ['precio_venta → Precio de venta al público en Lempiras'],
        ['costo        → Costo de compra en Lempiras'],
        ['gravado      → 1 = Aplica ISV 15%  |  0 = Exento de ISV'],
      ]
    },
    clientes: {
      nombre: 'Plantilla_Clientes.xlsx',
      encabezados: ['nombre','rtn','direccion','telefono','email','limite_credito'],
      ejemplos: [
        ['Empresa ABC S.A.','08011234567890','Col. Palmira, Tegucigalpa','2234-5678','info@abc.hn','50000'],
        ['Juan Pérez','0801199012345','SPS, Honduras','9900-1234','juan@email.com','10000'],
        ['Supermercado XYZ','08019876543210','La Ceiba, Atlántida','2440-0000','','0'],
      ],
      notas: [
        [''],
        ['INSTRUCCIONES:'],
        ['nombre          → Nombre o razón social (requerido)'],
        ['rtn             → RTN del cliente sin guiones (14 dígitos)'],
        ['direccion       → Dirección física del cliente'],
        ['telefono        → Número de teléfono'],
        ['email           → Correo electrónico'],
        ['limite_credito  → Límite de crédito en Lempiras (0 = sin crédito)'],
      ]
    },
    proveedores: {
      nombre: 'Plantilla_Proveedores.xlsx',
      encabezados: ['nombre','rtn','contacto','telefono','email','direccion','limite_credito'],
      ejemplos: [
        ['Distribuidora Nacional','08011111111111','Carlos López','2200-0001','ventas@dist.hn','Tegucigalpa, Honduras','100000'],
        ['Importaciones del Norte','08022222222222','María Flores','2600-0002','mflores@imp.hn','SPS, Honduras','200000'],
        ['Proveedor Local SA','08033333333333','Pedro García','9900-0003','','La Ceiba','50000'],
      ],
      notas: [
        [''],
        ['INSTRUCCIONES:'],
        ['nombre          → Nombre o razón social del proveedor (requerido)'],
        ['rtn             → RTN sin guiones (14 dígitos)'],
        ['contacto        → Nombre de la persona de contacto'],
        ['telefono        → Número de teléfono'],
        ['email           → Correo electrónico'],
        ['direccion       → Dirección del proveedor'],
        ['limite_credito  → Límite de crédito en Lempiras'],
      ]
    },
    inventario: {
      nombre: 'Plantilla_Inventario.xlsx',
      encabezados: ['codigo','tipo','cantidad','costo_unit','motivo'],
      ejemplos: [
        ['PROD001','entrada','50','35.00','Compra inicial de inventario'],
        ['PROD002','entrada','100','55.00','Recepción de mercadería'],
        ['PROD001','ajuste','45','','Ajuste por conteo físico'],
      ],
      notas: [
        [''],
        ['INSTRUCCIONES:'],
        ['codigo     → Código del producto existente en el sistema (requerido)'],
        ['tipo       → "entrada" suma al stock actual  |  "ajuste" fija el stock exacto (requerido)'],
        ['cantidad   → Número entero positivo (requerido)'],
        ['costo_unit → Costo unitario en Lempiras (opcional)'],
        ['motivo     → Descripción del movimiento (opcional)'],
        [''],
        ['TIPOS DE MOVIMIENTO:'],
        ['entrada → Se SUMA al stock actual. Ej: si hay 10 y pones 50, quedará 60'],
        ['ajuste  → Se FIJA el stock exacto. Ej: si hay 10 y pones 45, quedará 45'],
      ]
    }
  };

  const cfg = configs[tipo];
  if (!cfg) return;

  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Datos (para llenar y subir) ─────────────────────────────────
  const datosSheet = [cfg.encabezados, ...cfg.ejemplos];
  const ws1 = XLSX.utils.aoa_to_sheet(datosSheet);

  // Ancho automático por columna
  ws1['!cols'] = cfg.encabezados.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...cfg.ejemplos.map(r => (r[i]||'').toString().length)
    );
    return { wch: Math.min(Math.max(maxLen + 4, 12), 40) };
  });

  XLSX.utils.book_append_sheet(wb, ws1, 'Datos');

  // ── Hoja 2: Instrucciones ─────────────────────────────────────────────────
  const instrSheet = [
    ['PLANTILLA DE IMPORTACIÓN — METRIC POS v7.4'],
    ['Módulo: ' + tipo.charAt(0).toUpperCase() + tipo.slice(1)],
    ['Generado: ' + new Date().toLocaleDateString('es-HN')],
    [''],
    ['USO:'],
    ['1. Ve a la pestaña "Datos" de este archivo'],
    ['2. Mantén los encabezados de la fila 1 exactamente como están'],
    ['3. Borra los ejemplos (fila 2 en adelante) y escribe tus datos'],
    ['4. Guarda el archivo como .xlsx'],
    ['5. En Metric POS → módulo correspondiente → botón "Importar Excel"'],
    ...cfg.notas
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(instrSheet);
  ws2['!cols'] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');

  XLSX.writeFile(wb, cfg.nombre);
}
