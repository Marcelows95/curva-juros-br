/**
 * /api/historico
 *
 * Retorna série temporal de vértices-chave das curvas
 * via view `yield_curve_key_vertices` no Supabase.
 *
 * Query params:
 *   ?dias=90   → últimos N dias (default 90, max 365)
 */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://yacgpbbcxjyoxvoxxpcp.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhY2dwYmJjeGp5b3h2b3h4cGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjMyNTYsImV4cCI6MjA5MDEzOTI1Nn0.K4mDL8Tgzt4YeLEgZtogHEuKWD3_7tUEHLDV49MmL4I';

export default async function handler(req, res) {
  try {
    const dias = Math.min(parseInt(req.query.dias || '90', 10), 365);

    // Calcula data mínima
    const since = new Date();
    since.setDate(since.getDate() - dias);
    const sinceStr = since.toISOString().split('T')[0];

    // Busca da view no Supabase
    const url = `${SUPABASE_URL}/rest/v1/yield_curve_key_vertices` +
      `?data_ref=gte.${sinceStr}` +
      `&order=data_ref.asc` +
      `&limit=500`;

    const resp = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) throw new Error(`Supabase HTTP ${resp.status}`);
    const rows = await resp.json();

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.json({ ok: true, dias, rows });
  } catch (err) {
    console.error('[/api/historico]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
