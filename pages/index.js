import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';

const T = {
  bg:'#080c14',panel:'#0e1623',panelHi:'#131d2e',
  border:'#1e2d42',borderHi:'#2a4060',
  nominal:'#4db8ff',real:'#00e5a0',implied:'#ffb347',
  focus:'#c084fc',text:'#dce8f5',muted:'#5a7899',
  dim:'#3a5570',success:'#00c97a',danger:'#ff4d6d',accent:'#0a84ff',
  extrap:'#ff7b47',
};

const fmt    = (v,d=2) => v==null?'—':Number(v).toFixed(d);
const fmtPct = v       => v==null?'—':`${fmt(v)}%`;
const r3     = v       => v==null?null:Math.round(v*1000)/1000;

function loadScript(src) {
  return new Promise((res,rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

function Loader({color}) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
      <div style={{width:24,height:24,border:`2px solid ${T.border}`,borderTopColor:color,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:T.muted}}>carregando...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Badge({ok}) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',
      background:ok?`${T.success}18`:`${T.danger}18`,border:`1px solid ${ok?T.success:T.danger}40`,
      borderRadius:3,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:ok?T.success:T.danger}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:ok?T.success:T.danger,animation:ok?'pulse 2s ease infinite':'none'}}/>
      {ok?'LIVE':'ERRO'}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </span>
  );
}

// ─── Chart Card — curva suave Svensson + scatter raw ─────────────────────────
function CurveCard({title,subtitle,color,rawPoints,curve,rmse,loading,extraScatter,extraLabel,extraColor}) {
  const canvasRef=useRef(null);
  const instRef=useRef(null);

  useEffect(()=>{
    if (!window.Chart||!canvasRef.current) return;
    if (instRef.current) instRef.current.destroy();
    if (!curve&&!rawPoints) return;

    const datasets=[];

    // Curva suave Svensson
    if (curve?.length) datasets.push({
      label:`${title} (Svensson)`,
      data:curve.map(p=>({x:p.anos,y:p.taxa})),
      borderColor:color,backgroundColor:`${color}18`,
      pointRadius:0,pointHoverRadius:0,
      fill:true,tension:0,borderWidth:2.5,order:2,
    });

    // Scatter pontos brutos
    if (rawPoints?.length) datasets.push({
      label:'Tesouro Direto',
      data:rawPoints.map(p=>({x:p.anos,y:p.taxa})),
      borderColor:color,backgroundColor:T.panel,
      pointBackgroundColor:T.panel,pointBorderColor:color,pointBorderWidth:2,
      pointRadius:5,pointHoverRadius:8,
      fill:false,showLine:false,order:1,type:'scatter',
    });

    // Extra scatter (ex: Focus)
    if (extraScatter?.length) datasets.push({
      label:extraLabel,
      data:extraScatter.map(p=>({x:typeof p.ano==='string'?+p.ano-new Date().getFullYear():p.anos,y:p.mediana??p.taxa})),
      borderColor:extraColor,backgroundColor:'transparent',
      pointBackgroundColor:extraColor,pointBorderColor:T.panel,pointBorderWidth:2,
      pointRadius:4,pointHoverRadius:7,
      fill:false,showLine:false,order:0,type:'scatter',
    });

    instRef.current=new window.Chart(canvasRef.current.getContext('2d'),{
      type:'line',data:{datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:datasets.length>1,labels:{color:T.muted,font:{family:"'IBM Plex Mono',monospace",size:9},boxWidth:10,padding:8}},
          tooltip:{
            backgroundColor:T.panelHi,borderColor:T.borderHi,borderWidth:1,
            titleColor:T.muted,bodyColor:T.text,
            titleFont:{family:"'IBM Plex Mono',monospace",size:10},
            bodyFont:{family:"'IBM Plex Mono',monospace",size:11},padding:10,
            callbacks:{
              title:items=>`${fmt(items[0].parsed.x,2)} anos`,
              label:item=>` ${item.dataset.label}: ${fmt(item.parsed.y)}% a.a.`,
            },
          },
        },
        scales:{
          x:{type:'linear',grid:{color:`${T.border}88`},
            ticks:{color:T.muted,font:{family:"'IBM Plex Mono',monospace",size:9},callback:v=>`${v}a`},
            title:{display:true,text:'anos',color:T.dim,font:{family:"'IBM Plex Mono',monospace",size:9}}},
          y:{grid:{color:`${T.border}88`},
            ticks:{color:T.muted,font:{family:"'IBM Plex Mono',monospace",size:9},callback:v=>`${v}%`},
            title:{display:true,text:'% a.a.',color:T.dim,font:{family:"'IBM Plex Mono',monospace",size:9}}},
        },
      },
    });
  },[curve,rawPoints,extraScatter,color]);

  const longTaxa=curve?.length?curve[curve.length-1]?.taxa:null;

  return (
    <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:10}}>
        <span style={{width:3,height:18,background:color,borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.text,letterSpacing:'0.08em',textTransform:'uppercase'}}>{title}</div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.muted,marginTop:1}}>{subtitle}</div>
        </div>
        <div style={{marginLeft:'auto',textAlign:'right'}}>
          {longTaxa!=null&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:16,fontWeight:700,color}}>{fmtPct(longTaxa)}</div>}
          {rmse!=null&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:rmse<0.05?T.success:rmse<0.15?T.implied:T.danger}}>RMSE {fmt(rmse,4)}%</div>}
        </div>
      </div>
      <div style={{flex:1,padding:16,minHeight:200,position:'relative'}}>
        {loading
          ?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><Loader color={color}/></div>
          :<canvas ref={canvasRef} style={{width:'100%',height:'100%'}}/>}
      </div>
    </div>
  );
}

// ─── Tabela de vértices padrão (ANBIMA) ───────────────────────────────────────
function VerticesTable({svNom,svReal,svImpl}) {
  if (!svNom?.vertices&&!svReal?.vertices) return null;
  const allLabels=[...new Set([
    ...(svNom?.vertices||[]).map(v=>v.label),
    ...(svReal?.vertices||[]).map(v=>v.label),
  ])];
  const byLabel=(arr,lbl)=>arr?.find(v=>v.label===lbl);

  return (
    <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:3,height:18,background:T.accent,borderRadius:2}}/>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.text,letterSpacing:'0.08em',textTransform:'uppercase'}}>Vértices Padrão — Metodologia ANBIMA/Svensson</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.muted}}>Taxas zero-cupom suavizadas · % a.a.</div>
          </div>
        </div>
        <div style={{display:'flex',gap:16}}>
          {svNom?.rmse!=null&&<span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.nominal}}>Nominal RMSE: {fmt(svNom.rmse,4)}%</span>}
          {svReal?.rmse!=null&&<span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.real}}>Real RMSE: {fmt(svReal.rmse,4)}%</span>}
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:T.panelHi}}>
              {['Vértice','DU','Anos','Nominal (Pré)','Real (IPCA+)','Infl. Implícita',''].map((h,i)=>(
                <th key={i} style={{padding:'6px 14px',textAlign:i>1?'right':'left',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:T.muted,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allLabels.map((lbl,i)=>{
              const nom=byLabel(svNom?.vertices,lbl);
              const re=byLabel(svReal?.vertices,lbl);
              const imp=byLabel(svImpl,lbl);
              return (
                <tr key={i} style={{borderBottom:`1px solid ${T.border}40`,background:i%2===0?'transparent':`${T.panelHi}50`}}>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.text}}>{lbl}</td>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:T.muted}}>{nom?.du??re?.du??'—'}</td>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:T.muted,textAlign:'right'}}>{fmt(nom?.anos??re?.anos,2)}</td>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:700,color:nom?T.nominal:T.dim,textAlign:'right'}}>{nom?fmtPct(nom.taxa):'—'}</td>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:700,color:re?T.real:T.dim,textAlign:'right'}}>{re?fmtPct(re.taxa):'—'}</td>
                  <td style={{padding:'7px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:700,color:imp?(imp.extrap?T.extrap:T.implied):T.dim,textAlign:'right'}}>{imp?fmtPct(imp.taxa):'—'}</td>
                  <td style={{padding:'7px 14px'}}>{imp?.extrap&&<span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:T.extrap}}>EXT</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{padding:'6px 14px',borderTop:`1px solid ${T.border}40`,fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:T.dim}}>
        EXT = extrapolação além do range nominal observado · Infl. implícita = Fisher: (1+nom)/(1+real)−1
      </div>
    </div>
  );
}

// ─── Painel de parâmetros Svensson ────────────────────────────────────────────
function ParamsPanel({params,color,label}) {
  if (!params) return null;
  return (
    <div style={{flex:1,minWidth:220,background:T.panelHi,border:`1px solid ${T.border}`,borderRadius:4,padding:'10px 14px'}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,color,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{label}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px 12px'}}>
        {[['β1 (nível)',params.b1],['β2 (incl.)',params.b2],['β3 (curv.1)',params.b3],['β4 (curv.2)',params.b4],['λ1',params.l1],['λ2',params.l2]].map(([k,v])=>(
          <div key={k}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:T.dim}}>{k}</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:600,color:T.text}}>{fmt(v,4)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── History Chart ────────────────────────────────────────────────────────────
const HISTORY_SERIES=[
  {key:'ntnb_2035',label:'NTN-B 7A',color:'#00e5a0'},
  {key:'real_10a', label:'Real 10A', color:'#2dd4a0'},
  {key:'nom_5a',   label:'Nom. 5A',  color:'#4db8ff'},
  {key:'nom_10a',  label:'Nom. 10A', color:'#2590d4'},
  {key:'impl_5a',  label:'Impl. 5A', color:'#ffb347'},
  {key:'impl_10a', label:'Impl. 10A',color:'#e8902a'},
];

function HistoryChart({rows,chartReady}) {
  const canvasRef=useRef(null);
  const instRef=useRef(null);
  const [active,setActive]=useState({ntnb_2035:true,real_10a:true,nom_5a:false,nom_10a:true,impl_5a:false,impl_10a:true});

  useEffect(()=>{
    if(!rows?.length||!window.Chart||!canvasRef.current) return;
    if(instRef.current) instRef.current.destroy();
    const datasets=HISTORY_SERIES.filter(s=>active[s.key]).map(s=>({
      label:s.label,
      data:rows.map(r=>({x:r.data_ref,y:r[s.key]!=null?parseFloat(r[s.key]):null})),
      borderColor:s.color,backgroundColor:'transparent',
      pointRadius:0,pointHoverRadius:5,borderWidth:1.5,tension:0.3,spanGaps:true,
    }));
    instRef.current=new window.Chart(canvasRef.current.getContext('2d'),{
      type:'line',data:{datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:T.panelHi,borderColor:T.borderHi,borderWidth:1,
            titleColor:T.muted,bodyColor:T.text,
            titleFont:{family:"'IBM Plex Mono',monospace",size:10},
            bodyFont:{family:"'IBM Plex Mono',monospace",size:11},padding:10,
            callbacks:{label:item=>` ${item.dataset.label}: ${item.parsed.y!=null?item.parsed.y.toFixed(2)+'%':'—'}`},
          },
        },
        scales:{
          x:{type:'time',time:{unit:'month',displayFormats:{month:"MMM 'yy"}},grid:{color:`${T.border}88`},ticks:{color:T.muted,font:{family:"'IBM Plex Mono',monospace",size:9},maxTicksLimit:12}},
          y:{grid:{color:`${T.border}88`},ticks:{color:T.muted,font:{family:"'IBM Plex Mono',monospace",size:9},callback:v=>`${v}%`}},
        },
      },
    });
  },[rows,active,chartReady]);

  return (
    <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:3,height:18,background:T.focus,borderRadius:2}}/>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.text,letterSpacing:'0.08em',textTransform:'uppercase'}}>Histórico de Taxas</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.muted,marginTop:1}}>
              {rows?.length?`${rows.length} dias úteis · Supabase · vértices Svensson`:'acumulando a partir de hoje'}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {HISTORY_SERIES.map(s=>(
            <button key={s.key} onClick={()=>setActive(p=>({...p,[s.key]:!p[s.key]}))} style={{
              padding:'3px 10px',background:active[s.key]?`${s.color}22`:'transparent',
              border:`1px solid ${active[s.key]?s.color:T.border}`,borderRadius:3,
              color:active[s.key]?s.color:T.dim,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:'pointer',transition:'all 0.15s',
            }}>{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{padding:16,height:240,position:'relative'}}>
        {!rows?.length
          ?<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8}}>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:T.muted}}>Histórico vazio</span>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.dim}}>Os dados começam a acumular a partir de hoje</span>
          </div>
          :<canvas ref={canvasRef} style={{width:'100%',height:'100%'}}/>}
      </div>
    </div>
  );
}

// ─── Focus Table ─────────────────────────────────────────────────────────────
function FocusTable({focus}) {
  if (!focus?.length) return null;
  return (
    <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:10}}>
        <span style={{width:3,height:18,background:T.focus,borderRadius:2}}/>
        <div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.text,letterSpacing:'0.08em',textTransform:'uppercase'}}>IPCA Focus — BCB</div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:T.muted}}>expectativas anuais · mediana · data: {focus[0]?.dataFocus}</div>
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:T.panelHi}}>
              {['Ano','Mín','Mediana','Máx','Band'].map(h=>(
                <th key={h} style={{padding:'6px 16px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:T.muted,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {focus.map((row,i)=>{
              const band=row.maximo-row.minimo;
              return (
                <tr key={i} style={{borderBottom:`1px solid ${T.border}40`}}>
                  <td style={{padding:'7px 16px',fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:T.focus}}>{row.ano}</td>
                  <td style={{padding:'7px 16px',fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:T.muted,textAlign:'right'}}>{fmtPct(row.minimo)}</td>
                  <td style={{padding:'7px 16px',fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:700,color:T.text,textAlign:'right'}}>{fmtPct(row.mediana)}</td>
                  <td style={{padding:'7px 16px',fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:T.muted,textAlign:'right'}}>{fmtPct(row.maximo)}</td>
                  <td style={{padding:'7px 16px',textAlign:'right'}}><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:band>1.5?T.danger:T.success}}>{fmtPct(band)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────
function Section({label,right}) {
  return (
    <div style={{marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:9,color:T.muted,letterSpacing:'0.1em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{label}</span>
      <div style={{flex:1,height:1,background:T.border}}/>
      {right&&<span style={{fontSize:9,color:T.dim,whiteSpace:'nowrap'}}>{right}</span>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [refreshedAt,setRefreshedAt]=useState(null);
  const [chartReady,setChartReady]=useState(false);
  const [history,setHistory]=useState(null);
  const [histDias,setHistDias]=useState(90);

  const fetchData=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const res=await fetch('/api/curvas');
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json=await res.json();
      if(!json.ok) throw new Error(json.error||'Erro desconhecido');
      setData(json);
      setRefreshedAt(new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    }catch(e){setError(e.message);}
    setLoading(false);
  },[]);

  const fetchHistory=useCallback(async(dias)=>{
    try{
      const res=await fetch(`/api/historico?dias=${dias}`);
      const json=await res.json();
      if(json.ok) setHistory(json.rows);
    }catch(e){console.warn('history',e);}
  },[]);

  useEffect(()=>{
    loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js')
      .then(()=>loadScript('https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js'))
      .then(()=>setChartReady(true))
      .catch(()=>setError('Falha ao carregar Chart.js'));
    fetchData();
    fetchHistory(90);
  },[]);

  useEffect(()=>{fetchHistory(histDias);},[histDias]);

  const chartsReady=chartReady&&!loading;
  const sv=data?.svensson;

  // Ticker values
  const ticker=[
    {label:'NTN-B 2035',val:sv?.real?.vertices?.find(v=>v.label==='7A')?.taxa,color:T.real},
    {label:'Real 10A',  val:sv?.real?.vertices?.find(v=>v.label==='10A')?.taxa,color:T.real},
    {label:'Nom. 5A',   val:sv?.nominal?.vertices?.find(v=>v.label==='5A')?.taxa,color:T.nominal},
    {label:'Nom. 10A',  val:sv?.nominal?.vertices?.find(v=>v.label==='10A')?.taxa,color:T.nominal},
    {label:'Impl. 5A',  val:sv?.implied?.find(v=>v.label==='5A')?.taxa,color:T.implied},
    {label:'Impl. 10A', val:sv?.implied?.find(v=>v.label==='10A')?.taxa,color:T.implied},
  ].filter(t=>t.val!=null);

  return (
    <>
      <Head>
        <title>Curva de Juros BR</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:"'IBM Plex Mono',monospace"}}>

        {/* ── Topbar ── */}
        <header style={{background:T.panel,borderBottom:`1px solid ${T.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:52,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{display:'flex',gap:3}}>
              {[T.nominal,T.real,T.implied].map((c,i)=><span key={i} style={{width:4,height:22,background:c,borderRadius:2}}/>)}
            </div>
            <span style={{fontSize:13,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:T.text}}>Curva de Juros BR</span>
          </div>
          {data&&(
            <div style={{marginLeft:24,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:9,color:T.muted,textTransform:'uppercase'}}>ref</span>
              <span style={{fontSize:11,color:T.text,fontWeight:600}}>{data.dataReferencia}</span>
              <span style={{fontSize:8,color:T.dim,marginLeft:4,border:`1px solid ${T.border}`,borderRadius:2,padding:'1px 5px'}}>SVENSSON 1994</span>
            </div>
          )}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:16}}>
            <Badge ok={!error&&!!data}/>
            {refreshedAt&&<span style={{fontSize:9,color:T.dim}}>atualizado {refreshedAt}</span>}
            <button onClick={fetchData} disabled={loading} style={{padding:'4px 12px',background:loading?T.border:T.accent,border:'none',borderRadius:3,color:'#fff',fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:'0.06em',cursor:loading?'wait':'pointer',textTransform:'uppercase',opacity:loading?0.6:1}}>
              {loading?'...':'↺ Refresh'}
            </button>
          </div>
        </header>

        {/* ── Ticker strip ── */}
        {ticker.length>0&&(
          <div style={{background:T.panelHi,borderBottom:`1px solid ${T.border}`,padding:'6px 24px',display:'flex',gap:32,overflowX:'auto',fontSize:10}}>
            {ticker.map((item,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                <span style={{color:T.muted}}>{item.label}</span>
                <span style={{fontWeight:700,color:item.color}}>{fmtPct(item.val)}</span>
              </div>
            ))}
          </div>
        )}

        <main style={{padding:'20px 24px',maxWidth:1440,margin:'0 auto'}}>

          {error&&(
            <div style={{background:`${T.danger}12`,border:`1px solid ${T.danger}40`,borderRadius:4,padding:'12px 16px',marginBottom:20,fontSize:11,color:T.danger}}>⚠ {error}</div>
          )}

          {/* ── Curvas suaves ── */}
          <Section label="Estrutura a Termo · Svensson (1994)" right={data?`ref: ${data.dataReferencia}`:undefined}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16,marginBottom:20}}>
            <CurveCard
              title="Nominal (Pré)" subtitle="Svensson fit · Tesouro Prefixado + NTN-F · % a.a."
              color={T.nominal} rawPoints={data?.nominal} curve={sv?.nominal?.curve}
              rmse={sv?.nominal?.rmse} loading={!chartsReady}
            />
            <CurveCard
              title="Real (IPCA+)" subtitle="Svensson fit · NTN-B · % a.a."
              color={T.real} rawPoints={data?.real} curve={sv?.real?.curve}
              rmse={sv?.real?.rmse} loading={!chartsReady}
              extraScatter={data?.focus} extraLabel="Focus IPCA" extraColor={T.focus}
            />
            <CurveCard
              title="Inflação Implícita" subtitle="Fisher: (1+nom)/(1+real)−1 · curva contínua · % a.a."
              color={T.implied} rawPoints={null}
              curve={sv?.implied?.filter(v=>!v.extrap).map(v=>({anos:v.anos,taxa:v.taxa}))}
              rmse={null} loading={!chartsReady}
            />
          </div>

          {/* ── Parâmetros Svensson ── */}
          {(sv?.nominal?.params||sv?.real?.params)&&(
            <>
              <Section label="Parâmetros Svensson"/>
              <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
                <ParamsPanel params={sv?.nominal?.params} color={T.nominal} label="Curva Nominal — β, λ"/>
                <ParamsPanel params={sv?.real?.params}    color={T.real}    label="Curva Real — β, λ"/>
              </div>
            </>
          )}

          {/* ── Vértices padrão ── */}
          <Section label="Vértices Padrão ANBIMA"/>
          <div style={{marginBottom:20}}>
            <VerticesTable svNom={sv?.nominal} svReal={sv?.real} svImpl={sv?.implied}/>
          </div>

          {/* ── Histórico ── */}
          <Section label="Histórico · Supabase" right={
            <div style={{display:'flex',gap:4}}>
              {[30,90,180,365].map(d=>(
                <button key={d} onClick={()=>setHistDias(d)} style={{padding:'2px 10px',border:`1px solid ${histDias===d?T.focus:T.border}`,borderRadius:3,background:histDias===d?`${T.focus}18`:'transparent',color:histDias===d?T.focus:T.muted,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:'pointer'}}>{d}d</button>
              ))}
            </div>
          }/>
          <div style={{marginBottom:20}}>
            <HistoryChart rows={history} chartReady={chartReady}/>
          </div>

          {/* ── Focus ── */}
          {data?.focus?.length>0&&(
            <>
              <Section label="Expectativas de Mercado"/>
              <div style={{marginBottom:20}}>
                <FocusTable focus={data.focus}/>
              </div>
            </>
          )}
        </main>

        <footer style={{borderTop:`1px solid ${T.border}`,padding:'14px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',gap:20}}>
            {['Tesouro Direto (CSV público)','BCB Olinda (Focus)','Supabase (histórico)'].map((s,i)=>(
              <span key={i} style={{fontSize:8,color:T.dim}}>● {s}</span>
            ))}
          </div>
          <span style={{fontSize:8,color:T.dim}}>Svensson (1994) · Nelson-Siegel estendido · cache 1h · ANBIMA metodologia</span>
        </footer>
      </div>
    </>
  );
}
