const httpProxy = require('http-proxy');
const http = require('http');

const proxy = httpProxy.createProxyServer({});
const nextURL = 'http://127.0.0.1:3000';
const mlURL = 'http://127.0.0.1:8000';

http.createServer((req, res) => {
  if (req.url.startsWith('/api-ml/')) {
    req.url = req.url.replace('/api-ml', '');
    proxy.web(req, res, { target: mlURL });
  } else {
    proxy.web(req, res, { target: nextURL });
  }
}).listen(5000, '0.0.0.0', () => console.log('Gateway proxy: http://0.0.0.0:5000'));
