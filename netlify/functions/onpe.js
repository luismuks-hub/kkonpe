// netlify/functions/onpe.js
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const CHROME_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

const BASES = [
  { base: 'https://resultadosegundavuelta.onpe.gob.pe', referer: 'https://resultadosegundavuelta.onpe.gob.pe/main/resumen', origin: 'https://resultadosegundavuelta.onpe.gob.pe' },
  { base: 'https://segundavuelta.onpe.gob.pe',          referer: 'https://segundavuelta.onpe.gob.pe/',                       origin: 'https://segundavuelta.onpe.gob.pe' },
];

const PATHS = {
  proceso:    '/presentacion-backend/proceso/proceso-electoral-activo',
  candidatos: (id) => `/presentacion-backend/candidatos/candidatos-segunda-vuelta?idEleccion=${id}&tipoFiltro=eleccion`,
  totales:    (id) => `/presentacion-backend/totales/totales-segunda-vuelta?idEleccion=${id}&tipoFiltro=eleccion`,
};

async function tryFetch(url, referer, origin) {
  const headers = { ...CHROME_HEADERS, 'Referer': referer, 'Origin': origin };
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error(`HTML recibido (status ${res.status})`);
  }
  return JSON.parse(text);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const p = event.queryStringParameters || {};
  const endpoint = p.endpoint || '';
  const id = p.idEleccion || '1';

  if (!['proceso', 'candidatos', 'totales'].includes(endpoint)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'endpoint invalido' }) };
  }

  const pathFn = PATHS[endpoint];
  const path = typeof pathFn === 'function' ? pathFn(id) : pathFn;

  const errors = [];
  for (const { base, referer, origin } of BASES) {
    try {
      const data = await tryFetch(base + path, referer, origin);
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-cache, no-store' },
        body: JSON.stringify(data),
      };
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }

  return {
    statusCode: 502,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'ONPE bloqueó todos los intentos', detalle: errors }),
  };
};
