/**
 * /api/curvas — Curvas de Juros BR
 *
 * Metodologia: Svensson (1994) Extended Nelson-Siegel
 *   r(τ) = β1 + β2·f1(τ,λ1) + β3·f2(τ,λ1) + β4·f2(τ,λ2)
 *   f1(τ,λ) = (1-e^(-τ/λ)) / (τ/λ)
 *   f2(τ,λ) = (1-e^(-τ/λ)) / (τ/λ) - e^(-τ/λ)
 *
 * Otimização (ANBIMA §1):
 *   - Grid search sobre (λ1, λ2) ∈ [0.3, 4] × [0.3, 4] (escala log)
 *   - Para cada (λ1,λ2) fixo → WLS analítico para (β1,β2,β3,β4)
 *   - Ponderador Wi = 1/τi (inverso da duration aproximada)
 *   - Refinamento por coordinate descent
 *
 * Inflação Implícita (ANBIMA §2 — Fisher):
 *   π = [(1+r_nominal)/(1+r_real)] - 1
 *
 * Fontes: Tesouro Direto (CSV público) + BCB Olinda (IPCA Focus)
 */

export const config = { api: { responseLimit: false } };

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://yacgpbbcxjyoxvoxxpcp.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhY2dwYmJjeGp5b3h2b3h4cGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjMyNTYsImV4cCI6MjA5MDEzOTI1Nn0.K4mDL8Tgzt4YeLEgZtogHEuKWD3_7tUEHLDV49MmL4I';

const CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/' +
  'df56aa42-484a-4a59-8184-7676580c81e3/resource/' +
  '796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

// ── Vértices padrão ANBIMA (em DU/252) ───────────────────────────────────────
const VERTICES = [
  { du: 21,   label: '1M'  },
  { du: 63,   label: '3M'  },
  { du: 126,  label: '6M'  },
  { du: 252,  label: '1A'  },
  { du: 378,  label: '18M' },
  { du: 504,  label: '2A'  },
  { du: 756,  label: '3A'  },
  { du: 1008, label: '4A'  },
  { du: 1260, label: '5A'  },
  { du: 1764, label: '7A'  },
  { du: 2016, label: '8A'  },
  { du: 2520, label: '10A' },
  { du: 3024, label: '12A' },
  { du: 4032, label: '16A' },
  { du: 5040, label: '20A' },
];

// ═══════════════════════════════════════════════════════════════════════
//  SVENSSON MODEL
// ═══════════════════════════════════════════════════════════════════════

/** Fatores de carga f1 e f2 para um dado prazo τ e decaimento λ */
function svFactors(tau, lam) {
  if (tau < 1e-8 || lam < 1e-8) return [1, 0];
  const x  = tau / lam;
  const ex = Math.exp(-x);
  const f1 = (1 - ex) / x;
  const f2 = f1 - ex;
  return [f1, f2];
}

/** Avalia a curva Svensson em τ dado o vetor de parâmetros b=[β1,β2,β3,β4,λ1,λ2] */
function svYield(b, tau) {
  const [b1, b2, b3, b4, l1, l2] = b;
  if (tau < 1e-8) return b1 + b2;
  const [f1a, f2a] = svFactors(tau, l1);
  const [,    f2c] = svFactors(tau, l2);
  return b1 + b2 * f1a + b3 * f2a + b4 * f2c;
}

/** Eliminação gaussiana para sistema 4×4 */
function solve4(A, rhs) {
  const n = 4;
  const M = A.map((r, i) => [...r, rhs[i]]);
  for (let p = 0; p < n; p++) {
    let mx = p;
    for (let r = p + 1; r < n; r++) if (Math.abs(M[r][p]) > Math.abs(M[mx][p])) mx = r;
    [M[p], M[mx]] = [M[mx], M[p]];
    if (Math.abs(M[p][p]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === p) continue;
      const f = M[r][p] / M[p][p];
      for (let c = p; c <= n; c++) M[r][c] -= f * M[p][c];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** WLS analítico para β dado λ1, λ2 fixos */
function fitBetas(pts, l1, l2) {
  const XWX = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const XWy = new Array(4).fill(0);
  for (const { tau, y, w } of pts) {
    const [f1a, f2a] = svFactors(tau, l1);
    const [,    f2c] = svFactors(tau, l2);
    const x = [1, f1a, f2a, f2c];
    for (let i = 0; i < 4; i++) {
      XWy[i] += w * x[i] * y;
      for (let j = 0; j < 4; j++) XWX[i][j] += w * x[i] * x[j];
    }
  }
  return solve4(XWX, XWy);
}

/** Soma dos erros quadráticos ponderados */
function wsse(pts, b) {
  return pts.reduce((s, { tau, y, w }) => {
    const r = svYield(b, tau) - y;
    return s + w * r * r;
  }, 0);
}

/**
 * Ajusta Svensson (1994) a um conjunto de pontos {anos, taxa}.
 * Retorna { params, rmse, _b } ou null se não convergir.
 */
function fitSvensson(rawPoints) {
  if (!rawPoints || rawPoints.length < 4) return null;

  const pts = rawPoints.map(p => ({
    tau: p.anos,
    y:   p.taxa,
    w:   1 / Math.max(p.anos, 0.1),   // Wi = 1/τi ≈ 1/Duration
  }));

  // Grid log-espaçado de λ em [0.3, 4.5]
  const N   = 12;
  const lams = Array.from({ length: N }, (_, i) =>
    0.3 * Math.exp(i * Math.log(4.5 / 0.3) / (N - 1))
  );

  let best   = null;
  let bestSse = Infinity;

  for (const l1 of lams) {
    for (const l2 of lams) {
      if (Math.abs(l1 - l2) < 0.08) continue;   // λ1 ≠ λ2
      const betas = fitBetas(pts, l1, l2);
      if (!betas) continue;
      if (betas[0] <= 0) continue;               // β1 > 0 (taxa longa positiva)
      const s = wsse(pts, [...betas, l1, l2]);
      if (s < bestSse) { bestSse = s; best = [...betas, l1, l2]; }
    }
  }
  if (!best) return null;

  // Refinamento: coordinate descent sobre λ1, λ2
  const STEPS = [0.15, 0.08, 0.03, 0.01];
  let improved = true;
  while (improved) {
    improved = false;
    for (const idx of [4, 5]) {
      for (const step of STEPS) {
        for (const dir of [-1, 1]) {
          const trial = [...best];
          trial[idx] = Math.max(0.08, trial[idx] + dir * step);
          const betas = fitBetas(pts, trial[4], trial[5]);
          if (!betas || betas[0] <= 0) continue;
          const s = wsse(pts, [...betas, trial[4], trial[5]]);
          if (s < bestSse - 1e-10) {
            bestSse = s;
            best = [...betas.slice(0, 4), trial[4], trial[5]];
            improved = true;
          }
        }
      }
    }
  }

  // Recalcula betas finais
  const fb = fitBetas(pts, best[4], best[5]);
  if (!fb) return null;
  best = [...fb, best[4], best[5]];

  const rmse = Math.sqrt(pts.reduce((s, { tau, y }) => {
    const r = svYield(best, tau) - y;
    return s + r * r;
  }, 0) / pts.length);

  return {
    params: {
      b1: r4(best[0]), b2: r4(best[1]),
      b3: r4(best[2]), b4: r4(best[3]),
      l1: r4(best[4]), l2: r4(best[5]),
    },
    rmse: r4(rmse),
    _b: best,
  };
}

function r4(v) { return Math.round(v * 10000) / 10000; }

/** Gera curva suave (n pontos) para uso nos gráficos */
function smoothCurve(model, minT = 0.08, maxT = 35, n = 120) {
  if (!model) return [];
  return Array.from({ length: n }, (_, i) => {
    const tau = minT * Math.exp(i * Math.log(maxT / minT) / (n - 1));
    return { anos: r4(tau), taxa: r4(svYield(model._b, tau)) };
  });
}

/** Avalia a curva nos vértices padrão ANBIMA */
function evalVertices(model) {
  if (!model) return [];
  return VERTICES.map(v => ({
    du:    v.du,
    anos:  r4(v.du / 252),
    label: v.label,
    taxa:  r4(svYield(model._b, v.du / 252)),
  }));
}

/** Inflação implícita Fisher nos vértices padrão */
function impliedVertices(nomModel, realModel, maxNomAno) {
  if (!nomModel || !realModel) return [];
  return VERTICES.map(v => {
    const tau  = v.du / 252;
    const nom  = svYield(nomModel._b, tau);
    const real = svYield(realModel._b, tau);
    const inf  = ((1 + nom / 100) / (1 + real / 100) - 1) * 100;
    // Flag como extrapolação se além do range nominal observado
    const extrap = tau > (maxNomAno * 1.05);
    return { du: v.du, anos: r4(tau), label: v.label, taxa: r4(inf), extrap };
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  FONTES DE DADOS
// ═══════════════════════════════════════════════════════════════════════

function parseBrDate(s) {
  if (!s) return null;
  const [d, m, y] = s.trim().split('/');
  if (!d || !m || !y) return null;
  return new Date(+y, +m - 1, +d);
}
function parseBrFloat(s) { return parseFloat((s || '').replace(',', '.')); }
function yearsBetween(a, b) { return (b - a) / (365.25 * 24 * 3600 * 1000); }

async function fetchCurvas() {
  const resp = await fetch(CSV_URL, {
    signal: AbortSignal.timeout(28_000),
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!resp.ok) throw new Error(`Tesouro Direto HTTP ${resp.status}`);

  const buffer = await resp.arrayBuffer();
  const text   = new TextDecoder('iso-8859-1').decode(buffer);
  const lines  = text.split(/\r?\n/).filter(l => l.trim());

  const headers = lines[0].split(';').map(h => h.trim());
  const idx     = kw => headers.findIndex(h => h.includes(kw));
  const iType   = idx('Tipo');
  const iVenc   = idx('Vencimento');
  const iBase   = idx('Base');
  const iTaxaV  = idx('Taxa Venda');
  const iTaxaC  = idx('Taxa Compra');

  // Data mais recente (max)
  let maxTs   = 0;
  let lastDate = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const base = cols[iBase]?.trim();
    if (base && /^\d{2}\/\d{2}\/\d{4}$/.test(base)) {
      const d = parseBrDate(base);
      if (d && d.getTime() > maxTs) { maxTs = d.getTime(); lastDate = base; }
    }
  }
  if (!lastDate) throw new Error('Nenhuma data encontrada no CSV');

  const baseDate = new Date(maxTs);
  const nominal  = [];
  const real     = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols[iBase]?.trim() !== lastDate) continue;

    const tipo    = cols[iType]?.trim() || '';
    const vencStr = cols[iVenc]?.trim() || '';
    const vencDate = parseBrDate(vencStr);
    if (!vencDate) continue;

    const taxa = parseBrFloat(cols[iTaxaV]) || parseBrFloat(cols[iTaxaC]);
    if (isNaN(taxa) || taxa <= 0) continue;

    const anos = r4(yearsBetween(baseDate, vencDate));
    if (anos <= 0) continue;

    const point = { anos, taxa, vencimento: vencStr, tipo };
    if      (tipo.includes('Prefixado')) nominal.push(point);
    else if (tipo.includes('IPCA'))      real.push(point);
  }

  nominal.sort((a, b) => a.anos - b.anos);
  real.sort((a, b)    => a.anos - b.anos);

  return { lastDate, nominal, real };
}

async function fetchFocus() {
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/' +
    'ExpectativaMercadoAnuais' +
    '?$filter=Indicador%20eq%20%27IPCA%27' +
    '&$orderby=Data%20desc,DataReferencia%20asc' +
    '&$top=40&$format=json' +
    '&$select=Data,DataReferencia,Mediana,Minimo,Maximo';
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return [];
    const json = await resp.json();
    const vals = json.value || [];
    if (!vals.length) return [];
    const last = vals[0].Data;
    return vals.filter(v => v.Data === last).map(v => ({
      ano: v.DataReferencia, mediana: v.Mediana,
      minimo: v.Minimo, maximo: v.Maximo, dataFocus: v.Data,
    }));
  } catch { return []; }
}

// ── Supabase upsert ──────────────────────────────────────────────────────────
async function upsertSnapshot(payload) {
  try {
    const [d, m, y] = payload.dataRef.split('/');
    const data_ref  = `${y}-${m}-${d}`;
    const body = {
      data_ref,
      nominal:  payload.nominal,
      real:     payload.real,
      implied:  payload.impliedRaw,
      focus:    payload.focus,
      svensson: payload.svensson,
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/yield_curve_snapshots`, {
      method:  'POST',
      headers: {
        'apikey':       SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn('[upsert]', res.status, await res.text());
  } catch (e) { console.warn('[upsert]', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    const [curvasResult, focusResult] = await Promise.allSettled([
      fetchCurvas(), fetchFocus(),
    ]);

    if (curvasResult.status === 'rejected')
      throw new Error(curvasResult.reason?.message || 'Erro ao buscar curvas');

    const { lastDate, nominal, real } = curvasResult.value;
    const focus = focusResult.status === 'fulfilled' ? focusResult.value : [];

    // ── Raw inflação implícita (Fisher nos pontos coincidentes) ──────────
    const impliedRaw = real.map(r => {
      const lower = nominal.filter(n => n.anos <= r.anos).pop();
      const upper = nominal.find(n => n.anos >= r.anos);
      let nomTaxa = null;
      if (lower && upper) {
        if (lower.anos === upper.anos) {
          nomTaxa = lower.taxa;
        } else {
          const t = (r.anos - lower.anos) / (upper.anos - lower.anos);
          nomTaxa = lower.taxa + t * (upper.taxa - lower.taxa);
        }
      }
      if (nomTaxa == null) return null;
      const inf = ((1 + nomTaxa / 100) / (1 + r.taxa / 100) - 1) * 100;
      return { anos: r.anos, taxa: r4(inf), vencimento: r.vencimento };
    }).filter(Boolean);

    // ── Svensson fitting ─────────────────────────────────────────────────
    const svNom  = fitSvensson(nominal);
    const svReal = fitSvensson(real);

    const maxNomAno = nominal.length ? nominal[nominal.length - 1].anos : 10;

    const svensson = {
      nominal: svNom ? {
        params:    svNom.params,
        rmse:      svNom.rmse,
        curve:     smoothCurve(svNom, 0.08, Math.min(maxNomAno * 1.1, 35)),
        vertices:  evalVertices(svNom),
      } : null,
      real: svReal ? {
        params:    svReal.params,
        rmse:      svReal.rmse,
        curve:     smoothCurve(svReal, 0.08, 35),
        vertices:  evalVertices(svReal),
      } : null,
      implied: impliedVertices(svNom, svReal, maxNomAno),
    };

    // fire-and-forget
    upsertSnapshot({ dataRef: lastDate, nominal, real, impliedRaw, focus, svensson });

    res.json({
      ok: true,
      dataReferencia: lastDate,
      geradoEm: new Date().toISOString(),
      metodologia: 'Svensson (1994) — ANBIMA',
      nominal,
      real,
      implied: impliedRaw,
      focus,
      svensson,
    });
  } catch (err) {
    console.error('[/api/curvas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
