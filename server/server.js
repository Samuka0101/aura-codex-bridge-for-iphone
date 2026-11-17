import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.AURA_PORT || 8787);
const host = process.env.AURA_HOST || "127.0.0.1";
const accessCode = process.env.AURA_ACCESS_CODE || String(crypto.randomInt(100000, 1000000));
const iphoneIp = process.env.IPHONE_IP;
const sshKey = process.env.IPHONE_SSH_KEY;
const knownHosts = process.env.IPHONE_KNOWN_HOSTS;
const sessions = new Map();
const pending = new Map();
const schemaPath = path.join(here, "aura-response.schema.json");

function sshArgs(command) {
  if (!iphoneIp || !sshKey || !knownHosts) {
    throw new Error("Configure IPHONE_IP, IPHONE_SSH_KEY e IPHONE_KNOWN_HOSTS no computador.");
  }
  return ["-i", sshKey, "-o", `UserKnownHostsFile=${knownHosts}`, "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=7", `mobile@${iphoneIp}`, command];
}

async function ssh(command) {
  const { stdout, stderr } = await execFileAsync("ssh", sshArgs(command), { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return (stdout || stderr || "OK").trim();
}

function safeName(value) {
  if (!/^[A-Za-z0-9_.-]{1,160}$/.test(value)) throw new Error("Nome inválido.");
  return value;
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

async function execute(name, args) {
  if (name === "iphone_status") return ssh("printf 'Conectado\\n'; sw_vers 2>/dev/null || uname -a; uptime");
  if (name === "list_tweak_preferences") return ssh("find /var/mobile/Library/Preferences -maxdepth 1 -name '*.plist' -print 2>/dev/null | sed 's#.*/##;s#\\.plist$##' | sort | head -200");
  if (name === "read_tweak_preferences") {
    const domain = safeName(args.domain);
    return ssh(`plutil -p ${shellQuote(`/var/mobile/Library/Preferences/${domain}.plist`)} 2>/dev/null || defaults read ${shellQuote(domain)}`);
  }
  if (name === "set_tweak_preference") {
    const domain = safeName(args.domain), key = safeName(args.key);
    const flags = { string: "-string", bool: "-bool", int: "-int", float: "-float" };
    if (!flags[args.value_type]) throw new Error("Tipo inválido.");
    return ssh(`cp ${shellQuote(`/var/mobile/Library/Preferences/${domain}.plist`)} ${shellQuote(`/var/mobile/Library/Preferences/${domain}.plist.aura-backup`)} 2>/dev/null || true; defaults write ${shellQuote(domain)} ${shellQuote(key)} ${flags[args.value_type]} ${shellQuote(args.value)}; killall cfprefsd 2>/dev/null || true; printf 'Preferência alterada; backup .aura-backup criado.'`);
  }
  if (name === "respring") return ssh("sbreload 2>/dev/null || killall SpringBoard");
  if (name === "reboot_userspace") return ssh("launchctl reboot userspace");
  throw new Error("Ação não permitida.");
}

function mutating(name) { return ["set_tweak_preference", "respring", "reboot_userspace"].includes(name); }

const instructions = `Você é Aura, assistente de um iPhone com jailbreak rootless. Responda em português brasileiro informal, curto e claro. Você só escolhe uma ação estruturada; não execute comandos, não use terminal e não leia arquivos. Ações disponíveis: none, iphone_status, list_tweak_preferences, read_tweak_preferences, set_tweak_preference, respring, reboot_userspace. Para consultar algo, escolha a ação correspondente. Nunca invente domínio ou chave: primeiro liste ou leia. Alterações e reinícios serão confirmados pela interface. Não peça senhas, chaves privadas ou tokens. Preencha argumentos não usados com string vazia.`;

async function askCodex(history, extra = "") {
  const transcript = history.slice(-12).map(x => `${x.role === "user" ? "USUÁRIO" : "AURA"}: ${x.text}`).join("\n");
  const prompt = `${instructions}\n\nCONVERSA:\n${transcript}\n${extra ? `\nRESULTADO DA AÇÃO:\n${extra}` : ""}\n\nProduza agora a próxima resposta estruturada.`;
  const args = ["exec", "--ephemeral", "--sandbox", "read-only", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--output-schema", schemaPath, "--color", "never", prompt];
  try {
    const { stdout } = await execFileAsync("codex", args, { timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, cwd: here });
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Resposta inválida do Codex.");
    return JSON.parse(stdout.slice(start, end + 1));
  } catch (error) {
    const detail = `${error.stderr || ""} ${error.message || ""}`;
    if (/not logged in|login/i.test(detail)) throw new Error("O Codex não está conectado. Feche a Aura, execute 'codex login' no PC e abra novamente.");
    throw new Error(`Falha ao consultar o Codex: ${String(error.message || error).slice(0, 250)}`);
  }
}

async function processModel(sessionId, history, extra = "") {
  const decision = await askCodex(history, extra);
  const name = decision.action?.name || "none";
  const args = decision.action || {};
  if (name === "none") return { text: decision.reply || "Pronto." };
  if (mutating(name)) {
    const id = crypto.randomUUID();
    pending.set(id, { sessionId, name, args, history, created: Date.now() });
    return { text: `${decision.reply || "Entendi."}\n\nPosso executar: ${describe(name, args)}`, confirmation: { id, danger: name === "reboot_userspace" } };
  }
  let output;
  try { output = await execute(name, args); } catch (error) { output = `ERRO: ${error.message}`; }
  return processModel(sessionId, history, `${name}: ${output}`);
}

function describe(name, args) {
  if (name === "set_tweak_preference") return `alterar ${args.domain} → ${args.key} para ${args.value}`;
  if (name === "respring") return "reiniciar a interface (respring)";
  if (name === "reboot_userspace") return "reiniciar o userspace do iPhone";
  return name;
}

function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Aura-Code",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw new Error("Pedido grande demais."); }
  return JSON.parse(raw || "{}");
}

function authorized(req) { return req.headers["x-aura-code"] === accessCode; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://local");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Aura-Code",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "600"
      });
      return res.end();
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js" || url.pathname === "/style.css" || url.pathname === "/manifest.json")) {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/manifest+json" };
      const content = fs.readFileSync(path.join(here, "public", file));
      res.writeHead(200, { "Content-Type": `${types[path.extname(file)]}; charset=utf-8`, "Cache-Control": "no-store" }); return res.end(content);
    }
    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, engine: "codex-login" });
    if (!authorized(req)) return json(res, 401, { error: "Código incorreto." });
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const data = await body(req); const sessionId = String(data.sessionId || crypto.randomUUID());
      const history = sessions.get(sessionId) || [];
      history.push({ role: "user", text: String(data.message || "").slice(0, 4000) });
      const result = await processModel(sessionId, history);
      history.push({ role: "assistant", text: result.text });
      sessions.set(sessionId, history.slice(-20)); return json(res, 200, { ...result, sessionId });
    }
    if (req.method === "POST" && url.pathname === "/api/confirm") {
      const data = await body(req); const item = pending.get(String(data.id));
      if (!item || Date.now() - item.created > 5 * 60_000) return json(res, 410, { error: "Confirmação expirada." });
      pending.delete(String(data.id));
      if (!data.approve) return json(res, 200, { text: "Cancelado. Não alterei nada." });
      let output; try { output = await execute(item.name, item.args); } catch (error) { output = `ERRO: ${error.message}`; }
      const result = await processModel(item.sessionId, item.history, `${item.name}: ${output}`);
      item.history.push({ role: "assistant", text: result.text });
      sessions.set(item.sessionId, item.history.slice(-20)); return json(res, 200, result);
    }
    json(res, 404, { error: "Não encontrado." });
  } catch (error) { json(res, 500, { error: error.message }); }
});

server.listen(port, host, () => {
  console.log(`\nAURA PRONTA`);
  const addresses = host === "0.0.0.0"
    ? Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === "IPv4" && !x.internal).map(x => x.address)
    : [host];
  console.log("Abra um destes endereços:");
  for (const address of addresses) console.log(`  http://${address}:${port}`);
  console.log(`Código de acesso: ${accessCode}`);
  console.log("Motor: login do Codex (sem chave de API)");
});
