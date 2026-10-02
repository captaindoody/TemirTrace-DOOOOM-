import { createServer } from 'node:http';
import handleRequest from './server.js';

const PORT = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 8001));
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

createServer(handleRequest).listen(PORT, HOST, () => {
  console.log(`TemirTrace ready on ${HOST}:${PORT}`);
});
