// netlify/functions/onpe.js
// Scraper de RPP que publica datos ONPE actualizados cada pocos minutos
// Sin bloqueos, sin CORS, funciona siempre

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    // RPP actualiza esta página en tiempo real con datos ONPE
    const res = await fetch('https://rpp.pe/politica/elecciones/onpe-resultados-segunda-vuelta-2026-hoy-conteo-de-votos-elecciones-peru-tiempo-real-noticia-1691992', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-PE,es;q=0.9',
      }
    });

    const html = await res.text();

    // Extraer porcentajes y votos del HTML de RPP
    // Buscar patrones como "50.057 %" o "50.057%" para Sánchez y Keiko
    const data = parsearRPP(html);

    if (!data) {
      // Fallback: El Comercio
      const res2 = await fetch('https://elcomercio.pe/politica/elecciones/resultados-segunda-vuelta-elecciones-peru-2026-en-vivo-conteo-onpe-flash-electoral-y-quien-gana-entre-keiko-fujimori-y-roberto-sanchez-hoy-7-de-junio-noticia/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
          'Accept': 'text/html',
        }
      });
      const html2 = await res2.text();
      const data2 = parsearElComercio(html2);
      if (!data2) throw new Error('No se pudo extraer datos de ninguna fuente');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ...data2, fuente: 'El Comercio' }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ...data, fuente: 'RPP' }) };

  } catch (err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

function parsearRPP(html) {
  try {
    // Patrones: "50.057 % de votos válidos" y votos absolutos
    // RPP usa texto como: "Roberto Sánchez (Juntos por el Perú) lidera el conteo de actas con 50.057 % de votos válidos"
    
    // Porcentaje de actas
    const actasMatch = html.match(/(\d{1,2}[.,]\d{1,3})\s*%\s*de\s*actas\s*contabilizadas/i)
                    || html.match(/al\s*(\d{1,2}[.,]\d{1,3})\s*%/i);
    
    // Porcentajes candidatos — buscar patrones numéricos cerca de los nombres
    const sanchezPctMatch = html.match(/[Ss][áa]nchez[^%]{0,200}?(\d{2}[.,]\d{2,3})\s*%/s)
                          || html.match(/(\d{2}[.,]\d{2,3})\s*%[^%]{0,100}?[Ss][áa]nchez/s);
    const keikoPctMatch   = html.match(/[Kk]eiko[^%]{0,200}?(\d{2}[.,]\d{2,3})\s*%/s)
                          || html.match(/(\d{2}[.,]\d{2,3})\s*%[^%]{0,100}?[Kk]eiko/s);

    // Votos absolutos — números grandes como 8,911,541 o 8.911.541
    const sanchezVotosMatch = html.match(/[Ss][áa]nchez\s+acumula\s+([\d',. ]+)\s*votos/i)
                            || html.match(/([\d'.]+)\s*votos[^.]{0,80}?[Ss][áa]nchez/i);
    const keikoVotosMatch   = html.match(/[Kk]eiko\s+[A-Za-z]+\s+([\d',. ]+)\s*votos/i)
                            || html.match(/([\d'.]+)\s*votos[^.]{0,80}?[Kk]eiko/i);

    const sPct = sanchezPctMatch ? parseFloat(sanchezPctMatch[1].replace(',', '.')) : null;
    const kPct = keikoPctMatch   ? parseFloat(keikoPctMatch[1].replace(',', '.'))   : null;

    if (!sPct && !kPct) return null;

    const sVotos = sanchezVotosMatch ? parseInt(sanchezVotosMatch[1].replace(/[',. ]/g, '')) : null;
    const kVotos = keikoVotosMatch   ? parseInt(keikoVotosMatch[1].replace(/[',. ]/g, ''))   : null;
    const actasPct = actasMatch ? parseFloat(actasMatch[1].replace(',', '.')) : null;

    return {
      sanchez: { nombre: 'Roberto Sánchez', partido: 'Juntos por el Perú', pct: sPct, votos: sVotos },
      keiko:   { nombre: 'Keiko Fujimori',  partido: 'Fuerza Popular',      pct: kPct, votos: kVotos },
      actasPct,
      diff: (sVotos && kVotos) ? Math.abs(sVotos - kVotos) : null,
    };
  } catch (e) {
    return null;
  }
}

function parsearElComercio(html) {
  try {
    const actasMatch = html.match(/(\d{1,2}[.,]\d{1,3})\s*%\s*de\s*actas\s*contabilizadas/i);
    const sanchezPctMatch = html.match(/[Ss][áa]nchez\D{0,100}?(\d{2}[.,]\d{2,3})\s*%/s);
    const keikoPctMatch   = html.match(/[Kk]eiko\D{0,100}?(\d{2}[.,]\d{2,3})\s*%/s);

    const sPct = sanchezPctMatch ? parseFloat(sanchezPctMatch[1].replace(',', '.')) : null;
    const kPct = keikoPctMatch   ? parseFloat(keikoPctMatch[1].replace(',', '.'))   : null;

    if (!sPct && !kPct) return null;

    return {
      sanchez: { nombre: 'Roberto Sánchez', partido: 'Juntos por el Perú', pct: sPct, votos: null },
      keiko:   { nombre: 'Keiko Fujimori',  partido: 'Fuerza Popular',      pct: kPct, votos: null },
      actasPct: actasMatch ? parseFloat(actasMatch[1].replace(',', '.')) : null,
      diff: null,
    };
  } catch (e) {
    return null;
  }
}
