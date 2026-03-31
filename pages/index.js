import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:        '#080c14',
  panel:     '#0e1623',
  panelHi:   '#131d2e',
  border:    '#1e2d42',
  borderHi:  '#2a4060',
  nominal:   '#4db8ff',
  real:      '#00e5a0',
  implied:   '#ffb347',
  focus:     '#c084fc',
  text:      '#dce8f5',
  muted:     '#5a7899',
  dim:       '#3a5570',
  success:   '#00c97a',
  danger:    '#ff4d6d',
  accent:    '#0a84ff',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => v == null ? '—' : Number(v).toFixed(d);
const fmtPct = (v) => v == null ? '—' : `${fmt(v)}%`;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ─── Sparkline bar (mini inline chart) ───────────────────────────────────────
function Spark({ values, color }) {
  if (!values || !values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, height: 18 }}>
      {values.map((v, i) => (
        <span key={i} style={{
          display: 'inline-block',
          width: 3,
          height: `${Math.max(15, ((v - min) / range) * 100)}%`,
          background: color,
          opacity: 0.5 + (i / values.length) * 0.5,
          borderRadius: 1,
        }} />
      ))}
    </span>
  );
}

// ─── Chart card ──────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, color, points, extraPoints, extraLabel, extraColor, loading }) {
  const canvasRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!points || !window.Chart || !canvasRef.current) return;

    if (instanceRef.current) instanceRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    const datasets = [
      {
        label: title,
        data: points.map((p) => ({ x: p.anos, y: p.taxa })),
        borderColor: color,
        backgroundColor: `${color}15`,
        pointBackgroundColor: color,
        pointBorderColor: T.panel,
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.35,
        borderWidth: 2,
      },
    ];

    if (extraPoints?.length) {
      datasets.push({
        label: extraLabel,
        data: extraPoints.map((p) => ({
          x: typeof p.ano === 'string' ? +p.ano - new Date().getFullYear() : p.anos,
          y: p.mediana ?? p.taxa,
        })),
        borderColor: extraColor,
        backgroundColor: 'transparent',
        pointBackgroundColor: extraColor,
        pointBorderColor: T.panel,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        fill: false,
        tension: 0.3,
        borderWidth: 1.5,
        borderDash: [5, 4],
      });
    }

    instanceRef.current = new window.Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: !!extraPoints?.length,
            labels: { color: T.muted, font: { family: "'IBM Plex Mono', monospace", size: 10 }, boxWidth: 12, padding: 10 },
          },
          tooltip: {
            backgroundColor: T.panelHi,
            borderColor: T.borderHi,
            borderWidth: 1,
            titleColor: T.muted,
            bodyColor: T.text,
            titleFont: { family: "'IBM Plex Mono', monospace", size: 10 },
            bodyFont: { family: "'IBM Plex Mono', monospace", size: 11 },
            padding: 10,
            callbacks: {
              title: (items) => `${fmt(items[0].parsed.x, 1)} anos`,
              label: (item) => ` ${item.dataset.label}: ${fmt(item.parsed.y)}% a.a.`,
              afterLabel: (item) => {
                const pt = points[item.dataIndex];
                return pt?.vencimento ? ` venc: ${pt.vencimento}` : '';
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'anos até vencimento', color: T.dim, font: { family: "'IBM Plex Mono', monospace", size: 9 } },
            grid: { color: `${T.border}88` },
            ticks: { color: T.muted, font: { family: "'IBM Plex Mono', monospace", size: 9 }, callback: (v) => `${v}a` },
          },
          y: {
            title: { display: true, text: '% a.a.', color: T.dim, font: { family: "'IBM Plex Mono', monospace", size: 9 } },
            grid: { color: `${T.border}88` },
            ticks: { color: T.muted, font: { family: "'IBM Plex Mono', monospace", size: 9 }, callback: (v) => `${v}%` },
          },
        },
      },
    });
  }, [points, extraPoints, color]);

  return (
    <div style={{
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: 4,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Card header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ width: 3, height: 18, background: color, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {title}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: T.muted, marginTop: 1 }}>
            {subtitle}
          </div>
        </div>
        {points?.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color }}>
              {fmtPct(points[points.length - 1]?.taxa)}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: T.muted }}>
              longo prazo
            </div>
          </div>
        )}
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, padding: 16, minHeight: 200, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader color={color} />
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* Footer mini table */}
      {points?.length > 0 && !loading && (
        <div style={{
          padding: '8px 16px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
        }}>
          {points.map((p, i) => (
            <div key={i} style={{ flexShrink: 0 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: T.muted, textTransform: 'uppercase' }}>
                {p.vencimento?.split('/')[2] ?? `${fmt(p.anos, 0)}a`}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, color }}>
                {fmtPct(p.taxa)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function Loader({ color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 24, height: 24,
        border: `2px solid ${T.border}`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: T.muted }}>
        carregando...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Focus table ─────────────────────────────────────────────────────────────
function FocusTable({ focus }) {
  if (!focus?.length) return null;
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ width: 3, height: 18, background: T.focus, borderRadius: 2 }} />
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            IPCA Focus — BCB
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: T.muted }}>
            expectativas anuais · mediana do mercado · data: {focus[0]?.dataFocus}
          </div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.panelHi }}>
              {['Ano', 'Mín', 'Mediana', 'Máx', 'Band'].map((h) => (
                <th key={h} style={{
                  padding: '6px 16px',
                  textAlign: 'right',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  color: T.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${T.border}`,
                  whiteSpace: 'nowrap',
                  ':first-child': { textAlign: 'left' },
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {focus.map((row, i) => {
              const band = row.maximo - row.minimo;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}40` }}>
                  <td style={{ padding: '7px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: T.focus }}>{row.ano}</td>
                  <td style={{ padding: '7px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, textAlign: 'right' }}>{fmtPct(row.minimo)}</td>
                  <td style={{ padding: '7px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: T.text, textAlign: 'right' }}>{fmtPct(row.mediana)}</td>
                  <td style={{ padding: '7px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, textAlign: 'right' }}>{fmtPct(row.maximo)}</td>
                  <td style={{ padding: '7px 16px', textAlign: 'right' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: band > 1.5 ? T.danger : T.success }}>{fmtPct(band)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary table ────────────────────────────────────────────────────────────
function SummaryTable({ nominal, real, implied }) {
  const allVenc = [...new Set([
    ...(nominal || []).map((p) => p.vencimento),
    ...(real || []).map((p) => p.vencimento),
  ])].sort();

  const byVenc = (arr, venc) => arr?.find((p) => p.vencimento === venc);
  const impliedByVenc = (venc) => implied?.find((p) => p.vencimento === venc);

  if (!allVenc.length) return null;

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 3, height: 18, background: T.accent, borderRadius: 2 }} />
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Resumo por Vencimento
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: T.muted }}>
            Tesouro Direto · taxas de venda · % a.a.
          </div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.panelHi }}>
              {['Vencimento', 'Prazo (anos)', `Nominal (Pré)`, `Real (IPCA+)`, `Infl. Implícita`, 'Título'].map((h, i) => (
                <th key={h} style={{
                  padding: '6px 16px',
                  textAlign: i > 0 ? 'right' : 'left',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  color: T.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${T.border}`,
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allVenc.map((venc, i) => {
              const nom = byVenc(nominal, venc);
              const re = byVenc(real, venc);
              const imp = impliedByVenc(venc);
              const ref = nom || re;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}40`, background: i % 2 === 0 ? 'transparent' : `${T.panelHi}60` }}>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.text, fontWeight: 600 }}>{venc}</td>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, textAlign: 'right' }}>{ref ? fmt(ref.anos, 1) : '—'}</td>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: nom ? 700 : 400, color: nom ? T.nominal : T.dim, textAlign: 'right' }}>
                    {nom ? fmtPct(nom.taxa) : '—'}
                  </td>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: re ? 700 : 400, color: re ? T.real : T.dim, textAlign: 'right' }}>
                    {re ? fmtPct(re.taxa) : '—'}
                  </td>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: imp ? 700 : 400, color: imp ? T.implied : T.dim, textAlign: 'right' }}>
                    {imp ? fmtPct(imp.taxa) : '—'}
                  </td>
                  <td style={{ padding: '8px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: T.muted, textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ref?.tipo || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function Badge({ ok }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px',
      background: ok ? `${T.success}18` : `${T.danger}18`,
      border: `1px solid ${ok ? T.success : T.danger}40`,
      borderRadius: 3,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 9,
      color: ok ? T.success : T.danger,
      letterSpacing: '0.06em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? T.success : T.danger, animation: ok ? 'pulse 2s ease infinite' : 'none' }} />
      {ok ? 'LIVE' : 'ERRO'}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/curvas');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erro desconhecido');
      setData(json);
      setRefreshedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js')
      .then(() => setChartReady(true))
      .catch(() => setError('Falha ao carregar Chart.js'));
    fetchData();
  }, []);

  const chartsReady = chartReady && !loading;

  return (
    <>
      <Head>
        <title>Curva de Juros BR</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.text,
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {/* ── Top bar ── */}
        <header style={{
          background: T.panel,
          borderBottom: `1px solid ${T.border}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[T.nominal, T.real, T.implied].map((c, i) => (
                <span key={i} style={{ width: 4, height: 22, background: c, borderRadius: 2 }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text }}>
              Curva de Juros BR
            </span>
          </div>

          {/* Center */}
          {data && (
            <div style={{ marginLeft: 32, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>ref</span>
              <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{data.dataReferencia}</span>
            </div>
          )}

          {/* Right */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge ok={!error && !!data} />
            {refreshedAt && (
              <span style={{ fontSize: 9, color: T.dim }}>atualizado {refreshedAt}</span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                padding: '4px 12px',
                background: loading ? T.border : T.accent,
                border: 'none',
                borderRadius: 3,
                color: '#fff',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: loading ? 'wait' : 'pointer',
                textTransform: 'uppercase',
                transition: 'opacity 0.2s',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? '...' : '↺ Refresh'}
            </button>
          </div>
        </header>

        {/* ── Ticker strip ── */}
        {data && (
          <div style={{
            background: T.panelHi,
            borderBottom: `1px solid ${T.border}`,
            padding: '6px 24px',
            display: 'flex',
            gap: 32,
            overflowX: 'auto',
            fontSize: 10,
          }}>
            {[
              { label: 'NTN-B 2035', val: data.real?.find(p => p.vencimento?.includes('2035'))?.taxa, color: T.real },
              { label: 'NTN-B 2045', val: data.real?.find(p => p.vencimento?.includes('2045'))?.taxa, color: T.real },
              { label: 'NTN-B 2055', val: data.real?.find(p => p.vencimento?.includes('2055'))?.taxa, color: T.real },
              { label: 'PRÉ 2029', val: data.nominal?.find(p => p.vencimento?.includes('2029'))?.taxa, color: T.nominal },
              { label: 'PRÉ 2031', val: data.nominal?.find(p => p.vencimento?.includes('2031'))?.taxa, color: T.nominal },
              { label: 'IMPL. longa', val: data.implied?.[data.implied.length - 1]?.taxa, color: T.implied },
            ].map((item, i) => item.val != null && (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ color: T.muted }}>{item.label}</span>
                <span style={{ fontWeight: 700, color: item.color }}>{fmtPct(item.val)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        <main style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

          {/* Error */}
          {error && (
            <div style={{
              background: `${T.danger}12`,
              border: `1px solid ${T.danger}40`,
              borderRadius: 4,
              padding: '12px 16px',
              marginBottom: 20,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: T.danger,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Section title */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Estrutura a Termo · Tesouro Direto
            </span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          {/* Charts grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}>
            <ChartCard
              title="Nominal (Pré)"
              subtitle="Tesouro Prefixado + NTN-F · % a.a."
              color={T.nominal}
              points={data?.nominal}
              loading={!chartsReady}
            />
            <ChartCard
              title="Real (IPCA+)"
              subtitle="NTN-B + NTN-B Principal · % a.a."
              color={T.real}
              points={data?.real}
              extraPoints={data?.focus}
              extraLabel="Focus IPCA"
              extraColor={T.focus}
              loading={!chartsReady}
            />
            <ChartCard
              title="Inflação Implícita"
              subtitle="Fisher: (1+nom)/(1+real)−1 · % a.a."
              color={T.implied}
              points={data?.implied}
              loading={!chartsReady}
            />
          </div>

          {/* Summary table */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Tabela resumo
            </span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <SummaryTable nominal={data?.nominal} real={data?.real} implied={data?.implied} />
          </div>

          {/* Focus */}
          {data?.focus?.length > 0 && (
            <>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Expectativas mercado
                </span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <FocusTable focus={data.focus} />
              </div>
            </>
          )}
        </main>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: `1px solid ${T.border}`,
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Tesouro Direto (tesourotransparente.gov.br)', 'BCB Olinda (Focus)'].map((s, i) => (
              <span key={i} style={{ fontSize: 8, color: T.dim, letterSpacing: '0.05em' }}>
                ● {s}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 8, color: T.dim }}>
            cache 1h · dados brutos sem ajuste
          </span>
        </footer>
      </div>
    </>
  );
}
