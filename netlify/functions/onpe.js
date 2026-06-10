// netlify/functions/onpe.js — scraper robusto RPP + Peru21 + La República
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const fuentes = [
    'https://rpp.pe/politica/elecciones/onpe-resultados-segunda-vuelta-2026-hoy-conteo-de-votos-elecciones-peru-tiempo-real-noticia-1691992',
    'https://peru21.pe/politica/onpe-resultados-oficiales-2026-en-vivo-sigue-el-conteo-de-votos-en-tiempo-real-de-segunda-vuelta/',
    'https://larepublica.pe/politica/2026/06/07/resultados-oficiales-onpe-en-vivo-conteo-de-votos-de-la-segunda-vuelta-de-elecciones-peru-2026-hnews-622951',
  ];

  const errors = [];
  for (const url of fuentes) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
      const html = await r.text();
      const nombre = new URL(url).hostname.replace('www.', '').split('.')[0];
      const data = parsear(html, nombre);
      if (data && (data.sanchez.pct || data.keiko.pct)) {
        return { statusCode: 200, headers: { ...CORS, 'Cache-Control': 'no-cache' }, body: JSON.stringify(data) };
      }
      errors.push(nombre + ': sin datos');
    } catch (e) { errors.push(e.message); }
  }

  return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Sin datos', detalle: errors }) };
};

function limpiarNum(s) { return parseInt(String(s).replace(/['\s,.]/g, '')); }

function parsear(html, fuente) {
  // Quitar tags HTML
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // ── % actas ──
  const actasM = t.match(/[Aa]l\s+(\d{1,2}[.,]\d{1,3})\s*%\s*de\s*actas/i)
              || t.match(/(\d{1,2}[.,]\d{1,3})\s*%\s*de\s*actas\s*contabilizadas/i);
  const actasPct = actasM ? parseFloat(actasM[1].replace(',', '.')) : null;

  // ── Patrón principal: "Sánchez acumula X votos frente a los Y votos de Keiko" ──
  const vM = t.match(/[Ss][áa]nchez\s+acumula\s+([\d',.]+)\s+votos\s+frente\s+a\s+los\s+([\d',.]+)\s+votos\s+de\s+[Kk]eiko/i);
  let sVotos = null, kVotos = null;
  if (vM) {
    sVotos = limpiarNum(vM[1]);
    kVotos = limpiarNum(vM[2]);
    // Solo aceptar si son millones (entre 5M y 15M)
    if (sVotos < 5000000 || kVotos < 5000000) { sVotos = null; kVotos = null; }
  }

  // ── Patrón alternativo: buscar todos los números grandes cerca de nombres ──
  if (!sVotos || !kVotos) {
    // Extraer todos los números de 7+ dígitos con separadores de miles
    const allNums = [];
    const re = /(\d[\d',.]{6,11})\s+votos/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
      const n = limpiarNum(m[1]);
      if (n >= 5000000 && n <= 15000000) allNums.push({ n, i: m.index });
    }

    // Encontrar índice de mención de cada candidato
    const sIdx = Math.max(t.indexOf('Sánchez'), t.indexOf('Sanchez'));
    const kIdx = Math.max(t.indexOf('Keiko'), t.indexOf('keiko'));

    for (const { n, i } of allNums) {
      const distS = Math.abs(i - sIdx);
      const distK = Math.abs(i - kIdx);
      if (!sVotos && distS < distK && distS < 800) sVotos = n;
      else if (!kVotos && distK < distS && distK < 800) kVotos = n;
    }

    // Último recurso: los dos primeros números grandes en orden
    if ((!sVotos || !kVotos) && allNums.length >= 2) {
      allNums.sort((a, b) => a.i - b.i);
      if (!sVotos) sVotos = allNums[0]?.n ?? null;
      if (!kVotos) kVotos = allNums[1]?.n ?? null;
    }
  }

  // ── Porcentajes ──
  // Patrón: "Sánchez ... 50.121 % de votos válidos"
  const sPctM = t.match(/[Ss][áa]nchez[^%]{0,400}?(\d{2}[.,]\d{2,3})\s*%/si)
             || t.match(/(\d{2}[.,]\d{2,3})\s*%[^%]{0,200}?[Ss][áa]nchez/si);
  const kPctM = t.match(/[Kk]eiko[^%]{0,400}?(\d{2}[.,]\d{2,3})\s*%/si)
             || t.match(/(\d{2}[.,]\d{2,3})\s*%[^%]{0,200}?[Kk]eiko/si);

  const sPct = sPctM ? parseFloat(sPctM[1].replace(',', '.')) : (sVotos && kVotos ? sVotos/(sVotos+kVotos)*100 : null);
  const kPct = kPctM ? parseFloat(kPctM[1].replace(',', '.')) : (sVotos && kVotos ? kVotos/(sVotos+kVotos)*100 : null);

  const diff = sVotos && kVotos ? Math.abs(sVotos - kVotos) : null;

  return {
    sanchez: { nombre: 'Roberto Sánchez', partido: 'Juntos por el Perú', pct: sPct, votos: sVotos },
    keiko:   { nombre: 'Keiko Fujimori',  partido: 'Fuerza Popular',      pct: kPct, votos: kVotos },
    actasPct, diff, fuente,
  };
}
