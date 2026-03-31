/**
 * /api/curvas
 *
 * Fontes:
 *   - Tesouro Direto (público, sem auth)  → Nominal + Real
 *   - BCB Olinda                           → IPCA Focus
 *
 * Histórico: salva snapshot diário no Supabase (upsert por data_ref)
 * Cache: 1h no edge da Vercel (s-maxage=3600)
 */

export const config = { api: { responseLimit: false } };

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://yacgpbbcxjyoxvoxxpcp.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhY2dwYmJjeGp5b3h2b3h4cGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjMyNTYsImV4cCI6MjA5MDEzOTI1Nn0.K4mDL8Tgzt4YeLEgZtogHEuKWD3_7tUEHLDV49MmL4I';

async function upsertSnapshot({ lastDate, nominal, real, implied, focus }) {
  try {
    // Parse date string dd/mm/yyyy → yyyy-mm-dd
    const [d, m, y] = lastDate.split('/');
    const data_ref = `${y}-${m}-${d}`;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/yield_curve_snapshots`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates',
      },
      body: JSON.stringify({ data_ref, nominal, real, implied, focus }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[upsertSnapshot] Supabase error:', res.status, err);
    }
  } catch (e) {
    console.warn('[upsertSnapshot] failed:', e.message);
  }
}

const CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/' +
  'df56aa42-484a-4a59-8184-7676580c81e3/resource/' +
  '796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBrDate(s) {
  if (!s) return null;
  const [d, m, y] = s.trim().split('/');
  if (!d || !m || !y) return null;
  return new Date(+y, +m - 1, +d);
}

function parseBrFloat(s) {
  return parseFloat((s || '').replace(',', '.'));
}

function yearsBetween(a, b) {
  return (b - a) / (365.25 * 24 * 3600 * 1000);
}

// ── Curvas Tesouro Direto ────────────────────────────────────────────────────

async function fetchCurvas() {
  const resp = await fetch(CSV_URL, {
    signal: AbortSignal.timeout(28_000),
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!resp.ok) throw new Error(`Tesouro Direto HTTP ${resp.status}`);

  const buffer = await resp.arrayBuffer();
  const text = new TextDecoder('iso-8859-1').decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  // ── Header index ──────────────────────────────────────────────────────────
  const headers = lines[0].split(';').map((h) => h.trim());
  const idx = (kw) => headers.findIndex((h) => h.includes(kw));
  const iType = idx('Tipo');
  const iVenc = idx('Vencimento');
  const iBase = idx('Base');
  const iTaxaV = idx('Taxa Venda');
  const iTaxaC = idx('Taxa Compra');

  // ── Find most recent Data Base (scan from end) ────────────────────────────
  let lastDate = null;
  for (let i = lines.length - 1; i > 0; i--) {
    const cols = lines[i].split(';');
    const base = cols[iBase]?.trim();
    if (base && /^\d{2}\/\d{2}\/\d{4}$/.test(base)) {
      lastDate = base;
      break;
    }
  }
  if (!lastDate) throw new Error('Nenhuma data encontrada no CSV');

  const baseDate = parseBrDate(lastDate);
  const nominal = [];
  const real = [];

  // Scan from end collecting rows for lastDate, stop when date changes
  let collecting = false;
  for (let i = lines.length - 1; i > 0; i--) {
    const cols = lines[i].split(';');
    const base = cols[iBase]?.trim();

    if (base === lastDate) {
      collecting = true;
      const tipo = cols[iType]?.trim() || '';
      const vencStr = cols[iVenc]?.trim() || '';
      const vencDate = parseBrDate(vencStr);
      if (!vencDate) continue;

      // Prefer taxa venda; fallback to compra
      const taxa = parseBrFloat(cols[iTaxaV]) || parseBrFloat(cols[iTaxaC]);
      if (isNaN(taxa) || taxa <= 0) continue;

      const anos = Math.round(yearsBetween(baseDate, vencDate) * 100) / 100;
      if (anos <= 0) continue;

      const point = { anos, taxa, vencimento: vencStr, tipo };

      if (tipo.includes('Prefixado')) nominal.push(point);
      else if (tipo.includes('IPCA')) real.push(point);
    } else if (collecting) {
      // Past the lastDate block
      break;
    }
  }

  nominal.sort((a, b) => a.anos - b.anos);
  real.sort((a, b) => a.anos - b.anos);

  // ── Inflação Implícita (Fisher) ───────────────────────────────────────────
  // For each real point, interpolate nearest nominal and compute break-even
  const interpolateNominal = (anos) => {
    if (!nominal.length) return null;
    // exact match
    const exact = nominal.find((n) => Math.abs(n.anos - anos) < 0.2);
    if (exact) return exact.taxa;
    // linear interpolation between neighbors
    const lower = [...nominal].filter((n) => n.anos <= anos).pop();
    const upper = nominal.find((n) => n.anos >= anos);
    if (!lower || !upper) return null;
    if (lower === upper) return lower.taxa;
    const t = (anos - lower.anos) / (upper.anos - lower.anos);
    return lower.taxa + t * (upper.taxa - lower.taxa);
  };

  const implied = real
    .map((r) => {
      const nomTaxa = interpolateNominal(r.anos);
      if (nomTaxa == null) return null;
      const inf = ((1 + nomTaxa / 100) / (1 + r.taxa / 100) - 1) * 100;
      return { anos: r.anos, taxa: Math.round(inf * 100) / 100, vencimento: r.vencimento };
    })
    .filter(Boolean);

  return { lastDate, baseDate: lastDate, nominal, real, implied };
}

// ── IPCA Focus BCB ───────────────────────────────────────────────────────────

async function fetchFocus() {
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/' +
    'ExpectativaMercadoAnuais' +
    '?$filter=Indicador%20eq%20%27IPCA%27' +
    '&$orderby=Data%20desc,DataReferencia%20asc' +
    '&$top=40' +
    '&$format=json' +
    '&$select=Data,DataReferencia,Mediana,Minimo,Maximo';

  const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`BCB HTTP ${resp.status}`);
  const json = await resp.json();
  const vals = json.value || [];
  if (!vals.length) return [];

  const lastFocusDate = vals[0].Data;
  return vals
    .filter((v) => v.Data === lastFocusDate)
    .map((v) => ({
      ano: v.DataReferencia,
      mediana: v.Mediana,
      minimo: v.Minimo,
      maximo: v.Maximo,
      dataFocus: v.Data,
    }));
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    const [curvas, focus] = await Promise.allSettled([fetchCurvas(), fetchFocus()]);

    if (curvas.status === 'rejected') {
      throw new Error(curvas.reason?.message || 'Erro ao buscar curvas');
    }

    const { lastDate, nominal, real, implied } = curvas.value;
    const focusData = focus.status === 'fulfilled' ? focus.value : [];

    // Salva snapshot no Supabase (fire-and-forget — não bloqueia a resposta)
    upsertSnapshot({ lastDate, nominal, real, implied, focus: focusData });

    res.json({
      ok: true,
      dataReferencia: lastDate,
      geradoEm: new Date().toISOString(),
      nominal,
      real,
      implied,
      focus: focusData,
    });
  } catch (err) {
    console.error('[/api/curvas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
