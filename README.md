# Gmail Plugin for MiniMax Code

Local plugin V1 que conecta MiniMax Code con Gmail via OAuth personal.

## Que hace

- Lista correos recientes (filtrar por no leídos o por etiqueta)
- Lee un correo completo (headers + body)
- Busca con query estilo Gmail (`from:`, `subject:`, `is:`, `has:`, etc)
- Envia correos nuevos (texto plano o HTML)
- Responde correos existentes preservando el hilo
- Modifica mensajes: marca como leído, mueve, etiqueta

## Setup

### 1. Credenciales OAuth

1. Ir a Google Cloud Console
2. Crear proyecto + habilitar Gmail API
3. Crear OAuth Client ID tipo **"Desktop app"**
4. Bajar `credentials.json`
5. Renombrar a `credentials.json` y ponerlo en la raiz de este plugin (NO se commitea)

### 2. Instalar

El plugin usa Node.js 18+. El bundle `server.js` ya viene precompilado, asi que no necesita `npm install`.

Solo asegurate de tener `node` en PATH (viene con Node.js 18+).

### 3. Primera autorizacion

La primera vez que uses cualquier tool, el plugin:
1. Imprime una URL en la consola
2. Abris el link, autorizas con tu Google account
3. Te redirige a `http://127.0.0.1:<puerto>/oauth2callback`
4. El plugin captura el codigo y guarda `token.json` automaticamente

Despues no te vuelve a pedir autorizacion hasta que revoques el token o expire.

## Tools

| Tool | Descripcion |
|------|-------------|
| `gmail_list_recent` | Lista los ultimos N correos (filtros: no leídos, etiqueta) |
| `gmail_get_message` | Lee un correo completo (headers + body) |
| `gmail_search` | Busca con query de Gmail |
| `gmail_send` | Envia un correo nuevo |
| `gmail_reply` | Responde un correo existente |
| `gmail_modify` | Marca como leido, mueve, etiqueta |

## Scopes usados

- `gmail.readonly`
- `gmail.send`
- `gmail.modify`

## Estructura

```
gmail/
├── .minimax-plugin/plugin.json   # manifest V1
├── gmail.mcp.json                 # config MCP stdio
├── icon.png                       # icono categoria Productivity
├── package.json                   # metadata (sin deps - el bundle es standalone)
├── server.js                      # bundle compilado con esbuild
├── server.src.js                  # source editable
├── skills/gmail-triage/SKILL.md   # workflow de triage
└── README.md
```

## Re-bundlear el server (si editas server.src.js)

```bash
npm install esbuild
npx esbuild server.src.js --bundle --platform=node --target=node18 --format=cjs --outfile=server.js --minify
```

Despues borra `node_modules` para mantener el package < 64MB.

## Seguridad

- `credentials.json` y `token.json` dan acceso a tu Gmail. NO los commitees ni los compartas.
- Si los compromete, anda a https://myaccount.google.com/permissions y revoca la app.

## Licencia

MIT
