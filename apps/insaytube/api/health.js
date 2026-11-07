'use strict';

module.exports = (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: true,
        status: 'ok',
        service: 'insaytube',
        platform: 'insaytube',
        version: '1.0.0',
        uptimeSec: Math.round(process.uptime())
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err.message }));
  }
};
