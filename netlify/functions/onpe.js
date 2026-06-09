// netlify/functions/onpe.js
// Uso: /.netlify/functions/onpe?endpoint=proceso
//       /.netlify/functions/onpe?endpoint=candidatos&idEleccion=1
//       /.netlify/functions/onpe?endpoint=totales&idEleccion=1

const ONPE_BASE = 'https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend';

const CHROME_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Origin': 'https://resultadosegundavuelta.onpe.gob.pe',
  'Pragma': 'no-cache',
  'Referer': 'https://resultadosegundavuelta.onpe.gob.pe/main/resumen',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const p = event.queryStringParameters || {};
  const endpoint = p.endpoint || '';
  const id = p.idEleccion || '1';

  // Construir URL de ONPE según el endpoint solicitado
  let onpeUrl;
  if (endpoint === 'proceso') {
    onpeUrl = `${ONPE_BASE}/proceso/proceso-electoral-activo`;
  } else if (endpoint === 'candidatos') {
    onpeUrl = `${ONPE_BASE}/candidatos/candidatos-segunda-vuelta?idEleccion=${id}&tipoFiltro=eleccion`;
  } else if (endpoint === 'totales') {
    onpeUrl = `${ONPE_BASE}/totales/totales-segunda-vuelta?idEleccion=${id}&tipoFiltro=eleccion`;
  } else {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'endpoint inválido. Usa: proceso, candidatos, totales' }),
    };
  }

  console.log(`[onpe-proxy] ${endpoint} → ${onpeUrl}`);

  try {
    const response = await fetch(onpeUrl, { method: 'GET', headers: CHROME_HEADERS });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `ONPE respondió ${response.status}` }),
      };
    }

    const data = await response.text();
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-cache, no-store' },
      body: data,
    };
  } catch (err) {
    console.error('[onpe-proxy] Error:', err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
