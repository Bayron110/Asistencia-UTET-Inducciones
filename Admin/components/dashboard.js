import {
  db as adminDb,
  ref as adminRef,
  onValue as adminOnValue
} from '../../Firebase/firebase-admin.js';

import {
  db as gruposDb,
  ref as gruposRef,
  onValue as gruposOnValue
} from '../../Firebase/Inducciones-Grupos.js';

const DB_ADMIN_ESTUDIANTES = 'admin_estudiantes';
const DB_GRUPOS            = 'grupos';
const $                    = id => document.getElementById(id);

/* ═══════════════════════════════════════
   ESTADO
═══════════════════════════════════════ */
let adminEstudiantes     = {};
let grupos               = {};
let filtroActual         = 'todos';
let filtroCarreraLive    = 'todas';
let filtroCarreraChart   = 'todos';
let vistaCarrera         = 'barras';
let chartInstance        = null;
let listenerIniciado     = false;
let listenerGrupoIniciado= false;

// historial de actividad reciente (máx 50 entradas)
let actividadFeed        = [];
let prevEstudiantes      = {};

const dashGrupoCarrera   = {};
const dashGrupoAbierto   = {};

/* ═══════════════════════════════════════
   UTILS
═══════════════════════════════════════ */
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sem(pct){
  if(pct>=80) return {text:'#4ade80',bg:'rgba(34,197,94,.15)',border:'rgba(34,197,94,.38)',bar:'#4ade80'};
  if(pct>=60) return {text:'#fbbf24',bg:'rgba(245,158,11,.13)',border:'rgba(245,158,11,.38)',bar:'#fbbf24'};
  return           {text:'#f87171',bg:'rgba(248,113,113,.13)',border:'rgba(248,113,113,.38)',bar:'#f87171'};
}
function animNum(el, target, suffix=''){
  if(!el) return;
  const start=parseInt(el.dataset.current||'0',10);
  const ts0=performance.now();
  el.dataset.current=target;
  function step(ts){
    const p=Math.min((ts-ts0)/650,1);
    const e=1-Math.pow(1-p,3);
    el.textContent=Math.round(start+(target-start)*e)+suffix;
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function calcCarrerasMap(lista){
  const map={};
  lista.forEach(e=>{
    const c=(e.carrera||'Sin carrera').trim();
    if(!map[c]) map[c]={total:0,presentes:0};
    map[c].total++;
    if(e.asistencia===true) map[c].presentes++;
  });
  return Object.entries(map)
    .map(([nombre,d])=>({nombre,total:d.total,presentes:d.presentes,
      pct:d.total>0?Math.round((d.presentes/d.total)*100):0}))
    .sort((a,b)=>b.pct-a.pct);
}
function timeAgo(ts){
  const diff=Math.floor((Date.now()-ts)/1000);
  if(diff<5)   return 'ahora';
  if(diff<60)  return `hace ${diff}s`;
  if(diff<3600)return `hace ${Math.floor(diff/60)}m`;
  return `hace ${Math.floor(diff/3600)}h`;
}

/* ═══════════════════════════════════════
   ACTIVIDAD RECIENTE (FEED)
   Detecta cambios y los agrega al feed
═══════════════════════════════════════ */
function detectarCambios(nuevos){
  if(!Object.keys(prevEstudiantes).length){
    // Primera carga: no emitir eventos (evita flood)
    prevEstudiantes={...nuevos};
    return;
  }
  const ahora=Date.now();
  Object.entries(nuevos).forEach(([ced,d])=>{
    const prev=prevEstudiantes[ced];
    if(!prev){
      // Nuevo registro
      actividadFeed.unshift({
        tipo:'nuevo', cedula:ced,
        nombre:d.nombres||d.nombre||ced,
        carrera:d.carrera||'Sin carrera',
        asistencia:d.asistencia===true,
        ts:ahora
      });
    } else if(prev.asistencia!==d.asistencia){
      // Cambio de asistencia
      actividadFeed.unshift({
        tipo:'cambio', cedula:ced,
        nombre:d.nombres||d.nombre||ced,
        carrera:d.carrera||'Sin carrera',
        asistencia:d.asistencia===true,
        ts:ahora
      });
    }
  });
  // Límite de 50 entradas
  if(actividadFeed.length>50) actividadFeed=actividadFeed.slice(0,50);
  prevEstudiantes={...nuevos};
}

/* ═══════════════════════════════════════
   RENDER FEED ACTIVIDAD
═══════════════════════════════════════ */
function renderFeedActividad(){
  const ul=$('dashFeedList'); if(!ul) return;
  const badge=$('dashFeedCount');

  if(!actividadFeed.length){
    ul.innerHTML=`
      <li class="daf-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <span>Sin actividad aún.<br>Los cambios aparecerán aquí en tiempo real.</span>
      </li>`;
    if(badge) badge.textContent='0';
    return;
  }

  if(badge) badge.textContent=actividadFeed.length;

  ul.innerHTML=actividadFeed.slice(0,20).map(ev=>{
    const ok=ev.asistencia;
    const iconPresente=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><path d="M20 6L9 17l-5-5"/></svg>`;
    const iconAusente=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const iconNuevo=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

    const dotColor = ok ? '#4ade80' : '#f87171';
    const dotBg    = ok ? 'rgba(34,197,94,.18)' : 'rgba(248,113,113,.18)';
    const icon     = ev.tipo==='nuevo' ? iconNuevo : (ok ? iconPresente : iconAusente);

    return `<li class="daf-item daf-item--${ok?'ok':'no'}" style="--dot:${dotColor};--dotbg:${dotBg};">
      <div class="daf-dot-wrap">
        <div class="daf-dot" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}55;">${icon}</div>
        <div class="daf-line"></div>
      </div>
      <div class="daf-body">
        <div class="daf-row1">
          <span class="daf-nombre">${esc(ev.nombre)}</span>
          <span class="daf-ts">${timeAgo(ev.ts)}</span>
        </div>
        <div class="daf-row2">
          <span class="daf-carrera">${esc(ev.carrera)}</span>
          <span class="daf-estado" style="color:${dotColor};">${ok?'Presente':'Ausente'}</span>
        </div>
      </div>
    </li>`;
  }).join('');

  // Actualizar timestamps cada 30s
  clearTimeout(renderFeedActividad._timer);
  renderFeedActividad._timer=setTimeout(renderFeedActividad,30000);
}

/* ═══════════════════════════════════════
   MINI GAUGE (velocímetro de asistencia)
   — reemplaza el espacio bajo el donut —
═══════════════════════════════════════ */
function renderMiniStats(){
  const vals=Object.values(adminEstudiantes);
  const total=vals.length;
  const pres=vals.filter(e=>e.asistencia===true).length;
  const pct=total>0?Math.round((pres/total)*100):0;

  // Carrera con más presencias
  const carreras=calcCarrerasMap(vals);
  const top=carreras[0];
  const peor=carreras[carreras.length-1];

  const elTop=$('dashTopCarrera');
  const elTopPct=$('dashTopCarreraPct');
  const elPeor=$('dashPeorCarrera');
  const elPeorPct=$('dashPeorCarreraPct');
  const elMeta=$('dashMetaBar');
  const elMetaLbl=$('dashMetaPct');

  if(elTop && top){
    elTop.textContent=top.nombre;
    if(elTopPct){ elTopPct.textContent=top.pct+'%'; elTopPct.style.color=sem(top.pct).text; }
  }
  if(elPeor && peor && peor!==top){
    elPeor.textContent=peor.nombre;
    if(elPeorPct){ elPeorPct.textContent=peor.pct+'%'; elPeorPct.style.color=sem(peor.pct).text; }
  }
  if(elMeta){ elMeta.style.width=pct+'%'; elMeta.style.background=sem(pct).bar; }
  if(elMetaLbl){ elMetaLbl.textContent=pct+'%'; elMetaLbl.style.color=sem(pct).text; }
}

/* ═══════════════════════════════════════
   KPIs
═══════════════════════════════════════ */
function renderKPIs(){
  const vals=Object.values(adminEstudiantes);
  const total=vals.length;
  const pres=vals.filter(e=>e.asistencia===true).length;
  const aus=total-pres;
  const pct=total>0?Math.round((pres/total)*100):0;
  animNum($('dashKpiTotal'),total);
  animNum($('dashKpiPresentes'),pres);
  animNum($('dashKpiAusentes'),aus);
  animNum($('dashKpiPct'),pct,'%');
}

/* ═══════════════════════════════════════
   DONUT
═══════════════════════════════════════ */
function renderDonut(){
  const vals=Object.values(adminEstudiantes);
  const total=vals.length;
  const pres=vals.filter(e=>e.asistencia===true).length;
  const pct=total>0?Math.round((pres/total)*100):0;
  const CIRCUM=408.41;
  const arc=$('dashArcFill');
  if(arc){ arc.style.strokeDasharray=CIRCUM; arc.style.strokeDashoffset=CIRCUM-(pct/100)*CIRCUM; }
  const lbl=$('dashArcPct'); if(lbl) lbl.textContent=pct+'%';
  const lP=$('dashLegPresentes'); if(lP) lP.textContent=pres;
  const lA=$('dashLegAusentes');  if(lA) lA.textContent=total-pres;
  const lT=$('dashLegTotal');     if(lT) lT.textContent=total;
  renderMiniStats();
}

/* ═══════════════════════════════════════
   TABLA VIVA
═══════════════════════════════════════ */
function renderTablaViva(){
  const tbody=$('dashTableBody'); if(!tbody) return;
  const all=Object.values(adminEstudiantes);
  const total=all.length;
  const pres=all.filter(v=>v.asistencia===true).length;

  const cT=$('dashChipCountTodos');     if(cT) cT.textContent=total;
  const cP=$('dashChipCountPresentes'); if(cP) cP.textContent=pres;
  const cA=$('dashChipCountAusentes');  if(cA) cA.textContent=total-pres;

  let entries=Object.entries(adminEstudiantes);
  if(filtroActual==='presentes') entries=entries.filter(([,v])=>v.asistencia===true);
  if(filtroActual==='ausentes')  entries=entries.filter(([,v])=>v.asistencia!==true);
  if(filtroCarreraLive!=='todas')
    entries=entries.filter(([,v])=>(v.carrera||'Sin carrera').trim()===filtroCarreraLive);
  const q=($('dashSearch')?.value||'').trim().toLowerCase();
  if(q) entries=entries.filter(([ced,v])=>
    ced.toLowerCase().includes(q)||(v.nombres||v.nombre||'').toLowerCase().includes(q)||(v.carrera||'').toLowerCase().includes(q));

  if(!entries.length){
    tbody.innerHTML=`<tr><td colspan="5" class="dash-empty-row">
      <div class="dash-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg><p>Sin resultados</p>
      </div></td></tr>`;
    return;
  }

  tbody.innerHTML=entries.map(([ced,d],i)=>{
    const ok=d.asistencia===true;
    return `<tr class="dash-row ${ok?'dash-row--presente':'dash-row--ausente'}">
      <td><span class="dash-num">${i+1}</span></td>
      <td><span class="dash-cedula">${esc(ced)}</span></td>
      <td><div class="dash-nombre">${esc(d.nombres||d.nombre||'–')}</div><div class="dash-carrera">${esc(d.carrera||'–')}</div></td>
      <td class="dash-tg">${esc(d.telegram||'–')}</td>
      <td><span class="dash-badge ${ok?'dash-badge--ok':'dash-badge--no'}">
        ${ok?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg> Presente`
           :`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Ausente`}
      </span></td></tr>`;
  }).join('');
}

/* ═══════════════════════════════════════
   CHIPS CARRERA
═══════════════════════════════════════ */
function renderChipsCarreraLive(){
  const wrap=$('dashCarreraChipsLive'); if(!wrap) return;
  const carreras=calcCarrerasMap(Object.values(adminEstudiantes));
  const todaActiva=filtroCarreraLive==='todas';
  let html=`
    <button class="dv-chip ${todaActiva?'dv-chip--act':''}" data-car="todas"
      style="${todaActiva?'border-color:rgba(37,99,235,.5);background:rgba(37,99,235,.18);color:#60a5fa;':''}">
      <span class="dv-dot" style="background:#60a5fa;"></span>Todas
      <span class="dv-n">${Object.values(adminEstudiantes).length}</span>
    </button>`;
  carreras.forEach(c=>{
    const cs=sem(c.pct);
    const act=filtroCarreraLive===c.nombre;
    html+=`<button class="dv-chip ${act?'dv-chip--act':''}" data-car="${esc(c.nombre)}"
      style="border-color:${act?cs.border:'rgba(255,255,255,.1)'};background:${act?cs.bg:'rgba(255,255,255,.03)'};color:${act?cs.text:'#7a8fa8'};"
      title="${esc(c.nombre)}">
      <span class="dv-dot" style="background:${cs.text};"></span>${esc(c.nombre)}
      <span class="dv-pct" style="color:${cs.text};">${c.pct}%</span>
      <span class="dv-n">${c.total}</span>
    </button>`;
  });
  wrap.innerHTML=html;
  wrap.querySelectorAll('.dv-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      filtroCarreraLive=btn.dataset.car;
      renderChipsCarreraLive();
      renderTablaViva();
    });
  });
}

/* ═══════════════════════════════════════
   CHART BARRAS CARRERAS
═══════════════════════════════════════ */
function renderCarrerasChart(){
  const all=calcCarrerasMap(Object.values(adminEstudiantes));
  const nCrit=all.filter(c=>c.pct<60).length;
  const nAlto=all.filter(c=>c.pct>=80).length;
  const tE=$('dashCarreraTotal'); if(tE) tE.textContent=all.length+(all.length===1?' carrera':' carreras');
  const cE=$('dashCarreraCritCount'); if(cE) cE.textContent=nCrit;
  const aE=$('dashCarreraAltoCount'); if(aE) aE.textContent=nAlto;

  let data=all;
  if(filtroCarreraChart==='critico') data=all.filter(c=>c.pct<60);
  if(filtroCarreraChart==='alto')    data=all.filter(c=>c.pct>=80);

  if(vistaCarrera==='barras') _renderBarras(data);
  else                         _renderCards(data);
}

function _renderBarras(data){
  if(typeof Chart==='undefined') return;
  const wrap=$('dashCarreraCanvasWrap');
  let cvs=$('dashCarreraCanvas');
  if(!cvs&&wrap){
    cvs=document.createElement('canvas');
    cvs.id='dashCarreraCanvas'; cvs.setAttribute('role','img');
    wrap.innerHTML=''; wrap.appendChild(cvs);
  }
  if(!cvs||!wrap) return;
  if(chartInstance){ chartInstance.destroy(); chartInstance=null; }

  if(!data.length){
    cvs.style.display='none';
    let m=wrap.querySelector('.dc-empty');
    if(!m){ m=document.createElement('p'); m.className='dc-empty'; m.style.cssText='padding:32px;text-align:center;color:#4a607a;font-size:.83rem;margin:0;'; wrap.appendChild(m); }
    m.textContent='Sin carreras en este filtro.'; m.style.display='block';
    wrap.style.height='80px'; return;
  }
  cvs.style.display='block';
  const em=wrap.querySelector('.dc-empty'); if(em) em.style.display='none';
  wrap.style.height=Math.max(data.length*52+60,100)+'px';

  chartInstance=new Chart(cvs,{
    type:'bar',
    plugins:[{
      id:'ref',
      afterDraw(c){
        const x=c.scales.x.getPixelForValue(80), ctx=c.ctx;
        ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(96,165,250,.35)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x,c.chartArea.top); ctx.lineTo(x,c.chartArea.bottom); ctx.stroke(); ctx.restore();
      }
    }],
    data:{
      labels:data.map(c=>c.nombre),
      datasets:[{
        data:data.map(c=>c.pct),
        backgroundColor:data.map(c=>sem(c.pct).bar),
        borderWidth:0, borderRadius:6, borderSkipped:false
      }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#0d1424',borderColor:'rgba(255,255,255,.12)',borderWidth:1,
          titleColor:'#e8eef8',bodyColor:'#7a8fa8',padding:10,
          callbacks:{label:ctx=>{ const c=data[ctx.dataIndex]; return ` ${c.presentes} de ${c.total} — ${c.pct}%`; }}
        }
      },
      scales:{
        x:{min:0,max:100,grid:{color:'rgba(255,255,255,.05)'},border:{color:'rgba(255,255,255,.07)'},
          ticks:{color:'#4a607a',font:{family:"'JetBrains Mono',monospace",size:11},callback:v=>v+'%'}},
        y:{grid:{display:false},border:{color:'rgba(255,255,255,.07)'},
          ticks:{color:'#7a8fa8',font:{family:"'Syne',sans-serif",size:12,weight:'600'}}}
      }
    }
  });
}

function _renderCards(data){
  const wrap=$('dashCarreraCards'); if(!wrap) return;
  if(!data.length){ wrap.innerHTML='<p style="padding:32px;text-align:center;color:#4a607a;font-size:.83rem;">Sin carreras en este filtro.</p>'; return; }
  wrap.innerHTML=data.map(c=>{
    const cs=sem(c.pct);
    return `<div style="background:rgba(13,20,36,.7);border:1px solid ${cs.border};border-radius:14px;padding:18px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${cs.bar};"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:.84rem;color:#e8eef8;line-height:1.35;">${esc(c.nombre)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.6rem;font-weight:700;color:${cs.text};flex-shrink:0;">${c.pct}%</div>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:.68rem;color:#4a607a;margin-bottom:10px;">${c.presentes} presentes / ${c.total} total</div>
      <div style="height:5px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${c.pct}%;background:${cs.bar};border-radius:99px;"></div>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   GRUPOS HISTÓRICOS
═══════════════════════════════════════ */
function renderGruposHistorico(){
  const container=$('dashGruposHistorico'); if(!container) return;
  const arr=Object.entries(grupos);

  if(!arr.length){
    container.innerHTML=`<div class="dash-empty" style="padding:40px 0;grid-column:1/-1;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg><p>Aún no hay grupos migrados.</p></div>`;
    return;
  }

  container.innerHTML=arr
    .sort(([,a],[,b])=>(b.creadoEn||0)-(a.creadoEn||0))
    .map(([id,g])=>buildGrupoCard(id,g)).join('');

  container.querySelectorAll('.dgh-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.id;
      const panel=$(`dgh-panel-${id}`); if(!panel) return;
      const open=panel.style.display!=='none';
      panel.style.display=open?'none':'block';
      btn.querySelector('.dgh-chev').style.transform=open?'':'rotate(180deg)';
      if(!open && !dashGrupoAbierto[id]){
        dashGrupoAbierto[id]=true;
        dashGrupoCarrera[id]='todas';
        aplicarFiltroGrupoHistorico(id);
      }
    });
  });

  container.querySelectorAll('.dgh-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const id=chip.dataset.id, car=chip.dataset.car;
      dashGrupoCarrera[id]=car;
      container.querySelectorAll(`.dgh-chip[data-id="${id}"]`).forEach(c=>c.classList.remove('dgh-chip--act'));
      chip.classList.add('dgh-chip--act');
      aplicarFiltroGrupoHistorico(id);
    });
  });
}

function buildGrupoCard(id,g){
  const miembros=Object.values(g.estudiantes||{});
  const total=miembros.length;
  const pres=miembros.filter(m=>m.asistencia===true).length;
  const pct=total>0?Math.round((pres/total)*100):0;
  const col=sem(pct);
  const fecha=g.creadoEn?new Date(g.creadoEn).toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'}):'–';
  const carreras=calcCarrerasMap(miembros);
  const nCarr=carreras.length;

  const chipsHtml=`
    <button class="dgh-chip dgh-chip--act" data-id="${esc(id)}" data-car="todas"
      style="border-color:rgba(37,99,235,.45);background:rgba(37,99,235,.18);color:#60a5fa;">
      <span style="width:6px;height:6px;border-radius:50%;background:#60a5fa;flex-shrink:0;"></span>
      Todas <span class="dgh-chip-n">${total}</span>
    </button>
    ${carreras.map(c=>{
      const cs=sem(c.pct);
      return `<button class="dgh-chip" data-id="${esc(id)}" data-car="${esc(c.nombre)}"
        style="border-color:${cs.border};background:${cs.bg};color:${cs.text};" title="${esc(c.nombre)}">
        <span style="width:6px;height:6px;border-radius:50%;background:${cs.text};flex-shrink:0;"></span>
        ${esc(c.nombre)}
        <span class="dgh-chip-pct">${c.pct}%</span>
        <span class="dgh-chip-n">${c.total}</span>
      </button>`;
    }).join('')}`;

  const barrasHtml=carreras.map(c=>{
    const cs=sem(c.pct);
    return `<div class="dgh-bar-row">
      <div class="dgh-bar-name" title="${esc(c.nombre)}">${esc(c.nombre)}</div>
      <div class="dgh-bar-track"><div class="dgh-bar-fill" style="width:${c.pct}%;background:${cs.bar};"></div></div>
      <span class="dgh-bar-pct" style="color:${cs.text};">${c.pct}%</span>
      <span class="dgh-bar-frac">${c.presentes}/${c.total}</span>
    </div>`;
  }).join('');

  return `
  <div class="dgh-card">
    <div class="dgh-accent" style="background:linear-gradient(90deg,${col.bar},transparent);"></div>
    <div class="dgh-header">
      <div class="dgh-header-info">
        <div class="dgh-nombre">${esc(g.nombre||id)}</div>
        <div class="dgh-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${fecha}
          <span class="dgh-sep">·</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          ${nCarr} ${nCarr===1?'carrera':'carreras'}
        </div>
      </div>
      <div class="dgh-pct" style="color:${col.text};">${pct}%</div>
      <button class="dgh-toggle" data-id="${esc(id)}">
        <svg class="dgh-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    </div>
    <div class="dgh-progress">
      <div class="dgh-progress-track"><div class="dgh-progress-fill" style="width:${pct}%;background:${col.bar};"></div></div>
      <span class="dgh-progress-lbl" style="color:${col.text};">${pct}%</span>
    </div>
    <div class="dgh-stats">
      <span class="dgh-stat">Total <b>${total}</b></span>
      <span class="dgh-stat dgh-stat--ok">✔ Presentes <b>${pres}</b></span>
      <span class="dgh-stat dgh-stat--bad">✖ Ausentes <b>${total-pres}</b></span>
    </div>
    <div class="dgh-barras-wrap">
      <div class="dgh-section-lbl">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        Por carrera
      </div>
      <div class="dgh-barras">${barrasHtml}</div>
    </div>
    <div class="dgh-panel" id="dgh-panel-${esc(id)}" style="display:none;">
      <div class="dgh-section-lbl" style="padding:14px 18px 8px;">Filtrar por carrera:</div>
      <div class="dgh-chips">${chipsHtml}</div>
      <div class="dgh-counter" id="dgh-counter-${esc(id)}">${total} personas</div>
      <div style="border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden;margin:0 16px 16px;">
        <div style="overflow-x:auto;max-height:300px;overflow-y:auto;">
          <table class="dash-table">
            <thead>
              <tr><th>#</th><th>Cédula</th><th>Nombre / Carrera</th><th>Estado</th></tr>
            </thead>
            <tbody id="dgh-tbody-${esc(id)}"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

function aplicarFiltroGrupoHistorico(id){
  const tbody=$(`dgh-tbody-${id}`);
  const counter=$(`dgh-counter-${id}`);
  if(!tbody) return;
  const car=dashGrupoCarrera[id]||'todas';
  let miembros=Object.values(grupos[id]?.estudiantes||{});
  if(car!=='todas') miembros=miembros.filter(m=>(m.carrera||'Sin carrera').trim()===car);
  if(counter) counter.textContent=`${miembros.length} persona${miembros.length!==1?'s':''}`;
  if(!miembros.length){
    tbody.innerHTML=`<tr><td colspan="4" style="padding:24px;text-align:center;color:#4a607a;font-size:.8rem;">Sin estudiantes en esta carrera.</td></tr>`;
    return;
  }
  tbody.innerHTML=miembros.map((m,i)=>{
    const ok=m.asistencia===true;
    return `<tr class="dash-row ${ok?'dash-row--presente':'dash-row--ausente'}">
      <td><span class="dash-num">${i+1}</span></td>
      <td><span class="dash-cedula">${esc(m.cedula||'')}</span></td>
      <td><div class="dash-nombre">${esc(m.nombres||'–')}</div><div class="dash-carrera">${esc(m.carrera||'–')}</div></td>
      <td><span class="dash-badge ${ok?'dash-badge--ok':'dash-badge--no'}">${ok?'✔ Presente':'✖ Ausente'}</span></td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════
   RENDER COMPLETO
═══════════════════════════════════════ */
function renderDashboard(){
  renderKPIs();
  renderDonut();
  renderChipsCarreraLive();
  renderTablaViva();
  renderCarrerasChart();
  renderGruposHistorico();
  renderFeedActividad();
}

/* ═══════════════════════════════════════
   HTML DEL TAB
═══════════════════════════════════════ */
function montarHTML(){
  const tab=$('tab-dashboard');
  if(!tab||tab.dataset.montado) return;
  tab.dataset.montado='1';

  tab.innerHTML=`
    <!-- KPI -->
    <div class="dash-kpi-row">
      <div class="dash-kpi dash-kpi--total">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiTotal">0</div>
        <div class="dash-kpi__label">Total estudiantes</div>
      </div>
      <div class="dash-kpi dash-kpi--ok">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiPresentes">0</div>
        <div class="dash-kpi__label">Presentes</div>
      </div>
      <div class="dash-kpi dash-kpi--no">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiAusentes">0</div>
        <div class="dash-kpi__label">Ausentes</div>
      </div>
      <div class="dash-kpi dash-kpi--pct">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiPct">0%</div>
        <div class="dash-kpi__label">% Asistencia</div>
      </div>
    </div>

    <!-- FILA PRINCIPAL: DONUT + FEED + TABLA -->
    <div class="dash-main-row">

      <!-- COLUMNA IZQUIERDA: Donut + Mini Stats + Feed Actividad -->
      <div class="dash-left-col">

        <!-- donut -->
        <div class="dash-donut-card">
          <div class="dash-donut-card__title">Distribución</div>
          <div class="dash-arc-wrap">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="65" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="14"/>
              <circle cx="80" cy="80" r="65" fill="none" stroke="rgba(248,113,113,.15)" stroke-width="14" stroke-dasharray="408.41" stroke-dashoffset="0"/>
              <circle id="dashArcFill" cx="80" cy="80" r="65" fill="none" stroke="#22c55e" stroke-width="14" stroke-linecap="round" stroke-dasharray="408.41" stroke-dashoffset="408.41"/>
            </svg>
            <div class="dash-arc-label">
              <span class="dash-arc-label__pct" id="dashArcPct">0%</span>
              <span class="dash-arc-label__sub">asistencia</span>
            </div>
          </div>
          <div class="dash-donut-legend">
            <div class="dash-legend-item"><div class="dash-legend-dot" style="background:#22c55e"></div><span class="dash-legend-item__label">Presentes</span><span class="dash-legend-item__val" id="dashLegPresentes">0</span></div>
            <div class="dash-legend-item"><div class="dash-legend-dot" style="background:#f87171"></div><span class="dash-legend-item__label">Ausentes</span><span class="dash-legend-item__val" id="dashLegAusentes">0</span></div>
            <div class="dash-legend-item"><div class="dash-legend-dot" style="background:#60a5fa"></div><span class="dash-legend-item__label">Total</span><span class="dash-legend-item__val" id="dashLegTotal">0</span></div>
          </div>
        </div>

        <!-- ══ NUEVO: Mini Stats ══ -->
        <div class="dash-ministats-card">
          <div class="dash-ministats-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Resumen rápido
          </div>

          <!-- Meta 80% -->
          <div class="dms-meta-wrap">
            <div class="dms-meta-label">
              <span>Meta de asistencia</span>
              <span id="dashMetaPct" style="font-family:'JetBrains Mono',monospace;font-weight:700;">0%</span>
            </div>
            <div class="dms-meta-track">
              <div id="dashMetaBar" class="dms-meta-fill" style="width:0%;"></div>
              <!-- línea meta 80% -->
              <div style="position:absolute;left:80%;top:-3px;bottom:-3px;width:2px;background:rgba(96,165,250,.5);border-radius:1px;" title="Meta 80%"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:3px;">
              <span style="font-size:.65rem;color:rgba(96,165,250,.5);">meta: 80%</span>
            </div>
          </div>

          <!-- Top carrera -->
          <div class="dms-row">
            <div class="dms-row-icon" style="background:rgba(34,197,94,.15);">
              <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div class="dms-row-body">
              <span class="dms-row-lbl">Mejor carrera</span>
              <span class="dms-row-val" id="dashTopCarrera">–</span>
            </div>
            <span class="dms-row-pct" id="dashTopCarreraPct">–</span>
          </div>

          <!-- Peor carrera -->
          <div class="dms-row">
            <div class="dms-row-icon" style="background:rgba(248,113,113,.15);">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <div class="dms-row-body">
              <span class="dms-row-lbl">Necesita atención</span>
              <span class="dms-row-val" id="dashPeorCarrera">–</span>
            </div>
            <span class="dms-row-pct" id="dashPeorCarreraPct">–</span>
          </div>
        </div>

        <!-- ══ NUEVO: Feed de actividad reciente ══ -->
        <div class="dash-feed-card">
          <div class="dash-feed-hd">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="dash-live"><span class="dash-live-dot"></span>En vivo</div>
              <span class="dash-feed-title">Actividad reciente</span>
            </div>
            <span class="dash-feed-badge" id="dashFeedCount">0</span>
          </div>
          <ul class="daf-list" id="dashFeedList">
            <li class="daf-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              <span>Sin actividad aún.<br>Los cambios aparecerán aquí en tiempo real.</span>
            </li>
          </ul>
        </div>

      </div><!-- /dash-left-col -->

      <!-- COLUMNA DERECHA: filtros + tabla viva -->
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0;">

        <!-- chips asistencia -->
        <div class="dash-filter-row">
          <button class="dash-chip dash-chip--todos active-todos" data-filtro="todos">
            <span class="dash-chip__dot"></span>Todos
            <span class="dash-chip__count" id="dashChipCountTodos">0</span>
          </button>
          <button class="dash-chip dash-chip--presentes" data-filtro="presentes">
            <span class="dash-chip__dot"></span>Presentes
            <span class="dash-chip__count" id="dashChipCountPresentes">0</span>
          </button>
          <button class="dash-chip dash-chip--ausentes" data-filtro="ausentes">
            <span class="dash-chip__dot"></span>Ausentes
            <span class="dash-chip__count" id="dashChipCountAusentes">0</span>
          </button>
        </div>

        <!-- chips carrera -->
        <div class="dv-chips-wrap">
          <div class="dv-chips-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Filtrar por carrera:
          </div>
          <div class="dv-chips" id="dashCarreraChipsLive"></div>
        </div>

        <!-- tabla -->
        <div class="dash-table-card">
          <div class="dash-table-head">
            <div style="display:flex;align-items:center;gap:10px;">
              <h3>Detalle de asistencia</h3>
              <div class="dash-live"><span class="dash-live-dot"></span>En vivo</div>
            </div>
            <div class="dash-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="dashSearch" type="text" placeholder="Buscar cédula, nombre…">
            </div>
          </div>
          <div class="dash-table-scroll">
            <table class="dash-table">
              <thead><tr><th>#</th><th>Cédula</th><th>Nombre / Carrera</th><th>Telegram</th><th>Estado</th></tr></thead>
              <tbody id="dashTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- ASISTENCIA POR CARRERA -->
    <div class="dash-section-card">
      <div class="dash-section-hd">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="dash-section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <span class="dash-section-title">Asistencia por carrera</span>
          <span id="dashCarreraTotal" class="dash-section-badge">0 carreras</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="dashBtnBarras" class="dv-view-btn dv-view-btn--act" onclick="window.__dashVista('barras')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="10" width="4" height="11"/><rect x="10" y="4" width="4" height="17"/><rect x="17" y="7" width="4" height="14"/></svg>
            Barras
          </button>
          <button id="dashBtnCards" class="dv-view-btn" onclick="window.__dashVista('cards')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="2" y="3" width="8" height="8" rx="1.5"/><rect x="14" y="3" width="8" height="8" rx="1.5"/><rect x="2" y="14" width="8" height="7" rx="1.5"/><rect x="14" y="14" width="8" height="7" rx="1.5"/></svg>
            Cards
          </button>
        </div>
      </div>
      <div class="dash-section-filters">
        <button class="dv-filter-btn dv-filter-btn--act" id="dashFTodos"   onclick="window.__dashFiltroChart('todos')"><span class="dv-dot" style="background:#60a5fa;"></span>Todas</button>
        <button class="dv-filter-btn"                   id="dashFCritico" onclick="window.__dashFiltroChart('critico')"><span class="dv-dot" style="background:#f87171;"></span>Críticas &lt;60% <span class="dv-fn" id="dashCarreraCritCount">0</span></button>
        <button class="dv-filter-btn"                   id="dashFAlto"    onclick="window.__dashFiltroChart('alto')"><span class="dv-dot" style="background:#4ade80;"></span>Óptimas ≥80% <span class="dv-fn" id="dashCarreraAltoCount">0</span></button>
        <div class="dv-leyenda">
          <span><span class="dv-sq" style="background:#4ade80;"></span>≥80%</span>
          <span><span class="dv-sq" style="background:#fbbf24;"></span>60–79%</span>
          <span><span class="dv-sq" style="background:#f87171;"></span>&lt;60%</span>
          <span style="border-left:1px dashed rgba(96,165,250,.3);padding-left:10px;color:rgba(96,165,250,.5);">— meta 80%</span>
        </div>
      </div>
      <div id="dashCarreraVistaBarras" style="padding:8px 0 4px;">
        <div id="dashCarreraCanvasWrap" style="position:relative;width:100%;height:100px;">
          <canvas id="dashCarreraCanvas"></canvas>
        </div>
      </div>
      <div id="dashCarreraVistaCards" style="display:none;padding:18px 20px;">
        <div id="dashCarreraCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;"></div>
      </div>
    </div>

    <!-- GRUPOS HISTÓRICOS -->
    <div class="dash-grupos-section">
      <div class="dash-grupos-section__header">
        <h3>Grupos migrados — histórico</h3>
      </div>
      <div class="dash-grupos-grid" id="dashGruposHistorico"></div>
    </div>

    <!-- ══ ESTILOS NUEVOS ══ -->
    <style>
      /* ─── Override: fila principal con proporciones correctas ─── */
      .dash-main-row {
        display: grid !important;
        grid-template-columns: 360px 1fr !important;
        gap: 16px !important;
        align-items: start !important;
      }

      /* Columna izquierda */
      .dash-left-col {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        min-width: 0;
      }

      /* Donut card con más aire */
      .dash-donut-card {
        padding: 20px !important;
      }
      .dash-donut-card__title {
        margin-bottom: 14px !important;
      }

      /* ─── Mini Stats card ─── */
      .dash-ministats-card {
        background: rgba(13,20,36,.85);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 16px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dash-ministats-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: .73rem;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: #4a607a;
      }
      .dms-meta-wrap { display:flex; flex-direction:column; gap:6px; }
      .dms-meta-label {
        display: flex;
        justify-content: space-between;
        font-size: .78rem;
        color: #7a8fa8;
      }
      .dms-meta-track {
        position: relative;
        height: 8px;
        background: rgba(255,255,255,.07);
        border-radius: 99px;
        overflow: visible;
      }
      .dms-meta-fill {
        height: 100%;
        border-radius: 99px;
        transition: width .6s cubic-bezier(.4,0,.2,1), background .4s;
      }
      .dms-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 12px;
        transition: background .2s;
      }
      .dms-row:hover { background: rgba(255,255,255,.055); }
      .dms-row-icon {
        width: 34px; height: 34px;
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .dms-row-body {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
      }
      .dms-row-lbl {
        font-size: .67rem;
        color: #4a607a;
        text-transform: uppercase;
        letter-spacing: .06em;
        font-weight: 700;
      }
      .dms-row-val {
        font-size: .82rem;
        color: #c4d4e8;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dms-row-pct {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.05rem;
        font-weight: 700;
        flex-shrink: 0;
      }

      /* ─── Feed de actividad ─── */
      .dash-feed-card {
        background: rgba(13,20,36,.85);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .dash-feed-hd {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px 12px;
        border-bottom: 1px solid rgba(255,255,255,.06);
        flex-shrink: 0;
      }
      .dash-feed-title {
        font-size: .8rem;
        font-weight: 700;
        color: #c4d4e8;
      }
      .dash-feed-badge {
        background: rgba(96,165,250,.15);
        border: 1px solid rgba(96,165,250,.3);
        color: #60a5fa;
        font-size: .68rem;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 99px;
        min-width: 28px;
        text-align: center;
      }
      .daf-list {
        list-style: none;
        margin: 0;
        padding: 6px 0;
        overflow-y: auto;
        max-height: 280px;
      }
      .daf-list::-webkit-scrollbar { width: 4px; }
      .daf-list::-webkit-scrollbar-track { background: transparent; }
      .daf-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }

      .daf-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 28px 16px;
        color: #4a607a;
        text-align: center;
        font-size: .78rem;
        line-height: 1.6;
      }

      .daf-item {
        display: flex;
        gap: 0;
        padding: 0;
        animation: daf-in .3s ease both;
      }
      @keyframes daf-in {
        from { opacity:0; transform:translateY(-6px); }
        to   { opacity:1; transform:translateY(0); }
      }

      .daf-dot-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0 0 16px;
        width: 40px;
        flex-shrink: 0;
      }
      .daf-dot {
        width: 24px; height: 24px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        color: #fff;
      }
      .daf-line {
        width: 1px;
        flex: 1;
        min-height: 10px;
        background: rgba(255,255,255,.07);
        margin-top: 5px;
      }
      .daf-item:last-child .daf-line { display: none; }

      .daf-body {
        padding: 10px 16px 10px 10px;
        flex: 1;
        min-width: 0;
        border-bottom: 1px solid rgba(255,255,255,.04);
      }
      .daf-item:last-child .daf-body { border-bottom: none; }

      .daf-row1 {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 3px;
      }
      .daf-nombre {
        font-size: .8rem;
        font-weight: 600;
        color: #c4d4e8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .daf-ts {
        font-size: .64rem;
        color: #4a607a;
        font-family: 'JetBrains Mono', monospace;
        flex-shrink: 0;
      }
      .daf-row2 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .daf-carrera {
        font-size: .7rem;
        color: #4a607a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .daf-estado {
        font-size: .7rem;
        font-weight: 700;
        flex-shrink: 0;
      }
        /* ═══════════════════════════════════════
   RESPONSIVE — agregar al final del <style>
═══════════════════════════════════════ */

/* Tablets anchas: 900–1100px */
@media (max-width: 1100px) {
  .dash-main-row {
    grid-template-columns: 300px 1fr !important;
  }
}

/* Tablets: < 900px — columna izquierda se va arriba */
@media (max-width: 900px) {
  .dash-main-row {
    grid-template-columns: 1fr !important;
  }

  .dash-left-col {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }
}

/* Móvil: < 640px */
@media (max-width: 640px) {
  .dash-kpi-row {
    grid-template-columns: 1fr 1fr !important;
  }

  .dash-main-row {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  .dash-left-col {
    display: flex !important;
    flex-direction: column !important;
  }

  .dash-donut-card {
    padding: 16px !important;
  }

  .dash-table-head {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 10px !important;
  }

  .dash-search-wrap {
    width: 100% !important;
  }

  #dashSearch {
    width: 100% !important;
  }

  .dash-section-hd {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 10px !important;
  }

  .dash-section-filters {
    flex-wrap: wrap !important;
    gap: 6px !important;
  }

  .dv-leyenda {
    display: none !important;
  }

  .dgh-card {
    border-radius: 12px !important;
  }

  .dgh-stats {
    flex-wrap: wrap !important;
    gap: 6px !important;
  }

  .daf-list {
    max-height: 220px !important;
  }
}

/* Móvil pequeño: < 400px */
@media (max-width: 400px) {
  .dash-kpi-row {
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
  }

  .dash-kpi__num {
    font-size: 1.6rem !important;
  }

  .dash-filter-row {
    flex-wrap: wrap !important;
    gap: 6px !important;
  }

  .dv-chips {
    gap: 5px !important;
  }

  .dv-chip {
    font-size: .7rem !important;
    padding: 5px 9px !important;
  }
}
    </style>
  `;

  /* chips asistencia */
  tab.querySelectorAll('.dash-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      filtroActual=chip.dataset.filtro;
      tab.querySelectorAll('.dash-chip').forEach(c=>{ c.className=c.className.replace(/active-\S+/g,'').trim(); });
      chip.classList.add('active-'+filtroActual);
      renderTablaViva();
    });
  });

  /* buscador */
  const ds=$('dashSearch');
  if(ds) ds.addEventListener('input',renderTablaViva);

  /* Chart.js */
  if(typeof Chart==='undefined'){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload=()=>renderCarrerasChart();
    document.head.appendChild(s);
  }

  window.__dashVista=v=>{
    vistaCarrera=v;
    $('dashCarreraVistaBarras').style.display=v==='barras'?'block':'none';
    $('dashCarreraVistaCards').style.display =v==='cards'?'block':'none';
    $('dashBtnBarras').classList.toggle('dv-view-btn--act', v==='barras');
    $('dashBtnCards').classList.toggle('dv-view-btn--act',  v==='cards');
    renderCarrerasChart();
  };

  window.__dashFiltroChart=f=>{
    filtroCarreraChart=f;
    ['dashFTodos','dashFCritico','dashFAlto'].forEach(id=>$(id)?.classList.remove('dv-filter-btn--act'));
    const map={todos:'dashFTodos',critico:'dashFCritico',alto:'dashFAlto'};
    $(map[f])?.classList.add('dv-filter-btn--act');
    renderCarrerasChart();
  };
}

/* ═══════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════ */
export function iniciarDashboard(){
  montarHTML();
  if(!listenerIniciado){
    listenerIniciado=true;
    adminOnValue(adminRef(adminDb,DB_ADMIN_ESTUDIANTES),snap=>{
      const nuevos=snap.val()||{};
      detectarCambios(nuevos);
      adminEstudiantes=nuevos;
      renderKPIs(); renderDonut();
      renderChipsCarreraLive(); renderTablaViva(); renderCarrerasChart();
      renderFeedActividad();
    });
  }
  if(!listenerGrupoIniciado){
    listenerGrupoIniciado=true;
    adminOnValue(adminRef(adminDb,DB_GRUPOS),snap=>{
      grupos=snap.val()||{}; renderGruposHistorico();
    });
  }
}