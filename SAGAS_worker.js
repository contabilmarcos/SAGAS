// SAGAS Worker v26 - estabilidade e performance sem travar o carregamento
// ===== utils.js =====
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function ok(data = {}, status = 200) {
  return json({ ok: true, ...data }, status);
}

function error(message, status = 400, code = "BAD_REQUEST", details) {
  return json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status);
}

class HttpError extends Error {
  constructor(status, message, code = "BAD_REQUEST", details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "JSON inválido.", "INVALID_JSON"); }
}

function uuid() { return crypto.randomUUID(); }

function required(value, name) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new HttpError(400, `Campo obrigatório: ${name}.`, "VALIDATION_ERROR");
  }
  return value;
}

function cleanText(value, max = 255) {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, max);
}

function bool01(value, fallback = 1) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function moneyToCents(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new HttpError(400, "Valor monetário inválido.", "VALIDATION_ERROR");
    return Math.round(value * 100);
  }
  const s = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s || !/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new HttpError(400, `Valor monetário inválido: ${value}`, "VALIDATION_ERROR");
  }
  return Math.round(Number(s) * 100);
}

function centsToMoney(cents) { return Number(cents || 0) / 100; }

function isoDate(value, field = "data") {
  required(value, field);
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new HttpError(400, `${field} deve estar no formato YYYY-MM-DD.`, "VALIDATION_ERROR");
  }
  return s;
}

function clientIp(request) { return request.headers.get("CF-Connecting-IP") || null; }
function requestId(request) { return request.headers.get("CF-Ray") || crypto.randomUUID(); }

function routeMatch(pathname, pattern) {
  const keys = [];
  const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, m => {
    keys.push(m.slice(1));
    return "([^/]+)";
  }) + "$");
  const match = pathname.match(regex);
  if (!match) return null;
  const params = {};
  keys.forEach((k, i) => params[k] = decodeURIComponent(match[i + 1]));
  return params;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "*").split(",").map(x => x.trim()).filter(Boolean);
  const allowOrigin = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0] || "");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Company-Id, X-Bootstrap-Secret",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ===== auth.js =====
const enc = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - s.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sha256Text(text) {
  return toBase64Url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

async function hashPassword(password, saltBytes = null, iterations = 100000) {
  if (typeof password !== "string" || password.length < 8) {
    throw new HttpError(400, "A senha deve ter pelo menos 8 caracteres.", "WEAK_PASSWORD");
  }
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return { hash: toBase64Url(bits), salt: toBase64Url(salt), iterations };
}

async function verifyPassword(password, storedHash, storedSalt, iterations) {
  const calc = await hashPassword(password, fromBase64Url(storedSalt), Number(iterations));
  const a = fromBase64Url(calc.hash), b = fromBase64Url(storedHash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function createSession(env, user, request) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Text(token);
  const hours = Math.max(1, Number(env.SESSION_HOURS || 12));
  const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
  await env.DB.prepare(`
    INSERT INTO auth_sessions (token_hash,user_id,expires_at,user_agent,ip_address)
    VALUES (?,?,?,?,?)
  `).bind(tokenHash, user.id, expiresAt, request.headers.get("User-Agent")?.slice(0,500) || null, clientIp(request)).run();
  return { token, expires_at: expiresAt };
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw new HttpError(401, "Autenticação necessária.", "UNAUTHORIZED");
  const raw = header.slice(7).trim();
  const tokenHash = await sha256Text(raw);
  const row = await env.DB.prepare(`
    SELECT s.token_hash,s.user_id,s.expires_at,s.revoked_at,u.name,u.email,u.active
    FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?
  `).bind(tokenHash).first();
  if (!row || row.revoked_at || !row.active || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, "Sessão inválida ou expirada.", "UNAUTHORIZED");
  }
  return { token_hash: tokenHash, user: { id: row.user_id, name: row.name, email: row.email } };
}

async function logout(auth, env) {
  await env.DB.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(auth.token_hash).run();
}

async function changePassword(env, request, auth, body) {
  const currentPassword = String(body.current_password || "");
  const newPassword = String(body.new_password || "");

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, "Informe a senha atual e a nova senha.", "VALIDATION_ERROR");
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, "A nova senha deve ser diferente da senha atual.", "VALIDATION_ERROR");
  }

  const user = await env.DB.prepare(`
    SELECT id,password_hash,password_salt,password_iterations
    FROM users
    WHERE id=? AND active=1
  `).bind(auth.user.id).first();

  if (!user) {
    throw new HttpError(404, "Usuário não encontrado.", "NOT_FOUND");
  }

  const valid = await verifyPassword(
    currentPassword,
    user.password_hash,
    user.password_salt,
    user.password_iterations
  );

  if (!valid) {
    throw new HttpError(401, "A senha atual está incorreta.", "INVALID_CURRENT_PASSWORD");
  }

  const pw = await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET password_hash=?, password_salt=?, password_iterations=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(pw.hash, pw.salt, pw.iterations, auth.user.id),

    env.DB.prepare(`
      UPDATE auth_sessions
      SET revoked_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL
    `).bind(auth.user.id, auth.token_hash)
  ]);

  await audit(env, {
    userId: auth.user.id,
    action: "CHANGE_PASSWORD",
    entity: "user",
    entityId: auth.user.id,
    request
  });

  return { message: "Senha alterada com sucesso." };
}


async function updateOwnProfile(env, request, auth, body) {
  const current=await env.DB.prepare(`
    SELECT id,name,email
    FROM users
    WHERE id=? AND active=1
  `).bind(auth.user.id).first();

  if (!current) throw new HttpError(404,"Usuário não encontrado.","NOT_FOUND");

  const name=cleanText(required(body.name===undefined?current.name:body.name,"name"),300);
  const email=cleanText(required(body.email===undefined?current.email:body.email,"email"),320).toLowerCase();

  const conflict=await env.DB.prepare(`
    SELECT id FROM users WHERE email=? AND id<>?
  `).bind(email,current.id).first();
  if (conflict) throw new HttpError(400,"Este e-mail já está sendo usado por outro usuário.","VALIDATION_ERROR");

  await env.DB.prepare(`
    UPDATE users
    SET name=?,email=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(name,email,current.id).run();

  const updated={id:current.id,name,email};

  await audit(env,{
    userId:auth.user.id,
    action:"UPDATE_PROFILE",
    entity:"user",
    entityId:current.id,
    before:{name:current.name,email:current.email},
    after:{name,email},
    request
  });

  return updated;
}

async function getCompanyUser(env, companyId, userId) {
  return await env.DB.prepare(`
    SELECT
      u.id,u.name,u.email,u.active,cm.status,cm.is_owner,u.last_login_at,
      (SELECT ur.role_id
         FROM user_roles ur
         JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND ur.company_id=cm.company_id
        ORDER BY r.system_role DESC,r.name
        LIMIT 1) AS role_id,
      (SELECT GROUP_CONCAT(r.name, ', ')
         FROM user_roles ur
         JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND ur.company_id=cm.company_id) AS role_names
    FROM company_memberships cm
    JOIN users u ON u.id=cm.user_id
    WHERE cm.company_id=? AND u.id=?
  `).bind(companyId,userId).first();
}

async function adminResetPassword(env, request, auth, companyId, userId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.user.manage");

  const target=await getCompanyUser(env,companyId,userId);
  if (!target) throw new HttpError(404,"Usuário não encontrado nesta empresa.","NOT_FOUND");

  if (userId===auth.user.id) {
    throw new HttpError(400,"Para alterar sua própria senha, use a opção Alterar senha.","VALIDATION_ERROR");
  }

  if (Number(target.is_owner)===1) {
    throw new HttpError(400,"A senha do proprietário não pode ser redefinida por outro usuário.","VALIDATION_ERROR");
  }

  const newPassword=String(required(body.new_password,"new_password"));
  const pw=await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET password_hash=?,password_salt=?,password_iterations=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(pw.hash,pw.salt,pw.iterations,userId),
    env.DB.prepare(`
      UPDATE auth_sessions
      SET revoked_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND revoked_at IS NULL
    `).bind(userId)
  ]);

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"RESET_PASSWORD",
    entity:"user",
    entityId:userId,
    request
  });

  return {message:"Senha temporária definida. As sessões anteriores do usuário foram encerradas."};
}

async function companyAccess(env, userId, companyId) {
  if (!companyId) throw new HttpError(400, "Informe X-Company-Id.", "COMPANY_REQUIRED");
  const row = await env.DB.prepare(`SELECT status,is_owner FROM company_memberships WHERE company_id=? AND user_id=?`).bind(companyId, userId).first();
  if (!row || row.status !== "ACTIVE") throw new HttpError(403, "Você não possui acesso a esta empresa.", "FORBIDDEN");
  return { company_id: companyId, is_owner: Number(row.is_owner) === 1 };
}

async function requirePermission(env, userId, companyId, code) {
  const membership = await companyAccess(env, userId, companyId);
  if (membership.is_owner) return;
  const row = await env.DB.prepare(`
    SELECT 1 AS allowed
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id=ur.role_id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=? AND ur.company_id=? AND p.code=? LIMIT 1
  `).bind(userId, companyId, code).first();
  if (!row) throw new HttpError(403, `Permissão necessária: ${code}`, "FORBIDDEN");
}

async function getEffectivePermissions(env, userId, companyId) {
  const membership = await companyAccess(env, userId, companyId);

  if (membership.is_owner) {
    const all = await env.DB.prepare(`
      SELECT code FROM permissions ORDER BY code
    `).all();
    return (all.results || []).map(x => x.code);
  }

  const result = await env.DB.prepare(`
    SELECT DISTINCT p.code
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ? AND ur.company_id = ?
    ORDER BY p.code
  `).bind(userId, companyId).all();

  return (result.results || []).map(x => x.code);
}


async function audit(env, { companyId=null, userId=null, action, entity, entityId=null, before=null, after=null, request=null }) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id,company_id,user_id,action,entity,entity_id,before_json,after_json,request_id,ip_address)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(uuid(), companyId, userId, action, entity, entityId,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    request ? requestId(request) : null,
    request ? clientIp(request) : null).run();
}

async function bootstrap(env, request, body) {
  if (!env.BOOTSTRAP_SECRET) throw new HttpError(500, "BOOTSTRAP_SECRET não configurado.", "SERVER_CONFIG");
  if (request.headers.get("X-Bootstrap-Secret") !== env.BOOTSTRAP_SECRET) throw new HttpError(403, "Chave de bootstrap inválida.", "FORBIDDEN");
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (Number(existing?.n || 0) > 0) throw new HttpError(409, "O bootstrap inicial já foi executado.", "BOOTSTRAP_ALREADY_DONE");

  const companyName = String(body.company_name || "").trim();
  const name = String(body.admin_name || "").trim();
  const email = String(body.admin_email || "").trim().toLowerCase();
  if (!companyName || !name || !email || !body.password) throw new HttpError(400, "Informe company_name, admin_name, admin_email e password.", "VALIDATION_ERROR");

  const companyId=uuid(), branchId=uuid(), userId=uuid(), roleId=uuid();
  const pw = await hashPassword(String(body.password));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO companies (id,code,legal_name,trade_name,tax_id) VALUES (?,?,?,?,?)`).bind(companyId, String(body.company_code || "001"), companyName, body.trade_name || null, body.tax_id || null),
    env.DB.prepare(`INSERT INTO branches (id,company_id,code,name) VALUES (?,?,'001',?)`).bind(branchId, companyId, body.branch_name || "Matriz"),
    env.DB.prepare(`INSERT INTO users (id,name,email,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?)`).bind(userId, name, email, pw.hash, pw.salt, pw.iterations),
    env.DB.prepare(`INSERT INTO company_memberships (company_id,user_id,status,is_owner) VALUES (?,?,'ACTIVE',1)`).bind(companyId, userId),
    env.DB.prepare(`INSERT INTO roles (id,company_id,code,name,description,system_role) VALUES (?,?,'ADMIN','Administrador','Acesso total à empresa',1)`).bind(roleId, companyId),
    env.DB.prepare(`INSERT INTO user_roles (company_id,user_id,role_id) VALUES (?,?,?)`).bind(companyId, userId, roleId),
    env.DB.prepare(`INSERT INTO role_permissions (role_id,permission_id) SELECT ?,id FROM permissions`).bind(roleId),
  ]);
  await audit(env, { companyId, userId, action:"BOOTSTRAP", entity:"company", entityId:companyId, after:{companyName,email}, request });
  return { user:{id:userId,name,email}, company:{id:companyId,code:String(body.company_code||"001"),legal_name:companyName}, branch:{id:branchId,code:"001",name:body.branch_name||"Matriz"}, ...(await createSession(env,{id:userId},request)) };
}

// ===== accounting.js =====
async function assertCompanyEntity(env, table, id, companyId) {
  const allowed = new Set(["accounts","cost_centers","history_templates","branches","accounting_periods","journal_batches"]);
  if (!allowed.has(table)) throw new Error("Tabela não permitida");
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).bind(id, companyId).first();
  if (!row) throw new HttpError(400, `Registro inválido em ${table}: ${id}`, "VALIDATION_ERROR");
  return row;
}

async function listSimple(env, companyId, table, columns) {
  const allowed = new Set(["branches","accounts","cost_centers","history_templates","accounting_periods","journal_batches"]);
  if (!allowed.has(table)) throw new Error("Tabela não permitida");
  const res = await env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE company_id=? ORDER BY 1 LIMIT 2000`).bind(companyId).all();
  return res.results || [];
}



const ACCOUNT_MASK_WIDTHS=[1,2,2,2,4];
const ACCOUNT_MASK_CUMULATIVE=[1,3,5,7,11];

function parseAccountCodeMask(value) {
  const raw=String(value??"").trim().replace(/\D/g,"");
  const levelIndex=ACCOUNT_MASK_CUMULATIVE.indexOf(raw.length);

  if (levelIndex<0) {
    throw new HttpError(
      400,
      "Código inválido. Use a máscara 1.01.01.01.0001. Você pode digitar somente os números; os pontos são automáticos.",
      "INVALID_ACCOUNT_MASK"
    );
  }

  let pos=0;
  const parts=[];
  for (let i=0;i<=levelIndex;i++) {
    const width=ACCOUNT_MASK_WIDTHS[i];
    parts.push(raw.slice(pos,pos+width));
    pos+=width;
  }

  const code=parts.join(".");
  const level=levelIndex+1;
  const analytic=level===ACCOUNT_MASK_WIDTHS.length ? 1 : 0;

  let parentCode=null;
  if (level>1) {
    parentCode=parts.slice(0,-1).join(".");
  }

  return {raw,code,level,analytic,parentCode};
}

async function resolveAccountParentFromMask(env, companyId, accountId, parsed, accountClass) {
  if (!parsed.parentCode) return null;

  const parent=await env.DB.prepare(`
    SELECT *
    FROM accounts
    WHERE company_id=? AND code=?
    LIMIT 1
  `).bind(companyId,parsed.parentCode).first();

  if (!parent) {
    throw new HttpError(
      400,
      `Cadastre primeiro a conta superior ${parsed.parentCode}.`,
      "MISSING_PARENT_ACCOUNT"
    );
  }

  await validateAccountHierarchy(env,companyId,accountId,parent.id,accountClass);
  return parent;
}

async function validateAccountHierarchy(env, companyId, accountId, parentId, accountClass) {
  if (!parentId) return null;

  if (accountId && parentId===accountId) {
    throw new HttpError(400,"Uma conta não pode ser superior dela mesma.","INVALID_ACCOUNT_HIERARCHY");
  }

  const parent=await assertCompanyEntity(env,"accounts",parentId,companyId);

  if (Number(parent.analytic)===1) {
    throw new HttpError(400,`A conta superior ${parent.code} é analítica. Somente contas sintéticas podem possuir contas filhas.`,"INVALID_ACCOUNT_HIERARCHY");
  }

  if (parent.account_class!==accountClass) {
    throw new HttpError(400,`A conta superior ${parent.code} possui natureza diferente. Conta superior e conta filha devem ter a mesma natureza.`,"INVALID_ACCOUNT_HIERARCHY");
  }

  if (accountId) {
    let cursor=parent;
    const visited=new Set();
    for (let depth=0; depth<200 && cursor; depth++) {
      if (cursor.id===accountId) {
        throw new HttpError(400,"A hierarquia criaria um ciclo entre as contas.","INVALID_ACCOUNT_HIERARCHY");
      }
      if (!cursor.parent_id) break;
      if (visited.has(cursor.id)) {
        throw new HttpError(400,"Foi detectada uma hierarquia circular no plano de contas.","INVALID_ACCOUNT_HIERARCHY");
      }
      visited.add(cursor.id);
      cursor=await assertCompanyEntity(env,"accounts",cursor.parent_id,companyId);
    }
  }

  return parent;
}

async function ensureAccountCanBeAnalytic(env, companyId, accountId) {
  if (!accountId) return;

  const child=await env.DB.prepare(`
    SELECT id,code,name
    FROM accounts
    WHERE company_id=? AND parent_id=?
    LIMIT 1
  `).bind(companyId,accountId).first();

  if (child) {
    throw new HttpError(400,`Esta conta possui conta filha (${child.code}). Uma conta com filhas deve permanecer sintética.`,"ACCOUNT_HAS_CHILDREN");
  }
}

async function ensureAccountCanBeSynthetic(env, companyId, accountId) {
  if (!accountId) return;

  const used=await env.DB.prepare(`
    SELECT jl.id
    FROM journal_lines jl
    WHERE jl.company_id=? AND jl.account_id=?
    LIMIT 1
  `).bind(companyId,accountId).first();

  if (used) {
    throw new HttpError(400,"Esta conta já possui lançamentos contábeis e não pode ser transformada em sintética.","ACCOUNT_HAS_ENTRIES");
  }
}

async function validatePostedEntryAccounts(env, companyId, entryId) {
  const invalid=await env.DB.prepare(`
    SELECT a.code,a.name,a.active,a.analytic
    FROM journal_lines jl
    JOIN accounts a ON a.id=jl.account_id
    WHERE jl.company_id=?
      AND jl.entry_id=?
      AND (a.active<>1 OR a.analytic<>1)
    LIMIT 1
  `).bind(companyId,entryId).first();

  if (invalid) {
    throw new HttpError(
      409,
      `A conta ${invalid.code} não está apta para contabilização. Somente contas analíticas e ativas podem receber lançamentos.`,
      "INVALID_ACCOUNT"
    );
  }
}


async function nextReducedAccountCode(env, companyId) {
  const row=await env.DB.prepare(`
    SELECT MAX(CAST(reduced_code AS INTEGER)) AS max_reduced
    FROM accounts
    WHERE company_id=?
      AND reduced_code IS NOT NULL
      AND TRIM(reduced_code)<>''
      AND reduced_code NOT GLOB '*[^0-9]*'
  `).bind(companyId).first();

  return String((Number(row?.max_reduced)||0)+1);
}

async function createAccount(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.account.manage");

  const side=String(required(body.normal_side,"normal_side")).toUpperCase();
  if (!["D","C"].includes(side)) throw new HttpError(400,"normal_side deve ser D ou C.","VALIDATION_ERROR");

  const accountClass=String(body.account_class||"OTHER").toUpperCase();
  const parsed=parseAccountCodeMask(required(body.code,"code"));
  const parent=await resolveAccountParentFromMask(env,companyId,null,parsed,accountClass);

  const duplicate=await env.DB.prepare(`
    SELECT id
    FROM accounts
    WHERE company_id=? AND code=?
    LIMIT 1
  `).bind(companyId,parsed.code).first();

  if (duplicate) {
    throw new HttpError(400,`A conta ${parsed.code} já existe.`,"DUPLICATE_ACCOUNT_CODE");
  }

  const reducedCode=await nextReducedAccountCode(env,companyId);
  const id=uuid();
  await env.DB.prepare(`
    INSERT INTO accounts
      (id,company_id,code,reduced_code,name,parent_id,account_class,normal_side,analytic,active)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    companyId,
    parsed.code,
    reducedCode,
    cleanText(required(body.name,"name"),300),
    parent?.id||null,
    accountClass,
    side,
    parsed.analytic,
    bool01(body.active,1)
  ).run();

  const row=await env.DB.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"account",entityId:id,after:row,request});
  return row;
}

async function updateAccount(env, request, auth, companyId, id, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.account.manage");

  const before=await assertCompanyEntity(env,"accounts",id,companyId);
  const parsed=parseAccountCodeMask(body.code ?? before.code);

  const next={
    code:parsed.code,
    reduced_code:before.reduced_code ? String(before.reduced_code) : await nextReducedAccountCode(env,companyId),
    name:cleanText(body.name ?? before.name,300),
    account_class:String(body.account_class ?? before.account_class).toUpperCase(),
    normal_side:String(body.normal_side ?? before.normal_side).toUpperCase(),
    analytic:parsed.analytic,
    active:bool01(body.active,before.active)
  };

  if (!["D","C"].includes(next.normal_side)) {
    throw new HttpError(400,"normal_side deve ser D ou C.","VALIDATION_ERROR");
  }

  const parent=await resolveAccountParentFromMask(env,companyId,id,parsed,next.account_class);
  next.parent_id=parent?.id||null;

  const duplicate=await env.DB.prepare(`
    SELECT id
    FROM accounts
    WHERE company_id=? AND code=? AND id<>?
    LIMIT 1
  `).bind(companyId,next.code,id).first();

  if (duplicate) {
    throw new HttpError(400,`A conta ${next.code} já existe.`,"DUPLICATE_ACCOUNT_CODE");
  }

  const child=await env.DB.prepare(`
    SELECT id,code,name
    FROM accounts
    WHERE company_id=? AND parent_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (child && next.analytic===1) {
    throw new HttpError(
      400,
      `Esta conta possui conta filha (${child.code}) e deve permanecer sintética.`,
      "ACCOUNT_HAS_CHILDREN"
    );
  }

  if (child && next.code!==before.code) {
    throw new HttpError(
      400,
      "Uma conta que possui contas filhas não pode ter o código alterado. Ajuste primeiro a estrutura abaixo dela.",
      "ACCOUNT_CODE_HAS_CHILDREN"
    );
  }

  if (Number(before.analytic)===1 && next.analytic===0) {
    await ensureAccountCanBeSynthetic(env,companyId,id);
  }

  if (before.account_class!==next.account_class) {
    const incompatibleChild=await env.DB.prepare(`
      SELECT code,name
      FROM accounts
      WHERE company_id=? AND parent_id=? AND account_class<>?
      LIMIT 1
    `).bind(companyId,id,next.account_class).first();

    if (incompatibleChild) {
      throw new HttpError(
        400,
        `Não é possível alterar a natureza desta conta enquanto existir a conta filha ${incompatibleChild.code} com natureza diferente.`,
        "INVALID_ACCOUNT_HIERARCHY"
      );
    }
  }

  await env.DB.prepare(`
    UPDATE accounts
    SET code=?,reduced_code=?,name=?,parent_id=?,account_class=?,normal_side=?,analytic=?,active=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).bind(
    next.code,next.reduced_code,next.name,next.parent_id,next.account_class,next.normal_side,
    next.analytic,next.active,id,companyId
  ).run();

  const after=await env.DB.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"UPDATE",entity:"account",entityId:id,before,after,request});
  return after;
}

async function deleteAccount(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.account.manage");

  const account=await assertCompanyEntity(env,"accounts",id,companyId);

  const child=await env.DB.prepare(`
    SELECT id,code,name
    FROM accounts
    WHERE company_id=? AND parent_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (child) {
    throw new HttpError(
      409,
      `A conta ${account.code} possui contas filhas. Exclua primeiro as contas abaixo dela.`,
      "ACCOUNT_HAS_CHILDREN"
    );
  }

  const movement=await env.DB.prepare(`
    SELECT id
    FROM journal_lines
    WHERE company_id=? AND account_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (movement) {
    throw new HttpError(
      409,
      `A conta ${account.code} já foi utilizada em lançamentos contábeis e não pode ser excluída. Inative a conta.`,
      "ACCOUNT_HAS_ENTRIES"
    );
  }

  await env.DB.prepare(`
    DELETE FROM accounts
    WHERE id=? AND company_id=?
  `).bind(id,companyId).run();

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"DELETE",
    entity:"account",
    entityId:id,
    before:account,
    request
  });

  return {deleted:true,id};
}



const COST_CENTER_MASK_WIDTHS=[2,2,3];
const COST_CENTER_MASK_CUMULATIVE=[2,4,7];

function parseCostCenterCodeMask(value) {
  const raw=String(value??"").trim().replace(/\D/g,"");
  const levelIndex=COST_CENTER_MASK_CUMULATIVE.indexOf(raw.length);
  if (levelIndex<0) throw new HttpError(400,"Código inválido. Use a máscara 01.01.001. Você pode digitar somente os números; os pontos são automáticos.","INVALID_COST_CENTER_MASK");
  let pos=0; const parts=[];
  for (let i=0;i<=levelIndex;i++) { const width=COST_CENTER_MASK_WIDTHS[i]; parts.push(raw.slice(pos,pos+width)); pos+=width; }
  const code=parts.join("."); const level=levelIndex+1;
  return {raw,code,level,analytic:level===3,parentCode:level>1?parts.slice(0,-1).join("."):null};
}

async function resolveCostCenterParentFromMask(env, companyId, currentId, parsed) {
  if (!parsed.parentCode) return null;
  const parent=await env.DB.prepare(`SELECT * FROM cost_centers WHERE company_id=? AND code=? LIMIT 1`).bind(companyId,parsed.parentCode).first();
  if (!parent) throw new HttpError(400,`Cadastre primeiro o centro de custo superior ${parsed.parentCode}.`,"MISSING_PARENT_COST_CENTER");
  const parentMask=parseCostCenterCodeMask(parent.code);
  if (parentMask.analytic) throw new HttpError(400,`O centro de custo ${parent.code} é analítico e não pode possuir centros abaixo dele.`,"INVALID_COST_CENTER_HIERARCHY");
  if (currentId && parent.id===currentId) throw new HttpError(400,"Um centro de custo não pode ser superior dele mesmo.","INVALID_COST_CENTER_HIERARCHY");
  return parent;
}

async function costCenterUsage(env, companyId, id) {
  const line=await env.DB.prepare(`SELECT id FROM journal_lines WHERE company_id=? AND cost_center_id=? LIMIT 1`).bind(companyId,id).first();
  const allocation=await env.DB.prepare(`SELECT id FROM allocation_lines WHERE company_id=? AND cost_center_id=? LIMIT 1`).bind(companyId,id).first();
  return !!(line||allocation);
}

async function validateCostCenterForEntry(env, companyId, id) {
  const cc=await assertCompanyEntity(env,"cost_centers",id,companyId);
  const parsed=parseCostCenterCodeMask(cc.code);
  if (!cc.active) throw new HttpError(400,`O centro de custo ${cc.code} está inativo.`,"INVALID_COST_CENTER");
  if (!parsed.analytic) throw new HttpError(400,`O centro de custo ${cc.code} é sintético. Somente centros analíticos no padrão 01.01.001 podem receber lançamentos e rateios.`,"INVALID_COST_CENTER");
  return cc;
}

async function createCostCenter(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.cost_center.manage");
  const parsed=parseCostCenterCodeMask(required(body.code,"code"));
  const parent=await resolveCostCenterParentFromMask(env,companyId,null,parsed);
  const duplicate=await env.DB.prepare(`SELECT id FROM cost_centers WHERE company_id=? AND code=? LIMIT 1`).bind(companyId,parsed.code).first();
  if (duplicate) throw new HttpError(400,`O centro de custo ${parsed.code} já existe.`,"DUPLICATE_COST_CENTER");
  const id=uuid();
  await env.DB.prepare(`INSERT INTO cost_centers (id,company_id,code,name,parent_id,active) VALUES (?,?,?,?,?,?)`).bind(id,companyId,parsed.code,cleanText(required(body.name,"name"),300),parent?.id||null,bool01(body.active,1)).run();
  const row=await env.DB.prepare("SELECT * FROM cost_centers WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"cost_center",entityId:id,after:row,request});
  return row;
}

async function updateCostCenter(env, request, auth, companyId, id, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.cost_center.manage");
  const before=await assertCompanyEntity(env,"cost_centers",id,companyId);
  const parsed=parseCostCenterCodeMask(body.code ?? before.code);
  const parent=await resolveCostCenterParentFromMask(env,companyId,id,parsed);
  const duplicate=await env.DB.prepare(`SELECT id FROM cost_centers WHERE company_id=? AND code=? AND id<>? LIMIT 1`).bind(companyId,parsed.code,id).first();
  if (duplicate) throw new HttpError(400,`O centro de custo ${parsed.code} já existe.`,"DUPLICATE_COST_CENTER");
  const child=await env.DB.prepare(`SELECT id,code,name FROM cost_centers WHERE company_id=? AND parent_id=? LIMIT 1`).bind(companyId,id).first();
  if (child && parsed.analytic) throw new HttpError(409,`Este centro possui o centro filho ${child.code} e deve permanecer sintético.`,"COST_CENTER_HAS_CHILDREN");
  if (child && parsed.code!==before.code) throw new HttpError(409,"Um centro de custo que possui centros abaixo dele não pode ter o código alterado.","COST_CENTER_CODE_HAS_CHILDREN");
  if (parsed.code!==before.code && await costCenterUsage(env,companyId,id)) throw new HttpError(409,"Este centro de custo já foi utilizado em lançamentos ou rateios. O código não pode mais ser alterado.","COST_CENTER_IN_USE");
  await env.DB.prepare(`UPDATE cost_centers SET code=?,name=?,parent_id=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(parsed.code,cleanText(body.name ?? before.name,300),parent?.id||null,bool01(body.active,before.active),id,companyId).run();
  const after=await env.DB.prepare("SELECT * FROM cost_centers WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"UPDATE",entity:"cost_center",entityId:id,before,after,request});
  return after;
}

async function deleteCostCenter(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.cost_center.manage");
  const cc=await assertCompanyEntity(env,"cost_centers",id,companyId);
  const child=await env.DB.prepare(`SELECT id,code,name FROM cost_centers WHERE company_id=? AND parent_id=? LIMIT 1`).bind(companyId,id).first();
  if (child) throw new HttpError(409,`O centro de custo ${cc.code} possui centros abaixo dele. Exclua primeiro os centros filhos.`,"COST_CENTER_HAS_CHILDREN");
  if (await costCenterUsage(env,companyId,id)) throw new HttpError(409,`O centro de custo ${cc.code} já foi utilizado em lançamentos ou rateios e não pode ser excluído. Inative-o.`,"COST_CENTER_IN_USE");
  await env.DB.prepare(`DELETE FROM cost_centers WHERE id=? AND company_id=?`).bind(id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:"DELETE",entity:"cost_center",entityId:id,before:cc,request});
  return {deleted:true,id};
}


async function nextHistoryCode(env, companyId) {
  const row=await env.DB.prepare(`
    SELECT MAX(CAST(code AS INTEGER)) AS max_code
    FROM history_templates
    WHERE company_id=?
      AND code IS NOT NULL
      AND TRIM(code)<>''
      AND code NOT GLOB '*[^0-9]*'
  `).bind(companyId).first();

  const next=(Number(row?.max_code)||0)+1;
  return String(next).padStart(3,"0");
}

async function historyInUse(env, companyId, id) {
  const row=await env.DB.prepare(`
    SELECT id
    FROM journal_lines
    WHERE company_id=? AND history_template_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  return !!row;
}

async function createHistory(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.history.manage");

  const code=await nextHistoryCode(env,companyId);
  const id=uuid();

  await env.DB.prepare(`
    INSERT INTO history_templates
      (id,company_id,code,description,complement_required,active)
    VALUES (?,?,?,?,?,?)
  `).bind(
    id,
    companyId,
    code,
    cleanText(required(body.description,"description"),1000),
    bool01(body.complement_required,0),
    bool01(body.active,1)
  ).run();

  const row=await env.DB.prepare("SELECT * FROM history_templates WHERE id=?").bind(id).first();

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"CREATE",
    entity:"history_template",
    entityId:id,
    after:row,
    request
  });

  return row;
}

async function updateHistory(env, request, auth, companyId, id, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.history.manage");

  const before=await assertCompanyEntity(env,"history_templates",id,companyId);

  const code=before.code && String(before.code).trim()
    ? String(before.code)
    : await nextHistoryCode(env,companyId);

  await env.DB.prepare(`
    UPDATE history_templates
    SET code=?,
        description=?,
        complement_required=?,
        active=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).bind(
    code,
    cleanText(body.description ?? before.description,1000),
    bool01(body.complement_required,before.complement_required),
    bool01(body.active,before.active),
    id,
    companyId
  ).run();

  const after=await env.DB.prepare("SELECT * FROM history_templates WHERE id=?").bind(id).first();

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"UPDATE",
    entity:"history_template",
    entityId:id,
    before,
    after,
    request
  });

  return after;
}

async function deleteHistory(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.history.manage");

  const history=await assertCompanyEntity(env,"history_templates",id,companyId);

  if (await historyInUse(env,companyId,id)) {
    throw new HttpError(
      409,
      `O histórico ${history.code} já foi utilizado em lançamento contábil e não pode ser excluído. Inative-o.`,
      "HISTORY_IN_USE"
    );
  }

  await env.DB.prepare(`
    DELETE FROM history_templates
    WHERE id=? AND company_id=?
  `).bind(id,companyId).run();

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"DELETE",
    entity:"history_template",
    entityId:id,
    before:history,
    request
  });

  return {deleted:true,id};
}


async function ensureAccountingPeriodSchema(env) {
  const info=await env.DB.prepare(`PRAGMA table_info(accounting_periods)`).all();
  const columns=new Set((info.results||[]).map(x=>x.name));

  if (!columns.has("closed_until")) {
    await env.DB.prepare(`ALTER TABLE accounting_periods ADD COLUMN closed_until TEXT`).run();
  }
}

function automaticPeriodCode(start, end) {
  const sy=start.slice(0,4);
  const ey=end.slice(0,4);

  if (sy===ey && start===`${sy}-01-01` && end===`${sy}-12-31`) return sy;
  return `${start.replaceAll("-","")}-${end.replaceAll("-","")}`;
}

function normalizedClosedUntil(value, start, end) {
  if (value===undefined || value===null || String(value).trim()==="") return null;

  const closed=isoDate(value,"closed_until");
  if (closed<start || closed>end) {
    throw new HttpError(400,"A data 'Fechado até' deve estar dentro do período contábil.","VALIDATION_ERROR");
  }
  return closed;
}

function periodStatusFromClosing(end, closedUntil) {
  return closedUntil && closedUntil>=end ? "CLOSED" : "OPEN";
}

async function validateNoPeriodOverlap(env, companyId, start, end, ignoreId=null) {
  const overlap=ignoreId
    ? await env.DB.prepare(`
        SELECT id,code,start_date,end_date
        FROM accounting_periods
        WHERE company_id=?
          AND id<>?
          AND NOT (end_date<? OR start_date>?)
        LIMIT 1
      `).bind(companyId,ignoreId,start,end).first()
    : await env.DB.prepare(`
        SELECT id,code,start_date,end_date
        FROM accounting_periods
        WHERE company_id=?
          AND NOT (end_date<? OR start_date>?)
        LIMIT 1
      `).bind(companyId,start,end).first();

  if (overlap) {
    throw new HttpError(
      409,
      `Já existe o período ${overlap.code} entre ${overlap.start_date} e ${overlap.end_date}. Os períodos não podem se sobrepor.`,
      "PERIOD_OVERLAP"
    );
  }
}

async function validatePeriodClosingDrafts(env, companyId, periodId, newClosedUntil, previousClosedUntil=null) {
  if (!newClosedUntil) return;
  if (previousClosedUntil && newClosedUntil<=previousClosedUntil) return;

  const draft=await env.DB.prepare(`
    SELECT je.id,je.entry_date,je.document_number
    FROM journal_entries je
    JOIN journal_batches jb ON jb.id=je.batch_id
    WHERE je.company_id=?
      AND jb.period_id=?
      AND je.status='DRAFT'
      AND je.entry_date<=?
      AND (? IS NULL OR je.entry_date>?)
    ORDER BY je.entry_date
    LIMIT 1
  `).bind(companyId,periodId,newClosedUntil,previousClosedUntil,previousClosedUntil).first();

  if (draft) {
    throw new HttpError(
      409,
      `Existe lançamento em rascunho na data ${draft.entry_date}. Contabilize ou ajuste os rascunhos antes de fechar até ${newClosedUntil}.`,
      "PERIOD_HAS_DRAFTS"
    );
  }
}

function assertDateOpenInPeriod(period, date) {
  if (period.status==="LOCKED") {
    throw new HttpError(409,"O período contábil está bloqueado.","PERIOD_CLOSED");
  }

  if (period.status==="CLOSED" && !period.closed_until) {
    throw new HttpError(409,"O período contábil está fechado.","PERIOD_CLOSED");
  }

  if (period.closed_until && date<=period.closed_until) {
    throw new HttpError(
      409,
      `A contabilidade está fechada até ${period.closed_until}. A data ${date} não pode ser utilizada.`,
      "DATE_CLOSED"
    );
  }

  if (period.status==="CLOSED" && period.closed_until && period.closed_until>=period.end_date) {
    throw new HttpError(409,"O período contábil está totalmente fechado.","PERIOD_CLOSED");
  }
}

async function createPeriod(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.period.manage");
  await ensureAccountingPeriodSchema(env);

  const start=isoDate(body.start_date,"start_date");
  const end=isoDate(body.end_date,"end_date");

  if (start>end) throw new HttpError(400,"A data inicial não pode ser posterior à data final.","VALIDATION_ERROR");

  await validateNoPeriodOverlap(env,companyId,start,end);

  const closedUntil=normalizedClosedUntil(body.closed_until,start,end);
  const code=automaticPeriodCode(start,end);
  const status=periodStatusFromClosing(end,closedUntil);

  const duplicate=await env.DB.prepare(`
    SELECT id FROM accounting_periods
    WHERE company_id=? AND code=?
    LIMIT 1
  `).bind(companyId,code).first();

  if (duplicate) throw new HttpError(409,`Já existe um período com o código ${code}.`,"DUPLICATE_PERIOD");

  const id=uuid();

  await env.DB.prepare(`
    INSERT INTO accounting_periods
      (id,company_id,code,start_date,end_date,status,closed_until)
    VALUES (?,?,?,?,?,?,?)
  `).bind(id,companyId,code,start,end,status,closedUntil).run();

  const row=await env.DB.prepare("SELECT * FROM accounting_periods WHERE id=?").bind(id).first();

  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"accounting_period",entityId:id,after:row,request});
  return row;
}

async function updatePeriod(env, request, auth, companyId, id, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.period.manage");
  await ensureAccountingPeriodSchema(env);

  const before=await assertCompanyEntity(env,"accounting_periods",id,companyId);

  const start=isoDate(body.start_date ?? before.start_date,"start_date");
  const end=isoDate(body.end_date ?? before.end_date,"end_date");

  if (start>end) throw new HttpError(400,"A data inicial não pode ser posterior à data final.","VALIDATION_ERROR");

  const hasBatch=await env.DB.prepare(`
    SELECT id
    FROM journal_batches
    WHERE company_id=? AND period_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (hasBatch && (start!==before.start_date || end!==before.end_date)) {
    throw new HttpError(
      409,
      "Este período já possui lote contábil. As datas inicial e final não podem mais ser alteradas.",
      "PERIOD_HAS_BATCHES"
    );
  }

  await validateNoPeriodOverlap(env,companyId,start,end,id);

  const closedInput=body.closed_until===undefined ? before.closed_until : body.closed_until;
  const closedUntil=normalizedClosedUntil(closedInput,start,end);

  await validatePeriodClosingDrafts(env,companyId,id,closedUntil,before.closed_until||null);

  const code=automaticPeriodCode(start,end);
  const status=before.status==="LOCKED" ? "LOCKED" : periodStatusFromClosing(end,closedUntil);

  const duplicate=await env.DB.prepare(`
    SELECT id FROM accounting_periods
    WHERE company_id=? AND code=? AND id<>?
    LIMIT 1
  `).bind(companyId,code,id).first();

  if (duplicate) throw new HttpError(409,`Já existe um período com o código ${code}.`,"DUPLICATE_PERIOD");

  await env.DB.prepare(`
    UPDATE accounting_periods
    SET code=?,start_date=?,end_date=?,status=?,closed_until=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).bind(code,start,end,status,closedUntil,id,companyId).run();

  const after=await env.DB.prepare("SELECT * FROM accounting_periods WHERE id=?").bind(id).first();

  await audit(env,{companyId,userId:auth.user.id,action:"UPDATE",entity:"accounting_period",entityId:id,before,after,request});
  return after;
}

async function deletePeriod(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.period.manage");
  await ensureAccountingPeriodSchema(env);

  const period=await assertCompanyEntity(env,"accounting_periods",id,companyId);

  const batch=await env.DB.prepare(`
    SELECT id,code
    FROM journal_batches
    WHERE company_id=? AND period_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (batch) {
    throw new HttpError(
      409,
      `O período ${period.code} possui lote contábil e não pode ser excluído.`,
      "PERIOD_HAS_BATCHES"
    );
  }

  await env.DB.prepare(`DELETE FROM accounting_periods WHERE id=? AND company_id=?`).bind(id,companyId).run();

  await audit(env,{companyId,userId:auth.user.id,action:"DELETE",entity:"accounting_period",entityId:id,before:period,request});
  return {deleted:true,id};
}


async function ensureBatchIntegrationSchema(env) {
  const batchInfo=await env.DB.prepare(`PRAGMA table_info(journal_batches)`).all();
  const batchCols=new Set((batchInfo.results||[]).map(x=>x.name));

  if (!batchCols.has("cover_mode")) {
    await env.DB.prepare(`ALTER TABLE journal_batches ADD COLUMN cover_mode TEXT NOT NULL DEFAULT 'AUTO'`).run();
  }
  if (!batchCols.has("cover_amount_cents")) {
    await env.DB.prepare(`ALTER TABLE journal_batches ADD COLUMN cover_amount_cents INTEGER`).run();
  }
  if (!batchCols.has("locked_by")) {
    await env.DB.prepare(`ALTER TABLE journal_batches ADD COLUMN locked_by TEXT`).run();
  }
  if (!batchCols.has("locked_at")) {
    await env.DB.prepare(`ALTER TABLE journal_batches ADD COLUMN locked_at TEXT`).run();
  }

  const entryInfo=await env.DB.prepare(`PRAGMA table_info(journal_entries)`).all();
  const entryCols=new Set((entryInfo.results||[]).map(x=>x.name));

  if (!entryCols.has("official_status")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN official_status TEXT NOT NULL DEFAULT 'PENDING'`).run();
  }
  if (!entryCols.has("integrated_by")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN integrated_by TEXT`).run();
  }
  if (!entryCols.has("integrated_at")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN integrated_at TEXT`).run();
  }
  if (!entryCols.has("integration_id")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN integration_id TEXT`).run();
  }
  if (!entryCols.has("unintegrated_by")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN unintegrated_by TEXT`).run();
  }
  if (!entryCols.has("unintegrated_at")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN unintegrated_at TEXT`).run();
  }
}

function nextIsoDate(value) {
  const d=new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

async function nextBatchCode(env, companyId) {
  const row=await env.DB.prepare(`
    SELECT MAX(CAST(code AS INTEGER)) AS max_code
    FROM journal_batches
    WHERE company_id=?
      AND code<>'0'
      AND code NOT GLOB '*[^0-9]*'
  `).bind(companyId).first();

  return String((Number(row?.max_code)||0)+1);
}

async function batchEntrySummary(env, companyId, batchId) {
  await ensureBatchIntegrationSchema(env);

  const row=await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_entries,
      SUM(CASE WHEN status='DRAFT' THEN 1 ELSE 0 END) AS draft_entries,
      SUM(CASE WHEN status='POSTED' THEN 1 ELSE 0 END) AS posted_entries,
      SUM(CASE WHEN status='VOID' THEN 1 ELSE 0 END) AS void_entries,
      SUM(CASE WHEN official_status='INTEGRATED' THEN 1 ELSE 0 END) AS integrated_entries,
      SUM(CASE WHEN status='POSTED' AND official_status<>'INTEGRATED' THEN 1 ELSE 0 END) AS pending_entries,
      COALESCE(SUM(CASE WHEN status<>'VOID' THEN total_debit_cents ELSE 0 END),0) AS total_debit_cents,
      MIN(CASE WHEN status<>'VOID' THEN entry_date END) AS min_entry_date,
      MAX(CASE WHEN status<>'VOID' THEN entry_date END) AS max_entry_date
    FROM journal_entries
    WHERE company_id=? AND batch_id=?
  `).bind(companyId,batchId).first();

  return {
    total_entries:Number(row?.total_entries||0),
    draft_entries:Number(row?.draft_entries||0),
    posted_entries:Number(row?.posted_entries||0),
    void_entries:Number(row?.void_entries||0),
    integrated_entries:Number(row?.integrated_entries||0),
    pending_entries:Number(row?.pending_entries||0),
    total_debit_cents:Number(row?.total_debit_cents||0),
    total_debit:centsToMoney(Number(row?.total_debit_cents||0)),
    min_entry_date:row?.min_entry_date||null,
    max_entry_date:row?.max_entry_date||null
  };
}

async function listBatchesDetailed(env, companyId) {
  await ensureBatchIntegrationSchema(env);

  const res=await env.DB.prepare(`
    SELECT
      b.id,b.period_id,b.code,b.description,b.start_date,b.end_date,b.status,b.cover_mode,b.cover_amount_cents,
      b.created_at,b.locked_at,p.code AS period_code,p.closed_until,
      COUNT(e.id) AS total_entries,
      SUM(CASE WHEN e.status='DRAFT' THEN 1 ELSE 0 END) AS draft_entries,
      SUM(CASE WHEN e.status='POSTED' AND e.official_status<>'INTEGRATED' THEN 1 ELSE 0 END) AS pending_entries,
      SUM(CASE WHEN e.official_status='INTEGRATED' THEN 1 ELSE 0 END) AS integrated_entries
    FROM journal_batches b
    JOIN accounting_periods p ON p.id=b.period_id
    LEFT JOIN journal_entries e ON e.batch_id=b.id AND e.company_id=b.company_id
    WHERE b.company_id=?
    GROUP BY b.id
    ORDER BY
      CASE WHEN b.code NOT GLOB '*[^0-9]*' THEN CAST(b.code AS INTEGER) ELSE 999999999 END,
      b.code
  `).bind(companyId).all();

  const official=await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_entries,
      COALESCE(SUM(total_debit_cents),0) AS total_debit_cents,
      MIN(entry_date) AS start_date,
      MAX(entry_date) AS end_date
    FROM journal_entries
    WHERE company_id=?
      AND status='POSTED'
      AND official_status='INTEGRATED'
  `).bind(companyId).first();

  return {
    batches:(res.results||[]).map(x=>({
      ...x,
      cover_amount:x.cover_amount_cents==null?null:centsToMoney(x.cover_amount_cents),
      total_entries:Number(x.total_entries||0),
      draft_entries:Number(x.draft_entries||0),
      pending_entries:Number(x.pending_entries||0),
      integrated_entries:Number(x.integrated_entries||0)
    })),
    official:{
      code:"0",
      description:"LOTE OFICIAL",
      status:"OFFICIAL",
      total_entries:Number(official?.total_entries||0),
      total_debit_cents:Number(official?.total_debit_cents||0),
      total_debit:centsToMoney(Number(official?.total_debit_cents||0)),
      start_date:official?.start_date||null,
      end_date:official?.end_date||null
    }
  };
}

async function getBatchDetails(env, companyId, id) {
  await ensureBatchIntegrationSchema(env);

  const batch=await env.DB.prepare(`
    SELECT b.*,p.code AS period_code,p.start_date AS period_start_date,p.end_date AS period_end_date,p.closed_until
    FROM journal_batches b
    JOIN accounting_periods p ON p.id=b.period_id
    WHERE b.id=? AND b.company_id=?
  `).bind(id,companyId).first();

  if (!batch) throw new HttpError(404,"Lote não encontrado.","NOT_FOUND");

  const entries=await env.DB.prepare(`
    SELECT
      id,entry_date,document_number,description,status,official_status,
      total_debit_cents,total_credit_cents,integrated_at,integration_id
    FROM journal_entries
    WHERE company_id=? AND batch_id=?
    ORDER BY entry_date,created_at
  `).bind(companyId,id).all();

  return {
    ...batch,
    cover_amount:batch.cover_amount_cents==null?null:centsToMoney(batch.cover_amount_cents),
    summary:await batchEntrySummary(env,companyId,id),
    entries:(entries.results||[]).map(x=>({
      ...x,
      total_debit:centsToMoney(x.total_debit_cents),
      total_credit:centsToMoney(x.total_credit_cents)
    }))
  };
}

async function validateManualCover(env, companyId, batch) {
  if (batch.cover_mode!=="MANUAL") return;

  const summary=await batchEntrySummary(env,companyId,batch.id);

  if (summary.draft_entries>0) {
    throw new HttpError(
      409,
      "O lote possui lançamentos em rascunho. Contabilize ou ajuste os rascunhos antes de bloquear.",
      "BATCH_HAS_DRAFTS"
    );
  }

  if (batch.cover_amount_cents!=null && summary.total_debit_cents!==Number(batch.cover_amount_cents)) {
    throw new HttpError(
      409,
      `O valor da capa é ${centsToMoney(batch.cover_amount_cents).toFixed(2)}, mas o lote totaliza ${centsToMoney(summary.total_debit_cents).toFixed(2)}.`,
      "BATCH_COVER_MISMATCH"
    );
  }
}

async function createBatch(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureAccountingPeriodSchema(env);
  await ensureBatchIntegrationSchema(env);

  const period=await assertCompanyEntity(env,"accounting_periods",required(body.period_id,"period_id"),companyId);

  if (period.status==="LOCKED" || (period.status==="CLOSED" && (!period.closed_until || period.closed_until>=period.end_date))) {
    throw new HttpError(409,"O período contábil está totalmente fechado.","PERIOD_CLOSED");
  }

  const coverMode=body.cover_mode==="MANUAL" || body.manual_cover===true ? "MANUAL" : "AUTO";

  let suggestedStart=period.start_date;
  if (period.closed_until && period.closed_until>=period.start_date) {
    suggestedStart=nextIsoDate(period.closed_until);
  }

  let start=suggestedStart;
  let end=period.end_date;
  let coverAmountCents=null;

  if (coverMode==="MANUAL") {
    start=isoDate(required(body.start_date,"start_date"),"start_date");
    end=isoDate(required(body.end_date,"end_date"),"end_date");
    coverAmountCents=moneyToCents(required(body.cover_amount,"cover_amount"));

    if (coverAmountCents<=0) {
      throw new HttpError(400,"O valor da capa deve ser maior que zero.","VALIDATION_ERROR");
    }
  }

  if (start<period.start_date || end>period.end_date || start>end) {
    throw new HttpError(400,"As datas do lote devem estar dentro do período contábil.","VALIDATION_ERROR");
  }

  if (period.closed_until && start<=period.closed_until) {
    throw new HttpError(
      409,
      `O período está fechado até ${period.closed_until}. O lote deve começar após essa data.`,
      "DATE_CLOSED"
    );
  }

  const code=await nextBatchCode(env,companyId);
  const id=uuid();

  await env.DB.prepare(`
    INSERT INTO journal_batches
      (id,company_id,period_id,code,description,start_date,end_date,status,created_by,cover_mode,cover_amount_cents)
    VALUES (?,?,?,?,?,?,?,'OPEN',?,?,?)
  `).bind(
    id,
    companyId,
    period.id,
    code,
    cleanText(required(body.description,"description"),500),
    start,
    end,
    auth.user.id,
    coverMode,
    coverAmountCents
  ).run();

  const row=await env.DB.prepare("SELECT * FROM journal_batches WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"journal_batch",entityId:id,after:row,request});
  return row;
}

async function updateBatch(env, request, auth, companyId, id, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureAccountingPeriodSchema(env);
  await ensureBatchIntegrationSchema(env);

  const before=await assertCompanyEntity(env,"journal_batches",id,companyId);

  if (before.status==="LOCKED") {
    throw new HttpError(409,"Desbloqueie o lote antes de editá-lo.","BATCH_LOCKED");
  }

  const period=await assertCompanyEntity(env,"accounting_periods",before.period_id,companyId);
  const coverMode=body.cover_mode===undefined ? (before.cover_mode||"AUTO") : (body.cover_mode==="MANUAL"?"MANUAL":"AUTO");

  let start=before.start_date;
  let end=before.end_date;
  let coverAmountCents=before.cover_amount_cents;

  if (coverMode==="MANUAL") {
    start=isoDate(body.start_date ?? before.start_date,"start_date");
    end=isoDate(body.end_date ?? before.end_date,"end_date");

    if (body.cover_amount!==undefined) {
      coverAmountCents=moneyToCents(required(body.cover_amount,"cover_amount"));
    }

    if (coverAmountCents==null || coverAmountCents<=0) {
      throw new HttpError(400,"Informe um valor de capa maior que zero.","VALIDATION_ERROR");
    }
  } else {
    coverAmountCents=null;
    let suggestedStart=period.start_date;
    if (period.closed_until && period.closed_until>=period.start_date) suggestedStart=nextIsoDate(period.closed_until);
    start=suggestedStart;
    end=period.end_date;
  }

  if (start<period.start_date || end>period.end_date || start>end) {
    throw new HttpError(400,"As datas do lote devem estar dentro do período contábil.","VALIDATION_ERROR");
  }

  if (period.closed_until && start<=period.closed_until) {
    throw new HttpError(409,`O período está fechado até ${period.closed_until}.`,"DATE_CLOSED");
  }

  const outside=await env.DB.prepare(`
    SELECT id,entry_date
    FROM journal_entries
    WHERE company_id=? AND batch_id=?
      AND status<>'VOID'
      AND (entry_date<? OR entry_date>?)
    LIMIT 1
  `).bind(companyId,id,start,end).first();

  if (outside) {
    throw new HttpError(
      409,
      `Existe lançamento em ${outside.entry_date}, fora das novas datas da capa.`,
      "ENTRY_OUTSIDE_BATCH"
    );
  }

  await env.DB.prepare(`
    UPDATE journal_batches
    SET description=?,start_date=?,end_date=?,cover_mode=?,cover_amount_cents=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).bind(
    cleanText(body.description ?? before.description,500),
    start,end,coverMode,coverAmountCents,id,companyId
  ).run();

  const after=await env.DB.prepare("SELECT * FROM journal_batches WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"UPDATE",entity:"journal_batch",entityId:id,before,after,request});
  return after;
}

async function setBatchLock(env, request, auth, companyId, id, locked) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureBatchIntegrationSchema(env);

  const before=await assertCompanyEntity(env,"journal_batches",id,companyId);

  if (locked) {
    await validateManualCover(env,companyId,before);

    await env.DB.prepare(`
      UPDATE journal_batches
      SET status='LOCKED',locked_by=?,locked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).bind(auth.user.id,id,companyId).run();
  } else {
    await env.DB.prepare(`
      UPDATE journal_batches
      SET status='OPEN',locked_by=NULL,locked_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).bind(id,companyId).run();
  }

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:locked?"LOCK":"UNLOCK",
    entity:"journal_batch",
    entityId:id,
    before:{status:before.status},
    after:{status:locked?"LOCKED":"OPEN"},
    request
  });

  return getBatchDetails(env,companyId,id);
}

async function deleteBatch(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureBatchIntegrationSchema(env);

  const batch=await assertCompanyEntity(env,"journal_batches",id,companyId);

  const entry=await env.DB.prepare(`
    SELECT id FROM journal_entries
    WHERE company_id=? AND batch_id=?
    LIMIT 1
  `).bind(companyId,id).first();

  if (entry) {
    throw new HttpError(
      409,
      `O lote ${batch.code} possui lançamentos e não pode ser excluído.`,
      "BATCH_HAS_ENTRIES"
    );
  }

  await env.DB.prepare(`DELETE FROM journal_batches WHERE id=? AND company_id=?`).bind(id,companyId).run();

  await audit(env,{companyId,userId:auth.user.id,action:"DELETE",entity:"journal_batch",entityId:id,before:batch,request});
  return {deleted:true,id};
}

async function integrateBatchEntries(env, request, auth, companyId, batchId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureAccountingPeriodSchema(env);
  await ensureBatchIntegrationSchema(env);

  const batch=await assertCompanyEntity(env,"journal_batches",batchId,companyId);
  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);

  const requested=Array.isArray(body.entry_ids)?[...new Set(body.entry_ids.map(String))]:[];

  let sql=`
    SELECT id,entry_date,official_status,status
    FROM journal_entries
    WHERE company_id=? AND batch_id=? AND status='POSTED' AND official_status<>'INTEGRATED'
  `;
  const binds=[companyId,batchId];

  if (requested.length) {
    sql+=` AND id IN (${requested.map(()=>"?").join(",")})`;
    binds.push(...requested);
  }

  const res=await env.DB.prepare(sql).bind(...binds).all();
  const entries=res.results||[];

  if (!entries.length) {
    throw new HttpError(409,"Não há lançamentos contabilizados pendentes para integrar.","NOTHING_TO_INTEGRATE");
  }

  for (const e of entries) assertDateOpenInPeriod(period,e.entry_date);

  const integrationId=uuid();

  await env.DB.batch(entries.map(e=>env.DB.prepare(`
    UPDATE journal_entries
    SET official_status='INTEGRATED',
        integrated_by=?,
        integrated_at=CURRENT_TIMESTAMP,
        integration_id=?,
        unintegrated_by=NULL,
        unintegrated_at=NULL,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND status='POSTED'
  `).bind(auth.user.id,integrationId,e.id,companyId)));

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"INTEGRATE_OFFICIAL",
    entity:"journal_batch",
    entityId:batchId,
    after:{integration_id:integrationId,entry_ids:entries.map(x=>x.id)},
    request
  });

  return {
    integration_id:integrationId,
    integrated_count:entries.length,
    batch:await getBatchDetails(env,companyId,batchId)
  };
}

async function unintegrateBatchEntries(env, request, auth, companyId, batchId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.batch.manage");
  await ensureAccountingPeriodSchema(env);
  await ensureBatchIntegrationSchema(env);

  const batch=await assertCompanyEntity(env,"journal_batches",batchId,companyId);
  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);

  const requested=Array.isArray(body.entry_ids)?[...new Set(body.entry_ids.map(String))]:[];

  if (!requested.length) {
    throw new HttpError(400,"Selecione ao menos um lançamento integrado.","VALIDATION_ERROR");
  }

  const sql=`
    SELECT id,entry_date
    FROM journal_entries
    WHERE company_id=? AND batch_id=? AND status='POSTED' AND official_status='INTEGRATED'
      AND id IN (${requested.map(()=>"?").join(",")})
  `;

  const res=await env.DB.prepare(sql).bind(companyId,batchId,...requested).all();
  const entries=res.results||[];

  if (!entries.length) {
    throw new HttpError(409,"Nenhum dos lançamentos selecionados está integrado ao Lote 0.","NOTHING_TO_UNINTEGRATE");
  }

  for (const e of entries) assertDateOpenInPeriod(period,e.entry_date);

  await env.DB.batch(entries.map(e=>env.DB.prepare(`
    UPDATE journal_entries
    SET official_status='PENDING',
        unintegrated_by=?,
        unintegrated_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND official_status='INTEGRATED'
  `).bind(auth.user.id,e.id,companyId)));

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"UNINTEGRATE_OFFICIAL",
    entity:"journal_batch",
    entityId:batchId,
    after:{entry_ids:entries.map(x=>x.id)},
    request
  });

  return {
    unintegrated_count:entries.length,
    batch:await getBatchDetails(env,companyId,batchId)
  };
}

async function listOfficialEntries(env, companyId, limit=300) {
  await ensureBatchIntegrationSchema(env);

  const res=await env.DB.prepare(`
    SELECT
      e.id,e.entry_date,e.document_number,e.description,e.total_debit_cents,e.total_credit_cents,
      e.integrated_at,e.integration_id,b.code AS origin_batch_code,b.description AS origin_batch_description
    FROM journal_entries e
    JOIN journal_batches b ON b.id=e.batch_id
    WHERE e.company_id=?
      AND e.status='POSTED'
      AND e.official_status='INTEGRATED'
    ORDER BY e.entry_date DESC,e.integrated_at DESC
    LIMIT ?
  `).bind(companyId,Math.min(500,Math.max(1,Number(limit)||300))).all();

  return (res.results||[]).map(x=>({
    ...x,
    total_debit:centsToMoney(x.total_debit_cents),
    total_credit:centsToMoney(x.total_credit_cents)
  }));
}


async function migrateLegacyDraftEntries(env, companyId) {
  await env.DB.prepare(`
    UPDATE journal_entries
    SET status='POSTED',
        posted_by=COALESCE(posted_by,created_by),
        posted_at=COALESCE(posted_at,created_at,CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=?
      AND status='DRAFT'
      AND total_debit_cents=total_credit_cents
      AND total_debit_cents>0
  `).bind(companyId).run();
}


async function ensureEntryMaintenanceSchema(env) {
  // Colunas de rastreabilidade de edição.
  const info=await env.DB.prepare(`PRAGMA table_info(journal_entries)`).all();
  const cols=new Set((info.results||[]).map(x=>x.name));

  if (!cols.has("edited_by")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN edited_by TEXT`).run();
  }
  if (!cols.has("edited_at")) {
    await env.DB.prepare(`ALTER TABLE journal_entries ADD COLUMN edited_at TEXT`).run();
  }

  // Novas permissões. A migração de perfis ocorre somente quando a permissão
  // é criada pela primeira vez, para não reatribuir algo removido depois pelo administrador.
  const editExists=await env.DB.prepare(`SELECT id FROM permissions WHERE code='accounting.entry.edit'`).first();
  if (!editExists) {
    const editId=uuid();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO permissions (id,code,module,description)
        VALUES (?,'accounting.entry.edit','ACCOUNTING','Editar lançamentos contábeis')
      `).bind(editId),
      env.DB.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
        SELECT rp.role_id, ?
        FROM role_permissions rp
        JOIN permissions pold ON pold.id=rp.permission_id
        WHERE pold.code='accounting.entry.create'
      `).bind(editId)
    ]);
  }

  const deleteExists=await env.DB.prepare(`SELECT id FROM permissions WHERE code='accounting.entry.delete'`).first();
  if (!deleteExists) {
    const deleteId=uuid();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO permissions (id,code,module,description)
        VALUES (?,'accounting.entry.delete','ACCOUNTING','Excluir lançamentos contábeis')
      `).bind(deleteId),
      env.DB.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
        SELECT rp.role_id, ?
        FROM role_permissions rp
        JOIN permissions pold ON pold.id=rp.permission_id
        WHERE pold.code='accounting.entry.void'
      `).bind(deleteId)
    ]);
  }
}

async function assertEntryCanBeMaintained(env, companyId, entry, actionLabel) {
  await ensureBatchIntegrationSchema(env);
  await ensureAccountingPeriodSchema(env);

  if (entry.status!=="POSTED") {
    throw new HttpError(409,`Somente lançamento contabilizado pode ser ${actionLabel}.`,"INVALID_STATUS");
  }

  if (entry.official_status==="INTEGRATED") {
    throw new HttpError(
      409,
      `Este lançamento está no Lote 0. Desfaça a integração antes de ${actionLabel}.`,
      "ENTRY_IN_OFFICIAL_BATCH"
    );
  }

  const batch=await assertCompanyEntity(env,"journal_batches",entry.batch_id,companyId);
  if (batch.status!=="OPEN") {
    throw new HttpError(
      409,
      `O lote ${batch.code} não está aberto. Desbloqueie o lote antes de ${actionLabel}.`,
      "BATCH_CLOSED"
    );
  }

  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);
  assertDateOpenInPeriod(period,entry.entry_date);

  return {batch,period};
}

async function entrySnapshot(env, companyId, id) {
  return await getEntry(env,companyId,id);
}

async function updateEntry(env, request, auth, companyId, id, body) {
  await ensureEntryMaintenanceSchema(env);
  await requirePermission(env,auth.user.id,companyId,"accounting.entry.edit");

  const before=await entrySnapshot(env,companyId,id);
  await assertEntryCanBeMaintained(env,companyId,before,"editado");

  // A mesma validação usada na inclusão: lote aberto, período aberto,
  // débito=crédito, contas/CC/históricos válidos etc.
  const v=await validateEntry(env,companyId,body);

  const deleteAlloc=env.DB.prepare(`
    DELETE FROM allocation_lines
    WHERE company_id=?
      AND journal_line_id IN (
        SELECT id FROM journal_lines WHERE company_id=? AND entry_id=?
      )
  `).bind(companyId,companyId,id);

  const deleteLines=env.DB.prepare(`
    DELETE FROM journal_lines WHERE company_id=? AND entry_id=?
  `).bind(companyId,id);

  const stmts=[
    deleteAlloc,
    deleteLines,
    env.DB.prepare(`
      UPDATE journal_entries
      SET batch_id=?,
          branch_id=?,
          entry_date=?,
          document_number=?,
          description=?,
          total_debit_cents=?,
          total_credit_cents=?,
          edited_by=?,
          edited_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).bind(
      v.batch.id,
      body.branch_id||null,
      v.date,
      cleanText(body.document_number,120),
      cleanText(body.description,1000),
      v.debit,
      v.credit,
      auth.user.id,
      id,
      companyId
    )
  ];

  for (const line of v.lines) {
    stmts.push(
      env.DB.prepare(`
        INSERT INTO journal_lines
          (id,company_id,entry_id,line_no,account_id,side,amount_cents,branch_id,cost_center_id,
           history_template_id,history_complement,document_number)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        line.id,companyId,id,line.line_no,line.account_id,line.side,line.amount_cents,
        line.branch_id,line.cost_center_id,line.history_template_id,line.history_complement,line.document_number
      )
    );

    for (const alloc of line.allocations) {
      stmts.push(
        env.DB.prepare(`
          INSERT INTO allocation_lines
            (id,company_id,journal_line_id,cost_center_id,amount_cents,percentage_basis_points)
          VALUES (?,?,?,?,?,?)
        `).bind(
          alloc.id,companyId,line.id,alloc.cost_center_id,alloc.amount_cents,alloc.percentage_basis_points
        )
      );
    }
  }

  await env.DB.batch(stmts);

  const after=await entrySnapshot(env,companyId,id);

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"UPDATE",
    entity:"journal_entry",
    entityId:id,
    before,
    after,
    request
  });

  return after;
}

async function deleteEntry(env, request, auth, companyId, id) {
  await ensureEntryMaintenanceSchema(env);
  await requirePermission(env,auth.user.id,companyId,"accounting.entry.delete");

  const before=await entrySnapshot(env,companyId,id);
  await assertEntryCanBeMaintained(env,companyId,before,"excluído");

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM allocation_lines
      WHERE company_id=?
        AND journal_line_id IN (
          SELECT id FROM journal_lines WHERE company_id=? AND entry_id=?
        )
    `).bind(companyId,companyId,id),
    env.DB.prepare(`DELETE FROM journal_lines WHERE company_id=? AND entry_id=?`).bind(companyId,id),
    env.DB.prepare(`DELETE FROM journal_entries WHERE company_id=? AND id=?`).bind(companyId,id)
  ]);

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"DELETE",
    entity:"journal_entry",
    entityId:id,
    before,
    request
  });

  return {deleted:true,id};
}

async function validateEntry(env, companyId, body) {
  await ensureBatchIntegrationSchema(env);
  const batch=await assertCompanyEntity(env,"journal_batches",required(body.batch_id,"batch_id"),companyId);
  if (batch.status!=="OPEN") throw new HttpError(409,"O lote não está aberto.","BATCH_CLOSED");
  await ensureAccountingPeriodSchema(env);
  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);
  const date=isoDate(body.entry_date,"entry_date");
  if (date<batch.start_date || date>batch.end_date || date<period.start_date || date>period.end_date) {
    throw new HttpError(400,"A data do lançamento está fora do período/lote.","DATE_OUT_OF_PERIOD");
  }
  assertDateOpenInPeriod(period,date);
  if (body.branch_id) await assertCompanyEntity(env,"branches",body.branch_id,companyId);
  const lines=Array.isArray(body.lines)?body.lines:[];
  if (lines.length<2) throw new HttpError(400,"O lançamento precisa de pelo menos 2 linhas.","VALIDATION_ERROR");

  let debit=0,credit=0; const normalized=[];
  for (let i=0;i<lines.length;i++) {
    const line=lines[i];
    const account=await assertCompanyEntity(env,"accounts",required(line.account_id,`lines[${i}].account_id`),companyId);
    if (!account.active || !account.analytic) throw new HttpError(400,`A conta ${account.code} deve estar ativa e ser analítica.`,"INVALID_ACCOUNT");
    const side=String(required(line.side,`lines[${i}].side`)).toUpperCase();
    if (!["D","C"].includes(side)) throw new HttpError(400,`lines[${i}].side deve ser D ou C.`,"VALIDATION_ERROR");
    const cents=moneyToCents(required(line.amount,`lines[${i}].amount`));
    if (cents<=0) throw new HttpError(400,"O valor da linha deve ser maior que zero.","VALIDATION_ERROR");
    if (line.cost_center_id) await validateCostCenterForEntry(env,companyId,line.cost_center_id);
    if (line.history_template_id) {
      const hist=await assertCompanyEntity(env,"history_templates",line.history_template_id,companyId);
      if (hist.complement_required && !String(line.history_complement||"").trim()) throw new HttpError(400,`A linha ${i+1} exige complemento de histórico.`,"VALIDATION_ERROR");
    }
    const allocations=Array.isArray(line.allocations)?line.allocations:[];
    let allocTotal=0,bpTotal=0; const normAllocs=[];
    for (const alloc of allocations) {
      await validateCostCenterForEntry(env,companyId,required(alloc.cost_center_id,"allocation.cost_center_id"));
      const ac=moneyToCents(required(alloc.amount,"allocation.amount"));
      const bp=alloc.percentage_basis_points!=null?Number(alloc.percentage_basis_points):Math.round((ac/cents)*10000);
      if (ac<=0 || bp<=0 || bp>10000) throw new HttpError(400,"Rateio inválido.","VALIDATION_ERROR");
      allocTotal+=ac; bpTotal+=bp;
      normAllocs.push({id:uuid(),cost_center_id:alloc.cost_center_id,amount_cents:ac,percentage_basis_points:bp});
    }
    if (allocations.length && (allocTotal!==cents || Math.abs(bpTotal-10000)>1)) throw new HttpError(400,`O rateio da linha ${i+1} deve totalizar exatamente o valor da linha e 100%.`,"INVALID_ALLOCATION");
    if (side==="D") debit+=cents; else credit+=cents;
    normalized.push({id:uuid(),line_no:i+1,account_id:account.id,side,amount_cents:cents,branch_id:line.branch_id||body.branch_id||null,cost_center_id:line.cost_center_id||null,history_template_id:line.history_template_id||null,history_complement:cleanText(line.history_complement,2000),document_number:cleanText(line.document_number||body.document_number,120),allocations:normAllocs});
  }
  if (debit!==credit) throw new HttpError(400,`Lançamento não fecha: débito ${centsToMoney(debit).toFixed(2)} x crédito ${centsToMoney(credit).toFixed(2)}.`,"UNBALANCED_ENTRY");
  return {batch,period,date,lines:normalized,debit,credit};
}

async function createEntry(env, request, auth, companyId, body) {
  await requirePermission(env, auth.user.id, companyId, "accounting.entry.create");

  const v=await validateEntry(env,companyId,body), entryId=uuid();

  const stmts=[
    env.DB.prepare(`
      INSERT INTO journal_entries
        (id,company_id,batch_id,branch_id,entry_date,document_number,description,source_module,source_reference,
         status,total_debit_cents,total_credit_cents,created_by,posted_by,posted_at)
      VALUES (?,?,?,?,?,?,?,?,?,'POSTED',?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(
      entryId,
      companyId,
      v.batch.id,
      body.branch_id||null,
      v.date,
      cleanText(body.document_number,120),
      cleanText(body.description,1000),
      cleanText(body.source_module||"ACCOUNTING",50),
      cleanText(body.source_reference,200),
      v.debit,
      v.credit,
      auth.user.id,
      auth.user.id
    )
  ];

  for (const line of v.lines) {
    stmts.push(
      env.DB.prepare(`
        INSERT INTO journal_lines
          (id,company_id,entry_id,line_no,account_id,side,amount_cents,branch_id,cost_center_id,
           history_template_id,history_complement,document_number)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        line.id,companyId,entryId,line.line_no,line.account_id,line.side,line.amount_cents,
        line.branch_id,line.cost_center_id,line.history_template_id,line.history_complement,line.document_number
      )
    );

    for (const alloc of line.allocations) {
      stmts.push(
        env.DB.prepare(`
          INSERT INTO allocation_lines
            (id,company_id,journal_line_id,cost_center_id,amount_cents,percentage_basis_points)
          VALUES (?,?,?,?,?,?)
        `).bind(
          alloc.id,companyId,line.id,alloc.cost_center_id,alloc.amount_cents,alloc.percentage_basis_points
        )
      );
    }
  }

  await env.DB.batch(stmts);

  const after={
    id:entryId,
    total_debit:centsToMoney(v.debit),
    total_credit:centsToMoney(v.credit),
    status:"POSTED",
    official_status:"PENDING"
  };

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"CREATE_POSTED",
    entity:"journal_entry",
    entityId:entryId,
    after,
    request
  });

  return after;
}


async function ensureViewFilterSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_view_filters (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      view_key TEXT NOT NULL,
      name TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,user_id,view_key,name)
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_view_filters_scope
    ON user_view_filters(company_id,user_id,view_key)
  `).run();
}

function normalizeEntryFilterDefinition(definition) {
  const raw=Array.isArray(definition?.conditions)?definition.conditions:[];
  const allowedFields=new Set([
    "entry_date","batch_code","document_number","description","total_debit",
    "total_credit","status","official_status","branch","account","cost_center"
  ]);
  const allowedOps=new Set([
    "eq","neq","contains","starts","ends","gt","gte","lt","lte",
    "blank","not_blank","between"
  ]);

  const conditions=[];
  for (const item of raw.slice(0,20)) {
    const field=String(item?.field||"");
    const operator=String(item?.operator||"");
    if (!allowedFields.has(field) || !allowedOps.has(operator)) continue;

    conditions.push({
      logic:String(item?.logic||"AND").toUpperCase()==="OR"?"OR":"AND",
      field,
      operator,
      value:item?.value==null?"":String(item.value),
      value2:item?.value2==null?"":String(item.value2)
    });
  }

  return {conditions};
}

function entryFilterSql(definition) {
  const def=normalizeEntryFilterDefinition(definition);
  if (!def.conditions.length) return {sql:"",binds:[]};

  const textFields={
    batch_code:"b.code",
    document_number:"COALESCE(e.document_number,'')",
    description:"COALESCE(e.description,'')",
    status:"e.status",
    official_status:"COALESCE(e.official_status,'PENDING')",
    branch:"COALESCE(br.code,'') || ' ' || COALESCE(br.name,'')",
    account:`COALESCE((
      SELECT GROUP_CONCAT(COALESCE(fa.code,'') || ' ' || COALESCE(fa.name,''),' ')
      FROM journal_lines fjl
      JOIN accounts fa ON fa.id=fjl.account_id
      WHERE fjl.entry_id=e.id AND fjl.company_id=e.company_id
    ),'')`,
    cost_center:`COALESCE((
      SELECT GROUP_CONCAT(COALESCE(fcc.code,'') || ' ' || COALESCE(fcc.name,''),' ')
      FROM journal_lines fjl2
      LEFT JOIN cost_centers fcc ON fcc.id=fjl2.cost_center_id
      WHERE fjl2.entry_id=e.id AND fjl2.company_id=e.company_id
    ),'')`
  };

  const dateFields={entry_date:"e.entry_date"};
  const moneyFields={total_debit:"e.total_debit_cents",total_credit:"e.total_credit_cents"};

  const parts=[];
  const binds=[];

  for (const [index,c] of def.conditions.entries()) {
    let expr="", local=[];

    if (textFields[c.field]) {
      const col=textFields[c.field];

      if (c.operator==="blank") expr=`TRIM(${col})=''`;
      else if (c.operator==="not_blank") expr=`TRIM(${col})<>''`;
      else if (c.operator==="eq") { expr=`LOWER(${col})=LOWER(?)`; local=[c.value]; }
      else if (c.operator==="neq") { expr=`LOWER(${col})<>LOWER(?)`; local=[c.value]; }
      else if (c.operator==="contains") { expr=`LOWER(${col}) LIKE LOWER(?)`; local=[`%${c.value}%`]; }
      else if (c.operator==="starts") { expr=`LOWER(${col}) LIKE LOWER(?)`; local=[`${c.value}%`]; }
      else if (c.operator==="ends") { expr=`LOWER(${col}) LIKE LOWER(?)`; local=[`%${c.value}`]; }
      else if (["gt","gte","lt","lte"].includes(c.operator)) {
        const op={gt:">",gte:">=",lt:"<",lte:"<="}[c.operator];
        expr=`LOWER(${col}) ${op} LOWER(?)`;
        local=[c.value];
      } else if (c.operator==="between") {
        expr=`LOWER(${col}) BETWEEN LOWER(?) AND LOWER(?)`;
        local=[c.value,c.value2];
      }
    } else if (dateFields[c.field]) {
      const col=dateFields[c.field];
      if (c.operator==="blank") expr=`(${col} IS NULL OR ${col}='')`;
      else if (c.operator==="not_blank") expr=`(${col} IS NOT NULL AND ${col}<>'')`;
      else if (c.operator==="between") { expr=`${col} BETWEEN ? AND ?`; local=[c.value,c.value2]; }
      else {
        const op={eq:"=",neq:"<>",gt:">",gte:">=",lt:"<",lte:"<="}[c.operator];
        if (op) { expr=`${col} ${op} ?`; local=[c.value]; }
      }
    } else if (moneyFields[c.field]) {
      const col=moneyFields[c.field];
      if (c.operator==="blank") expr=`${col} IS NULL`;
      else if (c.operator==="not_blank") expr=`${col} IS NOT NULL`;
      else if (c.operator==="between") {
        expr=`${col} BETWEEN ? AND ?`;
        local=[moneyToCents(c.value),moneyToCents(c.value2)];
      } else {
        const op={eq:"=",neq:"<>",gt:">",gte:">=",lt:"<",lte:"<="}[c.operator];
        if (op) { expr=`${col} ${op} ?`; local=[moneyToCents(c.value)]; }
      }
    }

    if (!expr) continue;

    if (!parts.length) parts.push(`(${expr})`);
    else parts.push(`${c.logic==="OR"?"OR":"AND"} (${expr})`);
    binds.push(...local);
  }

  return {sql:parts.length?` AND (${parts.join(" ")})`:"",binds};
}

async function listUserViewFilters(env, companyId, userId, viewKey) {
  await ensureViewFilterSchema(env);

  const res=await env.DB.prepare(`
    SELECT id,name,view_key,definition_json,is_default,created_at,updated_at
    FROM user_view_filters
    WHERE company_id=? AND user_id=? AND view_key=?
    ORDER BY is_default DESC,name
  `).bind(companyId,userId,viewKey).all();

  return (res.results||[]).map(x=>({
    ...x,
    is_default:!!x.is_default,
    definition:(()=>{
      try{return normalizeEntryFilterDefinition(JSON.parse(x.definition_json||"{}"))}
      catch{return {conditions:[]}}
    })()
  }));
}

async function saveUserViewFilter(env, companyId, userId, body) {
  await ensureViewFilterSchema(env);

  const viewKey=cleanText(body.view_key||"journal_entries",80);
  if (viewKey!=="journal_entries") throw new HttpError(400,"Visão de filtro inválida.","VALIDATION_ERROR");

  const name=cleanText(required(body.name,"name"),120);
  const definition=normalizeEntryFilterDefinition(body.definition||{});
  if (!definition.conditions.length) throw new HttpError(400,"Adicione pelo menos uma condição ao filtro.","VALIDATION_ERROR");

  const isDefault=body.is_default?1:0;
  const existing=await env.DB.prepare(`
    SELECT id FROM user_view_filters
    WHERE company_id=? AND user_id=? AND view_key=? AND name=?
  `).bind(companyId,userId,viewKey,name).first();

  if (isDefault) {
    await env.DB.prepare(`
      UPDATE user_view_filters
      SET is_default=0,updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND user_id=? AND view_key=?
    `).bind(companyId,userId,viewKey).run();
  }

  let id=existing?.id;
  if (id) {
    await env.DB.prepare(`
      UPDATE user_view_filters
      SET definition_json=?,is_default=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND user_id=?
    `).bind(JSON.stringify(definition),isDefault,id,companyId,userId).run();
  } else {
    id=uuid();
    await env.DB.prepare(`
      INSERT INTO user_view_filters
        (id,company_id,user_id,view_key,name,definition_json,is_default)
      VALUES (?,?,?,?,?,?,?)
    `).bind(id,companyId,userId,viewKey,name,JSON.stringify(definition),isDefault).run();
  }

  return (await listUserViewFilters(env,companyId,userId,viewKey)).find(x=>x.id===id);
}

async function deleteUserViewFilter(env, companyId, userId, id) {
  await ensureViewFilterSchema(env);

  const row=await env.DB.prepare(`
    SELECT id FROM user_view_filters
    WHERE id=? AND company_id=? AND user_id=? AND view_key='journal_entries'
  `).bind(id,companyId,userId).first();

  if (!row) throw new HttpError(404,"Filtro não encontrado.","NOT_FOUND");

  await env.DB.prepare(`
    DELETE FROM user_view_filters WHERE id=? AND company_id=? AND user_id=?
  `).bind(id,companyId,userId).run();

  return {deleted:true,id};
}


let __accountingPerformanceIndexesReady = false;

async function ensureAccountingPerformanceIndexes(env) {
  if (__accountingPerformanceIndexesReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_entries_batch_grid ON journal_entries(company_id,batch_id,entry_date,created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_entries_official_grid ON journal_entries(company_id,official_status,status,entry_date,integrated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_grid ON journal_lines(company_id,entry_id,line_no)`)
  ]);
  __accountingPerformanceIndexesReady = true;
}

function journalEntryGridSearch(q) {
  const text=cleanText(q||"",120);
  if (!text) return {sql:"",binds:[]};
  const like=`%${text}%`;
  return {
    sql:` AND (
      COALESCE(e.document_number,'') LIKE ? COLLATE NOCASE
      OR COALESCE(e.description,'') LIKE ? COLLATE NOCASE
      OR COALESCE(e.source_reference,'') LIKE ? COLLATE NOCASE
      OR EXISTS (
        SELECT 1
        FROM journal_lines sl
        LEFT JOIN accounts sa ON sa.id=sl.account_id
        LEFT JOIN cost_centers scc ON scc.id=sl.cost_center_id
        LEFT JOIN history_templates sh ON sh.id=sl.history_template_id
        WHERE sl.company_id=e.company_id
          AND sl.entry_id=e.id
          AND (
            COALESCE(sl.document_number,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sl.history_complement,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sa.code,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sa.reduced_code,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sa.name,'') LIKE ? COLLATE NOCASE
            OR COALESCE(scc.code,'') LIKE ? COLLATE NOCASE
            OR COALESCE(scc.name,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sh.code,'') LIKE ? COLLATE NOCASE
            OR COALESCE(sh.description,'') LIKE ? COLLATE NOCASE
          )
      )
    )`,
    binds:Array(12).fill(like)
  };
}

async function listJournalEntryGrid(env, companyId, options={}) {
  await ensureBatchIntegrationSchema(env);
  await migrateLegacyDraftEntries(env,companyId);
  await ensureAccountingPerformanceIndexes(env);

  const context=String(options.context||"official").toLowerCase()==="batch"?"batch":"official";
  const page=Math.max(1,Number(options.page)||1);
  const pageSize=Math.min(200,Math.max(25,Number(options.page_size)||100));
  const offset=(page-1)*pageSize;
  const search=journalEntryGridSearch(options.q);

  let batch=null;
  let where="";
  let baseBinds=[];
  if (context==="batch") {
    const batchId=required(options.batch_id,"batch_id");
    batch=await env.DB.prepare(`
      SELECT b.id,b.code,b.description,b.status,b.cover_mode,b.start_date,b.end_date,
             p.code AS period_code,p.start_date AS period_start_date,p.end_date AS period_end_date,p.closed_until
      FROM journal_batches b
      JOIN accounting_periods p ON p.id=b.period_id
      WHERE b.id=? AND b.company_id=?
    `).bind(batchId,companyId).first();
    if (!batch) throw new HttpError(404,"Lote não encontrado.","NOT_FOUND");
    where="e.company_id=? AND e.batch_id=?";
    baseBinds=[companyId,batchId];
  } else {
    where="e.company_id=? AND e.status='POSTED' AND e.official_status='INTEGRATED'";
    baseBinds=[companyId];
  }

  const allBinds=[...baseBinds,...search.binds];
  const summary=await env.DB.prepare(`
    SELECT COUNT(*) AS total_entries,
           COALESCE(SUM(e.total_debit_cents),0) AS total_debit_cents,
           COALESCE(SUM(e.total_credit_cents),0) AS total_credit_cents
    FROM journal_entries e
    WHERE ${where}${search.sql}
  `).bind(...allBinds).first();

  const totalEntries=Number(summary?.total_entries||0);
  const totalPages=Math.max(1,Math.ceil(totalEntries/pageSize));
  const effectivePage=Math.min(page,totalPages);
  const effectiveOffset=(effectivePage-1)*pageSize;

  const entriesRes=await env.DB.prepare(`
    SELECT
      e.id,e.batch_id,e.entry_date,e.document_number,e.description,e.source_module,e.source_reference,e.status,
      e.official_status,e.integration_id,e.integrated_at,e.total_debit_cents,e.total_credit_cents,e.created_at,
      b.code AS batch_code,b.description AS batch_description,
      br.code AS branch_code,br.name AS branch_name
    FROM journal_entries e
    JOIN journal_batches b ON b.id=e.batch_id
    LEFT JOIN branches br ON br.id=e.branch_id
    WHERE ${where}${search.sql}
    ORDER BY e.entry_date DESC,e.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...allBinds,pageSize,effectiveOffset).all();

  const entries=(entriesRes.results||[]);
  const byId=new Map(entries.map(e=>[e.id,{...e,total_debit:centsToMoney(e.total_debit_cents),total_credit:centsToMoney(e.total_credit_cents),lines:[]}])) ;

  if (entries.length) {
    const ids=entries.map(e=>e.id);
    const placeholders=ids.map(()=>"?").join(",");
    const linesRes=await env.DB.prepare(`
      SELECT
        l.id,l.entry_id,l.line_no,l.side,l.amount_cents,l.document_number,l.history_complement,
        a.code AS account_code,a.reduced_code AS account_reduced_code,a.name AS account_name,
        cc.code AS cost_center_code,cc.name AS cost_center_name,
        h.code AS history_code,h.description AS history_description
      FROM journal_lines l
      JOIN accounts a ON a.id=l.account_id
      LEFT JOIN cost_centers cc ON cc.id=l.cost_center_id
      LEFT JOIN history_templates h ON h.id=l.history_template_id
      WHERE l.company_id=? AND l.entry_id IN (${placeholders})
      ORDER BY l.entry_id,l.line_no
    `).bind(companyId,...ids).all();

    for (const row of (linesRes.results||[])) {
      const target=byId.get(row.entry_id);
      if (!target) continue;
      target.lines.push({...row,amount:centsToMoney(row.amount_cents)});
    }
  }

  return {
    context,
    batch,
    page:effectivePage,
    page_size:pageSize,
    total_entries:totalEntries,
    total_pages:totalPages,
    total_debit_cents:Number(summary?.total_debit_cents||0),
    total_credit_cents:Number(summary?.total_credit_cents||0),
    total_debit:centsToMoney(Number(summary?.total_debit_cents||0)),
    total_credit:centsToMoney(Number(summary?.total_credit_cents||0)),
    entries:entries.map(e=>byId.get(e.id))
  };
}

async function listEntries(env, companyId, limit=100, filterDefinition=null) {
  await ensureBatchIntegrationSchema(env);
  await migrateLegacyDraftEntries(env,companyId);

  const f=entryFilterSql(filterDefinition);

  const res=await env.DB.prepare(`
    SELECT
      e.id,e.entry_date,e.document_number,e.description,e.source_module,e.source_reference,e.status,
      e.official_status,e.integration_id,e.integrated_at,
      e.total_debit_cents,e.total_credit_cents,e.created_at,e.posted_at,e.edited_at,
      b.code AS batch_code,b.description AS batch_description,
      br.code AS branch_code,br.name AS branch_name
    FROM journal_entries e
    JOIN journal_batches b ON b.id=e.batch_id
    LEFT JOIN branches br ON br.id=e.branch_id
    WHERE e.company_id=?
    ${f.sql}
    ORDER BY e.entry_date DESC,e.created_at DESC
    LIMIT ?
  `).bind(companyId,...f.binds,Math.min(1000,Math.max(1,Number(limit)||300))).all();

  return (res.results||[]).map(x=>({
    ...x,
    total_debit:centsToMoney(x.total_debit_cents),
    total_credit:centsToMoney(x.total_credit_cents)
  }));
}

async function getEntry(env, companyId, id) {
  await ensureBatchIntegrationSchema(env);
  await migrateLegacyDraftEntries(env,companyId);

  const entry=await env.DB.prepare(`
    SELECT
      e.*,
      b.code AS batch_code,
      b.description AS batch_description,
      b.status AS batch_status,
      p.code AS period_code,
      p.start_date AS period_start_date,
      p.end_date AS period_end_date,
      br.code AS branch_code,
      br.name AS branch_name,
      cu.name AS created_by_name,
      pu.name AS posted_by_name,
      eu.name AS edited_by_name,
      iu.name AS integrated_by_name,
      vu.name AS voided_by_name
    FROM journal_entries e
    JOIN journal_batches b ON b.id=e.batch_id
    JOIN accounting_periods p ON p.id=b.period_id
    LEFT JOIN branches br ON br.id=e.branch_id
    LEFT JOIN users cu ON cu.id=e.created_by
    LEFT JOIN users pu ON pu.id=e.posted_by
    LEFT JOIN users eu ON eu.id=e.edited_by
    LEFT JOIN users iu ON iu.id=e.integrated_by
    LEFT JOIN users vu ON vu.id=e.voided_by
    WHERE e.id=? AND e.company_id=?
  `).bind(id,companyId).first();

  if (!entry) throw new HttpError(404,"Lançamento não encontrado.","NOT_FOUND");

  const linesRes=await env.DB.prepare(`
    SELECT
      l.*,
      a.code AS account_code,
      a.reduced_code AS account_reduced_code,
      a.name AS account_name,
      cc.code AS cost_center_code,
      cc.name AS cost_center_name,
      h.code AS history_code,
      h.description AS history_description
    FROM journal_lines l
    JOIN accounts a ON a.id=l.account_id
    LEFT JOIN cost_centers cc ON cc.id=l.cost_center_id
    LEFT JOIN history_templates h ON h.id=l.history_template_id
    WHERE l.entry_id=? AND l.company_id=?
    ORDER BY l.line_no
  `).bind(id,companyId).all();

  const lineRows=linesRes.results||[];
  const allocationsByLine=new Map();
  if (lineRows.length) {
    const allocRes=await env.DB.prepare(`
      SELECT al.*,cc.code AS cost_center_code,cc.name AS cost_center_name
      FROM allocation_lines al
      JOIN cost_centers cc ON cc.id=al.cost_center_id
      JOIN journal_lines jl ON jl.id=al.journal_line_id AND jl.company_id=al.company_id
      WHERE jl.entry_id=? AND al.company_id=?
      ORDER BY al.journal_line_id,cc.code
    `).bind(id,companyId).all();
    for (const a of (allocRes.results||[])) {
      if (!allocationsByLine.has(a.journal_line_id)) allocationsByLine.set(a.journal_line_id,[]);
      allocationsByLine.get(a.journal_line_id).push({...a,amount:centsToMoney(a.amount_cents)});
    }
  }

  const lines=lineRows.map(row=>({
    ...row,
    amount:centsToMoney(row.amount_cents),
    allocations:allocationsByLine.get(row.id)||[]
  }));

  return {
    ...entry,
    total_debit:centsToMoney(entry.total_debit_cents),
    total_credit:centsToMoney(entry.total_credit_cents),
    lines
  };
}

async function postEntry(env, request, auth, companyId, id) {
  await requirePermission(env, auth.user.id, companyId, "accounting.entry.post");
  const entry=await getEntry(env,companyId,id);
  if (entry.status!=="DRAFT") throw new HttpError(409,"Somente lançamentos em rascunho podem ser contabilizados.","INVALID_STATUS");
  if (entry.total_debit_cents!==entry.total_credit_cents || entry.total_debit_cents<=0) throw new HttpError(409,"O lançamento não está balanceado.","UNBALANCED_ENTRY");
  await validatePostedEntryAccounts(env,companyId,id);
  await ensureAccountingPeriodSchema(env);
  const batch=await assertCompanyEntity(env,"journal_batches",entry.batch_id,companyId), period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);
  if (batch.status!=="OPEN") throw new HttpError(409,"O lote contábil não está aberto.","BATCH_CLOSED");
  assertDateOpenInPeriod(period,entry.entry_date);
  await env.DB.prepare(`UPDATE journal_entries SET status='POSTED',posted_by=?,posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='DRAFT'`).bind(auth.user.id,id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:"POST",entity:"journal_entry",entityId:id,before:{status:"DRAFT"},after:{status:"POSTED"},request});
  return getEntry(env,companyId,id);
}

async function voidEntry(env, request, auth, companyId, id, reason) {
  await requirePermission(env, auth.user.id, companyId, "accounting.entry.void");
  const before=await env.DB.prepare("SELECT * FROM journal_entries WHERE id=? AND company_id=?").bind(id,companyId).first();
  if (!before) throw new HttpError(404,"Lançamento não encontrado.","NOT_FOUND");
  await ensureBatchIntegrationSchema(env);
  if (before.status!=="POSTED") throw new HttpError(409,"Somente lançamento contabilizado pode ser anulado.","INVALID_STATUS");
  if (before.official_status==="INTEGRATED") {
    throw new HttpError(409,"Este lançamento está no Lote 0. Desfaça a integração antes de anulá-lo.","ENTRY_IN_OFFICIAL_BATCH");
  }
  if (!String(reason||"").trim()) throw new HttpError(400,"Informe o motivo da anulação.","VALIDATION_ERROR");

  await ensureAccountingPeriodSchema(env);
  const batch=await assertCompanyEntity(env,"journal_batches",before.batch_id,companyId);
  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);
  assertDateOpenInPeriod(period,before.entry_date);

  await env.DB.prepare(`UPDATE journal_entries SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='POSTED'`).bind(auth.user.id,cleanText(reason,1000),id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:"VOID",entity:"journal_entry",entityId:id,before:{status:"POSTED"},after:{status:"VOID",reason},request});
  return getEntry(env,companyId,id);
}

// ===== worker.js =====
async function currentCompany(request, env, auth) {
  const companyId = request.headers.get("X-Company-Id");
  await companyAccess(env, auth.user.id, companyId);
  return companyId;
}

async function listCompanies(env, auth) {
  const res = await env.DB.prepare(`
    SELECT c.id,c.code,c.legal_name,c.trade_name,c.tax_id,c.active,cm.status,cm.is_owner
    FROM company_memberships cm
    JOIN companies c ON c.id=cm.company_id
    WHERE cm.user_id=?
      AND cm.status='ACTIVE'
      AND c.active=1
    ORDER BY c.code
  `).bind(auth.user.id).all();
  return res.results || [];
}

async function createCompany(env, request, auth, body) {
  const companyId=uuid(), branchId=uuid(), roleId=uuid();
  const code=cleanText(required(body.code,"code"),50), name=cleanText(required(body.legal_name,"legal_name"),300);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO companies (id,code,legal_name,trade_name,tax_id) VALUES (?,?,?,?,?)`).bind(companyId,code,name,cleanText(body.trade_name,300),cleanText(body.tax_id,30)),
    env.DB.prepare(`INSERT INTO branches (id,company_id,code,name) VALUES (?,?,'001',?)`).bind(branchId,companyId,cleanText(body.branch_name||"Matriz",300)),
    env.DB.prepare(`INSERT INTO company_memberships (company_id,user_id,status,is_owner) VALUES (?,?,'ACTIVE',1)`).bind(companyId,auth.user.id),
    env.DB.prepare(`INSERT INTO roles (id,company_id,code,name,description,system_role) VALUES (?,?,'ADMIN','Administrador','Acesso total à empresa',1)`).bind(roleId,companyId),
    env.DB.prepare(`INSERT INTO user_roles (company_id,user_id,role_id) VALUES (?,?,?)`).bind(companyId,auth.user.id,roleId),
    env.DB.prepare(`INSERT INTO role_permissions (role_id,permission_id) SELECT ?,id FROM permissions`).bind(roleId),
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"company",entityId:companyId,after:{code,legal_name:name},request});
  return {id:companyId,code,legal_name:name,branch_id:branchId};
}

async function createBranch(env, request, auth, companyId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.branch.manage");
  const id=uuid();
  await env.DB.prepare(`INSERT INTO branches (id,company_id,code,name,tax_id,active) VALUES (?,?,?,?,?,?)`).bind(id,companyId,cleanText(required(body.code,"code"),50),cleanText(required(body.name,"name"),300),cleanText(body.tax_id,30),bool01(body.active,1)).run();
  const row=await env.DB.prepare("SELECT * FROM branches WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"branch",entityId:id,after:row,request});
  return row;
}

async function listUsers(env, auth, companyId) {
  await requirePermission(env,auth.user.id,companyId,"core.user.read");
  const res=await env.DB.prepare(`
    SELECT
      u.id,u.name,u.email,u.active,cm.status,cm.is_owner,u.last_login_at,
      (SELECT ur.role_id
         FROM user_roles ur
         JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND ur.company_id=cm.company_id
        ORDER BY r.system_role DESC, r.name
        LIMIT 1) AS role_id,
      (SELECT GROUP_CONCAT(r.name, ', ')
         FROM user_roles ur
         JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND ur.company_id=cm.company_id) AS role_names
    FROM company_memberships cm
    JOIN users u ON u.id=cm.user_id
    WHERE cm.company_id=?
    ORDER BY u.name
  `).bind(companyId).all();
  return res.results||[];
}

async function createUser(env, request, auth, companyId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.user.manage");
  const email=cleanText(required(body.email,"email"),320).toLowerCase(), name=cleanText(required(body.name,"name"),300);
  let user=await env.DB.prepare("SELECT id,name,email FROM users WHERE email=?").bind(email).first();
  if (!user) {
    const userId=uuid(), pw=await hashPassword(String(required(body.password,"password")));
    await env.DB.prepare(`INSERT INTO users (id,name,email,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?)`).bind(userId,name,email,pw.hash,pw.salt,pw.iterations).run();
    user={id:userId,name,email};
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO company_memberships (company_id,user_id,status,is_owner) VALUES (?,?,'ACTIVE',0)`).bind(companyId,user.id).run();
  if (body.role_id) {
    const role=await env.DB.prepare("SELECT id FROM roles WHERE id=? AND company_id=?").bind(body.role_id,companyId).first();
    if (!role) throw new HttpError(400,"Perfil inválido.","VALIDATION_ERROR");
    await env.DB.prepare(`INSERT OR IGNORE INTO user_roles (company_id,user_id,role_id) VALUES (?,?,?)`).bind(companyId,user.id,body.role_id).run();
  }
  await audit(env,{companyId,userId:auth.user.id,action:"ADD_USER",entity:"user",entityId:user.id,after:{email,role_id:body.role_id||null},request});
  return user;
}

async function updateUser(env, request, auth, companyId, userId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.user.manage");

  const target=await getCompanyUser(env,companyId,userId);
  if (!target) throw new HttpError(404,"Usuário não encontrado nesta empresa.","NOT_FOUND");

  const requestedName=body.name===undefined ? target.name : cleanText(required(body.name,"name"),300);
  const requestedEmail=body.email===undefined ? target.email : cleanText(required(body.email,"email"),320).toLowerCase();
  const requestedActive=body.active===undefined ? target.status==='ACTIVE' : bool01(body.active,1)===1;
  const requestedRoleId=body.role_id===undefined ? target.role_id : (body.role_id ? String(body.role_id) : null);

  const emailConflict=await env.DB.prepare(`
    SELECT id FROM users WHERE email=? AND id<>?
  `).bind(requestedEmail,userId).first();
  if (emailConflict) throw new HttpError(400,"Este e-mail já está sendo usado por outro usuário.","VALIDATION_ERROR");

  if (target.is_owner) {
    if (!requestedActive) throw new HttpError(400,"O proprietário da empresa não pode ser bloqueado.","VALIDATION_ERROR");
    if (body.role_id!==undefined && requestedRoleId!==target.role_id) {
      throw new HttpError(400,"O perfil do proprietário não pode ser alterado.","VALIDATION_ERROR");
    }
  }

  if (userId===auth.user.id && !requestedActive) {
    throw new HttpError(400,"Você não pode bloquear o seu próprio acesso à empresa.","VALIDATION_ERROR");
  }

  if (requestedRoleId) {
    const role=await env.DB.prepare("SELECT id FROM roles WHERE id=? AND company_id=?").bind(requestedRoleId,companyId).first();
    if (!role) throw new HttpError(400,"Perfil inválido.","VALIDATION_ERROR");
  }

  const before={
    name:target.name,
    email:target.email,
    status:target.status,
    role_id:target.role_id
  };

  const stmts=[
    env.DB.prepare(`
      UPDATE users
      SET name=?,email=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(requestedName,requestedEmail,userId),
    env.DB.prepare(`
      UPDATE company_memberships
      SET status=?
      WHERE company_id=? AND user_id=?
    `).bind(requestedActive?'ACTIVE':'BLOCKED',companyId,userId)
  ];

  if (!requestedActive) {
    stmts.push(env.DB.prepare(`
      UPDATE auth_sessions
      SET revoked_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND revoked_at IS NULL
    `).bind(userId));
  }

  if (!target.is_owner && body.role_id!==undefined) {
    stmts.push(env.DB.prepare(`
      DELETE FROM user_roles
      WHERE company_id=? AND user_id=?
    `).bind(companyId,userId));

    if (requestedRoleId) {
      stmts.push(env.DB.prepare(`
        INSERT INTO user_roles (company_id,user_id,role_id)
        VALUES (?,?,?)
      `).bind(companyId,userId,requestedRoleId));
    }
  }

  await env.DB.batch(stmts);

  const updated=await getCompanyUser(env,companyId,userId);

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"UPDATE",
    entity:"company_user",
    entityId:userId,
    before,
    after:{
      name:updated.name,
      email:updated.email,
      status:updated.status,
      role_id:updated.role_id
    },
    request
  });

  return updated;
}

async function createRole(env, request, auth, companyId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.role.manage");
  const id=uuid();
  await env.DB.prepare(`INSERT INTO roles (id,company_id,code,name,description) VALUES (?,?,?,?,?)`).bind(id,companyId,cleanText(required(body.code,"code"),50),cleanText(required(body.name,"name"),200),cleanText(body.description,1000)).run();
  const codes=Array.isArray(body.permissions)?body.permissions:[];
  if (codes.length) await env.DB.batch(codes.map(code=>env.DB.prepare(`INSERT OR IGNORE INTO role_permissions (role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?`).bind(id,code)));
  const row=await env.DB.prepare("SELECT * FROM roles WHERE id=?").bind(id).first();
  await audit(env,{companyId,userId:auth.user.id,action:"CREATE",entity:"role",entityId:id,after:row,request});
  return row;
}

async function getRoleDetails(env, auth, companyId, roleId) {
  await requirePermission(env,auth.user.id,companyId,"core.role.manage");
  const role=await env.DB.prepare(`
    SELECT id,company_id,code,name,description,system_role,created_at,updated_at
    FROM roles
    WHERE id=? AND company_id=?
  `).bind(roleId,companyId).first();
  if (!role) throw new HttpError(404,"Perfil não encontrado.","NOT_FOUND");

  const res=await env.DB.prepare(`
    SELECT p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=?
    ORDER BY p.module,p.code
  `).bind(roleId).all();

  return {...role,permissions:(res.results||[]).map(x=>x.code)};
}

async function updateRole(env, request, auth, companyId, roleId, body) {
  await requirePermission(env,auth.user.id,companyId,"core.role.manage");
  const current=await getRoleDetails(env,auth,companyId,roleId);

  if (current.system_role) {
    throw new HttpError(400,"Perfis do sistema são protegidos e não podem ser alterados.","VALIDATION_ERROR");
  }

  const code=cleanText(required(body.code===undefined?current.code:body.code,"code"),50);
  const name=cleanText(required(body.name===undefined?current.name:body.name,"name"),200);
  const description=body.description===undefined?current.description:cleanText(body.description,1000);

  let codes=current.permissions;
  if (body.permissions!==undefined) {
    if (!Array.isArray(body.permissions)) throw new HttpError(400,"Permissões inválidas.","VALIDATION_ERROR");
    codes=[...new Set(body.permissions.map(x=>String(x)))];
    if (!codes.length) throw new HttpError(400,"Selecione pelo menos uma permissão.","VALIDATION_ERROR");

    const all=await env.DB.prepare(`SELECT code FROM permissions`).all();
    const valid=new Set((all.results||[]).map(x=>x.code));
    const invalid=codes.filter(x=>!valid.has(x));
    if (invalid.length) throw new HttpError(400,`Permissão inválida: ${invalid[0]}.`,"VALIDATION_ERROR");
  }

  const stmts=[
    env.DB.prepare(`
      UPDATE roles
      SET code=?,name=?,description=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).bind(code,name,description,roleId,companyId),
    env.DB.prepare(`DELETE FROM role_permissions WHERE role_id=?`).bind(roleId),
    ...codes.map(code=>env.DB.prepare(`
      INSERT INTO role_permissions (role_id,permission_id)
      SELECT ?,id FROM permissions WHERE code=?
    `).bind(roleId,code))
  ];

  try {
    await env.DB.batch(stmts);
  } catch (err) {
    const msg=String(err?.message||err);
    if (msg.includes("UNIQUE")) throw new HttpError(400,"Já existe um perfil com esse código nesta empresa.","VALIDATION_ERROR");
    throw err;
  }

  const updated=await getRoleDetails(env,auth,companyId,roleId);

  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:"UPDATE",
    entity:"role",
    entityId:roleId,
    before:{code:current.code,name:current.name,description:current.description,permissions:current.permissions},
    after:{code:updated.code,name:updated.name,description:updated.description,permissions:updated.permissions},
    request
  });

  return updated;
}



// ===== purchasing.js =====
const PURCHASE_PERMISSION_DEFS=[
  ["purchasing.product.read","Consultar produtos e serviços"],
  ["purchasing.product.manage","Gerenciar produtos e serviços"],
  ["purchasing.supplier.read","Consultar fornecedores"],
  ["purchasing.supplier.manage","Gerenciar fornecedores"],
  ["purchasing.request.read","Consultar solicitações de compra"],
  ["purchasing.request.manage","Gerenciar solicitações de compra"],
  ["purchasing.quotation.read","Consultar cotações"],
  ["purchasing.quotation.manage","Gerenciar cotações"],
  ["purchasing.order.read","Consultar ordens de compra"],
  ["purchasing.order.manage","Gerenciar ordens de compra"],
  ["purchasing.receipt.read","Consultar recebimentos"],
  ["purchasing.receipt.manage","Registrar recebimentos"]
];

async function ensurePurchasingSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_products (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, description TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'PRODUCT', unit TEXT NOT NULL DEFAULT 'UN', purchase_unit TEXT,
      notes TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_suppliers (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      tax_id TEXT, email TEXT, phone TEXT, contact_name TEXT, notes TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_requests (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, number TEXT NOT NULL, branch_id TEXT,
      request_date TEXT NOT NULL, needed_date TEXT, requester_name TEXT NOT NULL, notes TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN', created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,number)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_request_items (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, request_id TEXT NOT NULL, line_no INTEGER NOT NULL,
      product_id TEXT NOT NULL, description TEXT NOT NULL, quantity_milli INTEGER NOT NULL, unit TEXT NOT NULL,
      cost_center_id TEXT, needed_date TEXT, notes TEXT,
      ordered_qty_milli INTEGER NOT NULL DEFAULT 0, received_qty_milli INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(request_id,line_no)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_quotations (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, number TEXT NOT NULL, request_id TEXT NOT NULL,
      buyer_name TEXT, quote_date TEXT NOT NULL, response_deadline TEXT, expected_delivery TEXT,
      notes TEXT, status TEXT NOT NULL DEFAULT 'OPEN', created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,number)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_quotation_suppliers (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, quotation_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
      freight_cents INTEGER NOT NULL DEFAULT 0, payment_terms TEXT, notes TEXT,
      status TEXT NOT NULL DEFAULT 'INVITED', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(quotation_id,supplier_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_quotation_items (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, quotation_id TEXT NOT NULL, request_item_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL, unit_price_cents INTEGER, delivery_date TEXT, selected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(quotation_id,request_item_id,supplier_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, number TEXT NOT NULL, quotation_id TEXT,
      request_id TEXT, supplier_id TEXT NOT NULL, branch_id TEXT, order_date TEXT NOT NULL,
      expected_delivery TEXT, payment_terms TEXT, freight_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT, status TEXT NOT NULL DEFAULT 'OPEN', created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,number)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, order_id TEXT NOT NULL, request_item_id TEXT,
      product_id TEXT NOT NULL, description TEXT NOT NULL, quantity_milli INTEGER NOT NULL, unit TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, cost_center_id TEXT,
      received_qty_milli INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_receipts (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, number TEXT NOT NULL, order_id TEXT NOT NULL,
      receipt_date TEXT NOT NULL, document_number TEXT, notes TEXT, created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,number)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_receipt_items (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, receipt_id TEXT NOT NULL, order_item_id TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_stock_balances (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,product_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_stock_movements (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, product_id TEXT NOT NULL,
      movement_date TEXT NOT NULL, movement_type TEXT NOT NULL, quantity_milli INTEGER NOT NULL,
      source_type TEXT, source_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request ON purchase_request_items(company_id,request_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_quote_request ON purchase_quotations(company_id,request_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_order_request ON purchase_orders(company_id,request_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_receipt_order ON purchase_receipts(company_id,order_id)`)
  ]);

  for (const [code,description] of PURCHASE_PERMISSION_DEFS) {
    const exists=await env.DB.prepare(`SELECT id FROM permissions WHERE code=?`).bind(code).first();
    if (!exists) {
      const id=uuid();
      await env.DB.prepare(`INSERT INTO permissions (id,code,module,description) VALUES (?,?,'PURCHASES',?)`).bind(id,code,description).run();
    }
  }

  // Local de estoque foi removido do SAGAS: elimina as permissões antigas da interface de segurança.
  await env.DB.prepare(`DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('purchasing.location.read','purchasing.location.manage'))`).run();
  await env.DB.prepare(`DELETE FROM permissions WHERE code IN ('purchasing.location.read','purchasing.location.manage')`).run();

  // Migra uma única vez os saldos antigos por local para saldo consolidado por produto, quando existirem.
  const legacyStock=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stock_balances'`).first();
  if(legacyStock){
    const rows=await env.DB.prepare(`SELECT company_id,product_id,SUM(quantity_milli) AS quantity_milli,MAX(updated_at) AS updated_at FROM stock_balances GROUP BY company_id,product_id`).all();
    for(const r of rows.results||[]){
      const exists=await env.DB.prepare(`SELECT id FROM product_stock_balances WHERE company_id=? AND product_id=?`).bind(r.company_id,r.product_id).first();
      if(!exists) await env.DB.prepare(`INSERT INTO product_stock_balances (id,company_id,product_id,quantity_milli,updated_at) VALUES (?,?,?,?,?)`).bind(uuid(),r.company_id,r.product_id,Number(r.quantity_milli||0),r.updated_at||new Date().toISOString()).run();
    }
  }

  // O perfil Administrador do sistema continua com acesso total às novas funções.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code='ADMIN' AND p.module='PURCHASES'
  `).run();
}

function qtyToMilli(value, field='quantidade') {
  if (typeof value==='number') {
    if (!Number.isFinite(value) || value<=0) throw new HttpError(400,`${field} inválida.`,`VALIDATION_ERROR`);
    return Math.round(value*1000);
  }
  const s=String(value??'').trim().replace(/\./g,'').replace(',','.');
  if (!s || !/^\d+(\.\d{1,3})?$/.test(s) || Number(s)<=0) throw new HttpError(400,`${field} inválida.`,`VALIDATION_ERROR`);
  return Math.round(Number(s)*1000);
}
function milliToQty(v){return Number(v||0)/1000;}

async function purchaseEntity(env,table,id,companyId) {
  const allowed=new Set([
    'purchase_products','purchase_suppliers','purchase_requests','purchase_quotations',
    'purchase_orders','purchase_receipts','purchase_request_items','purchase_order_items'
  ]);
  if (!allowed.has(table)) throw new Error('Tabela de compras não permitida');
  const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).bind(id,companyId).first();
  if (!row) throw new HttpError(404,'Registro de compras não encontrado.','NOT_FOUND');
  return row;
}

async function nextPurchaseNumber(env,companyId,table,prefix) {
  const row=await env.DB.prepare(`
    SELECT MAX(CAST(SUBSTR(number,?) AS INTEGER)) AS max_no
    FROM ${table} WHERE company_id=? AND number LIKE ?
  `).bind(prefix.length+1,companyId,`${prefix}%`).first();
  return prefix+String((Number(row?.max_no)||0)+1).padStart(6,'0');
}

function purchaseStatusLabel(s){
  return ({OPEN:'Aberta',RELEASED:'Liberada',QUOTING:'Em cotação',ORDERED:'Pedido gerado',PARTIAL:'Parcial',FULFILLED:'Atendida',CANCELLED:'Cancelada',RECEIVED:'Recebida'})[s]||s;
}

async function listPurchaseMaster(env,companyId,table,columns) {
  const res=await env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE company_id=? ORDER BY code`).bind(companyId).all();
  return res.results||[];
}

async function savePurchaseProduct(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.product.manage');
  const code=cleanText(required(body.code,'code'),50), description=cleanText(required(body.description,'description'),500);
  const itemType=String(body.item_type||'PRODUCT').toUpperCase()==='SERVICE'?'SERVICE':'PRODUCT';
  const unit=cleanText(required(body.unit,'unit'),20).toUpperCase();
  const purchaseUnit=cleanText(body.purchase_unit||unit,20)?.toUpperCase();
  const active=bool01(body.active,1), notes=cleanText(body.notes,1000);
  const natureId=cleanText(body.budget_nature_id,80)||null;
  if(natureId){
    const nature=await env.DB.prepare(`SELECT id,active,synthetic_analytic FROM budget_natures WHERE id=? AND company_id=?`).bind(natureId,companyId).first();
    if(!nature) throw new HttpError(404,'Natureza Orçamentária/Financeira não encontrada.','NOT_FOUND');
    if(!nature.active||nature.synthetic_analytic!=='ANALYTIC') throw new HttpError(409,'A Natureza padrão do produto deve ser analítica e ativa.','INVALID_NATURE');
  }
  if (id) {
    const before=await purchaseEntity(env,'purchase_products',id,companyId);
    await env.DB.prepare(`UPDATE purchase_products SET code=?,description=?,item_type=?,unit=?,purchase_unit=?,budget_nature_id=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
      .bind(code,description,itemType,unit,purchaseUnit,natureId,notes,active,id,companyId).run();
    const after=await purchaseEntity(env,'purchase_products',id,companyId);
    await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_product',entityId:id,before,after,request}); return after;
  }
  const newId=uuid();
  await env.DB.prepare(`INSERT INTO purchase_products (id,company_id,code,description,item_type,unit,purchase_unit,budget_nature_id,notes,active) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(newId,companyId,code,description,itemType,unit,purchaseUnit,natureId,notes,active).run();
  const after=await purchaseEntity(env,'purchase_products',newId,companyId);
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_product',entityId:newId,after,request}); return after;
}

async function savePurchaseSupplier(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.supplier.manage');
  const code=cleanText(required(body.code,'code'),50), name=cleanText(required(body.name,'name'),500);
  const vals=[code,name,cleanText(body.tax_id,30),cleanText(body.email,250),cleanText(body.phone,60),cleanText(body.contact_name,250),cleanText(body.notes,1000),bool01(body.active,1)];
  if (id) {
    const before=await purchaseEntity(env,'purchase_suppliers',id,companyId);
    await env.DB.prepare(`UPDATE purchase_suppliers SET code=?,name=?,tax_id=?,email=?,phone=?,contact_name=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(...vals,id,companyId).run();
    const after=await purchaseEntity(env,'purchase_suppliers',id,companyId); await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_supplier',entityId:id,before,after,request}); return after;
  }
  const newId=uuid(); await env.DB.prepare(`INSERT INTO purchase_suppliers (id,company_id,code,name,tax_id,email,phone,contact_name,notes,active) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(newId,companyId,...vals).run();
  const after=await purchaseEntity(env,'purchase_suppliers',newId,companyId); await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_supplier',entityId:newId,after,request}); return after;
}

async function deletePurchaseMaster(env,request,auth,companyId,type,id) {
  const cfg={
    product:{table:'purchase_products',perm:'purchasing.product.manage',checks:[['purchase_request_items','product_id'],['purchase_order_items','product_id']]},
    supplier:{table:'purchase_suppliers',perm:'purchasing.supplier.manage',checks:[['purchase_quotation_suppliers','supplier_id'],['purchase_orders','supplier_id']]}
  }[type];
  await requirePermission(env,auth.user.id,companyId,cfg.perm);
  const before=await purchaseEntity(env,cfg.table,id,companyId);
  for (const [table,col] of cfg.checks) {
    const used=await env.DB.prepare(`SELECT 1 FROM ${table} WHERE company_id=? AND ${col}=? LIMIT 1`).bind(companyId,id).first();
    if (used) {
      await env.DB.prepare(`UPDATE ${cfg.table} SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
      await audit(env,{companyId,userId:auth.user.id,action:'INACTIVATE',entity:type,entityId:id,before,request});
      return {deleted:false,inactivated:true,id};
    }
  }
  await env.DB.prepare(`DELETE FROM ${cfg.table} WHERE id=? AND company_id=?`).bind(id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:type,entityId:id,before,request});
  return {deleted:true,id};
}

async function listPurchaseRequests(env,companyId) {
  const res=await env.DB.prepare(`
    SELECT r.id,r.number,r.request_date,r.needed_date,r.requester_name,r.status,r.notes,r.branch_id,r.movement_type_id,
           b.code AS branch_code,b.name AS branch_name,mt.code AS movement_type_code,mt.name AS movement_type_name,
           COUNT(i.id) AS item_count
    FROM purchase_requests r
    LEFT JOIN branches b ON b.id=r.branch_id
    LEFT JOIN movement_types mt ON mt.id=r.movement_type_id
    LEFT JOIN purchase_request_items i ON i.request_id=r.id AND i.company_id=r.company_id
    WHERE r.company_id=? GROUP BY r.id ORDER BY r.request_date DESC,r.number DESC
  `).bind(companyId).all();
  return (res.results||[]).map(x=>({...x,item_count:Number(x.item_count||0)}));
}

async function getPurchaseRequest(env,companyId,id) {
  const req=await env.DB.prepare(`
    SELECT r.*,b.code AS branch_code,b.name AS branch_name,u.name AS created_by_name,
           mt.code AS movement_type_code,mt.name AS movement_type_name,mt.fetch_product_nature,mt.allow_edit_item_nature
    FROM purchase_requests r
    LEFT JOIN branches b ON b.id=r.branch_id
    LEFT JOIN users u ON u.id=r.created_by
    LEFT JOIN movement_types mt ON mt.id=r.movement_type_id
    WHERE r.id=? AND r.company_id=?
  `).bind(id,companyId).first();
  if(!req)throw new HttpError(404,'Solicitação não encontrada.','NOT_FOUND');
  const items=await env.DB.prepare(`
    SELECT i.*,p.code AS product_code,p.description AS product_description,p.item_type,p.unit AS product_unit,
           n.code AS nature_code,n.description AS nature_description,
           cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM purchase_request_items i
    JOIN purchase_products p ON p.id=i.product_id
    LEFT JOIN budget_natures n ON n.id=i.budget_nature_id
    LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id
    WHERE i.company_id=? AND i.request_id=? ORDER BY i.line_no
  `).bind(companyId,id).all();
  return {...req,items:(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli),ordered_qty:milliToQty(x.ordered_qty_milli),received_qty:milliToQty(x.received_qty_milli)}))};
}

async function validatePurchaseRequestItems(env,companyId,items,movementType) {
  if(!Array.isArray(items)||!items.length)throw new HttpError(400,'Inclua pelo menos um item na solicitação.','VALIDATION_ERROR');
  const out=[]; let no=1;
  for(const raw of items){
    const product=await purchaseEntity(env,'purchase_products',required(raw.product_id,'produto'),companyId);
    if(!product.active)throw new HttpError(409,`Produto/serviço ${product.code} está inativo.`,'INACTIVE_PRODUCT');
    let cc=null;
    const ccId=raw.cost_center_id||movementType.default_cost_center_id||null;
    if(ccId){ cc=await assertCompanyEntity(env,'cost_centers',ccId,companyId); if(!cc.active)throw new HttpError(409,'Centro de custo inativo.','INACTIVE_COST_CENTER'); }

    let natureId=cleanText(raw.budget_nature_id,80)||null;
    if(movementType.fetch_product_nature && product.budget_nature_id) natureId=product.budget_nature_id;
    if(!movementType.allow_edit_item_nature && product.budget_nature_id) natureId=product.budget_nature_id;
    if(natureId){
      const n=await env.DB.prepare(`SELECT id,active,synthetic_analytic FROM budget_natures WHERE id=? AND company_id=?`).bind(natureId,companyId).first();
      if(!n||!n.active||n.synthetic_analytic!=='ANALYTIC') throw new HttpError(409,`Natureza Orçamentária/Financeira inválida no item ${product.code}.`,'INVALID_NATURE');
    }
    out.push({
      id:raw.id||uuid(),line_no:no++,product_id:product.id,description:cleanText(raw.description||product.description,500),
      quantity_milli:qtyToMilli(raw.quantity),unit:cleanText(raw.unit||product.purchase_unit||product.unit,20).toUpperCase(),
      budget_nature_id:natureId,cost_center_id:cc?.id||null,
      needed_date:raw.needed_date?isoDate(raw.needed_date,'data necessária do item'):null,notes:cleanText(raw.notes,1000)
    });
  }
  return out;
}

async function createPurchaseRequest(env,request,auth,companyId,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const movementType=await getMovementType(env,companyId,required(body.movement_type_id,'Tipo de Movimento'));
  if(!movementType.active) throw new HttpError(409,'O Tipo de Movimento está inativo.','INACTIVE_MOVEMENT_TYPE');
  const branchId=body.branch_id||null; if(branchId)await assertCompanyEntity(env,'branches',branchId,companyId);
  const items=await validatePurchaseRequestItems(env,companyId,body.items,movementType);
  const id=uuid(),number=await nextMovementNumber(env,companyId,movementType.id);
  const requestDate=isoDate(body.request_date||new Date().toISOString().slice(0,10),'data da solicitação');
  const neededDate=body.needed_date?isoDate(body.needed_date,'data necessária'):null;
  const requester=cleanText(required(body.requester_name,'solicitante'),250),notes=cleanText(body.notes,2000);
  const stmts=[env.DB.prepare(`
    INSERT INTO purchase_requests
      (id,company_id,number,branch_id,request_date,needed_date,requester_name,notes,status,created_by,movement_type_id)
    VALUES (?,?,?,?,?,?,?,?, 'OPEN',?,?)
  `).bind(id,companyId,number,branchId,requestDate,neededDate,requester,notes,auth.user.id,movementType.id)];
  for(const x of items)stmts.push(env.DB.prepare(`
    INSERT INTO purchase_request_items
      (id,company_id,request_id,line_no,product_id,description,quantity_milli,unit,budget_nature_id,cost_center_id,needed_date,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(x.id,companyId,id,x.line_no,x.product_id,x.description,x.quantity_milli,x.unit,x.budget_nature_id,x.cost_center_id,x.needed_date,x.notes));
  await env.DB.batch(stmts);
  const after=await getPurchaseRequest(env,companyId,id);
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_request',entityId:id,after:{number,status:'OPEN',movement_type:movementType.code},request});
  return after;
}

async function updatePurchaseRequest(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const before=await getPurchaseRequest(env,companyId,id); if(before.status!=='OPEN')throw new HttpError(409,'Somente solicitação aberta pode ser editada.','INVALID_STATUS');
  const movementType=await getMovementType(env,companyId,body.movement_type_id||before.movement_type_id);
  if(!movementType.active) throw new HttpError(409,'O Tipo de Movimento está inativo.','INACTIVE_MOVEMENT_TYPE');
  const branchId=body.branch_id||null; if(branchId)await assertCompanyEntity(env,'branches',branchId,companyId);
  const items=await validatePurchaseRequestItems(env,companyId,body.items,movementType);
  const requestDate=isoDate(body.request_date||before.request_date,'data da solicitação'),neededDate=body.needed_date?isoDate(body.needed_date,'data necessária'):null;
  const stmts=[
    env.DB.prepare(`DELETE FROM purchase_request_items WHERE company_id=? AND request_id=?`).bind(companyId,id),
    env.DB.prepare(`UPDATE purchase_requests SET branch_id=?,request_date=?,needed_date=?,requester_name=?,notes=?,movement_type_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
      .bind(branchId,requestDate,neededDate,cleanText(required(body.requester_name,'solicitante'),250),cleanText(body.notes,2000),movementType.id,id,companyId)
  ];
  for(const x of items)stmts.push(env.DB.prepare(`
    INSERT INTO purchase_request_items
      (id,company_id,request_id,line_no,product_id,description,quantity_milli,unit,budget_nature_id,cost_center_id,needed_date,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(x.id,companyId,id,x.line_no,x.product_id,x.description,x.quantity_milli,x.unit,x.budget_nature_id,x.cost_center_id,x.needed_date,x.notes));
  await env.DB.batch(stmts);
  const after=await getPurchaseRequest(env,companyId,id);
  await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_request',entityId:id,before:{number:before.number},after:{number:after.number},request});
  return after;
}

async function setPurchaseRequestStatus(env,request,auth,companyId,id,target) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const before=await purchaseEntity(env,'purchase_requests',id,companyId);
  if(target==='RELEASED'&&before.status!=='OPEN')throw new HttpError(409,'Somente solicitação aberta pode ser liberada.','INVALID_STATUS');
  if(target==='CANCELLED'&&!['OPEN','RELEASED'].includes(before.status))throw new HttpError(409,'Esta solicitação já possui processo de compra em andamento e não pode ser cancelada por aqui.','INVALID_STATUS');
  await env.DB.prepare(`UPDATE purchase_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(target,id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:target==='RELEASED'?'RELEASE':'CANCEL',entity:'purchase_request',entityId:id,before:{status:before.status},after:{status:target},request});
  return getPurchaseRequest(env,companyId,id);
}

async function deletePurchaseRequest(env,request,auth,companyId,id) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const before=await purchaseEntity(env,'purchase_requests',id,companyId); if(before.status!=='OPEN')throw new HttpError(409,'Somente solicitação aberta pode ser excluída.','INVALID_STATUS');
  const quote=await env.DB.prepare(`SELECT 1 FROM purchase_quotations WHERE company_id=? AND request_id=? LIMIT 1`).bind(companyId,id).first(); if(quote)throw new HttpError(409,'A solicitação já está vinculada a cotação.','IN_USE');
  await env.DB.batch([env.DB.prepare(`DELETE FROM purchase_request_items WHERE company_id=? AND request_id=?`).bind(companyId,id),env.DB.prepare(`DELETE FROM purchase_requests WHERE company_id=? AND id=?`).bind(companyId,id)]);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'purchase_request',entityId:id,before,request}); return {deleted:true,id};
}

async function listQuotations(env,companyId) {
  const r=await env.DB.prepare(`
    SELECT q.id,q.number,q.quote_date,q.response_deadline,q.expected_delivery,q.buyer_name,q.status,q.notes,
           pr.number AS request_number,COUNT(DISTINCT qs.supplier_id) AS supplier_count
    FROM purchase_quotations q JOIN purchase_requests pr ON pr.id=q.request_id
    LEFT JOIN purchase_quotation_suppliers qs ON qs.quotation_id=q.id AND qs.company_id=q.company_id
    WHERE q.company_id=? GROUP BY q.id ORDER BY q.quote_date DESC,q.number DESC
  `).bind(companyId).all(); return (r.results||[]).map(x=>({...x,supplier_count:Number(x.supplier_count||0)}));
}

async function getQuotation(env,companyId,id) {
  const q=await env.DB.prepare(`SELECT q.*,pr.number AS request_number,pr.requester_name,pr.branch_id FROM purchase_quotations q JOIN purchase_requests pr ON pr.id=q.request_id WHERE q.id=? AND q.company_id=?`).bind(id,companyId).first();
  if(!q)throw new HttpError(404,'Cotação não encontrada.','NOT_FOUND');
  const suppliers=await env.DB.prepare(`SELECT qs.*,s.code AS supplier_code,s.name AS supplier_name,s.tax_id FROM purchase_quotation_suppliers qs JOIN purchase_suppliers s ON s.id=qs.supplier_id WHERE qs.company_id=? AND qs.quotation_id=? ORDER BY s.code`).bind(companyId,id).all();
  const req=await getPurchaseRequest(env,companyId,q.request_id);
  const proposals=await env.DB.prepare(`SELECT qi.*,s.code AS supplier_code,s.name AS supplier_name FROM purchase_quotation_items qi JOIN purchase_suppliers s ON s.id=qi.supplier_id WHERE qi.company_id=? AND qi.quotation_id=?`).bind(companyId,id).all();
  return {...q,request:req,suppliers:(suppliers.results||[]).map(x=>({...x,freight:centsToMoney(x.freight_cents)})),proposals:(proposals.results||[]).map(x=>({...x,unit_price:x.unit_price_cents==null?null:centsToMoney(x.unit_price_cents)}))};
}

async function createQuotation(env,request,auth,companyId,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.quotation.manage');
  const req=await purchaseEntity(env,'purchase_requests',required(body.request_id,'solicitação'),companyId); if(req.status!=='RELEASED')throw new HttpError(409,'A solicitação precisa estar liberada para cotação.','INVALID_STATUS');
  const supplierIds=[...new Set((Array.isArray(body.supplier_ids)?body.supplier_ids:[]).filter(Boolean))]; if(!supplierIds.length)throw new HttpError(400,'Selecione ao menos um fornecedor.','VALIDATION_ERROR');
  for(const sid of supplierIds){const s=await purchaseEntity(env,'purchase_suppliers',sid,companyId);if(!s.active)throw new HttpError(409,`Fornecedor ${s.code} está inativo.`,'INACTIVE_SUPPLIER');}
  const id=uuid(),number=await nextPurchaseNumber(env,companyId,'purchase_quotations','COT-'),quoteDate=isoDate(body.quote_date||new Date().toISOString().slice(0,10),'data da cotação');
  const stmts=[env.DB.prepare(`INSERT INTO purchase_quotations (id,company_id,number,request_id,buyer_name,quote_date,response_deadline,expected_delivery,notes,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,'OPEN',?)`).bind(id,companyId,number,req.id,cleanText(body.buyer_name,250),quoteDate,body.response_deadline?isoDate(body.response_deadline,'limite de resposta'):null,body.expected_delivery?isoDate(body.expected_delivery,'previsão de entrega'):null,cleanText(body.notes,2000),auth.user.id),env.DB.prepare(`UPDATE purchase_requests SET status='QUOTING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(req.id,companyId)];
  for(const sid of supplierIds)stmts.push(env.DB.prepare(`INSERT INTO purchase_quotation_suppliers (id,company_id,quotation_id,supplier_id) VALUES (?,?,?,?)`).bind(uuid(),companyId,id,sid));
  await env.DB.batch(stmts); await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_quotation',entityId:id,after:{number,request_id:req.id},request}); return getQuotation(env,companyId,id);
}

async function saveQuotationProposals(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.quotation.manage');
  const q=await purchaseEntity(env,'purchase_quotations',id,companyId); if(q.status!=='OPEN')throw new HttpError(409,'Somente cotação aberta pode ser alterada.','INVALID_STATUS');
  const details=await getQuotation(env,companyId,id),supplierSet=new Set(details.suppliers.map(x=>x.supplier_id)),itemSet=new Set(details.request.items.map(x=>x.id));
  const proposals=Array.isArray(body.proposals)?body.proposals:[],supplierTerms=Array.isArray(body.suppliers)?body.suppliers:[];
  const stmts=[env.DB.prepare(`DELETE FROM purchase_quotation_items WHERE company_id=? AND quotation_id=?`).bind(companyId,id)];
  for(const st of supplierTerms){if(!supplierSet.has(st.supplier_id))continue;stmts.push(env.DB.prepare(`UPDATE purchase_quotation_suppliers SET freight_cents=?,payment_terms=?,notes=?,status=? WHERE company_id=? AND quotation_id=? AND supplier_id=?`).bind(moneyToCents(st.freight||0),cleanText(st.payment_terms,500),cleanText(st.notes,1000),st.responded===false?'INVITED':'RESPONDED',companyId,id,st.supplier_id));}
  const selectedByItem=new Map();
  for(const p of proposals){if(!supplierSet.has(p.supplier_id)||!itemSet.has(p.request_item_id))continue;const hasPrice=String(p.unit_price??'').trim()!=='';if(!hasPrice)continue;const cents=moneyToCents(p.unit_price);if(cents<0)throw new HttpError(400,'Preço unitário inválido.','VALIDATION_ERROR');const selected=!!p.selected;if(selected){if(selectedByItem.has(p.request_item_id))throw new HttpError(400,'Selecione apenas um fornecedor por item.','VALIDATION_ERROR');selectedByItem.set(p.request_item_id,p.supplier_id);}stmts.push(env.DB.prepare(`INSERT INTO purchase_quotation_items (id,company_id,quotation_id,request_item_id,supplier_id,unit_price_cents,delivery_date,selected) VALUES (?,?,?,?,?,?,?,?)`).bind(uuid(),companyId,id,p.request_item_id,p.supplier_id,cents,p.delivery_date?isoDate(p.delivery_date,'data de entrega proposta'):null,selected?1:0));}
  await env.DB.batch(stmts); await audit(env,{companyId,userId:auth.user.id,action:'UPDATE_PROPOSALS',entity:'purchase_quotation',entityId:id,after:{proposals:proposals.length,selections:selectedByItem.size},request}); return getQuotation(env,companyId,id);
}

async function cancelQuotation(env,request,auth,companyId,id) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.quotation.manage'); const q=await purchaseEntity(env,'purchase_quotations',id,companyId); if(q.status!=='OPEN')throw new HttpError(409,'Somente cotação aberta pode ser cancelada.','INVALID_STATUS');
  await env.DB.batch([env.DB.prepare(`UPDATE purchase_quotations SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId),env.DB.prepare(`UPDATE purchase_requests SET status='RELEASED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='QUOTING'`).bind(q.request_id,companyId)]); await audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'purchase_quotation',entityId:id,request}); return getQuotation(env,companyId,id);
}

async function generateOrdersFromQuotation(env,request,auth,companyId,id,body={}) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.order.manage');
  const q=await getQuotation(env,companyId,id); if(q.status!=='OPEN')throw new HttpError(409,'A cotação não está aberta para geração de ordem.','INVALID_STATUS');
  const destType=await assertMovementDestination(env,companyId,q.request.movement_type_id,required(body.movement_type_id,'Tipo de Movimento destino'));
  const selected=q.proposals.filter(x=>Number(x.selected)===1&&x.unit_price_cents!=null); const allItems=q.request.items;
  const selectedMap=new Map(selected.map(x=>[x.request_item_id,x])); const missing=allItems.filter(x=>!selectedMap.has(x.id)); if(missing.length)throw new HttpError(409,`Selecione o fornecedor vencedor de todos os ${allItems.length} itens antes de gerar as ordens.`,'MISSING_WINNERS');
  const supplierConfig=new Map(q.suppliers.map(x=>[x.supplier_id,x])),groups=new Map();
  for(const item of allItems){const p=selectedMap.get(item.id);if(!groups.has(p.supplier_id))groups.set(p.supplier_id,[]);groups.get(p.supplier_id).push({item,proposal:p});}
  const created=[];
  for(const [supplierId,rows] of groups){
    const oid=uuid(),number=await nextMovementNumber(env,companyId,destType.id),sc=supplierConfig.get(supplierId)||{};
    const stmts=[env.DB.prepare(`
      INSERT INTO purchase_orders
      (id,company_id,number,quotation_id,request_id,supplier_id,branch_id,order_date,expected_delivery,payment_terms,freight_cents,notes,status,created_by,movement_type_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'OPEN',?,?)
    `).bind(oid,companyId,number,q.id,q.request_id,supplierId,q.branch_id,new Date().toISOString().slice(0,10),q.expected_delivery||null,sc.payment_terms||null,Number(sc.freight_cents||0),q.notes||null,auth.user.id,destType.id)];
    for(const row of rows){
      const total=Math.round(Number(row.item.quantity_milli)*Number(row.proposal.unit_price_cents)/1000);
      stmts.push(env.DB.prepare(`
        INSERT INTO purchase_order_items
        (id,company_id,order_id,request_item_id,product_id,description,quantity_milli,unit,unit_price_cents,total_cents,budget_nature_id,cost_center_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(uuid(),companyId,oid,row.item.id,row.item.product_id,row.item.description,row.item.quantity_milli,row.item.unit,row.proposal.unit_price_cents,total,row.item.budget_nature_id||null,row.item.cost_center_id));
      stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET ordered_qty_milli=ordered_qty_milli+? WHERE id=? AND company_id=?`).bind(row.item.quantity_milli,row.item.id,companyId));
    }
    await env.DB.batch(stmts); created.push({id:oid,number,supplier_id:supplierId,movement_type_id:destType.id,movement_type_code:destType.code});
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE purchase_quotations SET status='ORDERED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId),
    env.DB.prepare(`UPDATE purchase_requests SET status='ORDERED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(q.request_id,companyId)
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:'GENERATE_ORDERS',entity:'purchase_quotation',entityId:id,after:{movement_type:destType.code,orders:created.map(x=>x.number)},request});
  return {orders:created};
}

async function listOrders(env,companyId) {
  const r=await env.DB.prepare(`
    SELECT o.id,o.number,o.order_date,o.expected_delivery,o.status,o.freight_cents,o.movement_type_id,
           mt.code AS movement_type_code,mt.name AS movement_type_name,
           s.code AS supplier_code,s.name AS supplier_name,q.number AS quotation_number,r.number AS request_number,
           COUNT(i.id) AS item_count,COALESCE(SUM(i.total_cents),0)+o.freight_cents AS total_cents
    FROM purchase_orders o
    JOIN purchase_suppliers s ON s.id=o.supplier_id
    LEFT JOIN movement_types mt ON mt.id=o.movement_type_id
    LEFT JOIN purchase_quotations q ON q.id=o.quotation_id
    LEFT JOIN purchase_requests r ON r.id=o.request_id
    LEFT JOIN purchase_order_items i ON i.order_id=o.id AND i.company_id=o.company_id
    WHERE o.company_id=? GROUP BY o.id ORDER BY o.order_date DESC,o.number DESC
  `).bind(companyId).all();
  return (r.results||[]).map(x=>({...x,freight:centsToMoney(x.freight_cents),total:centsToMoney(x.total_cents),item_count:Number(x.item_count||0)}));
}

async function getOrder(env,companyId,id) {
  const o=await env.DB.prepare(`
    SELECT o.*,s.code AS supplier_code,s.name AS supplier_name,s.tax_id,s.email,s.phone,
           q.number AS quotation_number,r.number AS request_number,b.code AS branch_code,b.name AS branch_name,
           u.name AS created_by_name,mt.code AS movement_type_code,mt.name AS movement_type_name
    FROM purchase_orders o
    JOIN purchase_suppliers s ON s.id=o.supplier_id
    LEFT JOIN purchase_quotations q ON q.id=o.quotation_id
    LEFT JOIN purchase_requests r ON r.id=o.request_id
    LEFT JOIN branches b ON b.id=o.branch_id
    LEFT JOIN users u ON u.id=o.created_by
    LEFT JOIN movement_types mt ON mt.id=o.movement_type_id
    WHERE o.id=? AND o.company_id=?
  `).bind(id,companyId).first();
  if(!o)throw new HttpError(404,'Ordem de compra não encontrada.','NOT_FOUND');
  const items=await env.DB.prepare(`
    SELECT i.*,p.code AS product_code,p.item_type,n.code AS nature_code,n.description AS nature_description,
           cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM purchase_order_items i
    JOIN purchase_products p ON p.id=i.product_id
    LEFT JOIN budget_natures n ON n.id=i.budget_nature_id
    LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id
    WHERE i.company_id=? AND i.order_id=? ORDER BY i.created_at
  `).bind(companyId,id).all();
  const arr=(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli),received_qty:milliToQty(x.received_qty_milli),remaining_qty:milliToQty(Math.max(0,x.quantity_milli-x.received_qty_milli)),unit_price:centsToMoney(x.unit_price_cents),total:centsToMoney(x.total_cents)}));
  return {...o,freight:centsToMoney(o.freight_cents),items:arr,total:centsToMoney(arr.reduce((s,x)=>s+x.total_cents,Number(o.freight_cents||0)))};
}

async function cancelOrder(env,request,auth,companyId,id) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.order.manage'); const o=await purchaseEntity(env,'purchase_orders',id,companyId); if(!['OPEN'].includes(o.status))throw new HttpError(409,'Somente ordem aberta e sem recebimento pode ser cancelada.','INVALID_STATUS');
  const receipt=await env.DB.prepare(`SELECT 1 FROM purchase_receipts WHERE company_id=? AND order_id=? LIMIT 1`).bind(companyId,id).first(); if(receipt)throw new HttpError(409,'A ordem já possui recebimento.','IN_USE');
  const items=await env.DB.prepare(`SELECT request_item_id,quantity_milli FROM purchase_order_items WHERE company_id=? AND order_id=?`).bind(companyId,id).all(); const stmts=[env.DB.prepare(`UPDATE purchase_orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId)]; for(const x of items.results||[])if(x.request_item_id)stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET ordered_qty_milli=MAX(0,ordered_qty_milli-?) WHERE id=? AND company_id=?`).bind(x.quantity_milli,x.request_item_id,companyId)); await env.DB.batch(stmts); await audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'purchase_order',entityId:id,request}); return getOrder(env,companyId,id);
}

async function listReceipts(env,companyId) {
  const r=await env.DB.prepare(`
    SELECT rec.id,rec.number,rec.receipt_date,rec.document_number,rec.created_at,rec.movement_type_id,
           mt.code AS movement_type_code,mt.name AS movement_type_name,
           o.number AS order_number,s.code AS supplier_code,s.name AS supplier_name,COUNT(ri.id) AS item_count
    FROM purchase_receipts rec
    JOIN purchase_orders o ON o.id=rec.order_id
    JOIN purchase_suppliers s ON s.id=o.supplier_id
    LEFT JOIN movement_types mt ON mt.id=rec.movement_type_id
    LEFT JOIN purchase_receipt_items ri ON ri.receipt_id=rec.id AND ri.company_id=rec.company_id
    WHERE rec.company_id=? GROUP BY rec.id ORDER BY rec.receipt_date DESC,rec.number DESC
  `).bind(companyId).all();
  return (r.results||[]).map(x=>({...x,item_count:Number(x.item_count||0)}));
}

async function getReceipt(env,companyId,id) {
  const rec=await env.DB.prepare(`
    SELECT rec.*,o.number AS order_number,s.code AS supplier_code,s.name AS supplier_name,u.name AS created_by_name,
           mt.code AS movement_type_code,mt.name AS movement_type_name,
           ev.code AS accounting_event_code,ev.name AS accounting_event_name,
           jb.code AS accounting_batch_code,jb.description AS accounting_batch_description
    FROM purchase_receipts rec
    JOIN purchase_orders o ON o.id=rec.order_id
    JOIN purchase_suppliers s ON s.id=o.supplier_id
    LEFT JOIN users u ON u.id=rec.created_by
    LEFT JOIN movement_types mt ON mt.id=rec.movement_type_id
    LEFT JOIN movement_accounting_events ev ON ev.id=rec.accounting_event_id
    LEFT JOIN journal_batches jb ON jb.id=rec.accounting_batch_id
    WHERE rec.id=? AND rec.company_id=?
  `).bind(id,companyId).first();
  if(!rec)throw new HttpError(404,'Recebimento não encontrado.','NOT_FOUND');
  const items=await env.DB.prepare(`
    SELECT ri.*,oi.description,oi.unit,p.code AS product_code,n.code AS nature_code,n.description AS nature_description
    FROM purchase_receipt_items ri
    JOIN purchase_order_items oi ON oi.id=ri.order_item_id
    JOIN purchase_products p ON p.id=oi.product_id
    LEFT JOIN budget_natures n ON n.id=oi.budget_nature_id
    WHERE ri.company_id=? AND ri.receipt_id=?
  `).bind(companyId,id).all();
  const integrations=await receiptIntegrationLinks(env,companyId,id);
  return {...rec,items:(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli)})),integrations};
}

async function refreshRequestFulfillment(env,companyId,requestId) {
  if(!requestId)return;
  const x=await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN ordered_qty_milli>0 AND received_qty_milli>=ordered_qty_milli THEN 1 ELSE 0 END) AS done,SUM(received_qty_milli) AS received FROM purchase_request_items WHERE company_id=? AND request_id=?`).bind(companyId,requestId).first();
  const status=Number(x?.total||0)>0&&Number(x?.done||0)===Number(x?.total||0)?'FULFILLED':(Number(x?.received||0)>0?'PARTIAL':'ORDERED'); await env.DB.prepare(`UPDATE purchase_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status<>'CANCELLED'`).bind(status,requestId,companyId).run();
}

async function createReceipt(env,request,auth,companyId,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.receipt.manage');
  const order=await purchaseEntity(env,'purchase_orders',required(body.order_id,'ordem de compra'),companyId);
  if(!['OPEN','PARTIAL'].includes(order.status))throw new HttpError(409,'A ordem não está aberta para recebimento.','INVALID_STATUS');
  const movementType=await assertMovementDestination(env,companyId,order.movement_type_id,required(body.movement_type_id,'Tipo de Movimento destino'));
  const orderDetails=await getOrder(env,companyId,order.id),map=new Map(orderDetails.items.map(x=>[x.id,x]));
  const rows=Array.isArray(body.items)?body.items:[];
  if(!rows.length)throw new HttpError(400,'Informe ao menos um item recebido.','VALIDATION_ERROR');
  const valid=[];
  for(const raw of rows){
    const oi=map.get(raw.order_item_id);if(!oi)continue;
    const q=qtyToMilli(raw.quantity,'quantidade recebida'),remaining=oi.quantity_milli-oi.received_qty_milli;
    if(q>remaining)throw new HttpError(409,`Quantidade recebida de ${oi.description} excede o saldo da ordem.`,'QUANTITY_EXCEEDED');
    valid.push({oi,q});
  }
  if(!valid.length)throw new HttpError(400,'Nenhuma quantidade de recebimento válida.','VALIDATION_ERROR');

  const selected=new Map(valid.map(x=>[x.oi.id,x.q]));
  const willComplete=orderDetails.items.every(x=>Number(x.received_qty_milli)+(selected.get(x.id)||0)>=Number(x.quantity_milli));
  const rid=uuid(),number=await nextMovementNumber(env,companyId,movementType.id);
  const date=isoDate(body.receipt_date||new Date().toISOString().slice(0,10),'data do recebimento'),doc=cleanText(body.document_number,120);

  let eventId=movementType.accounting_event_id||null;
  if(movementType.allow_edit_accounting_event && body.accounting_event_id!==undefined) eventId=cleanText(body.accounting_event_id,80)||null;
  if(eventId){
    const ev=await getMovementAccountingEvent(env,companyId,eventId);
    if(!ev.active) throw new HttpError(409,'O Evento Contábil selecionado está inativo.','INACTIVE_ACCOUNTING_EVENT');
  }
  if(movementType.require_accounting_event&&!eventId) throw new HttpError(409,'O Tipo de Movimento exige Evento Contábil.','ACCOUNTING_EVENT_REQUIRED');

  const batchId=eventId?(cleanText(body.accounting_batch_id,80)||null):null;
  const integration=await prepareReceiptIntegrationsRM(env,auth,companyId,{
    movementType,eventId,batchId,order,orderDetails,valid,receiptId:rid,receiptNumber:number,
    receiptDate:date,documentNumber:doc,dueDate:body.due_date||null,willComplete
  });

  const stmts=[env.DB.prepare(`
    INSERT INTO purchase_receipts
      (id,company_id,number,order_id,receipt_date,document_number,notes,created_by,movement_type_id,
       accounting_event_id,accounting_batch_id,generate_financial,stock_effect)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(rid,companyId,number,order.id,date,doc,cleanText(body.notes,2000),auth.user.id,movementType.id,eventId,batchId,movementType.generate_financial?1:0,movementType.stock_effect)];

  for(const {oi,q} of valid){
    stmts.push(env.DB.prepare(`INSERT INTO purchase_receipt_items (id,company_id,receipt_id,order_item_id,quantity_milli) VALUES (?,?,?,?,?)`).bind(uuid(),companyId,rid,oi.id,q));
    stmts.push(env.DB.prepare(`UPDATE purchase_order_items SET received_qty_milli=received_qty_milli+? WHERE id=? AND company_id=?`).bind(q,oi.id,companyId));
    if(oi.request_item_id)stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET received_qty_milli=received_qty_milli+? WHERE id=? AND company_id=?`).bind(q,oi.request_item_id,companyId));
    if(oi.item_type==='PRODUCT'&&movementType.stock_effect!=='NONE'){
      const sign=movementType.stock_effect==='OUT'?-1:1;
      const delta=q*sign;
      const bal=await env.DB.prepare(`SELECT id,quantity_milli FROM product_stock_balances WHERE company_id=? AND product_id=?`).bind(companyId,oi.product_id).first();
      if(sign<0 && Number(bal?.quantity_milli||0)<q) throw new HttpError(409,`Saldo insuficiente para movimentar ${oi.description}.`,'INSUFFICIENT_STOCK');
      if(bal) stmts.push(env.DB.prepare(`UPDATE product_stock_balances SET quantity_milli=quantity_milli+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(delta,bal.id));
      else if(sign>0) stmts.push(env.DB.prepare(`INSERT INTO product_stock_balances (id,company_id,product_id,quantity_milli) VALUES (?,?,?,?)`).bind(uuid(),companyId,oi.product_id,q));
      stmts.push(env.DB.prepare(`
        INSERT INTO product_stock_movements
        (id,company_id,product_id,movement_date,movement_type,quantity_milli,source_type,source_id)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(uuid(),companyId,oi.product_id,date,movementType.code,delta,'PURCHASE_MOVEMENT',rid));
    }
  }
  stmts.push(...integration.stmts);
  stmts.push(env.DB.prepare(`UPDATE purchase_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(willComplete?'RECEIVED':'PARTIAL',order.id,companyId));
  await env.DB.batch(stmts);
  await refreshRequestFulfillment(env,companyId,order.request_id);
  if(integration.meta.journal_entry)await audit(env,{companyId,userId:auth.user.id,action:'CREATE_POSTED',entity:'journal_entry',entityId:integration.meta.journal_entry.id,after:{source:'PURCHASE_MOVEMENT',receipt:number,movement_type:movementType.code},request});
  if(integration.meta.payable)await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'financial_payable',entityId:integration.meta.payable.id,after:integration.meta.payable,request});
  await audit(env,{companyId,userId:auth.user.id,action:'RECEIVE',entity:'purchase_order',entityId:order.id,after:{receipt:number,movement_type:movementType.code,integrations:integration.meta},request});
  const receipt=await getReceipt(env,companyId,rid);
  return {...receipt,integration_created:integration.meta};
}

async function listStockBalances(env,companyId) {
  const r=await env.DB.prepare(`SELECT sb.id,p.code AS product_code,p.description,p.unit,sb.quantity_milli,sb.updated_at FROM product_stock_balances sb JOIN purchase_products p ON p.id=sb.product_id WHERE sb.company_id=? ORDER BY p.code`).bind(companyId).all();
  return (r.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli)}));
}




// ===== rm-purchasing-reference-model.js =====
// Estrutura funcional baseada nas entidades observadas no RM:
// TTMV/TITMTMV/TTMVEXT/TTMVFATURAMENTO,
// TTBORCAMENTO/TTBORCAMENTOCONT,
// TEVENTOSCONT/TITMEVC e TMOV/TITMMOV.

const RM_PURCHASE_PERMISSION_DEFS=[
  ["purchasing.movement_type.read","Consultar tipos de movimento"],
  ["purchasing.movement_type.manage","Gerenciar tipos de movimento"],
  ["purchasing.nature.read","Consultar naturezas orçamentárias/financeiras"],
  ["purchasing.nature.manage","Gerenciar naturezas orçamentárias/financeiras"],
  ["purchasing.accounting_event.read","Consultar eventos contábeis de movimentos"],
  ["purchasing.accounting_event.manage","Gerenciar eventos contábeis de movimentos"]
];

async function ensureTableColumn(env,table,column,definition){
  const info=await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const names=new Set((info.results||[]).map(x=>x.name));
  if(!names.has(column)) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

async function ensureRmPurchasingSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS budget_natures (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      synthetic_analytic TEXT NOT NULL DEFAULT 'ANALYTIC',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS budget_nature_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      nature_id TEXT NOT NULL,
      side TEXT NOT NULL,
      account_id TEXT NOT NULL,
      percentage REAL NOT NULL DEFAULT 100,
      branch_id TEXT,
      cost_center_id TEXT,
      history_template_id TEXT,
      history_complement TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_budget_nature_accounts_nature ON budget_nature_accounts(company_id,nature_id,side)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movement_accounting_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      process TEXT,
      use_percentage INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movement_accounting_event_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      side TEXT NOT NULL,
      incidence TEXT NOT NULL DEFAULT 'TOTAL',
      account_origin TEXT NOT NULL DEFAULT 'FIXED',
      account_id TEXT,
      percentage REAL NOT NULL DEFAULT 100,
      branch_id TEXT,
      cost_center_id TEXT,
      history_template_id TEXT,
      history_complement TEXT,
      formula_expression TEXT,
      condition_expression TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id,line_no)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_movement_event_items_event ON movement_accounting_event_items(company_id,event_id,line_no)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movement_types (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      initial_status TEXT,
      accounting_event_id TEXT,
      require_accounting_event INTEGER NOT NULL DEFAULT 0,
      allow_edit_accounting_event INTEGER NOT NULL DEFAULT 0,
      fetch_product_nature INTEGER NOT NULL DEFAULT 1,
      allow_edit_item_nature INTEGER NOT NULL DEFAULT 1,
      generate_financial INTEGER NOT NULL DEFAULT 0,
      stock_effect TEXT NOT NULL DEFAULT 'NONE',
      default_cost_center_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movement_type_destinations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_type_id TEXT NOT NULL,
      destination_type_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,source_type_id,destination_type_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movement_type_sequences (
      company_id TEXT NOT NULL,
      movement_type_id TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(company_id,movement_type_id)
    )`)
  ]);

  await ensureTableColumn(env,'purchase_products','budget_nature_id','TEXT');
  await ensureTableColumn(env,'purchase_requests','movement_type_id','TEXT');
  await ensureTableColumn(env,'purchase_request_items','budget_nature_id','TEXT');
  await ensureTableColumn(env,'purchase_orders','movement_type_id','TEXT');
  await ensureTableColumn(env,'purchase_order_items','budget_nature_id','TEXT');
  await ensureTableColumn(env,'purchase_receipts','movement_type_id','TEXT');
  await ensureTableColumn(env,'purchase_receipts','accounting_event_id','TEXT');
  await ensureTableColumn(env,'purchase_receipts','accounting_batch_id','TEXT');
  await ensureTableColumn(env,'purchase_receipts','generate_financial','INTEGER NOT NULL DEFAULT 0');
  await ensureTableColumn(env,'purchase_receipts','stock_effect','TEXT NOT NULL DEFAULT "NONE"');
  await ensureTableColumn(env,'movement_accounting_event_items','formula_expression','TEXT');
  await ensureTableColumn(env,'movement_accounting_event_items','condition_expression','TEXT');

  for(const [code,description] of RM_PURCHASE_PERMISSION_DEFS){
    const exists=await env.DB.prepare(`SELECT id FROM permissions WHERE code=?`).bind(code).first();
    if(!exists) await env.DB.prepare(`INSERT INTO permissions (id,code,module,description) VALUES (?,?,'PURCHASES',?)`).bind(uuid(),code,description).run();
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code='ADMIN' AND p.code IN (
      'purchasing.movement_type.read','purchasing.movement_type.manage',
      'purchasing.nature.read','purchasing.nature.manage',
      'purchasing.accounting_event.read','purchasing.accounting_event.manage'
    )
  `).run();
}

async function getMovementType(env,companyId,id){
  if(!id) throw new HttpError(400,'Informe o Tipo de Movimento.','VALIDATION_ERROR');
  const x=await env.DB.prepare(`
    SELECT mt.*,e.code AS accounting_event_code,e.name AS accounting_event_name,
           cc.code AS default_cost_center_code,cc.name AS default_cost_center_name
    FROM movement_types mt
    LEFT JOIN movement_accounting_events e ON e.id=mt.accounting_event_id
    LEFT JOIN cost_centers cc ON cc.id=mt.default_cost_center_id
    WHERE mt.id=? AND mt.company_id=?
  `).bind(id,companyId).first();
  if(!x) throw new HttpError(404,'Tipo de Movimento não encontrado.','NOT_FOUND');
  return x;
}

async function listMovementTypes(env,companyId){
  const r=await env.DB.prepare(`
    SELECT mt.*,e.code AS accounting_event_code,e.name AS accounting_event_name
    FROM movement_types mt
    LEFT JOIN movement_accounting_events e ON e.id=mt.accounting_event_id
    WHERE mt.company_id=? ORDER BY mt.code
  `).bind(companyId).all();
  return r.results||[];
}

async function getMovementTypeDetails(env,companyId,id){
  const movement_type=await getMovementType(env,companyId,id);
  const d=await env.DB.prepare(`
    SELECT mt.id,mt.code,mt.name
    FROM movement_type_destinations rel
    JOIN movement_types mt ON mt.id=rel.destination_type_id
    WHERE rel.company_id=? AND rel.source_type_id=?
    ORDER BY mt.code
  `).bind(companyId,id).all();
  return {...movement_type,destinations:d.results||[]};
}

async function saveMovementType(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'purchasing.movement_type.manage');
  const code=cleanText(required(body.code,'código do Tipo de Movimento'),30);
  const name=cleanText(required(body.name,'nome do Tipo de Movimento'),300);
  const eventId=cleanText(body.accounting_event_id,80)||null;
  if(eventId){
    const e=await env.DB.prepare(`SELECT id,active FROM movement_accounting_events WHERE id=? AND company_id=?`).bind(eventId,companyId).first();
    if(!e) throw new HttpError(404,'Evento Contábil não encontrado.','NOT_FOUND');
    if(!e.active) throw new HttpError(409,'O Evento Contábil selecionado está inativo.','INACTIVE_ACCOUNTING_EVENT');
  }
  const defaultCc=cleanText(body.default_cost_center_id,80)||null;
  if(defaultCc){
    const cc=await assertCompanyEntity(env,'cost_centers',defaultCc,companyId);
    if(!cc.active) throw new HttpError(409,'Centro de custo padrão está inativo.','INACTIVE_COST_CENTER');
  }
  const stockEffect=['NONE','IN','OUT'].includes(String(body.stock_effect||'NONE').toUpperCase())?String(body.stock_effect||'NONE').toUpperCase():'NONE';
  const vals=[
    code,name,cleanText(body.initial_status,40),
    eventId,bool01(body.require_accounting_event,0),bool01(body.allow_edit_accounting_event,0),
    bool01(body.fetch_product_nature,1),bool01(body.allow_edit_item_nature,1),
    bool01(body.generate_financial,0),stockEffect,defaultCc,bool01(body.active,1)
  ];
  let target=id;
  if(id){
    await getMovementType(env,companyId,id);
    await env.DB.prepare(`
      UPDATE movement_types SET code=?,name=?,initial_status=?,accounting_event_id=?,require_accounting_event=?,
      allow_edit_accounting_event=?,fetch_product_nature=?,allow_edit_item_nature=?,generate_financial=?,
      stock_effect=?,default_cost_center_id=?,active=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).bind(...vals,id,companyId).run();
  }else{
    target=uuid();
    await env.DB.prepare(`
      INSERT INTO movement_types
      (id,company_id,code,name,initial_status,accounting_event_id,require_accounting_event,
       allow_edit_accounting_event,fetch_product_nature,allow_edit_item_nature,generate_financial,
       stock_effect,default_cost_center_id,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(target,companyId,...vals).run();
  }

  const destIds=[...new Set((Array.isArray(body.destination_type_ids)?body.destination_type_ids:[]).filter(Boolean))];
  const stmts=[env.DB.prepare(`DELETE FROM movement_type_destinations WHERE company_id=? AND source_type_id=?`).bind(companyId,target)];
  for(const did of destIds){
    if(did===target) continue;
    const d=await getMovementType(env,companyId,did);
    if(!d.active) throw new HttpError(409,`Tipo de Movimento destino ${d.code} está inativo.`,'INACTIVE_MOVEMENT_TYPE');
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO movement_type_destinations (id,company_id,source_type_id,destination_type_id) VALUES (?,?,?,?)`).bind(uuid(),companyId,target,did));
  }
  await env.DB.batch(stmts);
  const after=await getMovementTypeDetails(env,companyId,target);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'movement_type',entityId:target,after,request});
  return after;
}

async function deleteMovementType(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'purchasing.movement_type.manage');
  const before=await getMovementType(env,companyId,id);
  const used=await env.DB.prepare(`
    SELECT 1 FROM purchase_requests WHERE company_id=? AND movement_type_id=?
    UNION ALL SELECT 1 FROM purchase_orders WHERE company_id=? AND movement_type_id=?
    UNION ALL SELECT 1 FROM purchase_receipts WHERE company_id=? AND movement_type_id=?
    LIMIT 1
  `).bind(companyId,id,companyId,id,companyId,id).first();
  if(used){
    await env.DB.prepare(`UPDATE movement_types SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
    await audit(env,{companyId,userId:auth.user.id,action:'INACTIVATE',entity:'movement_type',entityId:id,before,request});
    return {inactivated:true,id};
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM movement_type_destinations WHERE company_id=? AND (source_type_id=? OR destination_type_id=?)`).bind(companyId,id,id),
    env.DB.prepare(`DELETE FROM movement_type_sequences WHERE company_id=? AND movement_type_id=?`).bind(companyId,id),
    env.DB.prepare(`DELETE FROM movement_types WHERE company_id=? AND id=?`).bind(companyId,id)
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'movement_type',entityId:id,before,request});
  return {deleted:true,id};
}

async function listBudgetNatures(env,companyId){
  const r=await env.DB.prepare(`
    SELECT n.*,
      (SELECT COUNT(*) FROM budget_nature_accounts a WHERE a.company_id=n.company_id AND a.nature_id=n.id) AS default_count
    FROM budget_natures n WHERE n.company_id=? ORDER BY n.code
  `).bind(companyId).all();
  return r.results||[];
}

async function getBudgetNature(env,companyId,id){
  const n=await env.DB.prepare(`SELECT * FROM budget_natures WHERE id=? AND company_id=?`).bind(id,companyId).first();
  if(!n) throw new HttpError(404,'Natureza Orçamentária/Financeira não encontrada.','NOT_FOUND');
  const r=await env.DB.prepare(`
    SELECT a.*,ac.code AS account_code,ac.name AS account_name,
           b.code AS branch_code,b.name AS branch_name,cc.code AS cost_center_code,cc.name AS cost_center_name,
           h.code AS history_code,h.description AS history_description
    FROM budget_nature_accounts a
    JOIN accounts ac ON ac.id=a.account_id
    LEFT JOIN branches b ON b.id=a.branch_id
    LEFT JOIN cost_centers cc ON cc.id=a.cost_center_id
    LEFT JOIN history_templates h ON h.id=a.history_template_id
    WHERE a.company_id=? AND a.nature_id=?
    ORDER BY a.side,a.created_at
  `).bind(companyId,id).all();
  return {...n,defaults:r.results||[]};
}

async function validateDefaultPercentage(rows,label){
  const bySide={D:0,C:0};
  for(const x of rows) bySide[x.side]=(bySide[x.side]||0)+Number(x.percentage||0);
  for(const side of ['D','C']){
    if(bySide[side]&&Math.abs(bySide[side]-100)>0.0001)
      throw new HttpError(400,`${label}: o percentual dos defaults de ${side==='D'?'débito':'crédito'} deve totalizar 100%.`,'INVALID_PERCENTAGE');
  }
}

async function saveBudgetNature(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'purchasing.nature.manage');
  const code=cleanText(required(body.code,'código da natureza'),50),description=cleanText(required(body.description,'descrição da natureza'),500);
  const sa=String(body.synthetic_analytic||'ANALYTIC').toUpperCase()==='SYNTHETIC'?'SYNTHETIC':'ANALYTIC';
  const defaults=Array.isArray(body.defaults)?body.defaults:[];
  const normalized=[];
  for(const raw of defaults){
    const side=String(raw.side||'').toUpperCase();
    if(!['D','C'].includes(side)) throw new HttpError(400,'Default contábil com débito/crédito inválido.','VALIDATION_ERROR');
    const account=await assertAnalyticActiveAccount(env,companyId,required(raw.account_id,'conta contábil do default'),'a conta contábil do default');
    const pct=Number(raw.percentage??100);
    if(!Number.isFinite(pct)||pct<=0||pct>100) throw new HttpError(400,'Percentual de default inválido.','INVALID_PERCENTAGE');
    if(raw.branch_id) await assertCompanyEntity(env,'branches',raw.branch_id,companyId);
    if(raw.cost_center_id) await assertCompanyEntity(env,'cost_centers',raw.cost_center_id,companyId);
    if(raw.history_template_id) await assertCompanyEntity(env,'history_templates',raw.history_template_id,companyId);
    normalized.push({side,account_id:account.id,percentage:pct,branch_id:raw.branch_id||null,cost_center_id:raw.cost_center_id||null,history_template_id:raw.history_template_id||null,history_complement:cleanText(raw.history_complement,1000)});
  }
  await validateDefaultPercentage(normalized,'Natureza Orçamentária/Financeira');
  let target=id;
  if(id){
    await getBudgetNature(env,companyId,id);
    await env.DB.prepare(`UPDATE budget_natures SET code=?,description=?,synthetic_analytic=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(code,description,sa,bool01(body.active,1),id,companyId).run();
  }else{
    target=uuid();
    await env.DB.prepare(`INSERT INTO budget_natures (id,company_id,code,description,synthetic_analytic,active) VALUES (?,?,?,?,?,?)`).bind(target,companyId,code,description,sa,bool01(body.active,1)).run();
  }
  const stmts=[env.DB.prepare(`DELETE FROM budget_nature_accounts WHERE company_id=? AND nature_id=?`).bind(companyId,target)];
  for(const x of normalized) stmts.push(env.DB.prepare(`
    INSERT INTO budget_nature_accounts
      (id,company_id,nature_id,side,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(uuid(),companyId,target,x.side,x.account_id,x.percentage,x.branch_id,x.cost_center_id,x.history_template_id,x.history_complement));
  await env.DB.batch(stmts);
  const after=await getBudgetNature(env,companyId,target);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'budget_nature',entityId:target,after,request});
  return after;
}

async function deleteBudgetNature(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'purchasing.nature.manage');
  const before=await getBudgetNature(env,companyId,id);
  const used=await env.DB.prepare(`
    SELECT 1 FROM purchase_products WHERE company_id=? AND budget_nature_id=?
    UNION ALL SELECT 1 FROM purchase_request_items WHERE company_id=? AND budget_nature_id=?
    UNION ALL SELECT 1 FROM purchase_order_items WHERE company_id=? AND budget_nature_id=?
    LIMIT 1
  `).bind(companyId,id,companyId,id,companyId,id).first();
  if(used){
    await env.DB.prepare(`UPDATE budget_natures SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
    await audit(env,{companyId,userId:auth.user.id,action:'INACTIVATE',entity:'budget_nature',entityId:id,before,request});
    return {inactivated:true,id};
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM budget_nature_accounts WHERE company_id=? AND nature_id=?`).bind(companyId,id),
    env.DB.prepare(`DELETE FROM budget_natures WHERE company_id=? AND id=?`).bind(companyId,id)
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'budget_nature',entityId:id,before,request});
  return {deleted:true,id};
}

async function listMovementAccountingEvents(env,companyId){
  const r=await env.DB.prepare(`
    SELECT e.*,(SELECT COUNT(*) FROM movement_accounting_event_items i WHERE i.company_id=e.company_id AND i.event_id=e.id) AS item_count
    FROM movement_accounting_events e WHERE e.company_id=? ORDER BY e.code
  `).bind(companyId).all();
  return r.results||[];
}

async function getMovementAccountingEvent(env,companyId,id){
  const e=await env.DB.prepare(`SELECT * FROM movement_accounting_events WHERE id=? AND company_id=?`).bind(id,companyId).first();
  if(!e) throw new HttpError(404,'Evento Contábil não encontrado.','NOT_FOUND');
  const r=await env.DB.prepare(`
    SELECT i.*,a.code AS account_code,a.name AS account_name,b.code AS branch_code,b.name AS branch_name,
           cc.code AS cost_center_code,cc.name AS cost_center_name,h.code AS history_code,h.description AS history_description
    FROM movement_accounting_event_items i
    LEFT JOIN accounts a ON a.id=i.account_id
    LEFT JOIN branches b ON b.id=i.branch_id
    LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id
    LEFT JOIN history_templates h ON h.id=i.history_template_id
    WHERE i.company_id=? AND i.event_id=? ORDER BY i.line_no
  `).bind(companyId,id).all();
  return {...e,items:r.results||[]};
}

async function saveMovementAccountingEvent(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'purchasing.accounting_event.manage');
  const code=cleanText(required(body.code,'código do evento'),40),name=cleanText(required(body.name,'nome do evento'),300);
  const rawItems=Array.isArray(body.items)?body.items:[];
  if(!rawItems.length) throw new HttpError(400,'Inclua ao menos um item no Evento Contábil.','VALIDATION_ERROR');
  const items=[];let no=1;
  for(const raw of rawItems){
    const side=String(raw.side||'').toUpperCase();
    if(!['D','C'].includes(side)) throw new HttpError(400,'Tipo de lançamento do evento inválido.','VALIDATION_ERROR');
    const incidence=String(raw.incidence||'TOTAL').toUpperCase();
    if(!['TOTAL','ITEM','ITEMS','FREIGHT'].includes(incidence)) throw new HttpError(400,'Incidência do evento inválida.','VALIDATION_ERROR');
    const origin=String(raw.account_origin||'FIXED').toUpperCase();
    if(!['FIXED','NATURE'].includes(origin)) throw new HttpError(400,'Origem da conta do evento inválida.','VALIDATION_ERROR');
    let accountId=null;
    if(origin==='FIXED') accountId=(await assertAnalyticActiveAccount(env,companyId,required(raw.account_id,'conta fixa do evento'),'a conta fixa do evento')).id;

    const formulaExpression=cleanText(raw.formula_expression,500)||null;
    const conditionExpression=cleanText(raw.condition_expression,500)||null;
    if(formulaExpression) validateAccountingExpression(formulaExpression,'formula');
    if(conditionExpression) validateAccountingExpression(conditionExpression,'condition');

    const pct=Number(raw.percentage??100);
    if(!Number.isFinite(pct)||pct<=0||pct>100) throw new HttpError(400,'Percentual do evento inválido.','INVALID_PERCENTAGE');
    if(raw.branch_id) await assertCompanyEntity(env,'branches',raw.branch_id,companyId);
    if(raw.cost_center_id) await assertCompanyEntity(env,'cost_centers',raw.cost_center_id,companyId);
    if(raw.history_template_id) await assertCompanyEntity(env,'history_templates',raw.history_template_id,companyId);
    items.push({
      line_no:no++,side,incidence,account_origin:origin,account_id:accountId,percentage:pct,
      branch_id:raw.branch_id||null,cost_center_id:raw.cost_center_id||null,
      history_template_id:raw.history_template_id||null,history_complement:normalizedHistoryComplement,
      formula_expression:formulaExpression,condition_expression:conditionExpression
    });
  }
  let target=id;
  if(id){
    await getMovementAccountingEvent(env,companyId,id);
    await env.DB.prepare(`UPDATE movement_accounting_events SET code=?,name=?,process=?,use_percentage=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(code,name,cleanText(body.process,120),bool01(body.use_percentage,1),bool01(body.active,1),id,companyId).run();
  }else{
    target=uuid();
    await env.DB.prepare(`INSERT INTO movement_accounting_events (id,company_id,code,name,process,use_percentage,active) VALUES (?,?,?,?,?,?,?)`).bind(target,companyId,code,name,cleanText(body.process,120),bool01(body.use_percentage,1),bool01(body.active,1)).run();
  }
  const stmts=[env.DB.prepare(`DELETE FROM movement_accounting_event_items WHERE company_id=? AND event_id=?`).bind(companyId,target)];
  for(const x of items) stmts.push(env.DB.prepare(`
    INSERT INTO movement_accounting_event_items
      (id,company_id,event_id,line_no,side,incidence,account_origin,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement,formula_expression,condition_expression)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(uuid(),companyId,target,x.line_no,x.side,x.incidence,x.account_origin,x.account_id,x.percentage,x.branch_id,x.cost_center_id,x.history_template_id,x.history_complement,x.formula_expression,x.condition_expression));
  await env.DB.batch(stmts);
  const after=await getMovementAccountingEvent(env,companyId,target);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'movement_accounting_event',entityId:target,after,request});
  return after;
}

async function deleteMovementAccountingEvent(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'purchasing.accounting_event.manage');
  const before=await getMovementAccountingEvent(env,companyId,id);
  const used=await env.DB.prepare(`SELECT 1 FROM movement_types WHERE company_id=? AND accounting_event_id=? LIMIT 1`).bind(companyId,id).first();
  if(used){
    await env.DB.prepare(`UPDATE movement_accounting_events SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
    await audit(env,{companyId,userId:auth.user.id,action:'INACTIVATE',entity:'movement_accounting_event',entityId:id,before,request});
    return {inactivated:true,id};
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM movement_accounting_event_items WHERE company_id=? AND event_id=?`).bind(companyId,id),
    env.DB.prepare(`DELETE FROM movement_accounting_events WHERE company_id=? AND id=?`).bind(companyId,id)
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'movement_accounting_event',entityId:id,before,request});
  return {deleted:true,id};
}

async function nextMovementNumber(env,companyId,movementTypeId){
  await env.DB.prepare(`
    INSERT INTO movement_type_sequences (company_id,movement_type_id,last_number) VALUES (?,?,0)
    ON CONFLICT(company_id,movement_type_id) DO NOTHING
  `).bind(companyId,movementTypeId).run();
  await env.DB.prepare(`
    UPDATE movement_type_sequences SET last_number=last_number+1
    WHERE company_id=? AND movement_type_id=?
  `).bind(companyId,movementTypeId).run();
  const r=await env.DB.prepare(`SELECT last_number FROM movement_type_sequences WHERE company_id=? AND movement_type_id=?`).bind(companyId,movementTypeId).first();
  return String(Number(r?.last_number||1)).padStart(6,'0');
}

async function assertMovementDestination(env,companyId,sourceTypeId,destTypeId){
  const dest=await getMovementType(env,companyId,destTypeId);
  if(!dest.active) throw new HttpError(409,'O Tipo de Movimento destino está inativo.','INACTIVE_MOVEMENT_TYPE');
  if(sourceTypeId){
    const rel=await env.DB.prepare(`
      SELECT 1 FROM movement_type_destinations
      WHERE company_id=? AND source_type_id=? AND destination_type_id=?
    `).bind(companyId,sourceTypeId,destTypeId).first();
    if(!rel) throw new HttpError(409,`O Tipo de Movimento ${dest.code} não está configurado como movimento destino do movimento de origem.`,'MOVEMENT_DESTINATION_NOT_ALLOWED');
  }
  return dest;
}

async function getNatureDefaults(env,companyId,natureId,side){
  const r=await env.DB.prepare(`
    SELECT a.*,ac.code AS account_code,ac.name AS account_name
    FROM budget_nature_accounts a
    JOIN accounts ac ON ac.id=a.account_id
    WHERE a.company_id=? AND a.nature_id=? AND a.side=?
    ORDER BY a.created_at
  `).bind(companyId,natureId,side).all();
  return r.results||[];
}

function centsPercent(base,pct){ return Math.round(Number(base||0)*Number(pct||0)/100); }

// ===== Motor seguro de fórmulas contábeis =====
// Não usa eval/new Function. Aceita números, strings, variáveis, parênteses,
// + - * / %, comparações (=, !=, <>, >, >=, <, <=) e lógica AND/OR/NOT.
function accountingExpressionTokens(expression){
  const src=String(expression||'').trim();
  const out=[];let i=0;
  while(i<src.length){
    const ch=src[i];
    if(/\s/.test(ch)){i++;continue;}
    if(ch==='"'||ch==="'"){
      const quote=ch;let v='';i++;
      while(i<src.length){
        if(src[i]===quote){i++;break;}
        if(src[i]==='\\'&&i+1<src.length){v+=src[i+1];i+=2;continue;}
        v+=src[i++];
      }
      out.push({type:'value',value:v});continue;
    }
    if(/\d/.test(ch)||((ch==='.'||ch===',')&&/\d/.test(src[i+1]||''))){
      let s='';let sep=false;
      while(i<src.length){
        const c=src[i];
        if(/\d/.test(c)){s+=c;i++;continue;}
        if((c==='.'||c===',')&&!sep&&/\d/.test(src[i+1]||'')){s+='.';sep=true;i++;continue;}
        break;
      }
      out.push({type:'value',value:Number(s)});continue;
    }
    if(/[A-Za-z_]/.test(ch)){
      let s='';
      while(i<src.length&&/[A-Za-z0-9_.]/.test(src[i]))s+=src[i++];
      const u=s.toUpperCase();
      if(u==='AND'||u==='E')out.push({type:'op',value:'&&'});
      else if(u==='OR'||u==='OU')out.push({type:'op',value:'||'});
      else if(u==='NOT'||u==='NAO')out.push({type:'op',value:'!'});
      else if(u==='TRUE'||u==='VERDADEIRO')out.push({type:'value',value:true});
      else if(u==='FALSE'||u==='FALSO')out.push({type:'value',value:false});
      else out.push({type:'id',value:u});
      continue;
    }
    const two=src.slice(i,i+2);
    if(['>=','<=','!=','<>','==','&&','||'].includes(two)){out.push({type:'op',value:two});i+=2;continue;}
    if(['+','-','*','/','%','(',')','>','<','=','!'].includes(ch)){out.push({type:ch==='('||ch===')'?ch:'op',value:ch});i++;continue;}
    throw new HttpError(400,`Símbolo inválido na expressão contábil: ${ch}`,'INVALID_ACCOUNTING_EXPRESSION');
  }
  return out;
}

function accountingTruthy(v){
  if(typeof v==='boolean')return v;
  if(typeof v==='number')return Number.isFinite(v)&&v!==0;
  if(v===null||v===undefined)return false;
  const s=String(v).trim().toUpperCase();
  return s!==''&&s!=='0'&&s!=='FALSE'&&s!=='FALSO';
}

function accountingNumber(v){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new HttpError(400,`A expressão esperava um valor numérico, mas recebeu "${v}".`,'INVALID_ACCOUNTING_EXPRESSION');
  return n;
}

function evaluateAccountingExpression(expression,context={}){
  const tokens=accountingExpressionTokens(expression);let pos=0;
  const peek=()=>tokens[pos];const take=()=>tokens[pos++];
  const resolve=id=>{
    if(Object.prototype.hasOwnProperty.call(context,id))return context[id];
    throw new HttpError(400,`Variável contábil desconhecida: ${id}.`,'UNKNOWN_ACCOUNTING_VARIABLE');
  };
  const parsePrimary=()=>{
    const t=take();
    if(!t)throw new HttpError(400,'Expressão contábil incompleta.','INVALID_ACCOUNTING_EXPRESSION');
    if(t.type==='value')return t.value;
    if(t.type==='id')return resolve(t.value);
    if(t.type==='('){const v=parseOr();const c=take();if(!c||c.type!==')')throw new HttpError(400,'Parênteses não fechados na expressão contábil.','INVALID_ACCOUNTING_EXPRESSION');return v;}
    throw new HttpError(400,'Trecho inválido na expressão contábil.','INVALID_ACCOUNTING_EXPRESSION');
  };
  const parseUnary=()=>{
    const t=peek();
    if(t?.type==='op'&&['!','+','-'].includes(t.value)){
      take();const v=parseUnary();
      if(t.value==='!')return !accountingTruthy(v);
      if(t.value==='+')return accountingNumber(v);
      return -accountingNumber(v);
    }
    return parsePrimary();
  };
  const parseMul=()=>{let v=parseUnary();while(peek()?.type==='op'&&['*','/','%'].includes(peek().value)){const op=take().value,r=parseUnary(),a=accountingNumber(v),b=accountingNumber(r);if((op==='/'||op==='%')&&b===0)throw new HttpError(400,'Divisão por zero na fórmula contábil.','INVALID_ACCOUNTING_EXPRESSION');v=op==='*'?a*b:op==='/'?a/b:a%b;}return v;};
  const parseAdd=()=>{let v=parseMul();while(peek()?.type==='op'&&['+','-'].includes(peek().value)){const op=take().value,r=parseMul();v=op==='+'?accountingNumber(v)+accountingNumber(r):accountingNumber(v)-accountingNumber(r);}return v;};
  const compare=(a,b,op)=>{
    if(['=','==','!=','<>'].includes(op)){
      let eq;
      if(typeof a==='number'&&typeof b==='number')eq=a===b;
      else eq=String(a??'').toUpperCase()===String(b??'').toUpperCase();
      return op==='!='||op==='<>'?!eq:eq;
    }
    const an=Number(a),bn=Number(b);
    if(Number.isFinite(an)&&Number.isFinite(bn))return op==='>'?an>bn:op==='>='?an>=bn:op==='<'?an<bn:an<=bn;
    const as=String(a??'').toUpperCase(),bs=String(b??'').toUpperCase();
    return op==='>'?as>bs:op==='>='?as>=bs:op==='<'?as<bs:as<=bs;
  };
  const parseCompare=()=>{let v=parseAdd();while(peek()?.type==='op'&&['=','==','!=','<>','>','>=','<','<='].includes(peek().value)){const op=take().value,r=parseAdd();v=compare(v,r,op);}return v;};
  const parseAnd=()=>{let v=parseCompare();while(peek()?.type==='op'&&peek().value==='&&'){take();const r=parseCompare();v=accountingTruthy(v)&&accountingTruthy(r);}return v;};
  const parseOr=()=>{let v=parseAnd();while(peek()?.type==='op'&&peek().value==='||'){take();const r=parseAnd();v=accountingTruthy(v)||accountingTruthy(r);}return v;};
  const value=parseOr();
  if(pos!==tokens.length)throw new HttpError(400,'Não foi possível interpretar toda a expressão contábil.','INVALID_ACCOUNTING_EXPRESSION');
  return value;
}

function accountingSampleContext(){
  return {
    TOTAL:100000,ITENS:90000,FRETE:10000,PERCENTUAL:100,
    DOCUMENTO:'NF-001',FORNECEDOR:'FORNECEDOR TESTE',
    'ITEM.VALOR':50000,'ITEM.PRECO':25000,'ITEM.QUANTIDADE':2,
    'ITEM.TIPO':'PRODUCT','ITEM.NATUREZA':'1.01','ITEM.CODIGO':'001'
  };
}

function validateAccountingExpression(expression,kind='formula'){
  const value=evaluateAccountingExpression(expression,accountingSampleContext());
  if(kind==='formula'&&!Number.isFinite(Number(value)))throw new HttpError(400,'A fórmula contábil deve resultar em um número.','INVALID_ACCOUNTING_FORMULA');
  return true;
}

function accountingContext({itemsSubtotal,freightCents,totalCents,documentNumber,supplierName,pct,item=null}){
  const ctx={
    TOTAL:Number(totalCents||0),ITENS:Number(itemsSubtotal||0),FRETE:Number(freightCents||0),PERCENTUAL:Number(pct||100),
    DOCUMENTO:String(documentNumber||''),FORNECEDOR:String(supplierName||'')
  };
  if(item){
    const oi=item.oi||{};
    ctx['ITEM.VALOR']=Math.round(Number(oi.unit_price_cents||0)*Number(item.q||0)/1000);
    ctx['ITEM.PRECO']=Number(oi.unit_price_cents||0);
    ctx['ITEM.QUANTIDADE']=Number(item.q||0)/1000;
    ctx['ITEM.TIPO']=String(oi.item_type||'');
    ctx['ITEM.NATUREZA']=String(oi.nature_code||'');
    ctx['ITEM.CODIGO']=String(oi.product_code||'');
  }else{
    ctx['ITEM.VALOR']=0;ctx['ITEM.PRECO']=0;ctx['ITEM.QUANTIDADE']=0;
    ctx['ITEM.TIPO']='';ctx['ITEM.NATUREZA']='';ctx['ITEM.CODIGO']='';
  }
  return ctx;
}

function defaultAccountingFormula(rule){
  if(rule.incidence==='ITEM')return 'ITEM.VALOR';
  if(rule.incidence==='ITEMS')return 'ITENS';
  if(rule.incidence==='FREIGHT')return 'FRETE';
  return 'TOTAL';
}

function expressionUsesItem(rule){
  return rule.account_origin==='NATURE'||rule.incidence==='ITEM'||/\bITEM\./i.test(String(rule.formula_expression||''))||/\bITEM\./i.test(String(rule.condition_expression||''));
}

function evaluateRuleAmount(rule,ctx,event){
  if(rule.condition_expression&&!accountingTruthy(evaluateAccountingExpression(rule.condition_expression,ctx)))return 0;
  const expr=rule.formula_expression||defaultAccountingFormula(rule);
  const raw=accountingNumber(evaluateAccountingExpression(expr,ctx));
  const pct=Number(event.use_percentage)?Number(rule.percentage||100):100;
  return centsPercent(Math.round(raw),pct);
}

async function buildRmAccountingLines(env,companyId,{eventId,receiptItems,itemsSubtotal,freightCents,totalCents,branchId,documentNumber,supplierName}){
  const event=await getMovementAccountingEvent(env,companyId,eventId);
  if(!event.active) throw new HttpError(409,'O Evento Contábil do movimento está inativo.','INACTIVE_ACCOUNTING_EVENT');
  const lines=[];
  for(const rule of event.items){
    const pct=Number(event.use_percentage)?Number(rule.percentage||100):100;
    const itemScoped=expressionUsesItem(rule);

    if(itemScoped){
      for(const x of receiptItems){
        const ctx=accountingContext({itemsSubtotal,freightCents,totalCents,documentNumber,supplierName,pct,item:x});
        const ruleAmount=evaluateRuleAmount(rule,ctx,event);
        if(ruleAmount<=0)continue;

        if(rule.account_origin==='NATURE'){
          if(!x.oi.budget_nature_id) throw new HttpError(409,`O item ${x.oi.description} não possui Natureza Orçamentária/Financeira.`,'NATURE_NOT_CONFIGURED');
          const defaults=await getNatureDefaults(env,companyId,x.oi.budget_nature_id,rule.side);
          if(!defaults.length) throw new HttpError(409,`A Natureza do item ${x.oi.description} não possui default contábil de ${rule.side==='D'?'débito':'crédito'}.`,'NATURE_DEFAULT_NOT_CONFIGURED');
          for(const d of defaults){
            const amount=centsPercent(ruleAmount,Number(d.percentage||100));
            if(amount<=0)continue;
            lines.push({
              side:rule.side,account_id:d.account_id,amount:centsToMoney(amount),
              branch_id:rule.branch_id||d.branch_id||branchId||null,
              cost_center_id:rule.cost_center_id||d.cost_center_id||x.oi.cost_center_id||null,
              history_template_id:rule.history_template_id||d.history_template_id||null,
              history_complement:rule.history_complement||d.history_complement||`Compra ${documentNumber||''} - ${supplierName||''}`
            });
          }
        }else{
          lines.push({
            side:rule.side,account_id:rule.account_id,amount:centsToMoney(ruleAmount),
            branch_id:rule.branch_id||branchId||null,
            cost_center_id:rule.cost_center_id||x.oi.cost_center_id||null,
            history_template_id:rule.history_template_id||null,
            history_complement:rule.history_complement||`Compra ${documentNumber||''} - ${supplierName||''}`
          });
        }
      }
      continue;
    }

    const ctx=accountingContext({itemsSubtotal,freightCents,totalCents,documentNumber,supplierName,pct});
    const amount=evaluateRuleAmount(rule,ctx,event);
    if(amount<=0)continue;
    if(rule.account_origin==='NATURE') throw new HttpError(409,'Uma regra com conta pela Natureza precisa usar ITEM na fórmula/condição ou incidência Item.','ACCOUNTING_EVENT_SCOPE');
    lines.push({
      side:rule.side,account_id:rule.account_id,amount:centsToMoney(amount),
      branch_id:rule.branch_id||branchId||null,cost_center_id:rule.cost_center_id||null,
      history_template_id:rule.history_template_id||null,
      history_complement:rule.history_complement||`Compra ${documentNumber||''} - ${supplierName||''}`
    });
  }
  if(!lines.length) throw new HttpError(409,'O Evento Contábil não gerou partidas para este movimento. Verifique fórmulas e condições.','ACCOUNTING_EVENT_EMPTY');
  return lines;
}

async function prepareReceiptIntegrationsRM(env,auth,companyId,{movementType,eventId,batchId,order,orderDetails,valid,receiptId,receiptNumber,receiptDate,documentNumber,dueDate,willComplete}){
  const stmts=[],meta={payable:null,journal_entry:null};
  let itemsSubtotal=0;
  for(const {oi,q} of valid) itemsSubtotal+=Math.round(Number(oi.unit_price_cents)*Number(q)/1000);
  const freightCents=willComplete?Number(orderDetails.freight_cents||0):0;
  const totalCents=itemsSubtotal+freightCents;
  if(totalCents<=0) throw new HttpError(409,'O movimento não possui valor financeiro/contábil.','INVALID_AMOUNT');

  if(movementType.generate_financial){
    const finalDue=dueDate?isoDate(dueDate,'vencimento financeiro'):receiptDate;
    const payableId=uuid(),payableNumber=await nextPayableNumber(env,companyId);
    stmts.push(env.DB.prepare(`
      INSERT INTO financial_payables
      (id,company_id,number,supplier_id,source_type,source_id,receipt_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN',?)
    `).bind(payableId,companyId,payableNumber,order.supplier_id,'PURCHASE_MOVEMENT',receiptId,receiptId,receiptDate,finalDue,cleanText(documentNumber,120),`Movimento ${movementType.code} ${receiptNumber} / Ordem ${order.number}`,totalCents,totalCents,auth.user.id));
    meta.payable={id:payableId,number:payableNumber,due_date:finalDue,amount:centsToMoney(totalCents)};
  }

  if(eventId){
    if(!batchId) throw new HttpError(409,'Informe o lote contábil do movimento.','ACCOUNTING_BATCH_REQUIRED');
    const batch=await assertCompanyEntity(env,'journal_batches',batchId,companyId);
    if(batch.status!=='OPEN') throw new HttpError(409,'O lote contábil do movimento precisa estar aberto.','BATCH_LOCKED');
    const lines=await buildRmAccountingLines(env,companyId,{
      eventId,receiptItems:valid,itemsSubtotal,freightCents,totalCents,
      branchId:order.branch_id||null,documentNumber:documentNumber||receiptNumber,supplierName:orderDetails.supplier_name
    });
    const built=await buildInternalPostedEntry(env,auth,companyId,{
      batch_id:batchId,branch_id:order.branch_id||null,entry_date:receiptDate,
      document_number:documentNumber||receiptNumber,
      description:`Movimento ${movementType.code} ${receiptNumber} - ${orderDetails.supplier_name}`,
      source_module:'PURCHASES',source_reference:`RECEIPT:${receiptId}`,lines
    });
    stmts.push(...built.stmts);
    meta.journal_entry={id:built.entryId,amount:centsToMoney(built.total_cents)};
  }else if(movementType.require_accounting_event){
    throw new HttpError(409,'O Tipo de Movimento exige Evento Contábil.','ACCOUNTING_EVENT_REQUIRED');
  }
  return {stmts,meta,total_cents:totalCents};
}


// ===== purchase-finance-accounting-integration.js =====
const PURCHASE_INTEGRATION_PERMISSION_DEFS=[
  ["purchasing.integration.read","Consultar integração de compras"],
  ["purchasing.integration.manage","Configurar integração de compras"]
];
const FINANCE_PERMISSION_DEFS=[
  ["financial.payable.read","Consultar contas a pagar"],
  ["financial.payable.manage","Gerenciar contas a pagar"]
];

async function ensurePurchaseIntegrationSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_integration_settings (
      company_id TEXT PRIMARY KEY,
      create_payable INTEGER NOT NULL DEFAULT 0,
      auto_accounting INTEGER NOT NULL DEFAULT 0,
      default_due_days INTEGER NOT NULL DEFAULT 30,
      accounting_batch_id TEXT,
      product_debit_account_id TEXT,
      service_debit_account_id TEXT,
      freight_debit_account_id TEXT,
      payable_credit_account_id TEXT,
      history_template_id TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS financial_payables (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      number TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      receipt_id TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      document_number TEXT,
      description TEXT,
      amount_cents INTEGER NOT NULL,
      balance_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      payment_date TEXT,
      payment_notes TEXT,
      paid_by TEXT,
      paid_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,number),
      UNIQUE(company_id,source_type,source_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_financial_payables_company_status ON financial_payables(company_id,status,due_date)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_financial_payables_receipt ON financial_payables(company_id,receipt_id)`)
  ]);

  for(const [code,description] of [...PURCHASE_INTEGRATION_PERMISSION_DEFS,...FINANCE_PERMISSION_DEFS]){
    const exists=await env.DB.prepare(`SELECT id FROM permissions WHERE code=?`).bind(code).first();
    if(!exists){
      const id=uuid(), module=code.startsWith('financial.')?'FINANCE':'PURCHASES';
      await env.DB.prepare(`INSERT INTO permissions (id,code,module,description) VALUES (?,?,?,?)`).bind(id,code,module,description).run();
    }
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code='ADMIN' AND p.code IN ('purchasing.integration.read','purchasing.integration.manage','financial.payable.read','financial.payable.manage')
  `).run();
}

function addDaysISO(dateString,days){
  const d=new Date(String(dateString)+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}

async function getPurchaseIntegrationSettings(env,companyId){
  const row=await env.DB.prepare(`SELECT * FROM purchase_integration_settings WHERE company_id=?`).bind(companyId).first();
  return row||{
    company_id:companyId,create_payable:0,auto_accounting:0,default_due_days:30,
    accounting_batch_id:null,product_debit_account_id:null,service_debit_account_id:null,
    freight_debit_account_id:null,payable_credit_account_id:null,history_template_id:null
  };
}

async function assertAnalyticActiveAccount(env,companyId,id,label){
  if(!id) throw new HttpError(400,`Configure ${label}.`,'INTEGRATION_NOT_CONFIGURED');
  const a=await assertCompanyEntity(env,'accounts',id,companyId);
  if(!a.active||!a.analytic) throw new HttpError(409,`${label} deve ser uma conta analítica e ativa.`,'INVALID_ACCOUNT');
  return a;
}

async function savePurchaseIntegrationSettings(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'purchasing.integration.manage');
  const createPayable=bool01(body.create_payable,0), autoAccounting=bool01(body.auto_accounting,0);
  const due=Math.max(0,Math.min(3650,Number(body.default_due_days??30)||0));
  const batchId=cleanText(body.accounting_batch_id,80), productDebit=cleanText(body.product_debit_account_id,80), serviceDebit=cleanText(body.service_debit_account_id,80), freightDebit=cleanText(body.freight_debit_account_id,80), payableCredit=cleanText(body.payable_credit_account_id,80), histId=cleanText(body.history_template_id,80);

  if(batchId) await assertCompanyEntity(env,'journal_batches',batchId,companyId);
  for(const [id,label] of [[productDebit,'a conta de débito para produtos'],[serviceDebit,'a conta de débito para serviços'],[freightDebit,'a conta de débito para frete'],[payableCredit,'a conta de crédito de fornecedores']]){
    if(id) await assertAnalyticActiveAccount(env,companyId,id,label);
  }
  if(histId) await assertCompanyEntity(env,'history_templates',histId,companyId);
  if(autoAccounting){
    if(!batchId) throw new HttpError(400,'Selecione o lote contábil da integração.','INTEGRATION_NOT_CONFIGURED');
    if(!payableCredit) throw new HttpError(400,'Selecione a conta de crédito de fornecedores.','INTEGRATION_NOT_CONFIGURED');
    if(!productDebit&&!serviceDebit) throw new HttpError(400,'Configure ao menos uma conta de débito para produtos ou serviços.','INTEGRATION_NOT_CONFIGURED');
  }

  await env.DB.prepare(`
    INSERT INTO purchase_integration_settings
      (company_id,create_payable,auto_accounting,default_due_days,accounting_batch_id,product_debit_account_id,service_debit_account_id,freight_debit_account_id,payable_credit_account_id,history_template_id,updated_by,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      create_payable=excluded.create_payable,
      auto_accounting=excluded.auto_accounting,
      default_due_days=excluded.default_due_days,
      accounting_batch_id=excluded.accounting_batch_id,
      product_debit_account_id=excluded.product_debit_account_id,
      service_debit_account_id=excluded.service_debit_account_id,
      freight_debit_account_id=excluded.freight_debit_account_id,
      payable_credit_account_id=excluded.payable_credit_account_id,
      history_template_id=excluded.history_template_id,
      updated_by=excluded.updated_by,
      updated_at=CURRENT_TIMESTAMP
  `).bind(companyId,createPayable,autoAccounting,due,batchId||null,productDebit||null,serviceDebit||null,freightDebit||null,payableCredit||null,histId||null,auth.user.id).run();
  const after=await getPurchaseIntegrationSettings(env,companyId);
  await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_integration_settings',entityId:companyId,after,request});
  return after;
}

async function nextPayableNumber(env,companyId){
  const prefix='CP-';
  const row=await env.DB.prepare(`SELECT MAX(CAST(SUBSTR(number,?) AS INTEGER)) AS max_no FROM financial_payables WHERE company_id=? AND number LIKE 'CP-%'`).bind(prefix.length+1,companyId).first();
  return prefix+String((Number(row?.max_no)||0)+1).padStart(6,'0');
}

async function listFinancialPayables(env,companyId){
  const r=await env.DB.prepare(`
    SELECT fp.*,s.code AS supplier_code,s.name AS supplier_name,rec.number AS receipt_number,o.number AS order_number,
           fca.code AS payment_cash_account_code,fca.name AS payment_cash_account_name,
           fae.number AS payment_event_number,fae.name AS payment_event_name
    FROM financial_payables fp
    JOIN purchase_suppliers s ON s.id=fp.supplier_id
    LEFT JOIN purchase_receipts rec ON rec.id=fp.receipt_id
    LEFT JOIN purchase_orders o ON o.id=rec.order_id
    LEFT JOIN financial_cash_accounts fca ON fca.id=fp.payment_cash_account_id
    LEFT JOIN financial_accounting_events fae ON fae.id=fp.payment_accounting_event_id
    WHERE fp.company_id=?
    ORDER BY CASE fp.status WHEN 'OPEN' THEN 0 WHEN 'PAID' THEN 1 ELSE 2 END,fp.due_date,fp.number
  `).bind(companyId).all();
  return (r.results||[]).map(x=>({...x,amount:centsToMoney(x.amount_cents),balance:centsToMoney(x.balance_cents)}));
}

async function getFinancialPayable(env,companyId,id){
  const x=await env.DB.prepare(`
    SELECT fp.*,s.code AS supplier_code,s.name AS supplier_name,s.tax_id,rec.number AS receipt_number,o.number AS order_number,
           u.name AS created_by_name,pu.name AS paid_by_name,
           fca.code AS payment_cash_account_code,fca.name AS payment_cash_account_name,
           fae.number AS payment_event_number,fae.name AS payment_event_name,
           jb.code AS payment_batch_code
    FROM financial_payables fp
    JOIN purchase_suppliers s ON s.id=fp.supplier_id
    LEFT JOIN purchase_receipts rec ON rec.id=fp.receipt_id
    LEFT JOIN purchase_orders o ON o.id=rec.order_id
    LEFT JOIN users u ON u.id=fp.created_by
    LEFT JOIN users pu ON pu.id=fp.paid_by
    LEFT JOIN financial_cash_accounts fca ON fca.id=fp.payment_cash_account_id
    LEFT JOIN financial_accounting_events fae ON fae.id=fp.payment_accounting_event_id
    LEFT JOIN journal_batches jb ON jb.id=fp.payment_accounting_batch_id
    WHERE fp.id=? AND fp.company_id=?
  `).bind(id,companyId).first();
  if(!x) throw new HttpError(404,'Conta a pagar não encontrada.','NOT_FOUND');
  return {...x,amount:centsToMoney(x.amount_cents),balance:centsToMoney(x.balance_cents)};
}

function financialHistoryTokens(text,{paymentDate,payableNumber,supplierName,documentNumber}){
  let out=String(text||'');
  const p=String(paymentDate||'').split('-');
  const dtd=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(paymentDate||'');
  return out.replace(/\[DTD\]/gi,dtd).replace(/\[NUM\]/gi,String(payableNumber||''))
    .replace(/\[RAZ\]/gi,String(supplierName||'')).replace(/\[DOC\]/gi,String(documentNumber||''));
}

function financialDefaultHistoryPattern(code){
  const f=String(code||'').trim().toUpperCase();
  if(f==='CTB_003') return 'DESCONTO [NUM] - [RAZ]';
  if(f==='FL033') return 'JUROS [NUM] - [RAZ]';
  if(f==='FL039') return 'ADIANTAMENTO [NUM] - [RAZ]';
  return '[DTD] Nº [NUM] - [RAZ]';
}

function evalFinancialPaymentFormula(code,ctx){
  const f=String(code||'').trim().toUpperCase();
  if(!f || ['CTB_001','VALOR_BAIXADO','PAYMENT_VALUE'].includes(f)) return ctx.cashCents;
  if(f==='FL031.1') return ctx.supplierType==='PJ'?ctx.grossCents:0;
  if(f==='FL032.1') return ctx.supplierType==='PF'?ctx.grossCents:0;
  if(f==='VALOR_CONTABIL_FORNECEDOR') return ctx.grossCents;
  if(['CTB_003','VALOR_DESCONTO','DISCOUNT_VALUE'].includes(f)) return ctx.discountCents;
  if(['FL039','VALOR_ADIANTAMENTO','ADVANCE_VALUE'].includes(f)) return ctx.advanceCents;
  if(['FL033','VALOR_JUROS','INTEREST_VALUE'].includes(f)) return ctx.interestCents;
  throw new HttpError(409,`A fórmula ${code} ainda não está disponível para Baixa no SAGAS.`,'FINANCIAL_FORMULA_NOT_SUPPORTED');
}

async function buildFinancialPaymentAccountingLines(env,companyId,{eventId,cashAccountId,payable,paymentDate,discountCents,advanceCents,interestCents}){
  const event=await getFinancialAccountingEvent(env,companyId,eventId);
  if(!event.active||event.process!=='BAIXA') throw new HttpError(409,'Selecione um Evento Contábil ativo do processo Baixa.','INVALID_ACCOUNTING_EVENT');
  const cash=await getFinancialCashAccount(env,companyId,cashAccountId);
  if(!cash.active) throw new HttpError(409,'A Conta/Caixa selecionada está inativa.','INACTIVE_CASH_ACCOUNT');
  const grossCents=Number(payable.balance_cents||0);
  const taxDigits=String(payable.tax_id||'').replace(/\D/g,'');
  const supplierType=taxDigits.length===14?'PJ':taxDigits.length===11?'PF':'UNKNOWN';
  const interest=Number(interestCents||0);
  const cashCents=grossCents+interest-Number(discountCents||0)-Number(advanceCents||0);
  if(cashCents<0) throw new HttpError(400,'Desconto e adiantamento não podem superar o valor do título somado aos juros.','INVALID_PAYMENT_VALUES');
  const ctx={grossCents,cashCents,discountCents:Number(discountCents||0),advanceCents:Number(advanceCents||0),interestCents:interest,supplierType};
  const lines=[];
  for(const item of event.items){
    const amount=evalFinancialPaymentFormula(item.formula,ctx);
    if(amount===0&&!event.allow_zero) continue;
    if(amount<0) throw new HttpError(409,'O Evento Contábil gerou valor negativo.','INVALID_ACCOUNTING_AMOUNT');
    let accountId=item.account_id||null;
    if(item.account_origin==='TABLE_DEFAULT'){
      if(item.default_search!=='ACCOUNT_CASH') throw new HttpError(409,'A origem Tabela Default deste item não está configurada como Conta/Caixa.','DEFAULT_SOURCE_NOT_SUPPORTED');
      const side=String(item.default_side||item.side).toUpperCase();
      accountId=side==='D'?cash.debit_account_id:cash.credit_account_id;
      if(!accountId) throw new HttpError(409,`A Conta/Caixa ${cash.code} não possui default contábil de ${side==='D'?'Débito':'Crédito'}.`,'CASH_ACCOUNT_DEFAULT_MISSING');
    }
    await assertAnalyticActiveAccount(env,companyId,accountId,'a conta gerada pelo Evento Contábil Financeiro');
    let historyPattern=String(item.history_complement||'').trim();
    if(item.history_template_id&&!historyPattern) historyPattern=financialDefaultHistoryPattern(item.formula);
    lines.push({
      side:item.side,account_id:accountId,amount:centsToMoney(amount),branch_id:item.branch_id||null,cost_center_id:item.cost_center_id||null,
      history_template_id:item.history_template_id||null,
      history_complement:financialHistoryTokens(historyPattern,{paymentDate,payableNumber:payable.number,supplierName:payable.supplier_name,documentNumber:payable.document_number})
    });
  }
  if(!lines.length) throw new HttpError(409,'O Evento Contábil Financeiro não gerou partidas para esta baixa.','ACCOUNTING_EVENT_EMPTY');
  return {lines,cash,event,cashCents,grossCents};
}

async function payFinancialPayable(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  const before=await getFinancialPayable(env,companyId,id);
  if(before.status!=='OPEN') throw new HttpError(409,'Somente títulos em aberto podem ser pagos.','INVALID_STATUS');
  const date=isoDate(body.payment_date||new Date().toISOString().slice(0,10),'data do pagamento');
  const cashAccountId=cleanText(required(body.cash_account_id,'Conta/Caixa'),80);
  const cash=await getFinancialCashAccount(env,companyId,cashAccountId);
  if(!cash.active) throw new HttpError(409,'A Conta/Caixa selecionada está inativa.','INACTIVE_CASH_ACCOUNT');
  const discountCents=moneyToCents(body.discount||0),advanceCents=moneyToCents(body.advance||0),interestCents=moneyToCents(body.interest||0);
  if(discountCents<0||advanceCents<0||interestCents<0) throw new HttpError(400,'Desconto, adiantamento e juros não podem ser negativos.','INVALID_PAYMENT_VALUES');
  const cashCents=Number(before.balance_cents||0)+interestCents-discountCents-advanceCents;
  if(cashCents<0) throw new HttpError(400,'Desconto e adiantamento não podem superar o valor do título somado aos juros.','INVALID_PAYMENT_VALUES');

  const eventId=cleanText(body.accounting_event_id,80)||null;
  const batchId=eventId?(cleanText(required(body.accounting_batch_id,'lote contábil'),80)):null;
  let built=null;
  if(eventId){
    const batch=await assertCompanyEntity(env,'journal_batches',batchId,companyId);
    if(batch.status!=='OPEN') throw new HttpError(409,'O lote contábil da baixa precisa estar aberto.','BATCH_LOCKED');
    const acc=await buildFinancialPaymentAccountingLines(env,companyId,{eventId,cashAccountId,payable:before,paymentDate:date,discountCents,advanceCents,interestCents});
    built=await buildInternalPostedEntry(env,auth,companyId,{
      batch_id:batchId,entry_date:date,document_number:before.document_number||before.number,
      description:`Baixa ${before.number} - ${before.supplier_name}`,
      source_module:'FINANCE',source_reference:`PAYABLE_PAYMENT:${id}`,lines:acc.lines
    });
  }

  const update=env.DB.prepare(`UPDATE financial_payables SET status='PAID',balance_cents=0,payment_date=?,payment_notes=?,payment_cash_account_id=?,payment_accounting_event_id=?,payment_accounting_batch_id=?,payment_journal_entry_id=?,payment_discount_cents=?,payment_advance_cents=?,payment_interest_cents=?,payment_cash_cents=?,paid_by=?,paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(
    date,cleanText(body.payment_notes,1000),cashAccountId,eventId,batchId,built?.entryId||null,discountCents,advanceCents,interestCents,cashCents,auth.user.id,id,companyId
  );
  const stmts=[update,...(built?.stmts||[])];
  await env.DB.batch(stmts);
  const after=await getFinancialPayable(env,companyId,id);
  await audit(env,{companyId,userId:auth.user.id,action:'PAY',entity:'financial_payable',entityId:id,before:{status:before.status,balance_cents:before.balance_cents},after:{status:after.status,payment_cash_account_id:cashAccountId,payment_accounting_event_id:eventId,payment_journal_entry_id:built?.entryId||null},request});
  return after;
}

async function cancelFinancialPayable(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  const before=await getFinancialPayable(env,companyId,id);
  if(before.status!=='OPEN') throw new HttpError(409,'Somente títulos em aberto podem ser cancelados.','INVALID_STATUS');
  await env.DB.prepare(`UPDATE financial_payables SET status='CANCELLED',balance_cents=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
  const after=await getFinancialPayable(env,companyId,id);
  await audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'financial_payable',entityId:id,before,after,request});
  return after;
}

async function undoFinancialPayablePayment(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  const before=await getFinancialPayable(env,companyId,id);
  if(before.status!=='PAID') throw new HttpError(409,'Somente títulos baixados podem ter a baixa desfeita.','INVALID_STATUS');

  const journalEntryId=before.payment_journal_entry_id||null;
  if(journalEntryId){
    const entry=await getEntry(env,companyId,journalEntryId);
    if(entry.status==='POSTED'){
      await requirePermission(env,auth.user.id,companyId,'accounting.entry.delete');
      await deleteEntry(env,request,auth,companyId,journalEntryId);
    }else if(entry.status!=='VOID'){
      throw new HttpError(409,'O lançamento contábil vinculado à baixa está em uma situação que impede o estorno da baixa.','INVALID_ACCOUNTING_STATUS');
    }
  }

  await env.DB.prepare(`
    UPDATE financial_payables
    SET status='OPEN',
        balance_cents=amount_cents,
        payment_date=NULL,
        payment_notes=NULL,
        payment_cash_account_id=NULL,
        payment_accounting_event_id=NULL,
        payment_accounting_batch_id=NULL,
        payment_journal_entry_id=NULL,
        payment_discount_cents=0,
        payment_advance_cents=0,
        payment_interest_cents=0,
        payment_cash_cents=NULL,
        paid_by=NULL,
        paid_at=NULL,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).bind(id,companyId).run();

  const after=await getFinancialPayable(env,companyId,id);
  await audit(env,{
    companyId,
    userId:auth.user.id,
    action:'UNDO_PAYMENT',
    entity:'financial_payable',
    entityId:id,
    before:{status:before.status,balance_cents:before.balance_cents,payment_journal_entry_id:journalEntryId,payment_date:before.payment_date},
    after:{status:after.status,balance_cents:after.balance_cents},
    request
  });
  return after;
}

async function buildInternalPostedEntry(env,auth,companyId,body){
  const v=await validateEntry(env,companyId,body),entryId=uuid();
  const stmts=[env.DB.prepare(`
    INSERT INTO journal_entries
      (id,company_id,batch_id,branch_id,entry_date,document_number,description,source_module,source_reference,status,total_debit_cents,total_credit_cents,created_by,posted_by,posted_at)
    VALUES (?,?,?,?,?,?,?,?,?,'POSTED',?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(entryId,companyId,v.batch.id,body.branch_id||null,v.date,cleanText(body.document_number,120),cleanText(body.description,1000),cleanText(body.source_module||'PURCHASES',50),cleanText(body.source_reference,200),v.debit,v.credit,auth.user.id,auth.user.id)];
  for(const line of v.lines){
    stmts.push(env.DB.prepare(`INSERT INTO journal_lines (id,company_id,entry_id,line_no,account_id,side,amount_cents,branch_id,cost_center_id,history_template_id,history_complement,document_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(line.id,companyId,entryId,line.line_no,line.account_id,line.side,line.amount_cents,line.branch_id,line.cost_center_id,line.history_template_id,line.history_complement,line.document_number));
  }
  return {entryId,stmts,total_cents:v.debit};
}

async function prepareReceiptIntegrations(env,auth,companyId,{order,orderDetails,valid,receiptId,receiptNumber,receiptDate,documentNumber,dueDate,willComplete}){
  const settings=await getPurchaseIntegrationSettings(env,companyId),stmts=[],meta={payable:null,journal_entry:null};
  if(!settings.create_payable&&!settings.auto_accounting) return {settings,stmts,meta};

  let itemsTotal=0;
  const debitRaw=[];
  for(const {oi,q} of valid){
    const amount=Math.round(Number(oi.unit_price_cents)*Number(q)/1000);
    if(amount<=0) continue;
    itemsTotal+=amount;
    debitRaw.push({oi,q,amount});
  }
  const freightCents=willComplete?Number(orderDetails.freight_cents||0):0;
  const totalCents=itemsTotal+freightCents;
  if(totalCents<=0) throw new HttpError(409,'O recebimento não possui valor financeiro para integração.','INVALID_AMOUNT');

  const finalDue=dueDate?isoDate(dueDate,'vencimento financeiro'):addDaysISO(receiptDate,settings.default_due_days);
  if(settings.create_payable){
    const payableId=uuid(),payableNumber=await nextPayableNumber(env,companyId);
    stmts.push(env.DB.prepare(`INSERT INTO financial_payables (id,company_id,number,supplier_id,source_type,source_id,receipt_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN',?)`).bind(payableId,companyId,payableNumber,order.supplier_id,'PURCHASE_RECEIPT',receiptId,receiptId,receiptDate,finalDue,cleanText(documentNumber,120),`Compra ${order.number} / Recebimento ${receiptNumber}`,totalCents,totalCents,auth.user.id));
    meta.payable={id:payableId,number:payableNumber,due_date:finalDue,amount:centsToMoney(totalCents)};
  }

  if(settings.auto_accounting){
    if(!settings.accounting_batch_id) throw new HttpError(409,'Integração contábil ativa sem lote configurado.','INTEGRATION_NOT_CONFIGURED');
    const credit=await assertAnalyticActiveAccount(env,companyId,settings.payable_credit_account_id,'a conta de crédito de fornecedores');
    const lines=[];
    for(const x of debitRaw){
      const debitId=x.oi.item_type==='SERVICE'?settings.service_debit_account_id:settings.product_debit_account_id;
      if(!debitId) throw new HttpError(409,`Não há conta de débito configurada para ${x.oi.item_type==='SERVICE'?'serviços':'produtos'}.`,'INTEGRATION_NOT_CONFIGURED');
      await assertAnalyticActiveAccount(env,companyId,debitId,`a conta de débito de ${x.oi.item_type==='SERVICE'?'serviços':'produtos'}`);
      lines.push({side:'D',account_id:debitId,amount:centsToMoney(x.amount),cost_center_id:x.oi.cost_center_id||null,history_template_id:settings.history_template_id||null,history_complement:`Compra ${receiptNumber} - ${orderDetails.supplier_name}`});
    }
    if(freightCents>0){
      const freightAccount=settings.freight_debit_account_id||settings.product_debit_account_id||settings.service_debit_account_id;
      await assertAnalyticActiveAccount(env,companyId,freightAccount,'a conta de débito de frete');
      lines.push({side:'D',account_id:freightAccount,amount:centsToMoney(freightCents),history_template_id:settings.history_template_id||null,history_complement:`Frete da compra ${receiptNumber} - ${orderDetails.supplier_name}`});
    }
    lines.push({side:'C',account_id:credit.id,amount:centsToMoney(totalCents),history_template_id:settings.history_template_id||null,history_complement:`Fornecedor ${orderDetails.supplier_name} - ${receiptNumber}`});
    const built=await buildInternalPostedEntry(env,auth,companyId,{batch_id:settings.accounting_batch_id,branch_id:order.branch_id||null,entry_date:receiptDate,document_number:documentNumber||receiptNumber,description:`Compra ${receiptNumber} - ${orderDetails.supplier_name}`,source_module:'PURCHASES',source_reference:`RECEIPT:${receiptId}`,lines});
    stmts.push(...built.stmts);
    meta.journal_entry={id:built.entryId,amount:centsToMoney(totalCents)};
  }
  return {settings,stmts,meta,total_cents:totalCents,due_date:finalDue};
}



// ===== financial-accounting-events.js =====
const FINANCIAL_ACCOUNTING_EVENT_PERMISSION_DEFS=[
  ["financial.accounting_event.read","Consultar eventos contábeis financeiros"],
  ["financial.accounting_event.manage","Gerenciar eventos contábeis financeiros"],
  ["financial.cash_account.read","Consultar contas/caixa financeiras"],
  ["financial.cash_account.manage","Gerenciar contas/caixa financeiras"]
];

async function ensureFinancialAccountingEventSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS financial_accounting_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      process TEXT NOT NULL DEFAULT 'BAIXA',
      value_mode TEXT NOT NULL DEFAULT 'FORMULA',
      cost_center_apply TEXT NOT NULL DEFAULT 'DEBIT_CREDIT',
      search_branch_json TEXT,
      search_cost_center_json TEXT,
      group_entry INTEGER NOT NULL DEFAULT 1,
      allow_zero INTEGER NOT NULL DEFAULT 0,
      no_auto_adjust INTEGER NOT NULL DEFAULT 0,
      no_round_formula INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,number),
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS financial_accounting_event_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      side TEXT NOT NULL,
      description TEXT NOT NULL,
      apply_to TEXT NOT NULL DEFAULT 'BAIXA',
      account_origin TEXT NOT NULL DEFAULT 'FIXED',
      account_id TEXT,
      default_search TEXT,
      default_side TEXT,
      formula TEXT,
      tax_code TEXT,
      account_classification TEXT,
      percentage REAL,
      branch_id TEXT,
      department TEXT,
      cost_center_id TEXT,
      history_template_id TEXT,
      history_complement TEXT,
      elimination_company TEXT,
      elimination_account_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id,line_no)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fin_acc_event_company ON financial_accounting_events(company_id,number)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fin_acc_event_items ON financial_accounting_event_items(company_id,event_id,line_no)`)
  ]);

  for(const [code,description] of FINANCIAL_ACCOUNTING_EVENT_PERMISSION_DEFS){
    const exists=await env.DB.prepare(`SELECT id FROM permissions WHERE code=?`).bind(code).first();
    if(!exists) await env.DB.prepare(`INSERT INTO permissions (id,code,module,description) VALUES (?,?,'FINANCE',?)`).bind(uuid(),code,description).run();
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code='ADMIN' AND p.code IN ('financial.accounting_event.read','financial.accounting_event.manage','financial.cash_account.read','financial.cash_account.manage')
  `).run();
}

async function ensureFinancialCashAccountSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS financial_cash_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'BANK',
      debit_account_id TEXT,
      credit_account_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fin_cash_accounts_company ON financial_cash_accounts(company_id,code)`)
  ]);
  // Campos da baixa financeira. A tabela financial_payables é criada pelo schema do Financeiro/Compras.
  const t=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='financial_payables'`).first();
  if(t){
    await ensureTableColumn(env,'financial_payables','payment_cash_account_id','TEXT');
    await ensureTableColumn(env,'financial_payables','payment_accounting_event_id','TEXT');
    await ensureTableColumn(env,'financial_payables','payment_accounting_batch_id','TEXT');
    await ensureTableColumn(env,'financial_payables','payment_journal_entry_id','TEXT');
    await ensureTableColumn(env,'financial_payables','payment_discount_cents','INTEGER NOT NULL DEFAULT 0');
    await ensureTableColumn(env,'financial_payables','payment_advance_cents','INTEGER NOT NULL DEFAULT 0');
    await ensureTableColumn(env,'financial_payables','payment_interest_cents','INTEGER NOT NULL DEFAULT 0');
    await ensureTableColumn(env,'financial_payables','payment_cash_cents','INTEGER');
  }
}

async function listFinancialCashAccounts(env,companyId){
  const r=await env.DB.prepare(`
    SELECT f.*,da.code AS debit_account_code,da.name AS debit_account_name,
           ca.code AS credit_account_code,ca.name AS credit_account_name
    FROM financial_cash_accounts f
    LEFT JOIN accounts da ON da.id=f.debit_account_id
    LEFT JOIN accounts ca ON ca.id=f.credit_account_id
    WHERE f.company_id=? ORDER BY f.code
  `).bind(companyId).all();
  return r.results||[];
}

async function getFinancialCashAccount(env,companyId,id){
  const x=await env.DB.prepare(`
    SELECT f.*,da.code AS debit_account_code,da.name AS debit_account_name,
           ca.code AS credit_account_code,ca.name AS credit_account_name
    FROM financial_cash_accounts f
    LEFT JOIN accounts da ON da.id=f.debit_account_id
    LEFT JOIN accounts ca ON ca.id=f.credit_account_id
    WHERE f.id=? AND f.company_id=?
  `).bind(id,companyId).first();
  if(!x) throw new HttpError(404,'Conta/Caixa não encontrada.','NOT_FOUND');
  return x;
}

async function saveFinancialCashAccount(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'financial.cash_account.manage');
  const code=cleanText(required(body.code,'código da Conta/Caixa'),40);
  const name=cleanText(required(body.name,'descrição da Conta/Caixa'),200);
  const accountType=String(body.account_type||'BANK').toUpperCase()==='CASH'?'CASH':'BANK';
  let debitId=cleanText(body.debit_account_id,80)||null,creditId=cleanText(body.credit_account_id,80)||null;
  if(debitId) debitId=(await assertAnalyticActiveAccount(env,companyId,debitId,'o default de débito da Conta/Caixa')).id;
  if(creditId) creditId=(await assertAnalyticActiveAccount(env,companyId,creditId,'o default de crédito da Conta/Caixa')).id;
  if(!debitId&&!creditId) throw new HttpError(400,'Informe ao menos um default contábil de Débito ou Crédito.','VALIDATION_ERROR');
  const dup=await env.DB.prepare(`SELECT id FROM financial_cash_accounts WHERE company_id=? AND code=? AND id<>? LIMIT 1`).bind(companyId,code,id||'').first();
  if(dup) throw new HttpError(409,'Já existe Conta/Caixa com este código.','DUPLICATE_CASH_ACCOUNT');
  let target=id;
  if(id){
    await getFinancialCashAccount(env,companyId,id);
    await env.DB.prepare(`UPDATE financial_cash_accounts SET code=?,name=?,account_type=?,debit_account_id=?,credit_account_id=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(code,name,accountType,debitId,creditId,bool01(body.active,1),id,companyId).run();
  }else{
    target=uuid();
    await env.DB.prepare(`INSERT INTO financial_cash_accounts (id,company_id,code,name,account_type,debit_account_id,credit_account_id,active) VALUES (?,?,?,?,?,?,?,?)`).bind(target,companyId,code,name,accountType,debitId,creditId,bool01(body.active,1)).run();
  }
  const after=await getFinancialCashAccount(env,companyId,target);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'financial_cash_account',entityId:target,after:{code,name,account_type:accountType},request});
  return after;
}

async function deleteFinancialCashAccount(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'financial.cash_account.manage');
  const before=await getFinancialCashAccount(env,companyId,id);
  const used=await env.DB.prepare(`SELECT 1 FROM financial_payables WHERE company_id=? AND payment_cash_account_id=? LIMIT 1`).bind(companyId,id).first();
  if(used){
    await env.DB.prepare(`UPDATE financial_cash_accounts SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
    await audit(env,{companyId,userId:auth.user.id,action:'INACTIVATE',entity:'financial_cash_account',entityId:id,before:{code:before.code,name:before.name},request});
    return {inactivated:true,id};
  }
  await env.DB.prepare(`DELETE FROM financial_cash_accounts WHERE id=? AND company_id=?`).bind(id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'financial_cash_account',entityId:id,before:{code:before.code,name:before.name},request});
  return {deleted:true,id};
}

function parseJsonArray(value){
  try{const x=JSON.parse(value||'[]');return Array.isArray(x)?x:[]}catch{return []}
}

async function listFinancialAccountingEvents(env,companyId){
  const r=await env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM financial_accounting_event_items i WHERE i.company_id=e.company_id AND i.event_id=e.id AND i.side='D') AS debit_count,
      (SELECT COUNT(*) FROM financial_accounting_event_items i WHERE i.company_id=e.company_id AND i.event_id=e.id AND i.side='C') AS credit_count
    FROM financial_accounting_events e
    WHERE e.company_id=?
    ORDER BY e.number,e.code
  `).bind(companyId).all();
  return (r.results||[]).map(x=>({...x,
    search_branch:parseJsonArray(x.search_branch_json),
    search_cost_center:parseJsonArray(x.search_cost_center_json)
  }));
}

async function getFinancialAccountingEvent(env,companyId,id){
  const e=await env.DB.prepare(`SELECT * FROM financial_accounting_events WHERE id=? AND company_id=?`).bind(id,companyId).first();
  if(!e) throw new HttpError(404,'Evento Contábil Financeiro não encontrado.','NOT_FOUND');
  const r=await env.DB.prepare(`
    SELECT i.*,a.code AS account_code,a.name AS account_name,
           b.code AS branch_code,b.name AS branch_name,
           cc.code AS cost_center_code,cc.name AS cost_center_name,
           h.code AS history_code,h.description AS history_description,
           ea.code AS elimination_account_code,ea.name AS elimination_account_name
    FROM financial_accounting_event_items i
    LEFT JOIN accounts a ON a.id=i.account_id
    LEFT JOIN branches b ON b.id=i.branch_id
    LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id
    LEFT JOIN history_templates h ON h.id=i.history_template_id
    LEFT JOIN accounts ea ON ea.id=i.elimination_account_id
    WHERE i.company_id=? AND i.event_id=?
    ORDER BY i.side,i.line_no
  `).bind(companyId,id).all();
  return {...e,
    search_branch:parseJsonArray(e.search_branch_json),
    search_cost_center:parseJsonArray(e.search_cost_center_json),
    items:r.results||[]
  };
}

async function saveFinancialAccountingEvent(env,request,auth,companyId,id,body){
  await requirePermission(env,auth.user.id,companyId,'financial.accounting_event.manage');
  const number=Number(required(body.number,'número'));
  if(!Number.isInteger(number)||number<=0) throw new HttpError(400,'Número do evento inválido.','VALIDATION_ERROR');
  const code=cleanText(required(body.code,'código do evento'),40);
  const name=cleanText(required(body.name,'nome do evento'),300);
  const process=String(body.process||'BAIXA').toUpperCase();
  const allowedProcess=new Set(['BAIXA','EXTRATO_CAIXA','APLICACAO_FINANCEIRA','LANCAMENTO','OUTRO']);
  if(!allowedProcess.has(process)) throw new HttpError(400,'Processo financeiro inválido.','VALIDATION_ERROR');
  const valueMode=String(body.value_mode||'FORMULA').toUpperCase()==='PERCENTAGE'?'PERCENTAGE':'FORMULA';
  const searchBranch=Array.isArray(body.search_branch)?body.search_branch.map(String):[];
  const searchCC=Array.isArray(body.search_cost_center)?body.search_cost_center.map(String):[];
  const rawItems=Array.isArray(body.items)?body.items:[];
  const items=[];let lineNo=1;
  for(const raw of rawItems){
    const side=String(raw.side||'').toUpperCase();
    if(!['D','C'].includes(side)) throw new HttpError(400,'Débito/Crédito inválido em item do evento.','VALIDATION_ERROR');
    const origin=String(raw.account_origin||'FIXED').toUpperCase();
    if(!['FIXED','TABLE_DEFAULT'].includes(origin)) throw new HttpError(400,'Origem da conta inválida.','VALIDATION_ERROR');
    let accountId=cleanText(raw.account_id,80)||null;
    if(origin==='FIXED') accountId=(await assertAnalyticActiveAccount(env,companyId,required(accountId,'conta contábil do item'),'a conta contábil do item')).id;
    else accountId=null;
    let defaultSearch=cleanText(raw.default_search,80);
    if(origin==='TABLE_DEFAULT'){
      const normalized=String(defaultSearch||'').toUpperCase().replace(/\s+/g,'_').replace('/','_');
      if(['CONTA_CAIXA','CONTA/CAIXA','ACCOUNT_CASH'].includes(normalized)) defaultSearch='ACCOUNT_CASH';
      if(defaultSearch!=='ACCOUNT_CASH') throw new HttpError(400,'Para Tabela Default, selecione Conta/Caixa.','VALIDATION_ERROR');
      if(!['D','C'].includes(String(raw.default_side||'').toUpperCase())) throw new HttpError(400,'Informe se o default da Conta/Caixa será de Débito ou Crédito.','VALIDATION_ERROR');
    }
    if(raw.branch_id) await assertCompanyEntity(env,'branches',raw.branch_id,companyId);
    if(raw.cost_center_id) await assertCompanyEntity(env,'cost_centers',raw.cost_center_id,companyId);
    let normalizedHistoryComplement=cleanText(raw.history_complement,1000);
    if(raw.history_template_id){
      const h=await assertCompanyEntity(env,'history_templates',raw.history_template_id,companyId);
      if(h.complement_required&&!String(normalizedHistoryComplement||'').trim()) normalizedHistoryComplement=financialDefaultHistoryPattern(raw.formula);
    }
    let eliminationAccountId=cleanText(raw.elimination_account_id,80)||null;
    if(eliminationAccountId) eliminationAccountId=(await assertAnalyticActiveAccount(env,companyId,eliminationAccountId,'a conta contra partida da eliminação')).id;
    const pct=raw.percentage===undefined||raw.percentage===null||String(raw.percentage).trim()===''?null:Number(raw.percentage);
    if(pct!==null&&(!Number.isFinite(pct)||pct<0||pct>100)) throw new HttpError(400,'Percentual do item inválido.','VALIDATION_ERROR');
    items.push({
      line_no:lineNo++,side,
      description:cleanText(required(raw.description,'descrição do item'),300),
      apply_to:cleanText(raw.apply_to||process,60),
      account_origin:origin,account_id:accountId,
      default_search:origin==='TABLE_DEFAULT'?defaultSearch:null,default_side:origin==='TABLE_DEFAULT'?String(raw.default_side||'').toUpperCase():null,
      formula:cleanText(raw.formula,500),tax_code:cleanText(raw.tax_code,80),account_classification:cleanText(raw.account_classification,80),percentage:pct,
      branch_id:raw.branch_id||null,department:cleanText(raw.department,120),cost_center_id:raw.cost_center_id||null,
      history_template_id:raw.history_template_id||null,history_complement:cleanText(raw.history_complement,1000),
      elimination_company:cleanText(raw.elimination_company,80),elimination_account_id:eliminationAccountId
    });
  }
  if(!items.length) throw new HttpError(400,'Inclua ao menos um item de débito ou crédito.','VALIDATION_ERROR');
  if(!items.some(x=>x.side==='D')||!items.some(x=>x.side==='C')) throw new HttpError(400,'O evento precisa possuir ao menos um item de Débito e um de Crédito.','VALIDATION_ERROR');

  const duplicate=await env.DB.prepare(`SELECT id FROM financial_accounting_events WHERE company_id=? AND (number=? OR code=?) AND id<>? LIMIT 1`).bind(companyId,number,code,id||'').first();
  if(duplicate) throw new HttpError(409,'Já existe Evento Contábil Financeiro com este número ou código.','DUPLICATE_EVENT');

  let target=id;
  const values=[number,code,name,process,valueMode,cleanText(body.cost_center_apply||'DEBIT_CREDIT',60),JSON.stringify(searchBranch),JSON.stringify(searchCC),bool01(body.group_entry,1),bool01(body.allow_zero,0),bool01(body.no_auto_adjust,0),bool01(body.no_round_formula,1),bool01(body.active,1)];
  if(id){
    await getFinancialAccountingEvent(env,companyId,id);
    await env.DB.prepare(`UPDATE financial_accounting_events SET number=?,code=?,name=?,process=?,value_mode=?,cost_center_apply=?,search_branch_json=?,search_cost_center_json=?,group_entry=?,allow_zero=?,no_auto_adjust=?,no_round_formula=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(...values,id,companyId).run();
  }else{
    target=uuid();
    await env.DB.prepare(`INSERT INTO financial_accounting_events (id,company_id,number,code,name,process,value_mode,cost_center_apply,search_branch_json,search_cost_center_json,group_entry,allow_zero,no_auto_adjust,no_round_formula,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(target,companyId,...values).run();
  }
  const stmts=[env.DB.prepare(`DELETE FROM financial_accounting_event_items WHERE company_id=? AND event_id=?`).bind(companyId,target)];
  for(const x of items) stmts.push(env.DB.prepare(`
    INSERT INTO financial_accounting_event_items
      (id,company_id,event_id,line_no,side,description,apply_to,account_origin,account_id,default_search,default_side,formula,tax_code,account_classification,percentage,branch_id,department,cost_center_id,history_template_id,history_complement,elimination_company,elimination_account_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(uuid(),companyId,target,x.line_no,x.side,x.description,x.apply_to,x.account_origin,x.account_id,x.default_search,x.default_side,x.formula,x.tax_code,x.account_classification,x.percentage,x.branch_id,x.department,x.cost_center_id,x.history_template_id,x.history_complement,x.elimination_company,x.elimination_account_id));
  await env.DB.batch(stmts);
  const after=await getFinancialAccountingEvent(env,companyId,target);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'financial_accounting_event',entityId:target,after:{number,code,name,process},request});
  return after;
}

async function deleteFinancialAccountingEvent(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'financial.accounting_event.manage');
  const before=await getFinancialAccountingEvent(env,companyId,id);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM financial_accounting_event_items WHERE company_id=? AND event_id=?`).bind(companyId,id),
    env.DB.prepare(`DELETE FROM financial_accounting_events WHERE company_id=? AND id=?`).bind(companyId,id)
  ]);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'financial_accounting_event',entityId:id,before:{number:before.number,code:before.code,name:before.name},request});
  return {deleted:true,id};
}

async function receiptIntegrationLinks(env,companyId,receiptId){
  const payable=await env.DB.prepare(`SELECT id,number,status,due_date,amount_cents,balance_cents FROM financial_payables WHERE company_id=? AND receipt_id=? LIMIT 1`).bind(companyId,receiptId).first();
  const entry=await env.DB.prepare(`SELECT id,status,official_status,total_debit_cents FROM journal_entries WHERE company_id=? AND source_module='PURCHASES' AND source_reference=? ORDER BY created_at DESC LIMIT 1`).bind(companyId,`RECEIPT:${receiptId}`).first();
  return {payable:payable?{...payable,amount:centsToMoney(payable.amount_cents),balance:centsToMoney(payable.balance_cents)}:null,journal_entry:entry?{...entry,amount:centsToMoney(entry.total_debit_cents)}:null};
}

async function route(request, env) {
  const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"" )||"/", method=request.method.toUpperCase();
  if (method==="OPTIONS") return new Response(null,{status:204});

  if (method==="GET" && path==="/health") {
    const db=await env.DB.prepare("SELECT 1 AS ok").first();
    return ok({service:"sagas-api",database:db?.ok===1?"ok":"error"});
  }
  if (method==="POST" && path==="/api/bootstrap") return ok(await bootstrap(env,request,await readJson(request)),201);

  if (method==="POST" && path==="/api/auth/login") {
    const body=await readJson(request), email=String(body.email||"").trim().toLowerCase();
    const user=await env.DB.prepare(`SELECT id,name,email,password_hash,password_salt,password_iterations,active FROM users WHERE email=?`).bind(email).first();
    if (!user || !user.active || !(await verifyPassword(String(body.password||""),user.password_hash,user.password_salt,user.password_iterations))) {
      throw new HttpError(401,"E-mail ou senha inválidos.","INVALID_CREDENTIALS");
    }

    const companies=await listCompanies(env,{user});
    if (!companies.length) {
      throw new HttpError(403,"Seu usuário não possui acesso ativo a nenhuma empresa.","NO_ACTIVE_COMPANY");
    }

    await env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
    const session=await createSession(env,user,request);
    return ok({user:{id:user.id,name:user.name,email:user.email},companies,...session});
  }

  const auth=await authenticate(request,env);
  if (method==="POST" && path==="/api/auth/logout") { await logout(auth,env); return ok(); }
  if (method==="POST" && path==="/api/auth/change-password") return ok(await changePassword(env,request,auth,await readJson(request)));
  if (method==="PATCH" && path==="/api/auth/profile") return ok({user:await updateOwnProfile(env,request,auth,await readJson(request))});
  if (method==="GET" && path==="/api/auth/me") return ok({user:auth.user,companies:await listCompanies(env,auth)});
  if (method==="GET" && path==="/api/companies") return ok({companies:await listCompanies(env,auth)});
  if (method==="POST" && path==="/api/companies") return ok({company:await createCompany(env,request,auth,await readJson(request))},201);

  const companyId=await currentCompany(request,env,auth);

  // v26: não executa migrações/CREATE TABLE de Compras em toda chamada do sistema.
  // Essas estruturas só são verificadas quando a própria rota pertence ao módulo
  // de Compras/Movimentos/Financeiro gerado por compras. Isso evita dezenas de
  // consultas PRAGMA/CREATE em telas como Plano de Contas, Lotes e Usuários.
  const needsPurchasingSchema =
    path.startsWith("/api/purchase-") ||
    path.startsWith("/api/movement-") ||
    path.startsWith("/api/budget-natures") ||
    path.startsWith("/api/financial-payables") ||
    path.startsWith("/api/stock-balances");

  if (needsPurchasingSchema) {
    await ensurePurchasingSchema(env);
    await ensurePurchaseIntegrationSchema(env);
    await ensureRmPurchasingSchema(env);
  }

  if (path.startsWith("/api/financial-accounting-events") || path.startsWith("/api/financial-cash-accounts") || path.startsWith("/api/financial-payables") || path==="/api/auth/permissions") {
    await ensureFinancialAccountingEventSchema(env);
    await ensureFinancialCashAccountSchema(env);
  }

  if (method==="GET" && path==="/api/auth/permissions") return ok({permissions:await getEffectivePermissions(env,auth.user.id,companyId)});

  if (method==="GET" && path==="/api/branches") { await requirePermission(env,auth.user.id,companyId,"core.branch.read"); return ok({branches:await listSimple(env,companyId,"branches","id,code,name,tax_id,active,created_at")}); }
  if (method==="POST" && path==="/api/branches") return ok({branch:await createBranch(env,request,auth,companyId,await readJson(request))},201);

  let p;
  if (method==="GET" && path==="/api/users") return ok({users:await listUsers(env,auth,companyId)});
  if (method==="POST" && path==="/api/users") return ok({user:await createUser(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/users/:id/reset-password");
  if (p && method==="POST") return ok(await adminResetPassword(env,request,auth,companyId,p.id,await readJson(request)));
  p=routeMatch(path,"/api/users/:id");
  if (p && method==="PATCH") return ok({user:await updateUser(env,request,auth,companyId,p.id,await readJson(request))});

  if (method==="GET" && path==="/api/permissions") { await requirePermission(env,auth.user.id,companyId,"core.role.manage"); const r=await env.DB.prepare("SELECT id,code,module,description FROM permissions ORDER BY module,code").all(); return ok({permissions:r.results||[]}); }
  if (method==="GET" && path==="/api/roles") { await requirePermission(env,auth.user.id,companyId,"core.role.manage"); const r=await env.DB.prepare("SELECT * FROM roles WHERE company_id=? ORDER BY name").bind(companyId).all(); return ok({roles:r.results||[]}); }
  if (method==="POST" && path==="/api/roles") return ok({role:await createRole(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/roles/:id");
  if (p && method==="GET") return ok({role:await getRoleDetails(env,auth,companyId,p.id)});
  if (p && method==="PATCH") return ok({role:await updateRole(env,request,auth,companyId,p.id,await readJson(request))});

  if (method==="GET" && path==="/api/accounts") { await requirePermission(env,auth.user.id,companyId,"accounting.account.read"); return ok({accounts:await listSimple(env,companyId,"accounts","id,code,reduced_code,name,parent_id,account_class,normal_side,analytic,active")}); }
  if (method==="POST" && path==="/api/accounts") return ok({account:await createAccount(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/accounts/:id");
  if (p && method==="PATCH") return ok({account:await updateAccount(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteAccount(env,request,auth,companyId,p.id));

  if (method==="GET" && path==="/api/cost-centers") { await requirePermission(env,auth.user.id,companyId,"accounting.cost_center.read"); return ok({cost_centers:await listSimple(env,companyId,"cost_centers","id,code,name,parent_id,active")}); }
  if (method==="POST" && path==="/api/cost-centers") return ok({cost_center:await createCostCenter(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/cost-centers/:id");
  if (p && method==="PATCH") return ok({cost_center:await updateCostCenter(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteCostCenter(env,request,auth,companyId,p.id));

  if (method==="GET" && path==="/api/history-templates") { await requirePermission(env,auth.user.id,companyId,"accounting.history.read"); return ok({history_templates:await listSimple(env,companyId,"history_templates","id,code,description,complement_required,active")}); }
  if (method==="POST" && path==="/api/history-templates") return ok({history_template:await createHistory(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/history-templates/:id");
  if (p && method==="PATCH") return ok({history_template:await updateHistory(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteHistory(env,request,auth,companyId,p.id));

  if (method==="GET" && path==="/api/accounting-periods") {
    await requirePermission(env,auth.user.id,companyId,"accounting.period.read");
    await ensureAccountingPeriodSchema(env);
    return ok({periods:await listSimple(env,companyId,"accounting_periods","id,code,start_date,end_date,status,closed_until")});
  }
  if (method==="POST" && path==="/api/accounting-periods") return ok({period:await createPeriod(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/accounting-periods/:id");
  if (p && method==="PATCH") return ok({period:await updatePeriod(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePeriod(env,request,auth,companyId,p.id));

  if (method==="GET" && path==="/api/journal-batches") {
    await requirePermission(env,auth.user.id,companyId,"accounting.batch.read");
    return ok(await listBatchesDetailed(env,companyId));
  }
  if (method==="POST" && path==="/api/journal-batches") return ok({batch:await createBatch(env,request,auth,companyId,await readJson(request))},201);

  p=routeMatch(path,"/api/journal-batches/:id/lock");
  if (p && method==="POST") return ok({batch:await setBatchLock(env,request,auth,companyId,p.id,true)});

  p=routeMatch(path,"/api/journal-batches/:id/unlock");
  if (p && method==="POST") return ok({batch:await setBatchLock(env,request,auth,companyId,p.id,false)});

  p=routeMatch(path,"/api/journal-batches/:id/integrate");
  if (p && method==="POST") return ok(await integrateBatchEntries(env,request,auth,companyId,p.id,await readJson(request)));

  p=routeMatch(path,"/api/journal-batches/:id/unintegrate");
  if (p && method==="POST") return ok(await unintegrateBatchEntries(env,request,auth,companyId,p.id,await readJson(request)));

  p=routeMatch(path,"/api/journal-batches/:id");
  if (p && method==="GET") {
    await requirePermission(env,auth.user.id,companyId,"accounting.batch.read");
    return ok({batch:await getBatchDetails(env,companyId,p.id)});
  }
  if (p && method==="PATCH") return ok({batch:await updateBatch(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteBatch(env,request,auth,companyId,p.id));

  if (method==="GET" && path==="/api/journal-entry-grid") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok({grid:await listJournalEntryGrid(env,companyId,{
      context:url.searchParams.get("context"),
      batch_id:url.searchParams.get("batch_id"),
      page:url.searchParams.get("page"),
      page_size:url.searchParams.get("page_size"),
      q:url.searchParams.get("q")
    })});
  }

  if (method==="GET" && path==="/api/official-entries") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok({entries:await listOfficialEntries(env,companyId,url.searchParams.get("limit"))});
  }

  if (method==="GET" && path==="/api/journal-entry-filters") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok({filters:await listUserViewFilters(env,companyId,auth.user.id,"journal_entries")});
  }
  if (method==="POST" && path==="/api/journal-entry-filters") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok({filter:await saveUserViewFilter(env,companyId,auth.user.id,await readJson(request))},201);
  }
  p=routeMatch(path,"/api/journal-entry-filters/:id");
  if (p && method==="DELETE") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok(await deleteUserViewFilter(env,companyId,auth.user.id,p.id));
  }

  if (method==="GET" && path==="/api/journal-entries") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    let filterDefinition=null;
    const rawFilter=url.searchParams.get("filter");
    if (rawFilter) {
      try { filterDefinition=JSON.parse(rawFilter); }
      catch { throw new HttpError(400,"Filtro inválido.","VALIDATION_ERROR"); }
    }
    return ok({entries:await listEntries(env,companyId,url.searchParams.get("limit"),filterDefinition)});
  }
  if (method==="POST" && path==="/api/journal-entries") return ok({entry:await createEntry(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/journal-entries/:id");
  if (p && method==="GET") { await requirePermission(env,auth.user.id,companyId,"accounting.entry.read"); return ok({entry:await getEntry(env,companyId,p.id)}); }
  if (p && method==="PATCH") return ok({entry:await updateEntry(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteEntry(env,request,auth,companyId,p.id));
  p=routeMatch(path,"/api/journal-entries/:id/post");
  if (p && method==="POST") return ok({entry:await postEntry(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/journal-entries/:id/void");
  if (p && method==="POST") { const b=await readJson(request); return ok({entry:await voidEntry(env,request,auth,companyId,p.id,b.reason)}); }



  // ---- Cadastros estruturais do RM para Movimentos / Compras ----
  if(method==="GET"&&path==="/api/movement-types"){
    await requirePermission(env,auth.user.id,companyId,"purchasing.movement_type.read");
    return ok({movement_types:await listMovementTypes(env,companyId)});
  }
  if(method==="POST"&&path==="/api/movement-types")return ok({movement_type:await saveMovementType(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/movement-types/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.movement_type.read");return ok({movement_type:await getMovementTypeDetails(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({movement_type:await saveMovementType(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deleteMovementType(env,request,auth,companyId,p.id));

  if(method==="GET"&&path==="/api/budget-natures"){
    await requirePermission(env,auth.user.id,companyId,"purchasing.nature.read");
    return ok({natures:await listBudgetNatures(env,companyId)});
  }
  if(method==="POST"&&path==="/api/budget-natures")return ok({nature:await saveBudgetNature(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/budget-natures/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.nature.read");return ok({nature:await getBudgetNature(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({nature:await saveBudgetNature(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deleteBudgetNature(env,request,auth,companyId,p.id));

  if(method==="GET"&&path==="/api/movement-accounting-events"){
    await requirePermission(env,auth.user.id,companyId,"purchasing.accounting_event.read");
    return ok({events:await listMovementAccountingEvents(env,companyId)});
  }
  if(method==="POST"&&path==="/api/movement-accounting-events")return ok({event:await saveMovementAccountingEvent(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/movement-accounting-events/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.accounting_event.read");return ok({event:await getMovementAccountingEvent(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({event:await saveMovementAccountingEvent(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deleteMovementAccountingEvent(env,request,auth,companyId,p.id));

  // ---- Compras / Materiais ----
  if (method==="GET" && path==="/api/purchase-products") {
    await requirePermission(env,auth.user.id,companyId,"purchasing.product.read");
    const r=await env.DB.prepare(`
      SELECT p.id,p.code,p.description,p.item_type,p.unit,p.purchase_unit,p.budget_nature_id,p.notes,p.active,p.created_at,
             n.code AS nature_code,n.description AS nature_description
      FROM purchase_products p
      LEFT JOIN budget_natures n ON n.id=p.budget_nature_id
      WHERE p.company_id=? ORDER BY p.code
    `).bind(companyId).all();
    return ok({products:r.results||[]});
  }
  if (method==="POST" && path==="/api/purchase-products") return ok({product:await savePurchaseProduct(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-products/:id");
  if (p && method==="PATCH") return ok({product:await savePurchaseProduct(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePurchaseMaster(env,request,auth,companyId,"product",p.id));

  if (method==="GET" && path==="/api/purchase-suppliers") { await requirePermission(env,auth.user.id,companyId,"purchasing.supplier.read"); return ok({suppliers:await listPurchaseMaster(env,companyId,"purchase_suppliers","id,code,name,tax_id,email,phone,contact_name,notes,active,created_at")}); }
  if (method==="POST" && path==="/api/purchase-suppliers") return ok({supplier:await savePurchaseSupplier(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-suppliers/:id");
  if (p && method==="PATCH") return ok({supplier:await savePurchaseSupplier(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePurchaseMaster(env,request,auth,companyId,"supplier",p.id));

  if (method==="GET" && path==="/api/purchase-requests") { await requirePermission(env,auth.user.id,companyId,"purchasing.request.read"); return ok({requests:await listPurchaseRequests(env,companyId)}); }
  if (method==="POST" && path==="/api/purchase-requests") return ok({request:await createPurchaseRequest(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-requests/:id/release"); if(p&&method==="POST")return ok({request:await setPurchaseRequestStatus(env,request,auth,companyId,p.id,"RELEASED")});
  p=routeMatch(path,"/api/purchase-requests/:id/cancel"); if(p&&method==="POST")return ok({request:await setPurchaseRequestStatus(env,request,auth,companyId,p.id,"CANCELLED")});
  p=routeMatch(path,"/api/purchase-requests/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.request.read");return ok({request:await getPurchaseRequest(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({request:await updatePurchaseRequest(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deletePurchaseRequest(env,request,auth,companyId,p.id));

  if(method==="GET"&&path==="/api/purchase-quotations"){await requirePermission(env,auth.user.id,companyId,"purchasing.quotation.read");return ok({quotations:await listQuotations(env,companyId)});}
  if(method==="POST"&&path==="/api/purchase-quotations")return ok({quotation:await createQuotation(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-quotations/:id/proposals"); if(p&&method==="PATCH")return ok({quotation:await saveQuotationProposals(env,request,auth,companyId,p.id,await readJson(request))});
  p=routeMatch(path,"/api/purchase-quotations/:id/generate-orders"); if(p&&method==="POST")return ok(await generateOrdersFromQuotation(env,request,auth,companyId,p.id,await readJson(request)));
  p=routeMatch(path,"/api/purchase-quotations/:id/cancel"); if(p&&method==="POST")return ok({quotation:await cancelQuotation(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/purchase-quotations/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.quotation.read");return ok({quotation:await getQuotation(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/purchase-orders"){await requirePermission(env,auth.user.id,companyId,"purchasing.order.read");return ok({orders:await listOrders(env,companyId)});}
  p=routeMatch(path,"/api/purchase-orders/:id/cancel"); if(p&&method==="POST")return ok({order:await cancelOrder(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/purchase-orders/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.order.read");return ok({order:await getOrder(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/purchase-receipts"){await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");return ok({receipts:await listReceipts(env,companyId)});}
  if(method==="POST"&&path==="/api/purchase-receipts")return ok({receipt:await createReceipt(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-receipts/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");return ok({receipt:await getReceipt(env,companyId,p.id)});}


  // ---- Integração Compras / Financeiro / Contábil ----
  if(method==="GET"&&path==="/api/purchase-integration-settings"){await requirePermission(env,auth.user.id,companyId,"purchasing.integration.read");return ok({settings:await getPurchaseIntegrationSettings(env,companyId)});}
  if(method==="PUT"&&path==="/api/purchase-integration-settings")return ok({settings:await savePurchaseIntegrationSettings(env,request,auth,companyId,await readJson(request))});

  if(method==="GET"&&path==="/api/financial-cash-accounts"){await requirePermission(env,auth.user.id,companyId,"financial.cash_account.read");return ok({accounts:await listFinancialCashAccounts(env,companyId)});}
  if(method==="POST"&&path==="/api/financial-cash-accounts")return ok({account:await saveFinancialCashAccount(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/financial-cash-accounts/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"financial.cash_account.read");return ok({account:await getFinancialCashAccount(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({account:await saveFinancialCashAccount(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deleteFinancialCashAccount(env,request,auth,companyId,p.id));

  if(method==="GET"&&path==="/api/financial-accounting-events"){await requirePermission(env,auth.user.id,companyId,"financial.accounting_event.read");return ok({events:await listFinancialAccountingEvents(env,companyId)});}
  if(method==="POST"&&path==="/api/financial-accounting-events")return ok({event:await saveFinancialAccountingEvent(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/financial-accounting-events/:id");
  if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"financial.accounting_event.read");return ok({event:await getFinancialAccountingEvent(env,companyId,p.id)});}
  if(p&&method==="PATCH")return ok({event:await saveFinancialAccountingEvent(env,request,auth,companyId,p.id,await readJson(request))});
  if(p&&method==="DELETE")return ok(await deleteFinancialAccountingEvent(env,request,auth,companyId,p.id));

  if(method==="GET"&&path==="/api/financial-payables"){await requirePermission(env,auth.user.id,companyId,"financial.payable.read");return ok({payables:await listFinancialPayables(env,companyId)});}
  p=routeMatch(path,"/api/financial-payables/:id/pay"); if(p&&method==="POST")return ok({payable:await payFinancialPayable(env,request,auth,companyId,p.id,await readJson(request))});
  p=routeMatch(path,"/api/financial-payables/:id/unpay"); if(p&&method==="POST")return ok({payable:await undoFinancialPayablePayment(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/financial-payables/:id/cancel"); if(p&&method==="POST")return ok({payable:await cancelFinancialPayable(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/financial-payables/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"financial.payable.read");return ok({payable:await getFinancialPayable(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/stock-balances"){await requirePermission(env,auth.user.id,companyId,"purchasing.product.read");return ok({balances:await listStockBalances(env,companyId)});}

  if (method==="GET" && path==="/api/audit") {
    await requirePermission(env,auth.user.id,companyId,"core.audit.read");
    const limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit")||100)));
    const r=await env.DB.prepare(`SELECT a.*,u.name AS user_name,u.email AS user_email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(companyId,limit).all();
    return ok({audit:r.results||[]});
  }

  throw new HttpError(404,"Rota não encontrada.","NOT_FOUND");
}

export default {
  async fetch(request, env) {
    const cors=corsHeaders(request,env);
    try {
      const response=await route(request,env), headers=new Headers(response.headers);
      for (const [k,v] of Object.entries(cors)) headers.set(k,v);
      headers.set("X-Content-Type-Options","nosniff"); headers.set("Cache-Control","no-store");
      return new Response(response.body,{status:response.status,headers});
    } catch(e) {
      console.error(e);
      const response=e instanceof HttpError?error(e.message,e.status,e.code,e.details):error("Erro interno do servidor.",500,"INTERNAL_ERROR");
      const headers=new Headers(response.headers);
      for (const [k,v] of Object.entries(cors)) headers.set(k,v);
      headers.set("X-Content-Type-Options","nosniff"); headers.set("Cache-Control","no-store");
      return new Response(response.body,{status:response.status,headers});
    }
  }
};
