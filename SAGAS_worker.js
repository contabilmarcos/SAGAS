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

  const lines=[];
  for (const row of (linesRes.results||[])) {
    const alloc=await env.DB.prepare(`
      SELECT al.*,cc.code AS cost_center_code,cc.name AS cost_center_name
      FROM allocation_lines al
      JOIN cost_centers cc ON cc.id=al.cost_center_id
      WHERE al.journal_line_id=? AND al.company_id=?
      ORDER BY cc.code
    `).bind(row.id,companyId).all();

    lines.push({
      ...row,
      amount:centsToMoney(row.amount_cents),
      allocations:(alloc.results||[]).map(a=>({...a,amount:centsToMoney(a.amount_cents)}))
    });
  }

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
  ["purchasing.location.read","Consultar locais de estoque"],
  ["purchasing.location.manage","Gerenciar locais de estoque"],
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_locations (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,code)
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
      cost_center_id TEXT, location_id TEXT, needed_date TEXT, notes TEXT,
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
      unit_price_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, cost_center_id TEXT, location_id TEXT,
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_balances (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, product_id TEXT NOT NULL, location_id TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,product_id,location_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, product_id TEXT NOT NULL, location_id TEXT NOT NULL,
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
    'purchase_products','purchase_suppliers','purchase_locations','purchase_requests','purchase_quotations',
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
  if (id) {
    const before=await purchaseEntity(env,'purchase_products',id,companyId);
    await env.DB.prepare(`UPDATE purchase_products SET code=?,description=?,item_type=?,unit=?,purchase_unit=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
      .bind(code,description,itemType,unit,purchaseUnit,notes,active,id,companyId).run();
    const after=await purchaseEntity(env,'purchase_products',id,companyId);
    await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_product',entityId:id,before,after,request}); return after;
  }
  const newId=uuid();
  await env.DB.prepare(`INSERT INTO purchase_products (id,company_id,code,description,item_type,unit,purchase_unit,notes,active) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(newId,companyId,code,description,itemType,unit,purchaseUnit,notes,active).run();
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

async function savePurchaseLocation(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.location.manage');
  const code=cleanText(required(body.code,'code'),50), name=cleanText(required(body.name,'name'),300), active=bool01(body.active,1);
  if (id) {
    const before=await purchaseEntity(env,'purchase_locations',id,companyId);
    await env.DB.prepare(`UPDATE purchase_locations SET code=?,name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(code,name,active,id,companyId).run();
    const after=await purchaseEntity(env,'purchase_locations',id,companyId); await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_location',entityId:id,before,after,request}); return after;
  }
  const newId=uuid(); await env.DB.prepare(`INSERT INTO purchase_locations (id,company_id,code,name,active) VALUES (?,?,?,?,?)`).bind(newId,companyId,code,name,active).run();
  const after=await purchaseEntity(env,'purchase_locations',newId,companyId); await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_location',entityId:newId,after,request}); return after;
}

async function deletePurchaseMaster(env,request,auth,companyId,type,id) {
  const cfg={
    product:{table:'purchase_products',perm:'purchasing.product.manage',checks:[['purchase_request_items','product_id'],['purchase_order_items','product_id']]},
    supplier:{table:'purchase_suppliers',perm:'purchasing.supplier.manage',checks:[['purchase_quotation_suppliers','supplier_id'],['purchase_orders','supplier_id']]},
    location:{table:'purchase_locations',perm:'purchasing.location.manage',checks:[['purchase_request_items','location_id'],['purchase_order_items','location_id']]}
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
    SELECT r.id,r.number,r.request_date,r.needed_date,r.requester_name,r.status,r.notes,r.created_at,
           b.code AS branch_code,b.name AS branch_name,COUNT(i.id) AS item_count
    FROM purchase_requests r LEFT JOIN branches b ON b.id=r.branch_id
    LEFT JOIN purchase_request_items i ON i.request_id=r.id AND i.company_id=r.company_id
    WHERE r.company_id=? GROUP BY r.id ORDER BY r.request_date DESC,r.number DESC
  `).bind(companyId).all();
  return (res.results||[]).map(x=>({...x,item_count:Number(x.item_count||0)}));
}

async function getPurchaseRequest(env,companyId,id) {
  const req=await env.DB.prepare(`SELECT r.*,b.code AS branch_code,b.name AS branch_name,u.name AS created_by_name FROM purchase_requests r LEFT JOIN branches b ON b.id=r.branch_id LEFT JOIN users u ON u.id=r.created_by WHERE r.id=? AND r.company_id=?`).bind(id,companyId).first();
  if(!req)throw new HttpError(404,'Solicitação não encontrada.','NOT_FOUND');
  const items=await env.DB.prepare(`
    SELECT i.*,p.code AS product_code,p.description AS product_description,p.item_type,p.unit AS product_unit,
           cc.code AS cost_center_code,cc.name AS cost_center_name,l.code AS location_code,l.name AS location_name
    FROM purchase_request_items i JOIN purchase_products p ON p.id=i.product_id
    LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id LEFT JOIN purchase_locations l ON l.id=i.location_id
    WHERE i.company_id=? AND i.request_id=? ORDER BY i.line_no
  `).bind(companyId,id).all();
  return {...req,items:(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli),ordered_qty:milliToQty(x.ordered_qty_milli),received_qty:milliToQty(x.received_qty_milli)}))};
}

async function validatePurchaseRequestItems(env,companyId,items) {
  if(!Array.isArray(items)||!items.length)throw new HttpError(400,'Inclua pelo menos um item na solicitação.','VALIDATION_ERROR');
  const out=[]; let no=1;
  for(const raw of items){
    const product=await purchaseEntity(env,'purchase_products',required(raw.product_id,'produto'),companyId);
    if(!product.active)throw new HttpError(409,`Produto/serviço ${product.code} está inativo.`,'INACTIVE_PRODUCT');
    let cc=null,loc=null;
    if(raw.cost_center_id){ cc=await assertCompanyEntity(env,'cost_centers',raw.cost_center_id,companyId); if(!cc.active)throw new HttpError(409,'Centro de custo inativo.','INACTIVE_COST_CENTER'); }
    if(raw.location_id){ loc=await purchaseEntity(env,'purchase_locations',raw.location_id,companyId); if(!loc.active)throw new HttpError(409,'Local de estoque inativo.','INACTIVE_LOCATION'); }
    out.push({id:raw.id||uuid(),line_no:no++,product_id:product.id,description:cleanText(raw.description||product.description,500),quantity_milli:qtyToMilli(raw.quantity),unit:cleanText(raw.unit||product.purchase_unit||product.unit,20).toUpperCase(),cost_center_id:cc?.id||null,location_id:loc?.id||null,needed_date:raw.needed_date?isoDate(raw.needed_date,'data necessária do item'):null,notes:cleanText(raw.notes,1000)});
  }
  return out;
}

async function createPurchaseRequest(env,request,auth,companyId,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const branchId=body.branch_id||null; if(branchId)await assertCompanyEntity(env,'branches',branchId,companyId);
  const items=await validatePurchaseRequestItems(env,companyId,body.items);
  const id=uuid(),number=await nextPurchaseNumber(env,companyId,'purchase_requests','SC-');
  const requestDate=isoDate(body.request_date||new Date().toISOString().slice(0,10),'data da solicitação');
  const neededDate=body.needed_date?isoDate(body.needed_date,'data necessária'):null;
  const requester=cleanText(required(body.requester_name,'solicitante'),250),notes=cleanText(body.notes,2000);
  const stmts=[env.DB.prepare(`INSERT INTO purchase_requests (id,company_id,number,branch_id,request_date,needed_date,requester_name,notes,status,created_by) VALUES (?,?,?,?,?,?,?,?, 'OPEN',?)`).bind(id,companyId,number,branchId,requestDate,neededDate,requester,notes,auth.user.id)];
  for(const x of items)stmts.push(env.DB.prepare(`INSERT INTO purchase_request_items (id,company_id,request_id,line_no,product_id,description,quantity_milli,unit,cost_center_id,location_id,needed_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(x.id,companyId,id,x.line_no,x.product_id,x.description,x.quantity_milli,x.unit,x.cost_center_id,x.location_id,x.needed_date,x.notes));
  await env.DB.batch(stmts); const after=await getPurchaseRequest(env,companyId,id); await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_request',entityId:id,after:{number,status:'OPEN'},request}); return after;
}

async function updatePurchaseRequest(env,request,auth,companyId,id,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.request.manage');
  const before=await getPurchaseRequest(env,companyId,id); if(before.status!=='OPEN')throw new HttpError(409,'Somente solicitação aberta pode ser editada.','INVALID_STATUS');
  const branchId=body.branch_id||null; if(branchId)await assertCompanyEntity(env,'branches',branchId,companyId);
  const items=await validatePurchaseRequestItems(env,companyId,body.items);
  const requestDate=isoDate(body.request_date||before.request_date,'data da solicitação'),neededDate=body.needed_date?isoDate(body.needed_date,'data necessária'):null;
  const stmts=[
    env.DB.prepare(`DELETE FROM purchase_request_items WHERE company_id=? AND request_id=?`).bind(companyId,id),
    env.DB.prepare(`UPDATE purchase_requests SET branch_id=?,request_date=?,needed_date=?,requester_name=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(branchId,requestDate,neededDate,cleanText(required(body.requester_name,'solicitante'),250),cleanText(body.notes,2000),id,companyId)
  ];
  for(const x of items)stmts.push(env.DB.prepare(`INSERT INTO purchase_request_items (id,company_id,request_id,line_no,product_id,description,quantity_milli,unit,cost_center_id,location_id,needed_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(x.id,companyId,id,x.line_no,x.product_id,x.description,x.quantity_milli,x.unit,x.cost_center_id,x.location_id,x.needed_date,x.notes));
  await env.DB.batch(stmts); const after=await getPurchaseRequest(env,companyId,id); await audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'purchase_request',entityId:id,before:{number:before.number},after:{number:after.number},request}); return after;
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

async function generateOrdersFromQuotation(env,request,auth,companyId,id) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.order.manage');
  const q=await getQuotation(env,companyId,id); if(q.status!=='OPEN')throw new HttpError(409,'A cotação não está aberta para geração de ordem.','INVALID_STATUS');
  const selected=q.proposals.filter(x=>Number(x.selected)===1&&x.unit_price_cents!=null); const allItems=q.request.items;
  const selectedMap=new Map(selected.map(x=>[x.request_item_id,x])); const missing=allItems.filter(x=>!selectedMap.has(x.id)); if(missing.length)throw new HttpError(409,`Selecione o fornecedor vencedor de todos os ${allItems.length} itens antes de gerar as ordens.`,'MISSING_WINNERS');
  const supplierConfig=new Map(q.suppliers.map(x=>[x.supplier_id,x])),groups=new Map();
  for(const item of allItems){const p=selectedMap.get(item.id);if(!groups.has(p.supplier_id))groups.set(p.supplier_id,[]);groups.get(p.supplier_id).push({item,proposal:p});}
  const created=[];
  for(const [supplierId,rows] of groups){
    const oid=uuid(),number=await nextPurchaseNumber(env,companyId,'purchase_orders','OC-'),sc=supplierConfig.get(supplierId)||{};
    const stmts=[env.DB.prepare(`INSERT INTO purchase_orders (id,company_id,number,quotation_id,request_id,supplier_id,branch_id,order_date,expected_delivery,payment_terms,freight_cents,notes,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'OPEN',?)`).bind(oid,companyId,number,q.id,q.request_id,supplierId,q.branch_id,new Date().toISOString().slice(0,10),q.expected_delivery||null,sc.payment_terms||null,Number(sc.freight_cents||0),q.notes||null,auth.user.id)];
    for(const row of rows){const total=Math.round(Number(row.item.quantity_milli)*Number(row.proposal.unit_price_cents)/1000);stmts.push(env.DB.prepare(`INSERT INTO purchase_order_items (id,company_id,order_id,request_item_id,product_id,description,quantity_milli,unit,unit_price_cents,total_cents,cost_center_id,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),companyId,oid,row.item.id,row.item.product_id,row.item.description,row.item.quantity_milli,row.item.unit,row.proposal.unit_price_cents,total,row.item.cost_center_id,row.item.location_id));stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET ordered_qty_milli=ordered_qty_milli+? WHERE id=? AND company_id=?`).bind(row.item.quantity_milli,row.item.id,companyId));}
    await env.DB.batch(stmts); created.push({id:oid,number,supplier_id:supplierId});
  }
  await env.DB.batch([env.DB.prepare(`UPDATE purchase_quotations SET status='ORDERED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId),env.DB.prepare(`UPDATE purchase_requests SET status='ORDERED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(q.request_id,companyId)]);
  await audit(env,{companyId,userId:auth.user.id,action:'GENERATE_ORDERS',entity:'purchase_quotation',entityId:id,after:{orders:created.map(x=>x.number)},request}); return {orders:created};
}

async function listOrders(env,companyId) {
  const r=await env.DB.prepare(`SELECT o.id,o.number,o.order_date,o.expected_delivery,o.status,o.freight_cents,s.code AS supplier_code,s.name AS supplier_name,q.number AS quotation_number,r.number AS request_number,COUNT(i.id) AS item_count,COALESCE(SUM(i.total_cents),0)+o.freight_cents AS total_cents FROM purchase_orders o JOIN purchase_suppliers s ON s.id=o.supplier_id LEFT JOIN purchase_quotations q ON q.id=o.quotation_id LEFT JOIN purchase_requests r ON r.id=o.request_id LEFT JOIN purchase_order_items i ON i.order_id=o.id AND i.company_id=o.company_id WHERE o.company_id=? GROUP BY o.id ORDER BY o.order_date DESC,o.number DESC`).bind(companyId).all(); return (r.results||[]).map(x=>({...x,freight:centsToMoney(x.freight_cents),total:centsToMoney(x.total_cents),item_count:Number(x.item_count||0)}));
}

async function getOrder(env,companyId,id) {
  const o=await env.DB.prepare(`SELECT o.*,s.code AS supplier_code,s.name AS supplier_name,s.tax_id,s.email,s.phone,q.number AS quotation_number,r.number AS request_number,b.code AS branch_code,b.name AS branch_name,u.name AS created_by_name FROM purchase_orders o JOIN purchase_suppliers s ON s.id=o.supplier_id LEFT JOIN purchase_quotations q ON q.id=o.quotation_id LEFT JOIN purchase_requests r ON r.id=o.request_id LEFT JOIN branches b ON b.id=o.branch_id LEFT JOIN users u ON u.id=o.created_by WHERE o.id=? AND o.company_id=?`).bind(id,companyId).first(); if(!o)throw new HttpError(404,'Ordem de compra não encontrada.','NOT_FOUND');
  const items=await env.DB.prepare(`SELECT i.*,p.code AS product_code,p.item_type,cc.code AS cost_center_code,cc.name AS cost_center_name,l.code AS location_code,l.name AS location_name FROM purchase_order_items i JOIN purchase_products p ON p.id=i.product_id LEFT JOIN cost_centers cc ON cc.id=i.cost_center_id LEFT JOIN purchase_locations l ON l.id=i.location_id WHERE i.company_id=? AND i.order_id=? ORDER BY i.created_at`).bind(companyId,id).all();
  const arr=(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli),received_qty:milliToQty(x.received_qty_milli),remaining_qty:milliToQty(Math.max(0,x.quantity_milli-x.received_qty_milli)),unit_price:centsToMoney(x.unit_price_cents),total:centsToMoney(x.total_cents)})); return {...o,freight:centsToMoney(o.freight_cents),items:arr,total:centsToMoney(arr.reduce((s,x)=>s+x.total_cents,Number(o.freight_cents||0)))};
}

async function cancelOrder(env,request,auth,companyId,id) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.order.manage'); const o=await purchaseEntity(env,'purchase_orders',id,companyId); if(!['OPEN'].includes(o.status))throw new HttpError(409,'Somente ordem aberta e sem recebimento pode ser cancelada.','INVALID_STATUS');
  const receipt=await env.DB.prepare(`SELECT 1 FROM purchase_receipts WHERE company_id=? AND order_id=? LIMIT 1`).bind(companyId,id).first(); if(receipt)throw new HttpError(409,'A ordem já possui recebimento.','IN_USE');
  const items=await env.DB.prepare(`SELECT request_item_id,quantity_milli FROM purchase_order_items WHERE company_id=? AND order_id=?`).bind(companyId,id).all(); const stmts=[env.DB.prepare(`UPDATE purchase_orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId)]; for(const x of items.results||[])if(x.request_item_id)stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET ordered_qty_milli=MAX(0,ordered_qty_milli-?) WHERE id=? AND company_id=?`).bind(x.quantity_milli,x.request_item_id,companyId)); await env.DB.batch(stmts); await audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'purchase_order',entityId:id,request}); return getOrder(env,companyId,id);
}

async function listReceipts(env,companyId) {
  const r=await env.DB.prepare(`SELECT rec.id,rec.number,rec.receipt_date,rec.document_number,rec.created_at,o.number AS order_number,s.code AS supplier_code,s.name AS supplier_name,COUNT(ri.id) AS item_count FROM purchase_receipts rec JOIN purchase_orders o ON o.id=rec.order_id JOIN purchase_suppliers s ON s.id=o.supplier_id LEFT JOIN purchase_receipt_items ri ON ri.receipt_id=rec.id AND ri.company_id=rec.company_id WHERE rec.company_id=? GROUP BY rec.id ORDER BY rec.receipt_date DESC,rec.number DESC`).bind(companyId).all(); return (r.results||[]).map(x=>({...x,item_count:Number(x.item_count||0)}));
}

async function getReceipt(env,companyId,id) {
  const rec=await env.DB.prepare(`SELECT rec.*,o.number AS order_number,s.code AS supplier_code,s.name AS supplier_name,u.name AS created_by_name FROM purchase_receipts rec JOIN purchase_orders o ON o.id=rec.order_id JOIN purchase_suppliers s ON s.id=o.supplier_id LEFT JOIN users u ON u.id=rec.created_by WHERE rec.id=? AND rec.company_id=?`).bind(id,companyId).first(); if(!rec)throw new HttpError(404,'Recebimento não encontrado.','NOT_FOUND');
  const items=await env.DB.prepare(`SELECT ri.*,oi.description,oi.unit,p.code AS product_code,l.code AS location_code,l.name AS location_name FROM purchase_receipt_items ri JOIN purchase_order_items oi ON oi.id=ri.order_item_id JOIN purchase_products p ON p.id=oi.product_id LEFT JOIN purchase_locations l ON l.id=oi.location_id WHERE ri.company_id=? AND ri.receipt_id=?`).bind(companyId,id).all(); return {...rec,items:(items.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli)}))};
}

async function refreshRequestFulfillment(env,companyId,requestId) {
  if(!requestId)return;
  const x=await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN ordered_qty_milli>0 AND received_qty_milli>=ordered_qty_milli THEN 1 ELSE 0 END) AS done,SUM(received_qty_milli) AS received FROM purchase_request_items WHERE company_id=? AND request_id=?`).bind(companyId,requestId).first();
  const status=Number(x?.total||0)>0&&Number(x?.done||0)===Number(x?.total||0)?'FULFILLED':(Number(x?.received||0)>0?'PARTIAL':'ORDERED'); await env.DB.prepare(`UPDATE purchase_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status<>'CANCELLED'`).bind(status,requestId,companyId).run();
}

async function createReceipt(env,request,auth,companyId,body) {
  await requirePermission(env,auth.user.id,companyId,'purchasing.receipt.manage'); const order=await purchaseEntity(env,'purchase_orders',required(body.order_id,'ordem de compra'),companyId); if(!['OPEN','PARTIAL'].includes(order.status))throw new HttpError(409,'A ordem não está aberta para recebimento.','INVALID_STATUS');
  const orderDetails=await getOrder(env,companyId,order.id),map=new Map(orderDetails.items.map(x=>[x.id,x])); const rows=Array.isArray(body.items)?body.items:[]; if(!rows.length)throw new HttpError(400,'Informe ao menos um item recebido.','VALIDATION_ERROR');
  const valid=[]; for(const raw of rows){const oi=map.get(raw.order_item_id);if(!oi)continue;const q=qtyToMilli(raw.quantity,'quantidade recebida');const remaining=oi.quantity_milli-oi.received_qty_milli;if(q>remaining)throw new HttpError(409,`Quantidade recebida de ${oi.description} excede o saldo da ordem.`,'QUANTITY_EXCEEDED');valid.push({oi,q});} if(!valid.length)throw new HttpError(400,'Nenhuma quantidade de recebimento válida.','VALIDATION_ERROR');
  const rid=uuid(),number=await nextPurchaseNumber(env,companyId,'purchase_receipts','REC-'),date=isoDate(body.receipt_date||new Date().toISOString().slice(0,10),'data do recebimento'); const stmts=[env.DB.prepare(`INSERT INTO purchase_receipts (id,company_id,number,order_id,receipt_date,document_number,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`).bind(rid,companyId,number,order.id,date,cleanText(body.document_number,120),cleanText(body.notes,2000),auth.user.id)];
  for(const {oi,q} of valid){stmts.push(env.DB.prepare(`INSERT INTO purchase_receipt_items (id,company_id,receipt_id,order_item_id,quantity_milli) VALUES (?,?,?,?,?)`).bind(uuid(),companyId,rid,oi.id,q));stmts.push(env.DB.prepare(`UPDATE purchase_order_items SET received_qty_milli=received_qty_milli+? WHERE id=? AND company_id=?`).bind(q,oi.id,companyId));if(oi.request_item_id)stmts.push(env.DB.prepare(`UPDATE purchase_request_items SET received_qty_milli=received_qty_milli+? WHERE id=? AND company_id=?`).bind(q,oi.request_item_id,companyId));if(oi.item_type==='PRODUCT'&&oi.location_id){const bal=await env.DB.prepare(`SELECT id FROM stock_balances WHERE company_id=? AND product_id=? AND location_id=?`).bind(companyId,oi.product_id,oi.location_id).first();if(bal)stmts.push(env.DB.prepare(`UPDATE stock_balances SET quantity_milli=quantity_milli+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(q,bal.id));else stmts.push(env.DB.prepare(`INSERT INTO stock_balances (id,company_id,product_id,location_id,quantity_milli) VALUES (?,?,?,?,?)`).bind(uuid(),companyId,oi.product_id,oi.location_id,q));stmts.push(env.DB.prepare(`INSERT INTO stock_movements (id,company_id,product_id,location_id,movement_date,movement_type,quantity_milli,source_type,source_id) VALUES (?,?,?,?,?,'PURCHASE_RECEIPT',?,'PURCHASE_RECEIPT',?)`).bind(uuid(),companyId,oi.product_id,oi.location_id,date,q,rid));}}
  await env.DB.batch(stmts);
  const after=await getOrder(env,companyId,order.id),full=after.items.every(x=>x.received_qty_milli>=x.quantity_milli); await env.DB.prepare(`UPDATE purchase_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(full?'RECEIVED':'PARTIAL',order.id,companyId).run(); await refreshRequestFulfillment(env,companyId,order.request_id); await audit(env,{companyId,userId:auth.user.id,action:'RECEIVE',entity:'purchase_order',entityId:order.id,after:{receipt:number},request}); return getReceipt(env,companyId,rid);
}

async function listStockBalances(env,companyId) {
  const r=await env.DB.prepare(`SELECT sb.id,p.code AS product_code,p.description,p.unit,l.code AS location_code,l.name AS location_name,sb.quantity_milli,sb.updated_at FROM stock_balances sb JOIN purchase_products p ON p.id=sb.product_id JOIN purchase_locations l ON l.id=sb.location_id WHERE sb.company_id=? ORDER BY p.code,l.code`).bind(companyId).all(); return (r.results||[]).map(x=>({...x,quantity:milliToQty(x.quantity_milli)}));
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
  await ensurePurchasingSchema(env);

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


  // ---- Compras / Materiais ----
  if (method==="GET" && path==="/api/purchase-products") { await requirePermission(env,auth.user.id,companyId,"purchasing.product.read"); return ok({products:await listPurchaseMaster(env,companyId,"purchase_products","id,code,description,item_type,unit,purchase_unit,notes,active,created_at")}); }
  if (method==="POST" && path==="/api/purchase-products") return ok({product:await savePurchaseProduct(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-products/:id");
  if (p && method==="PATCH") return ok({product:await savePurchaseProduct(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePurchaseMaster(env,request,auth,companyId,"product",p.id));

  if (method==="GET" && path==="/api/purchase-suppliers") { await requirePermission(env,auth.user.id,companyId,"purchasing.supplier.read"); return ok({suppliers:await listPurchaseMaster(env,companyId,"purchase_suppliers","id,code,name,tax_id,email,phone,contact_name,notes,active,created_at")}); }
  if (method==="POST" && path==="/api/purchase-suppliers") return ok({supplier:await savePurchaseSupplier(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-suppliers/:id");
  if (p && method==="PATCH") return ok({supplier:await savePurchaseSupplier(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePurchaseMaster(env,request,auth,companyId,"supplier",p.id));

  if (method==="GET" && path==="/api/purchase-locations") { await requirePermission(env,auth.user.id,companyId,"purchasing.location.read"); return ok({locations:await listPurchaseMaster(env,companyId,"purchase_locations","id,code,name,active,created_at")}); }
  if (method==="POST" && path==="/api/purchase-locations") return ok({location:await savePurchaseLocation(env,request,auth,companyId,null,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-locations/:id");
  if (p && method==="PATCH") return ok({location:await savePurchaseLocation(env,request,auth,companyId,p.id,await readJson(request))});
  if (p && method==="DELETE") return ok(await deletePurchaseMaster(env,request,auth,companyId,"location",p.id));

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
  p=routeMatch(path,"/api/purchase-quotations/:id/generate-orders"); if(p&&method==="POST")return ok(await generateOrdersFromQuotation(env,request,auth,companyId,p.id));
  p=routeMatch(path,"/api/purchase-quotations/:id/cancel"); if(p&&method==="POST")return ok({quotation:await cancelQuotation(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/purchase-quotations/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.quotation.read");return ok({quotation:await getQuotation(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/purchase-orders"){await requirePermission(env,auth.user.id,companyId,"purchasing.order.read");return ok({orders:await listOrders(env,companyId)});}
  p=routeMatch(path,"/api/purchase-orders/:id/cancel"); if(p&&method==="POST")return ok({order:await cancelOrder(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/purchase-orders/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.order.read");return ok({order:await getOrder(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/purchase-receipts"){await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");return ok({receipts:await listReceipts(env,companyId)});}
  if(method==="POST"&&path==="/api/purchase-receipts")return ok({receipt:await createReceipt(env,request,auth,companyId,await readJson(request))},201);
  p=routeMatch(path,"/api/purchase-receipts/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");return ok({receipt:await getReceipt(env,companyId,p.id)});}

  if(method==="GET"&&path==="/api/stock-balances"){await requirePermission(env,auth.user.id,companyId,"purchasing.location.read");return ok({balances:await listStockBalances(env,companyId)});}

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

