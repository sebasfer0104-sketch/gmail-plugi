// Gmail MCP server - stdio transport
// OAuth personal flow con persistencia local del token
// Expone 6 tools al runtime de MiniMax Code

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import http from 'http';

// __dirname / __filename disponibles en CJS (que es como corre el bundle)
const PLUGIN_DIR = __dirname;
const CREDENTIALS_PATH = path.join(PLUGIN_DIR, 'credentials.json');
const TOKEN_PATH = path.join(PLUGIN_DIR, 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

const log = (msg) => process.stderr.write(`[gmail-plugin] ${msg}\n`);

// ---------- Credentials ----------
async function loadCredentials() {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const creds = JSON.parse(content);
  const cfg = creds.installed || creds.web;
  if (!cfg) throw new Error('credentials.json no tiene seccion installed ni web');
  const { client_id, client_secret } = cfg;
  if (!client_id || !client_secret) throw new Error('credentials.json incompleto: faltan client_id/client_secret');
  return { client_id, client_secret };
}

// ---------- OAuth flow ----------
async function ensureAuth() {
  const { client_id, client_secret } = await loadCredentials();

  if (fsSync.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
      const oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://127.0.0.1');
      oauth2Client.setCredentials(tokens);
      if (tokens.expiry_date && tokens.expiry_date < Date.now() && tokens.refresh_token) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          await fs.writeFile(TOKEN_PATH, JSON.stringify(credentials, null, 2));
          oauth2Client.setCredentials(credentials);
          log('Token refrescado automaticamente');
        } catch (e) {
          log(`Refresh fallo (${e.message}), re-autorizando`);
        }
      } else {
        return oauth2Client;
      }
    } catch (e) {
      log(`Error leyendo token.json: ${e.message}, re-autorizando`);
    }
  }

  const port = 3000 + Math.floor(Math.random() * 5000);
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  log('='.repeat(60));
  log('AUTORIZACION REQUERIDA (primera vez o token revocado)');
  log('Abrí este link en tu navegador y autoriza con tu cuenta:');
  log('');
  log(authUrl);
  log('');
  log('='.repeat(60));

  const code = await waitForCallback(port);
  const { tokens } = await oauth2Client.getToken(code);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  log('Token guardado en token.json');
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

function waitForCallback(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          const err = url.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          if (code) {
            res.end('<h1>Autorizado</h1><p>Podes cerrar esta pestana y volver a MiniMax Code.</p>');
            server.close();
            resolve(code);
          } else {
            res.end(`<h1>Error</h1><p>${err || 'sin code'}</p>`);
            server.close();
            reject(new Error(`OAuth fallo: ${err || 'sin code'}`));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (e) {
        reject(e);
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      log(`Callback server listening on http://127.0.0.1:${port}`);
    });
  });
}

// ---------- Helpers de payload ----------
function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

function decodePartData(part) {
  if (!part?.body?.data) return '';
  return Buffer.from(part.body.data, 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodePartData(payload);
  if (payload.parts?.length) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart) return decodePartData(textPart);
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart) return decodePartData(htmlPart);
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function messageStub(msg) {
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet,
    labelIds: msg.labelIds || []
  };
}

function buildMime({ to, subject, body, cc, bcc, html, inReplyTo, references }) {
  const lines = [];
  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(`Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`);
  lines.push('MIME-Version: 1.0');
  lines.push('');
  lines.push(body);
  return lines.join('\r\n');
}

async function getMessageMetadata(gmail, messageId) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID', 'References']
  });
  return res.data;
}

// ---------- MCP server ----------
const server = new Server(
  { name: 'gmail', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'gmail_list_recent',
      description: 'Lista los ultimos N correos del inbox. Opcional: filtrar por no leidos o por etiqueta.',
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: 'Cantidad maxima (default 20, max 100)' },
          labelIds: { type: 'array', items: { type: 'string' }, description: 'Filtrar por etiqueta (ej ["INBOX", "UNREAD", "CATEGORY_PROMOTIONS"])' },
          unreadOnly: { type: 'boolean', description: 'Si true, solo no leidos' }
        }
      }
    },
    {
      name: 'gmail_get_message',
      description: 'Lee un correo completo: headers principales + body decodificado.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'ID del mensaje' },
          format: { type: 'string', enum: ['full', 'metadata', 'minimal'], description: 'Formato (default full)' }
        },
        required: ['messageId']
      }
    },
    {
      name: 'gmail_search',
      description: 'Busca correos con query estilo Gmail: from:, to:, subject:, is:, has:, label:, filename:, after:, before:, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query completa de Gmail' },
          maxResults: { type: 'number', description: 'Cantidad maxima (default 20)' }
        },
        required: ['query']
      }
    },
    {
      name: 'gmail_send',
      description: 'Envia un correo nuevo (texto plano o HTML).',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Destinatario principal' },
          subject: { type: 'string' },
          body: { type: 'string', description: 'Cuerpo del mensaje' },
          cc: { type: 'string' },
          bcc: { type: 'string' },
          html: { type: 'boolean', description: 'Si true, el body se envia como HTML' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    {
      name: 'gmail_reply',
      description: 'Responde un correo existente preservando el hilo (thread, In-Reply-To, References, Re: en subject).',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'ID del mensaje original al que responder' },
          body: { type: 'string' },
          html: { type: 'boolean' }
        },
        required: ['messageId', 'body']
      }
    },
    {
      name: 'gmail_modify',
      description: 'Modifica un mensaje: marca como leido/no leido, agrega o quita etiquetas, mueve a carpeta.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          addLabelIds: { type: 'array', items: { type: 'string' }, description: 'Etiquetas a agregar (ej ["STARRED", "IMPORTANT"])' },
          removeLabelIds: { type: 'array', items: { type: 'string' }, description: 'Etiquetas a quitar (ej ["UNREAD", "INBOX"])' },
          markRead: { type: 'boolean', description: 'Atajo: true = quitar UNREAD, false = agregar UNREAD' }
        },
        required: ['messageId']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const auth = await ensureAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    switch (name) {
      case 'gmail_list_recent': {
        const maxResults = Math.min(args.maxResults || 20, 100);
        const q = args.unreadOnly ? 'is:unread' : undefined;
        const res = await gmail.users.messages.list({
          userId: 'me',
          maxResults,
          labelIds: args.labelIds,
          q
        });
        const messages = res.data.messages || [];
        const full = await Promise.all(messages.map(m =>
          gmail.users.messages.get({
            userId: 'me',
            id: m.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          })
        ));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(full.map(m => messageStub(m.data)), null, 2)
          }]
        };
      }

      case 'gmail_get_message': {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: args.format || 'full'
        });
        const msg = res.data;
        const headers = msg.payload?.headers || [];
        const body = extractBody(msg.payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: msg.id,
              threadId: msg.threadId,
              from: getHeader(headers, 'From'),
              to: getHeader(headers, 'To'),
              cc: getHeader(headers, 'Cc'),
              subject: getHeader(headers, 'Subject'),
              date: getHeader(headers, 'Date'),
              messageId: getHeader(headers, 'Message-ID'),
              references: getHeader(headers, 'References'),
              labelIds: msg.labelIds || [],
              body
            }, null, 2)
          }]
        };
      }

      case 'gmail_search': {
        const res = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: Math.min(args.maxResults || 20, 100)
        });
        const messages = res.data.messages || [];
        const full = await Promise.all(messages.map(m =>
          gmail.users.messages.get({
            userId: 'me',
            id: m.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          })
        ));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(full.map(m => messageStub(m.data)), null, 2)
          }]
        };
      }

      case 'gmail_send': {
        const mime = buildMime({
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
          html: args.html
        });
        const raw = Buffer.from(mime).toString('base64url');
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw }
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ id: res.data.id, threadId: res.data.threadId }, null, 2)
          }]
        };
      }

      case 'gmail_reply': {
        const orig = await getMessageMetadata(gmail, args.messageId);
        const origHeaders = orig.payload?.headers || [];
        const origMessageId = getHeader(origHeaders, 'Message-ID');
        const origReferences = getHeader(origHeaders, 'References') || '';
        const origSubject = getHeader(origHeaders, 'Subject') || '';
        const origFrom = getHeader(origHeaders, 'From') || '';
        if (!origFrom) throw new Error('No se pudo extraer From del mensaje original');
        const subject = origSubject.toLowerCase().startsWith('re:') ? origSubject : `Re: ${origSubject}`;
        const references = origMessageId
          ? (origReferences ? `${origReferences} ${origMessageId}` : origMessageId)
          : '';
        const mime = buildMime({
          to: origFrom,
          subject,
          body: args.body,
          html: args.html,
          inReplyTo: origMessageId || undefined,
          references: references || undefined
        });
        const raw = Buffer.from(mime).toString('base64url');
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw, threadId: orig.threadId }
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ id: res.data.id, threadId: res.data.threadId }, null, 2)
          }]
        };
      }

      case 'gmail_modify': {
        const addLabelIds = [...(args.addLabelIds || [])];
        const removeLabelIds = [...(args.removeLabelIds || [])];
        if (args.markRead === true && !removeLabelIds.includes('UNREAD')) {
          removeLabelIds.push('UNREAD');
        }
        if (args.markRead === false && !addLabelIds.includes('UNREAD')) {
          addLabelIds.push('UNREAD');
        }
        const res = await gmail.users.messages.modify({
          userId: 'me',
          id: args.messageId,
          requestBody: { addLabelIds, removeLabelIds }
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ id: res.data.id, labelIds: res.data.labelIds }, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Tool desconocida: ${name}`);
    }
  } catch (err) {
    const code = err.code || err.response?.status;
    let userMsg = err.message || String(err);
    if (code === 401 || /invalid_grant|invalid_token|unauthorized/i.test(userMsg)) {
      userMsg = 'Token expirado o sin permisos. Borra token.json y reintenta para re-autorizar.';
    } else if (code === 403) {
      userMsg = 'Permisos insuficientes. Verifica que los scopes en Google Cloud incluyen readonly, send y modify.';
    } else if (code === 429) {
      userMsg = 'Rate limit de Gmail API. Espera unos segundos y reintenta.';
    } else if (err.code === 'ENOENT' && err.path === CREDENTIALS_PATH) {
      userMsg = 'Falta credentials.json en el directorio del plugin. Bájalo de Google Cloud Console.';
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: userMsg, code: code || null }, null, 2) }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
(async () => {
  try {
    await server.connect(transport);
    log('Gmail MCP server conectado en stdio');
  } catch (e) {
    log('FATAL: ' + (e?.message || e));
    process.exit(1);
  }
})();
