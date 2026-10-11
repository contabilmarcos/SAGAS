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

async function listEntries(env, companyId, limit=100) {
  await ensureBatchIntegrationSchema(env);
  await migrateLegacyDraftEntries(env,companyId);

  const res=await env.DB.prepare(`
    SELECT
      e.id,e.entry_date,e.document_number,e.description,e.source_module,e.source_reference,e.status,
      e.official_status,e.integration_id,e.integrated_at,
      e.total_debit_cents,e.total_credit_cents,e.created_at,e.posted_at,
      b.code AS batch_code,b.description AS batch_description,
      br.code AS branch_code,br.name AS branch_name
    FROM journal_entries e
    JOIN journal_batches b ON b.id=e.batch_id
    LEFT JOIN branches br ON br.id=e.branch_id
    WHERE e.company_id=?
    ORDER BY e.entry_date DESC,e.created_at DESC
    LIMIT ?
  `).bind(companyId,Math.min(500,Math.max(1,Number(limit)||100))).all();

  return (res.results||[]).map(x=>({
    ...x,
    total_debit:centsToMoney(x.total_debit_cents),
    total_credit:centsToMoney(x.total_credit_cents)
  }));
}

async function getEntry(env, companyId, id) {
  await ensureBatchIntegrationSchema(env);
  await migrateLegacyDraftEntries(env,companyId);
  const entry=await env.DB.prepare("SELECT * FROM journal_entries WHERE id=? AND company_id=?").bind(id,companyId).first();
  if (!entry) throw new HttpError(404,"Lançamento não encontrado.","NOT_FOUND");
  const linesRes=await env.DB.prepare(`SELECT l.*,a.code AS account_code,a.name AS account_name,cc.code AS cost_center_code,cc.name AS cost_center_name,h.code AS history_code,h.description AS history_description FROM journal_lines l JOIN accounts a ON a.id=l.account_id LEFT JOIN cost_centers cc ON cc.id=l.cost_center_id LEFT JOIN history_templates h ON h.id=l.history_template_id WHERE l.entry_id=? AND l.company_id=? ORDER BY l.line_no`).bind(id,companyId).all();
  const lines=[];
  for (const row of (linesRes.results||[])) {
    const alloc=await env.DB.prepare(`SELECT al.*,cc.code AS cost_center_code,cc.name AS cost_center_name FROM allocation_lines al JOIN cost_centers cc ON cc.id=al.cost_center_id WHERE al.journal_line_id=? AND al.company_id=? ORDER BY cc.code`).bind(row.id,companyId).all();
    lines.push({
      ...row,
      amount:centsToMoney(row.amount_cents),
      allocations:(alloc.results||[]).map(a=>({...a,amount:centsToMoney(a.amount_cents)}))
    });
  }
  return {...entry,total_debit:centsToMoney(entry.total_debit_cents),total_credit:centsToMoney(entry.total_credit_cents),lines};
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
  await ensureEntryMaintenanceSchema(env);

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

  if (method==="GET" && path==="/api/official-entries") {
    await requirePermission(env,auth.user.id,companyId,"accounting.entry.read");
    return ok({entries:await listOfficialEntries(env,companyId,url.searchParams.get("limit"))});
  }

  if (method==="GET" && path==="/api/journal-entries") { await requirePermission(env,auth.user.id,companyId,"accounting.entry.read"); return ok({entries:await listEntries(env,companyId,url.searchParams.get("limit"))}); }
  if (method==="POST" && path==="/api/journal-entries") return ok({entry:await createEntry(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/journal-entries/:id");
  if (p && method==="GET") { await requirePermission(env,auth.user.id,companyId,"accounting.entry.read"); return ok({entry:await getEntry(env,companyId,p.id)}); }
  if (p && method==="PATCH") return ok({entry:await updateEntry(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deleteEntry(env,request,auth,companyId,p.id));
  p=routeMatch(path,"/api/journal-entries/:id/post");
  if (p && method==="POST") return ok({entry:await postEntry(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/journal-entries/:id/void");
  if (p && method==="POST") { const b=await readJson(request); return ok({entry:await voidEntry(env,request,auth,companyId,p.id,b.reason)}); }

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

