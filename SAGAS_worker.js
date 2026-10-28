import { payrollFinance39 } from './sagas-payroll39.js';
import { payrollEmployer40 } from './sagas-payroll-employer40.js';
import { payrollEmployer120 } from './sagas-payroll-employer120.js';
import { payrollProvisions42 } from './sagas-payroll-provisions42.js';
import { payrollProvisions43, ensureProvisionLedger43 } from './sagas-payroll-provisions43.js';
import { payrollProvisionAccounting45 } from './sagas-payroll-provisions45.js';
import { payrollAdmission46, payrollAdmissionSchema46, payrollAdmissionRead46, payrollAdmissionHistory46, payrollAdmissionSalary46 } from './sagas-payroll-admission46.js';
import { payrollSalarySettings47, payrollSalarySchema47, payrollSalaryRead47, payrollSalaryHistory47, payrollSalaryAmount47 } from './sagas-payroll-salary47.js';
import { payrollAbsence48, payrollAbsenceSchema48, payrollAbsenceSnapshot48, payrollAbsenceAmounts48 } from './sagas-payroll-absence48.js';
import { payrollLeave49, payrollLeaveSchema49, payrollLeaveSnapshot49, payrollLeaveAmounts49 } from './sagas-payroll-leave49.js';
import { payrollVacation50, payrollVacationSchema50 } from './sagas-payroll-vacation50.js';
import { payrollVacation89, payrollVacationSchema89 } from './sagas-payroll-vacation51.js';
import { payrollVacation90 } from './sagas-payroll-vacation52.js';
import { payrollVacationIntegration53 } from './sagas-payroll-vacation53.js';
import { payrollVacation54, payrollVacationSchema54 } from './sagas-payroll-vacation54.js';
import { payrollVacation55, payrollVacationSchema55 } from './sagas-payroll-vacation55.js';
import { payrollVacation56 } from './sagas-payroll-vacation56.js';
import { payrollVacationEnvelope58, payrollVacationSchema58 } from './sagas-payroll-vacation58.js';
import { payrollVacationReview59 } from './sagas-payroll-vacation59.js';
import { payrollVacationBridge60 } from './sagas-payroll-vacation60.js';
import { payrollVacationStage61, payrollVacationBlockMonthly61 } from './sagas-payroll-vacation61.js';
import { payrollVacationMonthly100, payrollVacationMonthlySchema100 } from './sagas-payroll-vacation62.js';
import { payrollVacationClosure63 } from './sagas-payroll-vacation63.js';
import { payrollVacationAccounting64 } from './sagas-payroll-vacation64.js';
import { payrollVacationPosting65 } from './sagas-payroll-vacation65.js';
import { payrollVacation121 } from './sagas-payroll-vacation121.js';
import { payrollVacationAdvance66, payrollVacationAdvanceSchema66 } from './sagas-payroll-vacation66.js';
import { payrollVacationProvision67 } from './sagas-payroll-vacation67.js';
import { payrollVacationUseLink68, payrollVacationUseLinkSchema68 } from './sagas-payroll-vacation68.js';
import { payrollMonthlyEndToEnd69 } from './sagas-payroll-closing69.js';
import { payrollThirteenth70 } from './sagas-payroll-thirteenth70.js';
import { payrollThirteenth71 } from './sagas-payroll-thirteenth71.js';
import { payrollThirteenth111 } from './sagas-payroll-thirteenth111.js';
import { payrollThirteenth112 } from './sagas-payroll-thirteenth112.js';
import { payrollThirteenthAudit113 } from './sagas-payroll-thirteenth-audit113.js';
import { payrollTermination114 } from './sagas-payroll-termination114.js';
import { payrollTermination115 } from './sagas-payroll-termination115.js';
import { payrollTermination116 } from './sagas-payroll-termination116.js';
import { payrollTermination117 } from './sagas-payroll-termination117.js';
import { payrollTermination118 } from './sagas-payroll-termination118.js';
import { payrollTermination119 } from './sagas-payroll-termination119.js';
import { payrollTermination122 } from './sagas-payroll-termination122.js';
import { payrollTermination123 } from './sagas-payroll-termination123.js';
import { payrollLiveAudit124 } from './sagas-payroll-live-audit124.js';
import { payrollCompetenceReopen125 } from './sagas-payroll-reopen125.js';
import { payrollDesigner127 } from './sagas-payroll-designer127.js';
import { payrollProvisionAccounting44 } from './sagas-payroll-provisions44.js';
// SAGAS Worker v96 - Registro auditável do envelope próprio VACATION de férias | cumulativo desde v49
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
  const allowed = new Set(["accounts","cost_centers","history_templates","branches","accounting_periods","journal_batches","budget_natures"]);
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
  return ensureSchemaRevision(env, 'accounting_period', 1, () => migrateEnsureAccountingPeriodSchema(env));
}

async function migrateEnsureAccountingPeriodSchema(env) {
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
  return ensureSchemaRevision(env, 'batch_integration', 1, () => migrateEnsureBatchIntegrationSchema(env));
}

async function migrateEnsureBatchIntegrationSchema(env) {
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
  return ensureSchemaRevision(env, `legacy_drafts:${companyId}`, 1,
    () => migrateLegacyDraftEntriesOnce(env, companyId));
}

async function migrateLegacyDraftEntriesOnce(env, companyId) {
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
  return ensureSchemaRevision(env, 'entry_maintenance', 1, () => migrateEnsureEntryMaintenanceSchema(env));
}

async function migrateEnsureEntryMaintenanceSchema(env) {
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
  // A provisão contabilizada possui vínculos de origem indivisíveis:
  // alterá-la isoladamente invalidaria saldos e conciliações de férias.
  const provision45Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_provision_postings45' LIMIT 1").first();
  if(provision45Table){
    const provision45Link=await env.DB.prepare("SELECT id FROM payroll_provision_postings45 WHERE company_id=? AND journal_entry_id=? LIMIT 1").bind(companyId,id).first();
    if(provision45Link)throw new HttpError(409,'Este lançamento está vinculado à contabilização de provisões. Utilize um procedimento contábil de reversão controlada.','PROVISION_POSTING_JOURNAL_LINKED');
  }

  const vac66Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_vacation_advance_payments66' LIMIT 1").first();
  if(vac66Table){
    const vac66Link=await env.DB.prepare("SELECT id FROM payroll_vacation_advance_payments66 WHERE company_id=? AND journal_entry_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,id).first();
    if(vac66Link)throw new HttpError(409,'A partida está vinculada ao pagamento de férias. Desvincule antes de editar.','VACATION_ADVANCE_JOURNAL_LINKED');
  }

  const before=await entrySnapshot(env,companyId,id);
  if(before.source_module==="PAYROLL"&&String(before.source_reference||"").startsWith("MONTHLY:"))
    throw new HttpError(409,"Lancamento integrado pela folha nao pode ser alterado isoladamente.","PAYROLL_LINK_LOCKED");
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
  // A provisão contabilizada possui vínculos de origem indivisíveis:
  // alterá-la isoladamente invalidaria saldos e conciliações de férias.
  const provision45Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_provision_postings45' LIMIT 1").first();
  if(provision45Table){
    const provision45Link=await env.DB.prepare("SELECT id FROM payroll_provision_postings45 WHERE company_id=? AND journal_entry_id=? LIMIT 1").bind(companyId,id).first();
    if(provision45Link)throw new HttpError(409,'Este lançamento está vinculado à contabilização de provisões. Utilize um procedimento contábil de reversão controlada.','PROVISION_POSTING_JOURNAL_LINKED');
  }

  // v104: lançamento que comprova adiantamento de férias exige
  // desvinculação formal antes de exclusão/estorno.
  const v104Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_vacation_advance_payments66' LIMIT 1").first();
  if(v104Table){
    const v104Link=await env.DB.prepare("SELECT id FROM payroll_vacation_advance_payments66 WHERE company_id=? AND journal_entry_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,id).first();
    if(v104Link)throw new HttpError(409,'Lançamento de adiantamento de férias vinculado. Desvincule primeiro no módulo de férias.','VACATION_ADVANCE_JOURNAL_LINKED');
  }


  const before=await entrySnapshot(env,companyId,id);
  if(before.source_module==="PAYROLL"&&String(before.source_reference||"").startsWith("MONTHLY:"))
    throw new HttpError(409,"Lancamento integrado pela folha nao pode ser excluido isoladamente.","PAYROLL_LINK_LOCKED");

  // Exclusão é diferente de edição/anulação:
  // permite remover tanto lançamento contabilizado quanto já anulado,
  // desde que ainda esteja no lote de origem, o lote esteja aberto
  // e o período contábil permita manutenção.
  await ensureBatchIntegrationSchema(env);
  await ensureAccountingPeriodSchema(env);

  if (!["POSTED","VOID"].includes(before.status)) {
    throw new HttpError(
      409,
      "Somente lançamento contabilizado ou anulado pode ser excluído.",
      "INVALID_STATUS"
    );
  }

  if (before.official_status==="INTEGRATED") {
    throw new HttpError(
      409,
      "Este lançamento está no Lote 0. Desfaça a integração antes de excluí-lo.",
      "ENTRY_IN_OFFICIAL_BATCH"
    );
  }

  const batch=await assertCompanyEntity(env,"journal_batches",before.batch_id,companyId);
  if (batch.status!=="OPEN") {
    throw new HttpError(
      409,
      `O lote ${batch.code} não está aberto. Desbloqueie o lote antes de excluí-lo.`,
      "BATCH_CLOSED"
    );
  }

  const period=await assertCompanyEntity(env,"accounting_periods",batch.period_id,companyId);
  assertDateOpenInPeriod(period,before.entry_date);

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
  return ensureSchemaRevision(env, 'view_filter', 1, () => migrateEnsureViewFilterSchema(env));
}

async function migrateEnsureViewFilterSchema(env) {
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
  // A provisão contabilizada possui vínculos de origem indivisíveis:
  // alterá-la isoladamente invalidaria saldos e conciliações de férias.
  const provision45Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_provision_postings45' LIMIT 1").first();
  if(provision45Table){
    const provision45Link=await env.DB.prepare("SELECT id FROM payroll_provision_postings45 WHERE company_id=? AND journal_entry_id=? LIMIT 1").bind(companyId,id).first();
    if(provision45Link)throw new HttpError(409,'Este lançamento está vinculado à contabilização de provisões. Utilize um procedimento contábil de reversão controlada.','PROVISION_POSTING_JOURNAL_LINKED');
  }

  // v104: lançamento que comprova adiantamento de férias exige
  // desvinculação formal antes de exclusão/estorno.
  const v104Table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_vacation_advance_payments66' LIMIT 1").first();
  if(v104Table){
    const v104Link=await env.DB.prepare("SELECT id FROM payroll_vacation_advance_payments66 WHERE company_id=? AND journal_entry_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,id).first();
    if(v104Link)throw new HttpError(409,'Lançamento de adiantamento de férias vinculado. Desvincule primeiro no módulo de férias.','VACATION_ADVANCE_JOURNAL_LINKED');
  }

  const before=await env.DB.prepare("SELECT * FROM journal_entries WHERE id=? AND company_id=?").bind(id,companyId).first();
  if (!before) throw new HttpError(404,"Lançamento não encontrado.","NOT_FOUND");
  if(before.source_module==="PAYROLL"&&String(before.source_reference||"").startsWith("MONTHLY:"))
    throw new HttpError(409,"Lancamento integrado pela folha nao pode ser anulado isoladamente.","PAYROLL_LINK_LOCKED");
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


  // v31: lançamento direto de Nota Fiscal de fornecedor, sem Solicitação/Cotação/Ordem.
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      number TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      branch_id TEXT,
      movement_type_id TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      document_number TEXT,
      series TEXT,
      due_date TEXT,
      freight_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      accounting_event_id TEXT,
      accounting_batch_id TEXT,
      generate_financial INTEGER NOT NULL DEFAULT 0,
      stock_effect TEXT NOT NULL DEFAULT 'NONE',
      financial_payable_id TEXT,
      journal_entry_id TEXT,
      status TEXT NOT NULL DEFAULT 'POSTED',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,number)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      description TEXT NOT NULL,
      item_type TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL,
      unit TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      budget_nature_id TEXT,
      cost_center_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(invoice_id,line_no)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_invoice_company_date ON purchase_invoices(company_id,entry_date,number)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(company_id,invoice_id,line_no)`)
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
    if(ccId){ cc=await validateCostCenterForEntry(env,companyId,ccId); if(!cc.active)throw new HttpError(409,'Centro de custo inativo.','INACTIVE_COST_CENTER'); }

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


// v36: parcelas independentes do fluxo antigo de ordens / cotações.
async function ensurePurchaseInvoiceInstallmentsSchema(env){
  await ensureSchemaRevision(env,'purchase_invoice_installments',1,async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_invoice_installments (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
        installment_no INTEGER NOT NULL, due_date TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, payable_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(invoice_id,installment_no)
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_invoice_installments_invoice ON purchase_invoice_installments(company_id,invoice_id,installment_no)`)
    ]);
  });
}

function validateInvoiceInstallments(body,totalCents,defaultDate){
  const input=Array.isArray(body.installments)?body.installments:null;
  const count=input?input.length:1;
  if(count<1||count>60)throw new HttpError(400,'Informe de 1 a 60 parcelas.','VALIDATION_ERROR');
  const result=(input||[{due_date:body.due_date||defaultDate,amount:centsToMoney(totalCents)}]).map((x,i)=>{
    const due=isoDate(x.due_date||'','vencimento da parcela '+(i+1));
    const amount=moneyToCents(x.amount);
    if(amount<=0)throw new HttpError(400,'O valor da parcela '+(i+1)+' deve ser maior que zero.','VALIDATION_ERROR');
    return {no:i+1,due_date:due,amount_cents:amount};
  });
  const sum=result.reduce((n,x)=>n+x.amount_cents,0);
  if(sum!==totalCents)throw new HttpError(400,'A soma das parcelas deve ser igual ao valor total da Nota Fiscal.','INSTALLMENT_TOTAL_MISMATCH');
  return result;
}

async function invoicePayables(env,companyId,invoiceId){
  const r=await env.DB.prepare(`SELECT * FROM financial_payables
    WHERE company_id=? AND source_type='PURCHASE_INVOICE'
      AND (source_id=? OR source_id LIKE ?)
    ORDER BY due_date,number`).bind(companyId,invoiceId,invoiceId+':%').all();
  return r.results||[];
}

async function listPurchaseInvoices(env,companyId){
  const r=await env.DB.prepare(`
    SELECT i.id,i.number,i.issue_date,i.entry_date,i.document_number,i.series,i.total_cents,i.status,
           i.generate_financial,i.stock_effect,i.financial_payable_id,i.journal_entry_id,
           (SELECT COUNT(*) FROM purchase_invoice_installments pi WHERE pi.company_id=i.company_id AND pi.invoice_id=i.id) AS installment_count,
           s.code AS supplier_code,s.name AS supplier_name,
           mt.code AS movement_type_code,mt.name AS movement_type_name,
           COUNT(ii.id) AS item_count
    FROM purchase_invoices i
    JOIN purchase_suppliers s ON s.id=i.supplier_id
    JOIN movement_types mt ON mt.id=i.movement_type_id
    LEFT JOIN purchase_invoice_items ii ON ii.invoice_id=i.id AND ii.company_id=i.company_id
    WHERE i.company_id=?
    GROUP BY i.id
    ORDER BY i.entry_date DESC,i.number DESC
  `).bind(companyId).all();
  return (r.results||[]).map(x=>({
    ...x,
    total:centsToMoney(x.total_cents),
    item_count:Number(x.item_count||0)
  }));
}

async function getPurchaseInvoice(env,companyId,id){
  const inv=await env.DB.prepare(`
    SELECT i.*,s.code AS supplier_code,s.name AS supplier_name,s.tax_id,
           b.code AS branch_code,b.name AS branch_name,
           mt.code AS movement_type_code,mt.name AS movement_type_name,
           ev.code AS accounting_event_code,ev.name AS accounting_event_name,
           jb.code AS accounting_batch_code,jb.description AS accounting_batch_description,
           fp.number AS payable_number,fp.status AS payable_status,fp.balance_cents AS payable_balance_cents,
           je.status AS journal_status
    FROM purchase_invoices i
    JOIN purchase_suppliers s ON s.id=i.supplier_id
    LEFT JOIN branches b ON b.id=i.branch_id
    JOIN movement_types mt ON mt.id=i.movement_type_id
    LEFT JOIN movement_accounting_events ev ON ev.id=i.accounting_event_id
    LEFT JOIN journal_batches jb ON jb.id=i.accounting_batch_id
    LEFT JOIN financial_payables fp ON fp.id=i.financial_payable_id
    LEFT JOIN journal_entries je ON je.id=i.journal_entry_id
    WHERE i.id=? AND i.company_id=?
  `).bind(id,companyId).first();
  if(!inv)throw new HttpError(404,'Nota Fiscal não encontrada.','NOT_FOUND');
  const r=await env.DB.prepare(`
    SELECT ii.*,p.code AS product_code,
           n.code AS nature_code,n.description AS nature_description,
           cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM purchase_invoice_items ii
    JOIN purchase_products p ON p.id=ii.product_id
    LEFT JOIN budget_natures n ON n.id=ii.budget_nature_id
    LEFT JOIN cost_centers cc ON cc.id=ii.cost_center_id
    WHERE ii.company_id=? AND ii.invoice_id=?
    ORDER BY ii.line_no
  `).bind(companyId,id).all();
  const ir=await env.DB.prepare(`SELECT pi.*,fp.number AS payable_number,fp.status AS payable_status
     FROM purchase_invoice_installments pi
     LEFT JOIN financial_payables fp ON fp.id=pi.payable_id AND fp.company_id=pi.company_id
     WHERE pi.company_id=? AND pi.invoice_id=? ORDER BY pi.installment_no`).bind(companyId,id).all();
  const installments=(ir.results||[]).map(x=>({...x,amount:centsToMoney(x.amount_cents)}));
  if(!installments.length){
    const legacy=await invoicePayables(env,companyId,id);
    if(legacy.length)legacy.forEach((x,i)=>installments.push({installment_no:i+1,due_date:x.due_date,amount:centsToMoney(x.amount_cents),payable_id:x.id,payable_number:x.number,payable_status:x.status}));
    else installments.push({installment_no:1,due_date:inv.due_date,amount:centsToMoney(inv.total_cents),payable_id:null});
  }
  return {
    ...inv,
    installments,
    total:centsToMoney(inv.total_cents),
    freight:centsToMoney(inv.freight_cents),
    payable_balance:inv.payable_balance_cents==null?null:centsToMoney(inv.payable_balance_cents),
    items:(r.results||[]).map(x=>({
      ...x,
      quantity:milliToQty(x.quantity_milli),
      unit_price:centsToMoney(x.unit_price_cents),
      total:centsToMoney(x.total_cents)
    }))
  };
}

async function createPurchaseInvoice(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'purchasing.receipt.manage');

  const supplier=await purchaseEntity(env,'purchase_suppliers',required(body.supplier_id,'fornecedor'),companyId);
  if(!supplier.active)throw new HttpError(409,'O fornecedor selecionado está inativo.','INACTIVE_SUPPLIER');

  const movementType=await getMovementType(env,companyId,required(body.movement_type_id,'Tipo de Movimento'));
  if(!movementType.active)throw new HttpError(409,'O Tipo de Movimento está inativo.','INACTIVE_MOVEMENT_TYPE');

  const branchId=cleanText(body.branch_id,80)||null;
  if(branchId)await assertCompanyEntity(env,'branches',branchId,companyId);

  const issueDate=isoDate(body.issue_date||new Date().toISOString().slice(0,10),'data de emissão');
  const entryDate=isoDate(body.entry_date||issueDate,'data de entrada');
  const doc=cleanText(body.document_number,120);
  const series=cleanText(body.series,40);

  if(doc){
    const dup=await env.DB.prepare(`
      SELECT id FROM purchase_invoices
      WHERE company_id=? AND supplier_id=? AND COALESCE(document_number,'')=? AND COALESCE(series,'')=?
      LIMIT 1
    `).bind(companyId,supplier.id,doc,series||'').first();
    if(dup)throw new HttpError(409,'Já existe uma Nota Fiscal deste fornecedor com o mesmo número e série.','DUPLICATE_INVOICE');
  }

  const rawItems=Array.isArray(body.items)?body.items:[];
  if(!rawItems.length)throw new HttpError(400,'Informe ao menos um item da Nota Fiscal.','VALIDATION_ERROR');

  const valid=[];
  let itemsSubtotal=0,lineNo=1;
  for(const raw of rawItems){
    const product=await purchaseEntity(env,'purchase_products',required(raw.product_id,'produto/serviço'),companyId);
    if(!product.active)throw new HttpError(409,`O item ${product.code} está inativo.`,'INACTIVE_PRODUCT');

    const q=qtyToMilli(raw.quantity,'quantidade');
    const unitPrice=moneyToCents(raw.unit_price);
    if(unitPrice<0)throw new HttpError(400,'Valor unitário inválido.','VALIDATION_ERROR');

    let natureId=cleanText(raw.budget_nature_id,80)||null;
    if(movementType.fetch_product_nature && !natureId)natureId=product.budget_nature_id||null;
    if(natureId){
      const nature=await assertCompanyEntity(env,'budget_natures',natureId,companyId);
      if(!nature.active)throw new HttpError(409,`A Natureza do item ${product.code} está inativa.`,'INACTIVE_NATURE');
    }

    const costCenterId=cleanText(raw.cost_center_id,80)||movementType.default_cost_center_id||null;
    if(costCenterId)await validateCostCenterForEntry(env,companyId,costCenterId);

    const total=Math.round(Number(unitPrice)*Number(q)/1000);
    itemsSubtotal+=total;

    valid.push({
      q,
      oi:{
        id:uuid(),
        line_no:lineNo++,
        product_id:product.id,
        product_code:product.code,
        description:product.description,
        item_type:product.item_type,
        unit:cleanText(raw.unit,20)||product.purchase_unit||product.unit||'UN',
        unit_price_cents:unitPrice,
        total_cents:total,
        budget_nature_id:natureId,
        cost_center_id:costCenterId
      }
    });
  }

  const freightCents=moneyToCents(body.freight||0);
  if(freightCents<0)throw new HttpError(400,'Valor de frete inválido.','VALIDATION_ERROR');
  const totalCents=itemsSubtotal+freightCents;
  if(totalCents<=0)throw new HttpError(409,'A Nota Fiscal não possui valor.','INVALID_AMOUNT');

  let eventId=movementType.accounting_event_id||null;
  if(movementType.allow_edit_accounting_event && body.accounting_event_id!==undefined){
    eventId=cleanText(body.accounting_event_id,80)||null;
  }
  if(eventId){
    const ev=await getMovementAccountingEvent(env,companyId,eventId);
    if(!ev.active)throw new HttpError(409,'O Evento Contábil selecionado está inativo.','INACTIVE_ACCOUNTING_EVENT');
  }
  if(movementType.require_accounting_event&&!eventId){
    throw new HttpError(409,'O Tipo de Movimento exige Evento Contábil.','ACCOUNTING_EVENT_REQUIRED');
  }

  const batchId=eventId?(cleanText(body.accounting_batch_id,80)||null):null;
  if(eventId&&!batchId)throw new HttpError(409,'Informe o lote contábil da Nota Fiscal.','ACCOUNTING_BATCH_REQUIRED');

  let batch=null;
  if(batchId){
    batch=await assertCompanyEntity(env,'journal_batches',batchId,companyId);
    if(batch.status!=='OPEN')throw new HttpError(409,'O lote contábil precisa estar aberto.','BATCH_LOCKED');
  }

  const id=uuid();
  const number=await nextPurchaseNumber(env,companyId,'purchase_invoices','NF-');
  const installments=validateInvoiceInstallments(body,totalCents,issueDate);
  const finalDue=installments[0].due_date;
  const stmts=[];
  let payableMeta=null,journalMeta=null;

  // Cada parcela é um título financeiro próprio, inclusive com vencimento editável.
  // Primeiro título preserva source_id=id para compatibilidade com notas antigas.
  let payableNumberBase='';
  if(movementType.generate_financial)payableNumberBase=await nextPayableNumber(env,companyId);
  const matchNo=payableNumberBase.match(/^(.*?)(\d+)$/);
  if(movementType.generate_financial&&!matchNo)throw new HttpError(409,'Não foi possível gerar a sequência do Contas a Pagar.','FINANCE_SEQUENCE_ERROR');
  for(const part of installments){
    const payableId=movementType.generate_financial?uuid():null;
    if(payableId){
      const payableNumber=matchNo[1]+String(Number(matchNo[2])+part.no-1).padStart(matchNo[2].length,'0');
      const sourceId=part.no===1?id:`${id}:${part.no}`;
      stmts.push(env.DB.prepare(`
        INSERT INTO financial_payables
        (id,company_id,number,supplier_id,source_type,source_id,receipt_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by)
        VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?,?,'OPEN',?)
      `).bind(payableId,companyId,payableNumber,supplier.id,'PURCHASE_INVOICE',sourceId,
        issueDate,part.due_date,doc,`Nota Fiscal ${doc||number} - Parcela ${part.no}/${installments.length} - ${supplier.name}`,
        part.amount_cents,part.amount_cents,auth.user.id));
      if(part.no===1)payableMeta={id:payableId,number:payableNumber};
    }
    stmts.push(env.DB.prepare(`INSERT INTO purchase_invoice_installments
      (id,company_id,invoice_id,installment_no,due_date,amount_cents,payable_id)
      VALUES (?,?,?,?,?,?,?)`).bind(uuid(),companyId,id,part.no,part.due_date,part.amount_cents,payableId));
  }

  if(eventId){
    const lines=await buildRmAccountingLines(env,companyId,{
      eventId,
      receiptItems:valid,
      itemsSubtotal,
      freightCents,
      totalCents,
      branchId,
      documentNumber:doc||number,
      supplierName:supplier.name
    });
    const built=await buildInternalPostedEntry(env,auth,companyId,{
      batch_id:batchId,
      branch_id:branchId,
      entry_date:entryDate,
      document_number:doc||number,
      description:`Nota Fiscal ${doc||number} - ${supplier.name}`,
      source_module:'PURCHASES',
      source_reference:`INVOICE:${id}`,
      lines
    });
    stmts.push(...built.stmts);
    journalMeta={id:built.entryId};
  }

  stmts.unshift(env.DB.prepare(`
    INSERT INTO purchase_invoices
      (id,company_id,number,supplier_id,branch_id,movement_type_id,issue_date,entry_date,document_number,series,due_date,
       freight_cents,total_cents,notes,accounting_event_id,accounting_batch_id,generate_financial,stock_effect,
       financial_payable_id,journal_entry_id,status,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'POSTED',?)
  `).bind(
    id,companyId,number,supplier.id,branchId,movementType.id,issueDate,entryDate,doc,series,finalDue,
    freightCents,totalCents,cleanText(body.notes,2000),eventId,batchId,movementType.generate_financial?1:0,movementType.stock_effect,
    payableMeta?.id||null,journalMeta?.id||null,auth.user.id
  ));

  for(const {oi,q} of valid){
    stmts.push(env.DB.prepare(`
      INSERT INTO purchase_invoice_items
        (id,company_id,invoice_id,line_no,product_id,description,item_type,quantity_milli,unit,unit_price_cents,total_cents,budget_nature_id,cost_center_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      oi.id,companyId,id,oi.line_no,oi.product_id,oi.description,oi.item_type,q,oi.unit,
      oi.unit_price_cents,oi.total_cents,oi.budget_nature_id,oi.cost_center_id
    ));

    if(oi.item_type==='PRODUCT'&&movementType.stock_effect!=='NONE'){
      const sign=movementType.stock_effect==='OUT'?-1:1;
      const delta=q*sign;
      const bal=await env.DB.prepare(`SELECT id,quantity_milli FROM product_stock_balances WHERE company_id=? AND product_id=?`).bind(companyId,oi.product_id).first();
      if(sign<0&&Number(bal?.quantity_milli||0)<q){
        throw new HttpError(409,`Saldo insuficiente para movimentar ${oi.description}.`,'INSUFFICIENT_STOCK');
      }
      if(bal)stmts.push(env.DB.prepare(`UPDATE product_stock_balances SET quantity_milli=quantity_milli+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(delta,bal.id));
      else if(sign>0)stmts.push(env.DB.prepare(`INSERT INTO product_stock_balances (id,company_id,product_id,quantity_milli) VALUES (?,?,?,?)`).bind(uuid(),companyId,oi.product_id,q));
      stmts.push(env.DB.prepare(`
        INSERT INTO product_stock_movements
          (id,company_id,product_id,movement_date,movement_type,quantity_milli,source_type,source_id)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(uuid(),companyId,oi.product_id,entryDate,movementType.code,delta,'PURCHASE_INVOICE',id));
    }
  }

  await env.DB.batch(stmts);

  if(payableMeta)await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'financial_payable',entityId:payableMeta.id,after:{source:'PURCHASE_INVOICE',invoice:number},request});
  if(journalMeta)await audit(env,{companyId,userId:auth.user.id,action:'CREATE_POSTED',entity:'journal_entry',entityId:journalMeta.id,after:{source:'PURCHASE_INVOICE',invoice:number},request});
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'purchase_invoice',entityId:id,after:{number,document_number:doc,total:centsToMoney(totalCents)},request});

  return getPurchaseInvoice(env,companyId,id);
}

async function deletePurchaseInvoice(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'purchasing.receipt.manage');
  const invoice=await getPurchaseInvoice(env,companyId,id);
  const payables=await invoicePayables(env,companyId,id);
  for(const payable of payables){
    if(payable.status!=='OPEN'||Number(payable.balance_cents)!==Number(payable.amount_cents)||payable.payment_date||payable.paid_at){
      throw new HttpError(409,`A parcela ${payable.number} já possui baixa ou movimentação financeira. Desfaça a baixa antes de excluir a Nota Fiscal.`,'INVOICE_HAS_PAYMENTS');
    }
    if(payable.payment_journal_entry_id){
      throw new HttpError(409,`A parcela ${payable.number} ainda está vinculada à contabilização de uma baixa.`,'INVOICE_PAYMENT_ACCOUNTING_LINK');
    }
  }

  const entryIds=new Set();
  if(invoice.journal_entry_id)entryIds.add(invoice.journal_entry_id);
  const found=await env.DB.prepare(`SELECT id FROM journal_entries
    WHERE company_id=? AND source_module='PURCHASES' AND source_reference=?`).bind(companyId,`INVOICE:${id}`).all();
  for(const x of found.results||[])entryIds.add(x.id);
  await ensureBatchIntegrationSchema(env);
  await ensureAccountingPeriodSchema(env);
  for(const entryId of entryIds){
    const entry=await env.DB.prepare(`SELECT * FROM journal_entries WHERE id=? AND company_id=?`).bind(entryId,companyId).first();
    if(!entry)continue;
    if(entry.official_status==='INTEGRATED')throw new HttpError(409,'A Nota Fiscal possui contabilização no Lote 0. Desfaça a integração antes de excluir.','INVOICE_OFFICIAL_ACCOUNTING');
    if(!['POSTED','VOID'].includes(entry.status))throw new HttpError(409,'A contabilização da Nota Fiscal não está em situação que permita exclusão.','INVOICE_ACCOUNTING_LOCKED');
    const batch=await assertCompanyEntity(env,'journal_batches',entry.batch_id,companyId);
    if(batch.status!=='OPEN')throw new HttpError(409,'Abra o lote contábil antes de excluir a Nota Fiscal.','INVOICE_BATCH_CLOSED');
    const period=await assertCompanyEntity(env,'accounting_periods',batch.period_id,companyId);
    assertDateOpenInPeriod(period,entry.entry_date);
  }

  const stock=await env.DB.prepare(`SELECT product_id,SUM(quantity_milli) AS delta
    FROM product_stock_movements WHERE company_id=? AND source_type='PURCHASE_INVOICE' AND source_id=?
    GROUP BY product_id`).bind(companyId,id).all();
  const stockUpdates=[];
  for(const m of stock.results||[]){
    const bal=await env.DB.prepare(`SELECT id,quantity_milli FROM product_stock_balances
      WHERE company_id=? AND product_id=?`).bind(companyId,m.product_id).first();
    const next=Number(bal?.quantity_milli||0)-Number(m.delta||0);
    if(next<0)throw new HttpError(409,'Não é possível excluir: parte do estoque da nota já foi consumida. Regularize o saldo antes.','INVOICE_STOCK_CONSUMED');
    if(!bal&&Number(m.delta||0))throw new HttpError(409,'Saldo de estoque da Nota Fiscal não encontrado.','INVOICE_STOCK_MISSING');
    if(bal)stockUpdates.push(env.DB.prepare(`UPDATE product_stock_balances SET quantity_milli=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(next,bal.id,companyId));
  }

  const stmts=[...stockUpdates];
  stmts.push(env.DB.prepare(`DELETE FROM product_stock_movements WHERE company_id=? AND source_type='PURCHASE_INVOICE' AND source_id=?`).bind(companyId,id));
  for(const entryId of entryIds){
    stmts.push(env.DB.prepare(`DELETE FROM allocation_lines WHERE company_id=? AND journal_line_id IN
      (SELECT id FROM journal_lines WHERE company_id=? AND entry_id=?)`).bind(companyId,companyId,entryId));
    stmts.push(env.DB.prepare(`DELETE FROM journal_lines WHERE company_id=? AND entry_id=?`).bind(companyId,entryId));
    stmts.push(env.DB.prepare(`DELETE FROM journal_entries WHERE company_id=? AND id=?`).bind(companyId,entryId));
  }
  stmts.push(env.DB.prepare(`DELETE FROM purchase_invoice_installments WHERE company_id=? AND invoice_id=?`).bind(companyId,id));
  stmts.push(env.DB.prepare(`DELETE FROM financial_payables WHERE company_id=? AND source_type='PURCHASE_INVOICE' AND (source_id=? OR source_id LIKE ?)`)
    .bind(companyId,id,id+':%'));
  stmts.push(env.DB.prepare(`DELETE FROM purchase_invoice_items WHERE company_id=? AND invoice_id=?`).bind(companyId,id));
  stmts.push(env.DB.prepare(`DELETE FROM purchase_invoices WHERE company_id=? AND id=?`).bind(companyId,id));
  await env.DB.batch(stmts);
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'purchase_invoice',entityId:id,
    before:{number:invoice.number,document_number:invoice.document_number,total:invoice.total,
      payables:payables.map(x=>x.number),journal_entries:[...entryIds]},request});
  return {deleted:true,id};
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
    const cc=await validateCostCenterForEntry(env,companyId,defaultCc);
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
  // Um conjunto de regras vale para um lado (D/C) em um centro de custo específico.
  const groups=new Map();
  for(const x of rows){
    const key=x.side+'|'+(x.cost_center_id||'*');
    groups.set(key,(groups.get(key)||0)+Number(x.percentage||0));
  }
  for(const [key,total] of groups){
    if(Math.abs(total-100)>0.0001)
      throw new HttpError(400,label+': os percentuais do grupo '+key+' devem totalizar 100%.','INVALID_PERCENTAGE');
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
    if(raw.cost_center_id) await validateCostCenterForEntry(env,companyId,raw.cost_center_id);
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
    if(raw.cost_center_id) await validateCostCenterForEntry(env,companyId,raw.cost_center_id);
    if(raw.history_template_id) await assertCompanyEntity(env,'history_templates',raw.history_template_id,companyId);
    items.push({
      line_no:no++,side,incidence,account_origin:origin,account_id:accountId,percentage:pct,
      branch_id:raw.branch_id||null,cost_center_id:raw.cost_center_id||null,
      history_template_id:raw.history_template_id||null,history_complement:cleanText(raw.history_complement,1000),
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
          const itemCc=rule.cost_center_id||x.oi.cost_center_id||null;
          const exact=itemCc?defaults.filter(v=>v.cost_center_id===itemCc):[];
          const applicable=exact.length?exact:defaults.filter(v=>!v.cost_center_id);
          if(!applicable.length) throw new HttpError(409,`A Natureza do item ${x.oi.description} não possui default de ${rule.side==='D'?'débito':'crédito'} para o centro de custo informado.`,'NATURE_DEFAULT_NOT_CONFIGURED');
          const pctTotal=applicable.reduce((n,v)=>n+Number(v.percentage||0),0);
          if(Math.abs(pctTotal-100)>0.0001) throw new HttpError(409,'Percentuais dos defaults da natureza não conciliam para o centro de custo.','INVALID_PERCENTAGE');
          let allocated=0;
          for(let di=0;di<applicable.length;di++){
            const d=applicable[di];
            const amount=di===applicable.length-1?ruleAmount-allocated:centsPercent(ruleAmount,Number(d.percentage||100));
            allocated+=amount;
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

async function listFinancialPayables(env,companyId,allowPayroll=false){
  const r=await env.DB.prepare(`
    SELECT fp.*,CASE WHEN fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION') THEN COALESCE(printf('%05d',pen.number),'FOLHA') ELSE s.code END AS supplier_code,
           CASE WHEN fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION') THEN pe.name ELSE s.name END AS supplier_name,
           rec.number AS receipt_number,o.number AS order_number,
           fca.code AS payment_cash_account_code,fca.name AS payment_cash_account_name,
           fae.number AS payment_event_number,fae.name AS payment_event_name
    FROM financial_payables fp
    LEFT JOIN purchase_suppliers s ON s.id=fp.supplier_id AND s.id=fp.supplier_id
    LEFT JOIN payroll_employees pe ON pe.id=fp.supplier_id AND pe.company_id=fp.company_id AND fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION')
    LEFT JOIN payroll_employee_numbers pen ON pen.employee_id=pe.id AND pen.company_id=fp.company_id
    LEFT JOIN purchase_receipts rec ON rec.id=fp.receipt_id
    LEFT JOIN purchase_orders o ON o.id=rec.order_id
    LEFT JOIN financial_cash_accounts fca ON fca.id=fp.payment_cash_account_id
    LEFT JOIN financial_accounting_events fae ON fae.id=fp.payment_accounting_event_id
    WHERE fp.company_id=? AND (?=1 OR fp.source_type NOT IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'))
    ORDER BY CASE fp.status WHEN 'OPEN' THEN 0 WHEN 'PAID' THEN 1 ELSE 2 END,fp.due_date,fp.number
  `).bind(companyId,allowPayroll?1:0).all();
  return (r.results||[]).map(x=>({...x,amount:centsToMoney(x.amount_cents),balance:centsToMoney(x.balance_cents)}));
}

async function getFinancialPayable(env,companyId,id){
  const x=await env.DB.prepare(`
    SELECT fp.*,CASE WHEN fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION') THEN COALESCE(printf('%05d',pen.number),'FOLHA') ELSE s.code END AS supplier_code,
           CASE WHEN fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION') THEN pe.name ELSE s.name END AS supplier_name,
           s.tax_id,rec.number AS receipt_number,o.number AS order_number,
           u.name AS created_by_name,pu.name AS paid_by_name,
           fca.code AS payment_cash_account_code,fca.name AS payment_cash_account_name,
           fae.number AS payment_event_number,fae.name AS payment_event_name,
           jb.code AS payment_batch_code
    FROM financial_payables fp
    LEFT JOIN purchase_suppliers s ON s.id=fp.supplier_id AND s.id=fp.supplier_id
    LEFT JOIN payroll_employees pe ON pe.id=fp.supplier_id AND pe.company_id=fp.company_id AND fp.source_type IN ('PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION')
    LEFT JOIN payroll_employee_numbers pen ON pen.employee_id=pe.id AND pen.company_id=fp.company_id
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
  const supplierType=['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(payable.source_type)?'PF':taxDigits.length===14?'PJ':taxDigits.length===11?'PF':'UNKNOWN';
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
  if(['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(before.source_type))await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  if(before.status!=='OPEN') throw new HttpError(409,'Somente títulos em aberto podem ser pagos.','INVALID_STATUS');
  const date=isoDate(body.payment_date||new Date().toISOString().slice(0,10),'data do pagamento');
  const cashAccountId=cleanText(required(body.cash_account_id,'Conta/Caixa'),80);
  const cash=await getFinancialCashAccount(env,companyId,cashAccountId);
  if(!cash.active) throw new HttpError(409,'A Conta/Caixa selecionada está inativa.','INACTIVE_CASH_ACCOUNT');
  const discountCents=moneyToCents(body.discount||0),advanceCents=moneyToCents(body.advance||0),interestCents=moneyToCents(body.interest||0);
  if(discountCents<0||advanceCents<0||interestCents<0) throw new HttpError(400,'Desconto, adiantamento e juros não podem ser negativos.','INVALID_PAYMENT_VALUES');
  if(['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(before.source_type) && (discountCents||advanceCents||interestCents))
    throw new HttpError(409,'Titulos de salarios liquidos nao aceitam juros, descontos ou adiantamentos nesta etapa.','PAYROLL_PAYMENT_RESTRICTED');
  const cashCents=Number(before.balance_cents||0)+interestCents-discountCents-advanceCents;
  if(cashCents<0) throw new HttpError(400,'Desconto e adiantamento não podem superar o valor do título somado aos juros.','INVALID_PAYMENT_VALUES');

  const eventId=cleanText(body.accounting_event_id,80)||null;
  if(['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(before.source_type) && !eventId)
    throw new HttpError(409,'Pagamento de folha exige Evento Contabil Financeiro de baixa para conciliar Salarios a Pagar e Banco.','PAYROLL_ACCOUNTING_EVENT_REQUIRED');
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
  if(['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(before.source_type)) throw new HttpError(409,'Titulos gerados pela folha nao podem ser cancelados isoladamente. Revise a integracao de origem.','PAYROLL_LINK_LOCKED');
  await env.DB.prepare(`UPDATE financial_payables SET status='CANCELLED',balance_cents=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
  const after=await getFinancialPayable(env,companyId,id);
  await audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'financial_payable',entityId:id,before,after,request});
  return after;
}

async function undoFinancialPayablePayment(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  // v104: não desfaça a baixa de um recibo de férias vinculado sem
  // remover primeiro a associação auditável à origem.
  const vac66Exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_vacation_advance_payments66' LIMIT 1").first();
  if(vac66Exists){
    const vac66Link=await env.DB.prepare("SELECT id FROM payroll_vacation_advance_payments66 WHERE company_id=? AND payable_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,id).first();
    if(vac66Link)throw new HttpError(409,'A baixa está vinculada a um recibo de férias. Desvincule o adiantamento antes de estornar o pagamento.','VACATION_PAYMENT_LINKED');
  }

  const before=await getFinancialPayable(env,companyId,id);
  if(['PAYROLL_MONTHLY','PAYROLL_THIRTEENTH','PAYROLL_TERMINATION','PAYROLL_TERMINATION_FGTS'].includes(before.source_type))await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  if(before.status!=='PAID') throw new HttpError(409,'Somente títulos baixados podem ter a baixa desfeita.','INVALID_STATUS');
  // v112: o adiantamento pago integra a fotografia da quitação do 13º.
  // Não reabrir o título da primeira parcela após ele ser utilizado.
  if(before.source_type==='PAYROLL_THIRTEENTH'){
    const has112=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_thirteenth_postings112' LIMIT 1").first();
    if(has112){
      const linked=await env.DB.prepare(
        "SELECT z.run_id FROM payroll_thirteenth_payables111 l JOIN payroll_thirteenth_runs71 a ON a.id=l.run_id AND a.company_id=l.company_id JOIN payroll_thirteenth_runs71 b ON b.company_id=a.company_id AND b.calendar_year=a.calendar_year AND b.phase='SECOND' JOIN payroll_thirteenth_postings112 z ON z.company_id=b.company_id AND z.run_id=b.id WHERE l.company_id=? AND l.payable_id=? LIMIT 1"
      ).bind(companyId,id).first();
      if(linked)throw new HttpError(409,'Adiantamento da primeira parcela já utilizado na quitação contabilizada do 13º. Estorno exige conciliação e reabertura controladas.','THIRTEENTH_FIRST_USED');
    }
  }


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
    if(raw.cost_center_id) await validateCostCenterForEntry(env,companyId,raw.cost_center_id);
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

// SAGAS Worker v34: migrações por versão persistida no D1 (sem cache global do Worker).
// Ao alterar a definição de um schema no futuro, incremente sua revisão aqui.
async function ensureSchemaRevision(env, scope, revision, migrate) {
  let row;
  try {
    row = await env.DB.prepare(`SELECT revision FROM sagas_schema_revisions WHERE scope=?`).bind(scope).first();
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!/no such table: sagas_schema_revisions/i.test(message)) throw error;
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sagas_schema_revisions (
      scope TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    row = await env.DB.prepare(`SELECT revision FROM sagas_schema_revisions WHERE scope=?`).bind(scope).first();
  }
  if (Number(row?.revision) >= revision) return;
  // A migração é executada até o fim antes de marcar a revisão como concluída.
  // Se falhar, o próximo acesso poderá tentar novamente; nunca marca como pronta.
  await migrate();
  await env.DB.prepare(`INSERT INTO sagas_schema_revisions(scope,revision,applied_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,applied_at=CURRENT_TIMESTAMP
  `).bind(scope,revision).run();
}


// ===== Folha de Pagamento: primeira etapa — cadastros, sem cálculo =====
const PAYROLL_TABLES={
  categories:'payroll_categories',
  departments:'payroll_departments',
  positions:'payroll_positions',
  employees:'payroll_employees',
  events:'payroll_events'
};

async function ensurePayrollSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_categories (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_departments (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_positions (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,name TEXT NOT NULL,
      salary_cents INTEGER NOT NULL CHECK(salary_cents>=0),
      active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_employees (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,name TEXT NOT NULL,
      category_id TEXT,department_id TEXT,position_id TEXT NOT NULL,
      salary_cents INTEGER NOT NULL CHECK(salary_cents>=0),
      admission_date TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_employee_company ON payroll_employees(company_id,name)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_events (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,code TEXT NOT NULL,
      name TEXT NOT NULL,event_type TEXT NOT NULL CHECK(event_type IN ('PROVENTO','DESCONTO','INFORMATIVO')),
      reference_unit TEXT NOT NULL CHECK(reference_unit IN ('VALOR','DIAS','HORAS','PERCENTUAL')),
      active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,code)
    )`)
  ]);
  for(const [code,description] of [
    ['payroll.read','Consultar cadastros da folha de pagamento'],
    ['payroll.manage','Cadastrar e alterar informações da folha de pagamento']
  ]){
    await env.DB.prepare(`INSERT OR IGNORE INTO permissions (id,code,module,description)
      VALUES (?,?,'PAYROLL',?)`).bind(uuid(),code,description).run();
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
    WHERE r.code='ADMIN' AND p.code IN ('payroll.read','payroll.manage')`).run();
}

// Etapa 11.1 — ID de exibição 00001..99999, sem alterar o UUID interno.
// Mantém reservas históricas mesmo se o cadastro for excluído: códigos não são reutilizados.
async function ensurePayrollEmployeeNumbersSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_employee_numbers (
    employee_id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 99999),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id,number)
  )`).run();
  // Backfill determinístico: criação mais antiga primeiro; ID desempata.
  // Uma única instrução SQL mantém o preenchimento da migração atômico.
  await env.DB.prepare(`INSERT INTO payroll_employee_numbers(employee_id,company_id,number)
    SELECT e.id,e.company_id,
           ROW_NUMBER() OVER(PARTITION BY e.company_id ORDER BY e.created_at,e.id)
    FROM payroll_employees e
    WHERE NOT EXISTS (SELECT 1 FROM payroll_employee_numbers n WHERE n.employee_id=e.id)
  `).run();
}

function payrollKindTable(kind){
  if(!Object.prototype.hasOwnProperty.call(PAYROLL_TABLES,kind))
    throw new HttpError(404,'Cadastro da folha não encontrado.','NOT_FOUND');
  return PAYROLL_TABLES[kind];
}

async function ensurePayrollCostCenter39(env){
  await ensureTableColumn(env,'payroll_employees','cost_center_id','TEXT');
}
async function ensurePayrollEnvelopeCostCenter39(env){
  await ensureTableColumn(env,'payroll_calc_envelopes','cost_center_id','TEXT');
}
async function listPayroll(env,companyId,kind){
  const table=payrollKindTable(kind);
  let sql;
  if(kind==='employees'){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    sql=`SELECT e.*,printf('%05d',n.number) AS employee_code,p.name AS position_name,
    d.name AS department_name,c.name AS category_name,
    cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM payroll_employees e
    LEFT JOIN payroll_employee_numbers n ON n.employee_id=e.id AND n.company_id=e.company_id
    LEFT JOIN payroll_positions p ON p.id=e.position_id AND p.company_id=e.company_id
    LEFT JOIN payroll_departments d ON d.id=e.department_id AND d.company_id=e.company_id
    LEFT JOIN payroll_categories c ON c.id=e.category_id AND c.company_id=e.company_id
    LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id
    WHERE e.company_id=? ORDER BY e.name COLLATE NOCASE`;
  }
  else sql=`SELECT * FROM ${table} WHERE company_id=? ORDER BY ${kind==='events'?'code':'name'} COLLATE NOCASE`;
  const res=await env.DB.prepare(sql).bind(companyId).all();
  return (res.results||[]).map(x=>({
    ...x,...('salary_cents' in x?{salary:centsToMoney(x.salary_cents)}:{})
  }));
}

async function getPayroll(env,companyId,kind,id){
  payrollKindTable(kind);
  const all=await listPayroll(env,companyId,kind);
  const item=all.find(x=>x.id===id);
  if(!item)throw new HttpError(404,'Registro não encontrado na empresa.','NOT_FOUND');
  return item;
}

async function payrollReference(env,companyId,kind,id,label){
  if(!id)return null;
  const table=payrollKindTable(kind);
  const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE company_id=? AND id=?`).bind(companyId,id).first();
  if(!row)throw new HttpError(400,`${label} não pertence à empresa selecionada.`,'VALIDATION_ERROR');
  if(!row.active)throw new HttpError(409,`${label} está inativo.`,'INACTIVE_REFERENCE');
  return row;
}

function payrollEventType(v){
  const s=String(v||'').toUpperCase();
  if(!['PROVENTO','DESCONTO','INFORMATIVO'].includes(s))throw new HttpError(400,'Tipo de evento inválido.','VALIDATION_ERROR');
  return s;
}
function payrollReferenceUnit(v){
  const s=String(v||'').toUpperCase();
  if(!['VALOR','DIAS','HORAS','PERCENTUAL'].includes(s))throw new HttpError(400,'Unidade de referência inválida.','VALIDATION_ERROR');
  return s;
}

async function savePayroll(env,request,auth,companyId,kind,id,body){
  const table=payrollKindTable(kind);
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const before=id?await getPayroll(env,companyId,kind,id):null;
  if(kind==='events'&&before&&['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL','FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO','LICENCA_REMUNERADA','LICENCA_NAO_REMUNERADA','DOENCA_EMPRESA_15','FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','ADIANTAMENTO_FERIAS','INSS_FERIAS','IRRF_FERIAS','FGTS_FERIAS'].includes(before.code))
    throw new HttpError(409,'Evento automático da folha: não é permitido alterar seu cadastro. Configure apenas a contabilização.','AUTO_EVENT_LOCKED');
  const entryId=id||uuid();
  const name=cleanText(required(body.name,'nome'),200);
  if(!name)throw new HttpError(400,'Informe o nome.','VALIDATION_ERROR');
  const active=bool01(body.active,1);
  let columns=['name','active'], values=[name,active];
  if(kind==='positions'){
    const salary=moneyToCents(required(body.salary,'salário do cargo'));
    if(salary<0)throw new HttpError(400,'O salário do cargo não pode ser negativo.','VALIDATION_ERROR');
    columns.push('salary_cents');values.push(salary);
  }else if(kind==='employees'){
    const position=await payrollReference(env,companyId,'positions',required(body.position_id,'cargo'),'Cargo');
    const categoryId=cleanText(body.category_id,80)||null;
    const departmentId=cleanText(body.department_id,80)||null;
    if(categoryId)await payrollReference(env,companyId,'categories',categoryId,'Categoria');
    if(departmentId)await payrollReference(env,companyId,'departments',departmentId,'Departamento');
    const admissionDate=isoDate(body.admission_date,'data de admissão');
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    const cc=await validateCostCenterForEntry(env,companyId,required(body.cost_center_id,'centro de custo do funcionário'));
    // Salário vem do cargo. Centro de custo analítico obrigatório para novos cadastros/edições.
    columns.push('position_id','category_id','department_id','salary_cents','admission_date','cost_center_id');
    values.push(position.id,categoryId,departmentId,position.salary_cents,admissionDate,cc.id);
  }else if(kind==='events'){
    const code=cleanText(required(body.code,'código do evento'),30).toUpperCase();
    if(['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL','FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO','LICENCA_REMUNERADA','LICENCA_NAO_REMUNERADA','DOENCA_EMPRESA_15'].includes(code))
      throw new HttpError(409,'Código reservado ao cálculo automático da folha. O evento já aparece no cadastro.','AUTO_EVENT_RESERVED');
    const type=payrollEventType(body.event_type),unit=payrollReferenceUnit(body.reference_unit);
    columns.push('code','event_type','reference_unit');values.push(code,type,unit);
  }
  try{
    if(id){
      await env.DB.prepare(`UPDATE ${table} SET ${columns.map(c=>`${c}=?`).join(',')},updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?`).bind(...values,id,companyId).run();
    }else{
      const insert=env.DB.prepare(`INSERT INTO ${table} (id,company_id,${columns.join(',')})
        VALUES (${Array(columns.length+2).fill('?').join(',')})`).bind(entryId,companyId,...values);
      if(kind==='employees'){
        // Garante a existência da numeração antes do cadastro.
        await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
        // O D1 executa o lote transacionalmente: funcionário e código nascem juntos.
        await env.DB.batch([insert,env.DB.prepare(`INSERT INTO payroll_employee_numbers(employee_id,company_id,number)
          SELECT ?,?,COALESCE(MAX(number),0)+1 FROM payroll_employee_numbers WHERE company_id=?`
        ).bind(entryId,companyId,companyId)]);
      }else await insert.run();
    }
  }catch(err){
    if(kind==='employees'&&/CHECK constraint failed|payroll_employee_numbers/i.test(String(err?.message||err)))
      throw new HttpError(409,'Limite de 99999 códigos de funcionários por empresa atingido ou código indisponível.','EMPLOYEE_CODE_LIMIT');
    if(/UNIQUE constraint failed/i.test(String(err?.message||err)))
      throw new HttpError(409,kind==='events'?'Já existe um evento com esse código.':'Já existe um cadastro com esse nome.','DUPLICATE');
    throw err;
  }
  if(kind==='employees'&&!id){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    const initial=await env.DB.prepare('SELECT salary_cents,admission_date FROM payroll_employees WHERE id=? AND company_id=?').bind(entryId,companyId).first();
    // Não presume que o salário atual do cargo era igual em admissões retroativas.
    // Só cria a vigência inicial automaticamente para admissão no mês corrente.
    const currentMonth=new Date().toISOString().slice(0,7);
    if(initial.admission_date.slice(0,7)===currentMonth){
      await env.DB.prepare(`INSERT OR IGNORE INTO payroll_salary_history (id,company_id,employee_id,effective_from,salary_cents,notes,created_by)
        VALUES (?,?,?,?,?,'Salário inicial do cargo na admissão do mês corrente',?)`).bind(uuid(),companyId,entryId,initial.admission_date,initial.salary_cents,auth.user.id).run();
    }
  }
  const after=await getPayroll(env,companyId,kind,entryId);
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:table,entityId:entryId,before,after,request});
  return after;
}

async function deletePayroll(env,request,auth,companyId,kind,id){
  const table=payrollKindTable(kind);
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const before=await getPayroll(env,companyId,kind,id);
  if(kind==='events'&&['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL','FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO','LICENCA_REMUNERADA','LICENCA_NAO_REMUNERADA','DOENCA_EMPRESA_15'].includes(before.code))
    throw new HttpError(409,'Evento automático da folha não pode ser excluído.','AUTO_EVENT_LOCKED');
  if(kind==='categories'||kind==='departments'||kind==='positions'){
    const column={categories:'category_id',departments:'department_id',positions:'position_id'}[kind];
    const ref=await env.DB.prepare(`SELECT 1 AS used FROM payroll_employees WHERE company_id=? AND ${column}=? LIMIT 1`).bind(companyId,id).first();
    if(ref)throw new HttpError(409,'Cadastro utilizado por funcionário. Inative em vez de excluir.','IN_USE');
  }
  if(kind==='employees'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    for(const table of Object.values(PAYROLL_EMPLOYEE_RECORD_KINDS)){
      const history=await env.DB.prepare(`SELECT 1 AS found FROM ${table} WHERE company_id=? AND employee_id=? LIMIT 1`).bind(companyId,id).first();
      if(history)throw new HttpError(409,'Funcionário possui histórico trabalhista. Inative em vez de excluir.','IN_USE');
    }
  }
  if(kind==='employees'||kind==='events'){
    const used=await env.DB.prepare(`SELECT 1 AS used FROM payroll_movements WHERE company_id=? AND ${kind==='employees'?'employee_id':'event_id'}=? LIMIT 1`).bind(companyId,id).first();
    if(used)throw new HttpError(409,'Cadastro possui lançamentos. Inative em vez de excluir.','IN_USE');
  }
  await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND company_id=?`).bind(id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:table,entityId:id,before,request});
  return {deleted:true,id};
}



// ===== SAGAS Folha Etapa 08: histórico funcional e salarial por vigência =====
// Operação isolada por empresa e funcionário. Salários antigos nunca são presumidos.
const PAYROLL_EMPLOYEE_RECORD_KINDS={
  salary:'payroll_salary_history',schedule:'payroll_work_schedule_history',
  dependents:'payroll_employee_dependents',occurrences:'payroll_employee_occurrences',
  functional:'payroll_employee_functional_history'
};
async function ensurePayrollEmployeeRecordsSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_salary_history (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      effective_from TEXT NOT NULL,salary_cents INTEGER NOT NULL CHECK(salary_cents>=0),
      notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,effective_from))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_salary_asof ON payroll_salary_history(company_id,employee_id,effective_from)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_work_schedule_history (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      effective_from TEXT NOT NULL,weekly_hours_milli INTEGER NOT NULL CHECK(weekly_hours_milli>0),
      monthly_hours_milli INTEGER NOT NULL CHECK(monthly_hours_milli>0),notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,effective_from))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_schedule_asof ON payroll_work_schedule_history(company_id,employee_id,effective_from)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_employee_dependents (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,relationship TEXT NOT NULL CHECK(relationship IN ('FILHO','CONJUGE','OUTRO')),
      birth_date TEXT NOT NULL,irrf_eligible INTEGER NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL,effective_to TEXT,notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_dependent_asof ON payroll_employee_dependents(company_id,employee_id,effective_from,effective_to)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_employee_occurrences (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK(kind IN ('FALTA','AFASTAMENTO','FERIAS','LICENCA')),
      start_date TEXT NOT NULL,end_date TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_occurrence_month ON payroll_employee_occurrences(company_id,employee_id,start_date,end_date)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_employee_functional_history (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      effective_from TEXT NOT NULL,position_id TEXT NOT NULL REFERENCES payroll_positions(id) ON DELETE RESTRICT,
      situation TEXT NOT NULL CHECK(situation IN ('ATIVO','AFASTADO','DESLIGADO')),
      notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,effective_from))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_functional_asof ON payroll_employee_functional_history(company_id,employee_id,effective_from)`)
  ]);
}
function payrollStrictDate(value,label){
  const s=isoDate(value,label),p=s.split('-').map(Number);
  const d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
  if(d.getUTCFullYear()!==p[0]||d.getUTCMonth()+1!==p[1]||d.getUTCDate()!==p[2]||p[0]<1900||p[0]>2100)
    throw new HttpError(400,`${label} inválida.`,'VALIDATION_ERROR');
  return s;
}
function payrollHoursMilli(value,label,max){
  const n=Number(value);
  if(value===null||value===undefined||value===''||!Number.isFinite(n)||n<=0||n>max||Math.abs(n*1000-Math.round(n*1000))>1e-6)
    throw new HttpError(400,`${label} deve ser positiva, no máximo ${max}, com até 3 casas decimais.`,'VALIDATION_ERROR');
  return Math.round(n*1000);
}
function payrollEmployeeKindTable(kind){
  if(!Object.prototype.hasOwnProperty.call(PAYROLL_EMPLOYEE_RECORD_KINDS,kind))
    throw new HttpError(404,'Tipo de histórico desconhecido.','NOT_FOUND');
  return PAYROLL_EMPLOYEE_RECORD_KINDS[kind];
}
async function payrollEmployeeRecordList(env,companyId,employeeId,kind){
  const table=payrollEmployeeKindTable(kind);
  await getPayroll(env,companyId,'employees',employeeId);
  const ordering=kind==='occurrences'?'start_date':kind==='dependents'?'effective_from':'effective_from';
  const r=await env.DB.prepare(`SELECT * FROM ${table} WHERE company_id=? AND employee_id=? ORDER BY ${ordering} DESC,id DESC LIMIT 251`).bind(companyId,employeeId).all();
  if((r.results||[]).length>250)throw new HttpError(409,'Histórico excede 250 registros. Consulte de forma paginada.','LIMIT');
  return (r.results||[]).map(x=>({
    ...x,...(kind==='salary'?{salary:centsToMoney(x.salary_cents)}:{}),
    ...(kind==='schedule'?{weekly_hours:x.weekly_hours_milli/1000,monthly_hours:x.monthly_hours_milli/1000}:{})
  }));
}
async function payrollEmployeeRecordSave(env,request,auth,companyId,employeeId,kind,id,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const table=payrollEmployeeKindTable(kind);
  const employee=await getPayroll(env,companyId,'employees',employeeId);
  const old=id?await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=? AND employee_id=?`).bind(id,companyId,employeeId).first():null;
  if(id&&!old)throw new HttpError(404,'Registro histórico não encontrado.','NOT_FOUND');
  const notes=cleanText(body.notes||'',500);
  let fields=[],vals=[];
  const add=(key,value)=>{fields.push(key);vals.push(value)};
  if(kind==='salary'||kind==='schedule'||kind==='functional'){
    const from=payrollStrictDate(body.effective_from,'Vigência');
    if(from<employee.admission_date)throw new HttpError(400,'A vigência não pode ser anterior à admissão.','VALIDATION_ERROR');
    add('effective_from',from);
  }
  if(kind==='salary'){
    const amount=moneyToCents(required(body.salary,'salário'));
    if(!Number.isSafeInteger(amount)||amount<0||amount>99999999999)throw new HttpError(400,'Salário fora do limite.','VALIDATION_ERROR');
    add('salary_cents',amount);add('notes',notes);
  }else if(kind==='schedule'){
    add('weekly_hours_milli',payrollHoursMilli(body.weekly_hours,'Jornada semanal',60));
    add('monthly_hours_milli',payrollHoursMilli(body.monthly_hours,'Jornada mensal',300));add('notes',notes);
  }else if(kind==='dependents'){
    const name=cleanText(required(body.name,'nome'),160);
    const relationship=String(body.relationship||'').toUpperCase();
    if(!name||!['FILHO','CONJUGE','OUTRO'].includes(relationship))throw new HttpError(400,'Dependente ou parentesco inválido.','VALIDATION_ERROR');
    const born=payrollStrictDate(body.birth_date,'Nascimento');
    const from=payrollStrictDate(body.effective_from,'Vigência');
    const to=body.effective_to?payrollStrictDate(body.effective_to,'Fim da vigência'):null;
    if(born>from||from<employee.admission_date||to&&to<from)throw new HttpError(400,'Datas do dependente inconsistentes.','VALIDATION_ERROR');
    add('name',name);add('relationship',relationship);add('birth_date',born);add('irrf_eligible',bool01(body.irrf_eligible,0));
    add('effective_from',from);add('effective_to',to);add('notes',notes);
  }else if(kind==='occurrences'){
    const k=String(body.kind||'').toUpperCase();
    if(!['FALTA','AFASTAMENTO','FERIAS','LICENCA'].includes(k))throw new HttpError(400,'Tipo de ocorrência inválido.','VALIDATION_ERROR');
    const start=payrollStrictDate(body.start_date,'Data inicial');
    const end=payrollStrictDate(body.end_date,'Data final');
    if(start<employee.admission_date||end<start)throw new HttpError(400,'Período da ocorrência inválido.','VALIDATION_ERROR');
    add('kind',k);add('start_date',start);add('end_date',end);add('notes',notes);
  }else if(kind==='functional'){
    const pos=await payrollReference(env,companyId,'positions',required(body.position_id,'cargo'),'Cargo');
    const status=String(body.situation||'').toUpperCase();
    if(!['ATIVO','AFASTADO','DESLIGADO'].includes(status))throw new HttpError(400,'Situação funcional inválida.','VALIDATION_ERROR');
    add('position_id',pos.id);add('situation',status);add('notes',notes);
  }
  const recordId=id||uuid();
  try{
    if(id)await env.DB.prepare(`UPDATE ${table} SET ${fields.map(c=>c+'=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND employee_id=?`).bind(...vals,id,companyId,employeeId).run();
    else await env.DB.prepare(`INSERT INTO ${table}(id,company_id,employee_id,${fields.join(',')},created_by) VALUES (${Array(fields.length+4).fill('?').join(',')})`).bind(recordId,companyId,employeeId,...vals,auth.user.id).run();
  }catch(e){if(/UNIQUE constraint failed/i.test(String(e?.message||e)))throw new HttpError(409,'Já existe registro com essa vigência. Edite o existente.','DUPLICATE');throw e}
  const after=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=? AND employee_id=?`).bind(recordId,companyId,employeeId).first();
  await audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:table,entityId:recordId,before:old,after,request});
  return after;
}
async function payrollEmployeeRecordDelete(env,request,auth,companyId,employeeId,kind,id){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const table=payrollEmployeeKindTable(kind);await getPayroll(env,companyId,'employees',employeeId);
  const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=? AND employee_id=?`).bind(id,companyId,employeeId).first();
  if(!row)throw new HttpError(404,'Registro histórico não encontrado.','NOT_FOUND');
  await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND company_id=? AND employee_id=?`).bind(id,companyId,employeeId).run();
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:table,entityId:id,before:row,request});
  return {deleted:true,id};
}
async function payrollEmployeeHistoricalContext(env,companyId,firstDate,lastDate){
  await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
  const defs=[
    ['salary',`SELECT employee_id,effective_from,salary_cents FROM payroll_salary_history WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from DESC`,firstDate],
    ['schedule',`SELECT employee_id,effective_from,weekly_hours_milli,monthly_hours_milli FROM payroll_work_schedule_history WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from DESC`,firstDate],
    ['dependents',`SELECT employee_id,id,irrf_eligible FROM payroll_employee_dependents WHERE company_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY employee_id`,lastDate],
    ['occurrences',`SELECT employee_id,kind,start_date,end_date FROM payroll_employee_occurrences WHERE company_id=? AND start_date<=? AND end_date>=? ORDER BY employee_id`,lastDate],
    ['functional',`SELECT employee_id,effective_from,situation,position_id FROM payroll_employee_functional_history WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from DESC`,firstDate],
    ['changesSalary',`SELECT employee_id,effective_from FROM payroll_salary_history WHERE company_id=? AND effective_from>? AND effective_from<=? ORDER BY employee_id`,lastDate],
    ['changesSchedule',`SELECT employee_id,effective_from FROM payroll_work_schedule_history WHERE company_id=? AND effective_from>? AND effective_from<=? ORDER BY employee_id`,lastDate],
    ['changesFunctional',`SELECT employee_id,effective_from FROM payroll_employee_functional_history WHERE company_id=? AND effective_from>? AND effective_from<=? ORDER BY employee_id`,lastDate]
  ];
  const maps={};
  for(const [kind,sql,date] of defs){
    const args=kind==='dependents'?[companyId,date,firstDate]:kind==='occurrences'?[companyId,date,firstDate]:kind.startsWith('changes')?[companyId,firstDate,date]:[companyId,date];
    const r=await env.DB.prepare(sql+' LIMIT 5001').bind(...args).all();
    if((r.results||[]).length>5000)throw new HttpError(409,'Histórico extenso demais para esta prévia.','PREVIEW_LIMIT');
    const groups=new Map();for(const row of r.results||[]){if(!groups.has(row.employee_id))groups.set(row.employee_id,[]);groups.get(row.employee_id).push(row)}
    maps[kind]=groups;
  }
  return maps;
}

// ===== Etapa 04: versões imutáveis de parametrização dos eventos (não calcula folha) =====
async function ensurePayrollEventRulesSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_event_rule_versions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,
      effective_from TEXT NOT NULL CHECK(length(effective_from)=7 AND substr(effective_from,5,1)='-'
        AND substr(effective_from,6,2) BETWEEN '01' AND '12'),
      revision INTEGER NOT NULL CHECK(revision>=1),
      priority INTEGER NOT NULL CHECK(priority BETWEEN 0 AND 99),
      calculation_code INTEGER NOT NULL CHECK(calculation_code BETWEEN 0 AND 999),
      formula_text TEXT,
      inss TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(inss IN ('SIM','NAO','PENDENTE')),
      irrf TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(irrf IN ('SIM','NAO','PENDENTE')),
      fgts TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(fgts IN ('SIM','NAO','PENDENTE')),
      request_key TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,event_id,effective_from,revision),
      UNIQUE(company_id,request_key)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_event_rule_effective
       ON payroll_event_rule_versions(company_id,event_id,effective_from DESC,revision DESC)`)
  ]);
}
function payrollIncidenceFlag(value,label){
  const code=String(value??'PENDENTE').trim().toUpperCase();
  if(!['SIM','NAO','PENDENTE'].includes(code))
    throw new HttpError(400,`Incidência de ${label} inválida.`,'VALIDATION_ERROR');
  return code;
}
function payrollRulePayload(body){
  const eventId=cleanText(required(body.event_id,'evento'),100);
  const effectiveFrom=payrollCompetence(required(body.effective_from,'competência inicial'));
  const priority=Number(body.priority),calculationCode=Number(body.calculation_code);
  if(body.priority===''||body.priority===undefined||body.priority===null||!Number.isInteger(priority)||priority<0||priority>99)
    throw new HttpError(400,'Prioridade deve estar entre 0 e 99.','VALIDATION_ERROR');
  if(body.calculation_code===''||body.calculation_code===undefined||body.calculation_code===null||!Number.isInteger(calculationCode)||calculationCode<0||calculationCode>999)
    throw new HttpError(400,'Código de cálculo deve ser um inteiro entre 0 e 999.','VALIDATION_ERROR');
  const raw=String(body.formula_text??'').trim();
  if(raw.length>1500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(raw))
    throw new HttpError(400,'Fórmula deve ter até 1500 caracteres de texto válido.','VALIDATION_ERROR');
  const requestKey=String(required(body.request_key,'identificador da operação'));
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))
    throw new HttpError(400,'Identificador da operação inválido.','VALIDATION_ERROR');
  return {event_id:eventId,effective_from:effectiveFrom,priority,calculation_code:calculationCode,
    formula_text:raw||null,inss:payrollIncidenceFlag(body.inss,'INSS'),
    irrf:payrollIncidenceFlag(body.irrf,'IRRF'),fgts:payrollIncidenceFlag(body.fgts,'FGTS'),request_key:requestKey};
}
async function payrollEventRulesList(env,companyId,eventId,competence){
  const event=await env.DB.prepare(`SELECT id,name,code,event_type,reference_unit,active FROM payroll_events WHERE company_id=? AND id=?`)
    .bind(companyId,eventId).first();
  if(!event)throw new HttpError(404,'Evento não encontrado nesta empresa.','NOT_FOUND');
  let period=null;
  if(competence!==null&&competence!==undefined&&competence!=='')period=payrollCompetence(competence);
  const result=await env.DB.prepare(`SELECT id,effective_from,revision,priority,calculation_code,
      formula_text,inss,irrf,fgts,created_by,created_at
      FROM payroll_event_rule_versions WHERE company_id=? AND event_id=?
      ORDER BY effective_from DESC,revision DESC LIMIT 501`).bind(companyId,eventId).all();
  const versions=result.results||[];
  if(versions.length>500)throw new HttpError(409,'Histórico muito grande para esta consulta.','TOO_MANY_RULE_VERSIONS');
  const applicable=period?versions.find(v=>v.effective_from<=period)||null:null;
  return {event,versions,applicable,competence:period,configuration_only:true,
    formulas_executed:false,ready_for_payroll:false};
}
async function payrollEventRuleCreate(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const data=payrollRulePayload(body);
  const event=await env.DB.prepare(`SELECT id,active FROM payroll_events WHERE id=? AND company_id=?`)
    .bind(data.event_id,companyId).first();
  if(!event)throw new HttpError(404,'Evento não encontrado nesta empresa.','NOT_FOUND');
  if(!event.active)throw new HttpError(409,'Não é permitido configurar evento inativo.','INACTIVE_REFERENCE');
  const previous=await env.DB.prepare(`SELECT * FROM payroll_event_rule_versions WHERE company_id=? AND request_key=?`)
    .bind(companyId,data.request_key).first();
  if(previous){
    const fields=['event_id','effective_from','priority','calculation_code','formula_text','inss','irrf','fgts'];
    if(!fields.every(k=>previous[k]===data[k]))
      throw new HttpError(409,'Identificador de operação reutilizado com dados diferentes.','IDEMPOTENCY_CONFLICT');
    return {id:previous.id,revision:previous.revision,effective_from:previous.effective_from,reused:true};
  }
  const revRow=await env.DB.prepare(`SELECT MAX(revision) AS rev FROM payroll_event_rule_versions
    WHERE company_id=? AND event_id=? AND effective_from=?`)
    .bind(companyId,data.event_id,data.effective_from).first();
  const rev=Number(revRow?.rev||0)+1, id=uuid();
  try{
    await env.DB.prepare(`INSERT INTO payroll_event_rule_versions (
      id,company_id,event_id,effective_from,revision,priority,calculation_code,
      formula_text,inss,irrf,fgts,request_key,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,companyId,data.event_id,data.effective_from,rev,data.priority,data.calculation_code,
        data.formula_text,data.inss,data.irrf,data.fgts,data.request_key,auth.user.id).run();
  }catch(e){
    if(/UNIQUE constraint failed/i.test(String(e?.message||e)))
      throw new HttpError(409,'Conflito de gravação. Atualize a tela e tente novamente.','CONFLICT');
    throw e;
  }
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_event_rule_versions',entityId:id,
    after:{...data,revision:rev},request});
  return {id,revision:rev,effective_from:data.effective_from,reused:false,
    configuration_only:true,formulas_executed:false};
}



// SAGAS Folha v44: tabelas históricas de vigência RGPS (empregado) e IRRF (pagamento).
// Moeda: centavos; taxas em base 10.000. Não é processamento homologado.
const HIST_INSS=[
 ['2020-01','FLAT',[[183029,800],[305052,900],[610106,1100]]],
 ['2020-03','PROGRESSIVE',[[104500,750],[208960,900],[313440,1200],[610106,1400]]],
 ['2021-01','PROGRESSIVE',[[110000,750],[220348,900],[330522,1200],[643357,1400]]],
 ['2022-01','PROGRESSIVE',[[121200,750],[242735,900],[364103,1200],[708722,1400]]],
 ['2023-01','PROGRESSIVE',[[130200,750],[257129,900],[385694,1200],[750749,1400]]],
 ['2023-05','PROGRESSIVE',[[132000,750],[257129,900],[385694,1200],[750749,1400]]],
 ['2024-01','PROGRESSIVE',[[141200,750],[266668,900],[400003,1200],[778602,1400]]],
 ['2025-01','PROGRESSIVE',[[151800,750],[279388,900],[419083,1200],[815741,1400]]],
 ['2026-01','PROGRESSIVE',[[162100,750],[290284,900],[435427,1200],[847555,1400]]]
];
const HIST_IRRF=[
 ['2020-01',[[190398,0,0],[282665,750,14280],[375105,1500,35480],[466468,2250,63613],[Infinity,2750,86936]],0,false],
 ['2023-05',[[211200,0,0],[282665,750,15840],[375105,1500,37040],[466468,2250,65173],[Infinity,2750,88496]],52800,false],
 ['2024-02',[[225920,0,0],[282665,750,16944],[375105,1500,38144],[466468,2250,66277],[Infinity,2750,89600]],56480,false],
 ['2025-05',[[242880,0,0],[282665,750,18216],[375105,1500,39416],[466468,2250,67549],[Infinity,2750,90873]],60720,false],
 ['2026-01',[[242880,0,0],[282665,750,18216],[375105,1500,39416],[466468,2250,67549],[Infinity,2750,90873]],60720,true]
];
function histTable(rows,ym){
  if(!/^20(2[0-6])-(0[1-9]|1[0-2])$/.test(ym))
    throw new HttpError(409,'Tabelas disponíveis apenas de 2020 a 2026.','TAX_TABLE_UNAVAILABLE');
  let table=null;for(const row of rows)if(row[0]<=ym)table=row;
  if(!table)throw new HttpError(409,'Tabela não encontrada.','TAX_TABLE_UNAVAILABLE');
  return table;
}
function histPaymentDate(value){
  const x=String(value||'');
  if(!/^20(2[0-6])-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(x))
    throw new HttpError(400,'Informe a data de pagamento entre 2020 e 2026.','PAYMENT_DATE_REQUIRED');
  const d=new Date(x+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)
    throw new HttpError(400,'Data de pagamento inválida.','INVALID_PAYMENT_DATE');
  return x;
}
function payrollTaxHistorical(baseInss,irrfGross,baseFgts,competence,paymentDate){
  const payment=histPaymentDate(paymentDate), inssTable=histTable(HIST_INSS,competence),irrfTable=histTable(HIST_IRRF,payment.slice(0,7));
  for(const n of [baseInss,irrfGross,baseFgts])if(!Number.isSafeInteger(n)||n<0||n>99999999999)throw new Error('Base tributária inválida');
  const limited=Math.min(baseInss,inssTable[2].at(-1)[0]);
  let sum=0;
  if(inssTable[1]==='FLAT'){
    const bracket=inssTable[2].find(x=>limited<=x[0])||inssTable[2].at(-1);
    sum=limited*bracket[1];
  }else{
    let prev=0;for(const [limit,rate] of inssTable[2]){sum+=Math.max(0,Math.min(limited,limit)-prev)*rate;prev=limit;}
  }
  const inss=payrollTaxRound(sum,10000),simplified=irrfTable[2];
  const legalOrSimplified=Math.max(inss,simplified);
  const taxable=Math.max(0,irrfGross-legalOrSimplified);
  const irrfBand=irrfTable[1].find(x=>taxable<=x[0]);
  const before=Math.max(0,payrollTaxRound(taxable*irrfBand[1],10000)-irrfBand[2]);
  let reduction=0;
  if(irrfTable[3]){
    if(irrfGross<=500000)reduction=Math.min(before,31289);
    else if(irrfGross<=735000)reduction=Math.min(before,Math.max(0,97862-payrollTaxRound(irrfGross*133145,1000000)));
  }
  return {inss_cents:inss,irrf_base_cents:taxable,irrf_original_cents:before,
    irrf_reduction_cents:reduction,irrf_cents:Math.max(0,before-reduction),
    fgts_cents:payrollTaxRound(baseFgts*800,10000),irrf_deduction_cents:legalOrSimplified,
    irrf_deduction_type:inss>=simplified?'INSS_SIMULADO':'DESCONTO_SIMPLIFICADO',
    inss_table_from:inssTable[0],inss_mode:inssTable[1],irrf_table_from:irrfTable[0],payment_date:payment};
}

// ===== SAGAS Folha Etapa 06 — LEGACY 2026 formulas kept for regression; route uses HISTORICAL =====
// Fonte INSS: Portaria MPS/MF 13/2026 — gov.br/inss; IRRF: Receita Federal tabela 2026;
// FGTS regra geral: art. 15 Lei 8.036/1990. Não é motor de fechamento/homologação.
// Valores em centavos; cálculos progressivos com arredondamento final half-up.
function payrollTaxRound(numerator,denominator){
  if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||numerator<0||denominator<=0)
    throw new Error('Cálculo monetário fora do limite');
  return Math.floor((numerator+Math.floor(denominator/2))/denominator);
}
function payrollTax2026(inssBaseCents,irrfGrossCents,fgtsBaseCents){
  for(const n of [inssBaseCents,irrfGrossCents,fgtsBaseCents]){
    if(!Number.isSafeInteger(n)||n<0||n>99999999999)throw new Error('Base tributária inválida');
  }
  let prev=0,total=0;
  for(const [limit,rate] of [[162100,750],[290284,900],[435427,1200],[847555,1400]]){
    const band=Math.max(0,Math.min(inssBaseCents,limit)-prev);
    total+=band*rate;
    prev=limit;
  }
  const inssCents=payrollTaxRound(total,10000);
  const legalDeduction=inssCents; // cenário sem dependentes ou pensão judicial
  const simplifiedDeduction=60720;
  const irrfDeduction=Math.max(legalDeduction,simplifiedDeduction);
  const irrfBase=Math.max(0,irrfGrossCents-irrfDeduction);
  let rate=0,deduction=0;
  if(irrfBase<=242880){rate=0;deduction=0;}
  else if(irrfBase<=282665){rate=750;deduction=18216;}
  else if(irrfBase<=375105){rate=1500;deduction=39416;}
  else if(irrfBase<=466468){rate=2250;deduction=67549;}
  else {rate=2750;deduction=90873;}
  const progressive=Math.max(0,payrollTaxRound(irrfBase*rate,10000)-deduction);
  let reduction=0;
  if(irrfGrossCents<=500000)reduction=Math.min(progressive,31289);
  else if(irrfGrossCents<=735000)reduction=Math.min(progressive,
    Math.max(0,97862-payrollTaxRound(irrfGrossCents*133145,1000000)));
  const irrfCents=Math.max(0,progressive-reduction);
  return {inss_cents:inssCents,irrf_base_cents:irrfBase,irrf_original_cents:progressive,
    irrf_reduction_cents:reduction,irrf_cents:irrfCents,fgts_cents:payrollTaxRound(fgtsBaseCents*800,10000),
    irrf_deduction_cents:irrfDeduction,irrf_deduction_type:legalDeduction>simplifiedDeduction?'INSS_SIMULADO':'DESCONTO_SIMPLIFICADO'};
}
async function payrollTaxPreviewHistorical(env,companyId,competenceId,paymentDate){
  const simulated=await payrollEventCalculationPreview(env,companyId,competenceId);
  const competence=simulated.competence.competence;
  // INSS da competência, IRRF pela data de pagamento fornecida (nunca presumida).
  const paid=histPaymentDate(paymentDate);
  const inssTable=histTable(HIST_INSS,competence), irrfTable=histTable(HIST_IRRF,paid.slice(0,7));
  const dependentRows=await env.DB.prepare(`SELECT employee_id,COUNT(*) AS total
    FROM payroll_employee_dependents
    WHERE company_id=? AND irrf_eligible=1 AND effective_from<=?
      AND (effective_to IS NULL OR effective_to>=?)
    GROUP BY employee_id LIMIT 2001`).bind(companyId,paid,paid).all();
  if((dependentRows.results||[]).length>2000)throw new HttpError(409,'Dependentes excedem limite da prévia.','PREVIEW_LIMIT');
  const dependentsByEmployee=new Map((dependentRows.results||[]).map(r=>[r.employee_id,Number(r.total)]));
  const result=await env.DB.prepare(`SELECT r.event_id,r.effective_from,r.revision,r.inss,r.irrf,r.fgts
    FROM payroll_event_rule_versions r
    WHERE r.company_id=? AND r.effective_from<=? AND r.event_id IN (
       SELECT DISTINCT event_id FROM payroll_movements WHERE company_id=? AND competence_id=?)
    ORDER BY r.event_id,r.effective_from DESC,r.revision DESC LIMIT 5001`)
    .bind(companyId,competence,companyId,competenceId).all();
  const allRules=result.results||[];
  if(allRules.length>5000)throw new HttpError(409,'Histórico excede limite de simulação.','RULES_LIMIT');
  const activeRules=new Map();for(const rule of allRules)if(!activeRules.has(rule.event_id))activeRules.set(rule.event_id,rule);
  let blocked=0,estimates=0;
  const items=simulated.items.map(employee=>{
    const warnings=employee.warnings.filter(w=>!w.includes('abatimento no IRRF ainda não está implementado.'));
    const dependentCount=dependentsByEmployee.get(employee.employee_id)||0;
    const events=employee.events||[];
    const missing=events.filter(ev=>{
      const rule=activeRules.get(ev.event_id);
      return !rule||[rule.inss,rule.irrf,rule.fgts].some(v=>!['SIM','NAO'].includes(v));
    });
    if(missing.length)warnings.push('Defina INSS, IRRF e FGTS de todos os eventos: '+missing.map(ev=>ev.event_code).join(', ')+'.');
    if(employee.pending_count>0)warnings.push('Existe evento sem valor calculável.');
    if(dependentCount)warnings.push('Dedução de '+dependentCount+' dependente(s) informado(s) na data do pagamento: conferir elegibilidade legal e documentos.');
    if(employee.salary_base_reference===null)warnings.push('Salário-base ou vínculo exige análise de proporcionalidade.');
    // Incidência sobre DESCONTOS não é transformada automaticamente em redução de base.
    if(events.some(ev=>ev.type==='DESCONTO'&&['SIM'].includes(activeRules.get(ev.event_id)?.inss)))
      warnings.push('Desconto com incidência INSS exige tratamento específico e conferência.');
    if(events.some(ev=>ev.type==='DESCONTO'&&['SIM'].includes(activeRules.get(ev.event_id)?.irrf)))
      warnings.push('Desconto com incidência IRRF exige tratamento específico e conferência.');
    const incomplete=missing.length||employee.pending_count>0||employee.salary_base_reference===null||
      events.some(ev=>ev.value_preview===null)||
      events.some(ev=>ev.type==='DESCONTO'&&(activeRules.get(ev.event_id)?.inss==='SIM'||activeRules.get(ev.event_id)?.irrf==='SIM'||activeRules.get(ev.event_id)?.fgts==='SIM'));
    if(incomplete){blocked++;return {employee_id:employee.employee_id,employee_name:employee.employee_name,
      blocked:true,dependent_count:dependentCount,dependent_deduction:centsToMoney(dependentCount*18959),base_inss:null,base_irrf_gross:null,base_fgts:null,inss_estimate:null,irrf_estimate:null,
      fgts_estimate:null,irrf_base:null,irrf_before_reduction:null,irrf_reduction:null,
      pending_reasons:[...new Set(warnings)],events:events.map(ev=>({code:ev.event_code,name:ev.event_name,
        status:ev.status,amount:ev.value_preview,incidences:activeRules.get(ev.event_id)||null}))};}
    const reference=Math.round(employee.salary_base_reference*100);
    let inss=reference,irrf=reference,fgts=reference;
    for(const ev of events){
      const rule=activeRules.get(ev.event_id);
      if(!rule)throw new Error('Regra ausente depois da validação');
      if(ev.type!=='PROVENTO')continue;
      const amount=Math.round(ev.value_preview*100);
      if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Evento fora do limite');
      if(rule.inss==='SIM')inss+=amount;
      if(rule.irrf==='SIM')irrf+=amount;
      if(rule.fgts==='SIM')fgts+=amount;
    }
    const tax=payrollTaxHistoricalWithDependents(inss,irrf,fgts,competence,paid,dependentCount);
    estimates++;
    warnings.push('Cenário CLT padrão: dedução de dependentes informados; não contempla pensão judicial, outros vínculos, afastamento, rescisão, 13º ou férias.');
    warnings.push('IRRF baseado na data informada: '+paid+'. Outros pagamentos no mesmo mês não são consolidados.');
    warnings.push('Salário-base utiliza o histórico vigente na competência; confira todas as alterações e ocorrências.');
    warnings.push('FGTS estimado a 8%: encargo do empregador, não descontado do funcionário.');
    return {employee_id:employee.employee_id,employee_name:employee.employee_name,blocked:false,
      dependent_count:dependentCount,dependent_deduction:centsToMoney(tax.dependent_deduction_cents),
      base_inss:centsToMoney(inss),base_irrf_gross:centsToMoney(irrf),base_fgts:centsToMoney(fgts),
      inss_estimate:centsToMoney(tax.inss_cents),irrf_estimate:centsToMoney(tax.irrf_cents),
      fgts_estimate:centsToMoney(tax.fgts_cents),irrf_base:centsToMoney(tax.irrf_base_cents),
      irrf_before_reduction:centsToMoney(tax.irrf_original_cents),irrf_reduction:centsToMoney(tax.irrf_reduction_cents),
      irrf_deduction_type:tax.irrf_deduction_type,irrf_deduction:centsToMoney(tax.irrf_deduction_cents),
      pending_reasons:[...new Set(warnings)],events:events.map(ev=>({code:ev.event_code,name:ev.event_name,
        amount:ev.value_preview,incidences:activeRules.get(ev.event_id)||null}))};
  });
  return {kind:'TAX_SCENARIO_PREVIEW_HISTORICAL',competence:simulated.competence,year:Number(competence.slice(0,4)),
    payment_date:paid,tables:{inss_from:inssTable[0],inss_mode:inssTable[1],irrf_from:irrfTable[0]},
    items,estimated_employee_count:estimates,blocked_employee_count:blocked,
    read_only:true,scenario_only:true,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    payroll_net:null,message:'Cenário tributário CLT histórico 2020–2026, com dependentes informados na data de pagamento. Não gera impostos, FGTS, pagamentos ou contabilidade.',
    sources:{inss:'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
      irrf:'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/tabelas-do-imposto-de-renda/',
      fgts:'https://www.planalto.gov.br/ccivil_03/leis/l8036compilada.htm'}};
}

// ===== SAGAS Folha Etapa 09: PRÉVIA proporcional civil, sem folha homologada =====
// Os segmentos usam o número de dias do mês; esse critério é identificado para
// conferência e pode exigir ajuste conforme regras da folha e convenção coletiva.
// Ausências/férias/afastamentos não são presumidos como faltas descontáveis.
async function payrollLaborPreview(env,companyId,competenceId){
  const base=await payrollSalaryPreview(env,companyId,competenceId);
  const competence=base.competence.competence;
  const [year,month]=competence.split('-').map(Number);
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  const first=competence+'-01', last=competence+'-'+String(daysInMonth).padStart(2,'0');
  const queries={
    salary:`SELECT employee_id,effective_from,salary_cents FROM payroll_salary_history
      WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from,id LIMIT 5001`,
    functional:`SELECT employee_id,effective_from,situation FROM payroll_employee_functional_history
      WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from,id LIMIT 5001`,
    schedule:`SELECT employee_id,effective_from FROM payroll_work_schedule_history
      WHERE company_id=? AND effective_from>? AND effective_from<=? ORDER BY employee_id,effective_from,id LIMIT 5001`,
    occurrences:`SELECT employee_id,kind,start_date,end_date FROM payroll_employee_occurrences
      WHERE company_id=? AND start_date<=? AND end_date>=? ORDER BY employee_id,start_date,id LIMIT 5001`
  };
  const maps={};
  for(const [kind,sql] of Object.entries(queries)){
    const args=kind==='schedule'?[companyId,first,last]:kind==='occurrences'?[companyId,last,first]:[companyId,last];
    const r=await env.DB.prepare(sql).bind(...args).all();
    if((r.results||[]).length>5000)throw new HttpError(409,'Históricos numerosos demais para a prévia.','PREVIEW_LIMIT');
    const m=new Map();for(const record of r.results||[]){
      if(!m.has(record.employee_id))m.set(record.employee_id,[]);
      m.get(record.employee_id).push(record);
    }
    maps[kind]=m;
  }
  const items=[];
  for(const employee of base.items){
    const warnings=[];
    const salaries=maps.salary.get(employee.employee_id)||[];
    const functional=maps.functional.get(employee.employee_id)||[];
    const scheduleChanges=(maps.schedule.get(employee.employee_id)||[]).filter(r=>r.effective_from>first);
    const occurrences=maps.occurrences.get(employee.employee_id)||[];
    const admission=employee.admission_date>first?employee.admission_date:first;
    const daysEligible=Math.max(0,daysInMonth-Number(admission.slice(-2))+1);
    const segments=[];
    let salarySum=0n,matchedDays=0,missing=false,invalidFunction=false;
    for(let day=Number(admission.slice(-2));day<=daysInMonth;day++){
      const date=competence+'-'+String(day).padStart(2,'0');
      const applicable=salaries.filter(r=>r.effective_from<=date).at(-1)||null;
      const status=functional.filter(r=>r.effective_from<=date).at(-1)||null;
      if(status&&status.situation!=='ATIVO')invalidFunction=true;
      if(!applicable){missing=true;continue;}
      const cents=applicable.salary_cents;
      if(!Number.isSafeInteger(cents)||cents<0||cents>99999999999)
        throw new HttpError(409,'Salário histórico inválido.','DATA_INVALID');
      salarySum+=BigInt(cents);matchedDays++;
      const prior=segments.at(-1);
      if(prior&&prior.salary_cents===cents){prior.days++;prior.end_date=date;}
      else segments.push({start_date:date,end_date:date,days:1,salary_cents:cents});
    }
    if(missing)warnings.push('Falta salário com vigência cobrindo todos os dias desde a admissão nesta competência.');
    if(invalidFunction)warnings.push('Há situação funcional não ativa durante a competência; exige tratamento trabalhista.');
    if(occurrences.length)warnings.push('Há ocorrências: não foi presumido desconto ou remuneração de faltas, férias, licenças e afastamentos.');
    if(scheduleChanges.length)warnings.push('Jornada alterada dentro do mês: conferir divisor e reflexos dos eventos.');
    if(employee.flags.includes('SALARIO_EVENTO_DUPLICADO'))warnings.push('Há evento de salário lançado; verificar duplicidade com o salário do cadastro.');
    if(employee.pending_event_count)warnings.push('Existem eventos cuja fórmula ainda não foi calculada.');
    if(!employee.monthly_hours)warnings.push('Jornada histórica não informada; conferir divisor para eventos em horas.');
    if(admission>first)warnings.push('Admissão no mês: proporcionalidade demonstrativa por dias corridos do mês.');
    const referenceCents=missing||matchedDays!==daysEligible?null:Number((salarySum+BigInt(Math.floor(daysInMonth/2)))/BigInt(daysInMonth));
    if(referenceCents!==null&&!Number.isSafeInteger(referenceCents))throw new HttpError(409,'Valor proporcional fora do limite.','DATA_INVALID');
    const blocked=referenceCents===null||invalidFunction||occurrences.length>0||scheduleChanges.length>0||employee.flags.includes('SALARIO_EVENTO_DUPLICADO');
    const computed=segments.map(seg=>({...seg,
      salary_monthly:centsToMoney(seg.salary_cents),
      reference_amount:centsToMoney(Number((BigInt(seg.salary_cents)*BigInt(seg.days)+BigInt(Math.floor(daysInMonth/2)))/BigInt(daysInMonth)))}));
    const preview={employee_id:employee.employee_id,employee_name:employee.employee_name,
      admission_date:employee.admission_date,day_count:daysInMonth,days_employed:daysEligible,
      salary_reference:referenceCents===null?null:centsToMoney(referenceCents),
      salary_proportional_preview:blocked?null:centsToMoney(referenceCents),
      eligible_dependents:employee.eligible_dependents,occurrences_count:occurrences.length,
      segments:computed,occurrences:occurrences.map(o=>({kind:o.kind,start_date:o.start_date,end_date:o.end_date})),
      blocked, status:blocked?'PENDENTE':'SIMULACAO',warnings,
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false};
    items.push(preview);
  }
  return {kind:'LABOR_PROPORTIONAL_PREVIEW',competence:base.competence,
    method:'DIAS_CORRIDOS_DO_MES',month_days:daysInMonth,items,
    simulated_employee_count:items.filter(x=>!x.blocked).length,
    pending_employee_count:items.filter(x=>x.blocked).length,
    read_only:true,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    payroll_net:null,message:'Simulação civil de proporcionalidade salarial com históricos. Não é folha homologada. Ausências não são descontadas automaticamente.'};
}

// ===== IRRF: dependentes elegíveis informados; validação legal ainda requerida =====
// 2020–2026: dedução mensal por dependente de R$ 189,59. Opta pelo maior entre
// deduções legais (INSS + dependentes) e o desconto simplificado vigente.
function payrollTaxHistoricalWithDependents(baseInss,irrfGross,baseFgts,competence,paymentDate,dependents){
  if(!Number.isSafeInteger(dependents)||dependents<0||dependents>100)
    throw new HttpError(409,'Quantidade de dependentes incompatível.','DATA_INVALID');
  const original=payrollTaxHistorical(baseInss,irrfGross,baseFgts,competence,paymentDate);
  const table=histTable(HIST_IRRF,paymentDate.slice(0,7));
  const depCents=dependents*18959;
  const legal=original.inss_cents+depCents;
  const deduction=Math.max(legal,table[2]);
  const taxable=Math.max(0,irrfGross-deduction);
  const band=table[1].find(x=>taxable<=x[0]);
  const before=Math.max(0,payrollTaxRound(taxable*band[1],10000)-band[2]);
  let reduction=0;
  if(table[3]){
    if(irrfGross<=500000)reduction=Math.min(before,31289);
    else if(irrfGross<=735000)
      reduction=Math.min(before,Math.max(0,97862-payrollTaxRound(irrfGross*133145,1000000)));
  }
  return {...original,irrf_base_cents:taxable,irrf_original_cents:before,
    irrf_reduction_cents:reduction,irrf_cents:Math.max(0,before-reduction),
    dependent_count:dependents,dependent_deduction_cents:depCents,
    irrf_deduction_type:legal>=table[2]?'DEDUCOES_LEGAIS':'DESCONTO_SIMPLIFICADO',
    irrf_deduction_cents:deduction};
}

// ===== SAGAS Folha - Etapa 05: avaliador ARITMETICO de preview (somente leitura). =====
// Sintaxe SAGAS reduzida, NÃO é a linguagem proprietária de fórmulas do RM.
// Sem eval, Function, JS executável, persistência de envelope, impostos ou fechamento.
function payrollExprCents(formula, variables){
  const input=String(formula||'').trim();
  if(!input || input.length>180)throw new Error('FORMULA_FORA_DO_ESCOPO');
  const t=[];let i=0;
  while(i<input.length){
    const rest=input.slice(i);let m;
    if(/^\s+/.test(rest)){i+=/^\s+/.exec(rest)[0].length;continue;}
    if((m=/^\d+(?:\.\d+)?/.exec(rest))){
      if(m[0].replace(/\D/g,'').length>12)throw new Error('NUMERO_MUITO_GRANDE');
      t.push({type:'number',value:m[0]});i+=m[0].length;
    }else if((m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))){
      t.push({type:'name',value:m[0].toUpperCase()});i+=m[0].length;
    }else if('+-*/()'.includes(input[i])){t.push({type:input[i]});i++;}
    else throw new Error('FORMULA_FORA_DO_ESCOPO');
    if(t.length>80)throw new Error('FORMULA_MUITO_COMPLEXA');
  }
  const max=10n**38n;
  function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const c=a%b;a=b;b=c;}return a||1n;}
  function rat(a,b=1n){
    if(b===0n)throw new Error('DIVISAO_ZERO');
    if(b<0n){a=-a;b=-b;}
    const g=gcd(a,b);a/=g;b/=g;
    if(a>max||a < -max||b>max)throw new Error('FORMULA_FORA_DO_LIMITE');
    return {a,b};
  }
  function decimal(x){const parts=x.split('.'),scale=10n**BigInt(parts[1]?.length||0);return rat(BigInt(parts[0]+(parts[1]||'')),scale);}
  const op=(l,r,kind)=>{
    if(kind==='+')return rat(l.a*r.b+r.a*l.b,l.b*r.b);
    if(kind==='-')return rat(l.a*r.b-r.a*l.b,l.b*r.b);
    if(kind==='*')return rat(l.a*r.a,l.b*r.b);
    return rat(l.a*r.b,l.b*r.a);
  };
  let j=0;
  function factor(depth){
    if(depth>18)throw new Error('FORMULA_MUITO_COMPLEXA');
    let x=t[j];if(!x)throw new Error('FORMULA_INCOMPLETA');
    if(x.type==='+'||x.type==='-'){j++;const v=factor(depth+1);return x.type==='-'?rat(-v.a,v.b):v;}
    if(x.type==='('){j++;const v=expr(depth+1);if(t[j]?.type!==')')throw new Error('PARENTESES_INVALIDOS');j++;return v;}
    j++;
    if(x.type==='number')return decimal(x.value);
    if(x.type==='name'){
      if(!Object.prototype.hasOwnProperty.call(variables,x.value))throw new Error('VARIAVEL_NAO_DISPONIVEL');
      return variables[x.value];
    }
    throw new Error('FORMULA_INVALIDA');
  }
  function term(depth){let v=factor(depth);while(t[j]?.type==='*'||t[j]?.type==='/'){const k=t[j++].type;v=op(v,factor(depth),k);}return v;}
  function expr(depth){let v=term(depth);while(t[j]?.type==='+'||t[j]?.type==='-'){const k=t[j++].type;v=op(v,term(depth),k);}return v;}
  const v=expr(0);
  if(j!==t.length)throw new Error('FORMULA_INVALIDA');
  if(v.a<0n)throw new Error('VALOR_NEGATIVO');
  const cents=(v.a*100n*2n+v.b)/(2n*v.b); // arredondamento half-up, sem float
  if(cents>99999999999n)throw new Error('VALOR_FORA_DO_LIMITE');
  return Number(cents);
}

async function payrollEventCalculationPreview(env,companyId,competenceId){
  // A prévia já protege limites e isola empresa/competência, sem fazer operações de escrita.
  const salaryPreview=await payrollSalaryPreview(env,companyId,competenceId);
  const competence=salaryPreview.competence.competence;
  const eventsResult=await env.DB.prepare(`SELECT m.id,m.employee_id,m.event_id,m.unit,m.amount_cents,m.quantity_milli,
        v.code AS event_code,v.name AS event_name,v.event_type
      FROM payroll_movements m
      JOIN payroll_events v ON v.id=m.event_id AND v.company_id=m.company_id
      WHERE m.company_id=? AND m.competence_id=?
      ORDER BY m.employee_id,v.code,m.id`).bind(companyId,competenceId).all();
  const allEvents=eventsResult.results||[];
  if(allEvents.length>5000)throw new HttpError(409,'Número de movimentos superior ao limite de prévia.','PREVIEW_LIMIT');
  const ruleResult=await env.DB.prepare(`SELECT r.event_id,r.effective_from,r.revision,r.priority,r.calculation_code,
        r.formula_text,r.inss,r.irrf,r.fgts
      FROM payroll_event_rule_versions r
      WHERE r.company_id=? AND r.effective_from<=? AND r.event_id IN (
        SELECT DISTINCT event_id FROM payroll_movements WHERE company_id=? AND competence_id=?)
      ORDER BY r.event_id,r.effective_from DESC,r.revision DESC LIMIT 5001`)
    .bind(companyId,competence,companyId,competenceId).all();
  const rules=ruleResult.results||[];
  if(rules.length>5000)throw new HttpError(409,'Histórico de regras superior ao limite de prévia.','RULES_LIMIT');
  const latest=new Map();for(const rule of rules)if(!latest.has(rule.event_id))latest.set(rule.event_id,rule);
  const byEmployee=new Map();for(const movement of allEvents){
    if(!byEmployee.has(movement.employee_id))byEmployee.set(movement.employee_id,[]);
    byEmployee.get(movement.employee_id).push(movement);
  }
  const items=[];let pendingCount=0,calculatedCount=0;
  for(const emp of salaryPreview.items){
    const fullMonth=emp.salary_base_preview!==null && !emp.flags.includes('SALARIO_EVENTO_DUPLICADO');
    let plus=0,minus=0,unresolved=0;const details=[],warnings=[...emp.warnings];
    for(const mov of byEmployee.get(emp.employee_id)||[]){
      const rule=latest.get(mov.event_id)||null;
      let amount=null,status='INFORMADO',note='Valor lançado manualmente';
      if(mov.unit==='VALOR'){
        if(!Number.isSafeInteger(mov.amount_cents)||mov.amount_cents<0)throw new HttpError(409,'Movimento monetário inválido.','DATA_INVALID');
        amount=mov.amount_cents;
      }else if(!rule || !String(rule.formula_text||'').trim()){
        status='PENDENTE';note='Evento sem fórmula vigente';
      }else if(Number(rule.calculation_code)!==0){
        status='PENDENTE';note='Código de cálculo especial ainda não implementado';
      }else if(!fullMonth){
        status='PENDENTE';note='Vínculo ou salário-base exige conferência';
      }else {
        const variables={SALARIO:{a:BigInt(Math.round(emp.salary_base_preview*100)),b:100n},
          REFERENCIA:{a:BigInt(mov.quantity_milli),b:1000n},
          QUANTIDADE:{a:BigInt(mov.quantity_milli),b:1000n}};
        if(emp.monthly_hours!==null)variables.JORNADA_MENSAL={a:BigInt(Math.round(emp.monthly_hours*1000)),b:1000n};
        if(mov.unit==='HORAS')variables.HORAS=variables.REFERENCIA;
        if(mov.unit==='DIAS')variables.DIAS=variables.REFERENCIA;
        if(mov.unit==='PERCENTUAL')variables.PERCENTUAL=variables.REFERENCIA;
        try{amount=payrollExprCents(rule.formula_text,variables);status='CALCULADO_PREVIA';note='Fórmula aritmética SAGAS';calculatedCount++;}
        catch(e){status='PENDENTE';note='Fórmula não suportada: '+String(e?.message||'erro de cálculo');}
      }
      if(amount===null){unresolved++;pendingCount++;}
      else if(mov.event_type==='PROVENTO')plus+=amount;
      else if(mov.event_type==='DESCONTO')minus+=amount;
      else if(mov.event_type!=='INFORMATIVO')throw new HttpError(409,'Tipo de evento inválido.','DATA_INVALID');
      if(!Number.isSafeInteger(plus)||!Number.isSafeInteger(minus))throw new HttpError(409,'Total excede o limite seguro.','DATA_INVALID');
      const taxPending=!rule || [rule.inss,rule.irrf,rule.fgts].some(x=>x==='PENDENTE');
      if(taxPending)warnings.push('Incidências não confirmadas para '+mov.event_code+'.');
      details.push({id:mov.id,event_id:mov.event_id,event_code:mov.event_code,event_name:mov.event_name,type:mov.event_type,
        unit:mov.unit,reference:mov.unit==='VALOR'?centsToMoney(mov.amount_cents):Number(mov.quantity_milli)/1000,
        value_preview:amount===null?null:centsToMoney(amount),status,note,
        priority:rule?rule.priority:null,rule_version:rule?rule.effective_from+'#'+rule.revision:null,
        formula_text:mov.unit==='VALOR'?null:(rule?.formula_text||null),
        calculation_code:rule?Number(rule.calculation_code):null,
        incidences_checked:!taxPending});
    }
    details.sort((a,b)=>(a.priority??99)-(b.priority??99)||a.event_code.localeCompare(b.event_code)||a.id.localeCompare(b.id));
    if(unresolved)warnings.push(unresolved+' evento(s) sem valorização nesta competência.');
    const salary=fullMonth?Math.round(emp.salary_base_preview*100):null;
    const subtotal=salary!==null && unresolved===0 ? salary+plus-minus:null;
    if(subtotal!==null&&!Number.isSafeInteger(subtotal))throw new HttpError(409,'Subtotal excede o limite seguro.','DATA_INVALID');
    items.push({employee_id:emp.employee_id,employee_name:emp.employee_name,admission_date:emp.admission_date,
      salary_base_reference:salary===null?null:centsToMoney(salary),proventos_eventos:centsToMoney(plus),
      descontos_eventos:centsToMoney(minus),subtotal_aritmetico:subtotal===null?null:centsToMoney(subtotal),
      events:details,pending_count:unresolved,eligible_dependents:emp.eligible_dependents,warnings:[...new Set(warnings)],
      ready_for_payroll:false,liquid:null});
  }
  const orphanMovements=allEvents.filter(m=>!items.some(i=>i.employee_id===m.employee_id)).length;
  return {kind:'EVENT_FORMULA_PREVIEW',competence:salaryPreview.competence,items,
    movement_count:allEvents.length,formula_calculated_count:calculatedCount,
    unresolved_event_count:pendingCount,orphan_movement_count:orphanMovements,
    read_only:true,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    payroll_net:null,taxes_calculated:false,
    message:'Simulação aritmética de eventos lançados. NÃO é envelope, folha homologada ou salário líquido.'};
}


// SAGAS Folha Etapa 10 — demonstrativo de CONFERÊNCIA por funcionário.
// Agrega prévias existentes; não cria envelope final nem grava cálculos/financeiro/contábil.
// Para evitar divergência de origem, tributação só é exibida se o salário considerado
// pelo motor de eventos corresponder à referência proporcional trabalhista.
async function payrollConferencePreview(env,companyId,competenceId,paymentDate){
  const paid=histPaymentDate(paymentDate);
  const [labor,events,tax]=await Promise.all([
    payrollLaborPreview(env,companyId,competenceId),
    payrollEventCalculationPreview(env,companyId,competenceId),
    payrollTaxPreviewHistorical(env,companyId,competenceId,paid)
  ]);
  if(labor.competence.id!==events.competence.id||labor.competence.id!==tax.competence.id)
    throw new HttpError(409,'Incompatibilidade de competências entre as prévias.','PREVIEW_MISMATCH');
  const eventsByEmployee=new Map(events.items.map(x=>[x.employee_id,x]));
  const taxesByEmployee=new Map(tax.items.map(x=>[x.employee_id,x]));
  let pending=0,arithmetics=0,eligibleTax=0;
  function cents(n){
    if(typeof n!=='number'||!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100)))return null;
    const result=Math.round(n*100);
    if(Math.abs(n*100-result)>0.000001)return null;
    return result;
  }
  const items=labor.items.map(work=>{
    const calc=eventsByEmployee.get(work.employee_id)||null;
    const fiscal=taxesByEmployee.get(work.employee_id)||null;
    const reasons=[],notices=[];
    const add=(arr,msg)=>{if(typeof msg==='string'&&msg.trim()&&!arr.includes(msg))arr.push(msg)};
    for(const w of work.warnings||[])add(notices,w);
    for(const w of calc?.warnings||[])if(!/Não foram calculados INSS|não é salário líquido/i.test(w))add(notices,w);
    for(const w of fiscal?.pending_reasons||[])add(notices,w);
    if(work.blocked||work.salary_proportional_preview===null)
      add(reasons,'Salário e ocorrências trabalhistas precisam de conferência antes de montar o subtotal.');
    if(!calc)add(reasons,'Não foi possível vincular os eventos deste funcionário.');
    if(calc&&calc.pending_count>0)add(reasons,calc.pending_count+' evento(s) com cálculo pendente.');
    const salaryCents=cents(work.salary_proportional_preview);
    const eventsSalaryCents=cents(calc?.salary_base_reference);
    const pCents=cents(calc?.proventos_eventos),dCents=cents(calc?.descontos_eventos);
    // Apenas referências idênticas autorizam uma soma aritmética nesta etapa;
    // admissão parcial pode ser exibida à parte, nunca combinada sem motor próprio.
    const compatible=salaryCents!==null&&eventsSalaryCents!==null&&salaryCents===eventsSalaryCents;
    if(salaryCents!==null&&!compatible)
      add(reasons,'A referência salarial dos eventos difere da proporcionalidade; não somar parcelas automaticamente.');
    const subtotalAllowed=!work.blocked&&compatible&&calc?.pending_count===0&&pCents!==null&&dCents!==null;
    const subtotalCents=subtotalAllowed?salaryCents+pCents-dCents:null;
    if(subtotalCents!==null&&!Number.isSafeInteger(subtotalCents))throw new HttpError(409,'Subtotal aritmético fora do limite.','DATA_INVALID');
    if(subtotalCents!==null)arithmetics++;
    // Cenário tributário opcional e informativo: não soma ao subtotal, não produz líquido.
    const taxAllowed=subtotalAllowed&&fiscal&&!fiscal.blocked&&
      cents(fiscal.base_inss)!==null&&cents(fiscal.inss_estimate)!==null&&
      cents(fiscal.irrf_estimate)!==null&&cents(fiscal.fgts_estimate)!==null;
    if(!taxAllowed)add(reasons,'Cenário tributário ainda não validado para este funcionário.');
    if(taxAllowed)eligibleTax++;
    const issues=reasons.length>0;
    if(issues)pending++;
    return {employee_id:work.employee_id,employee_name:work.employee_name,
      admission_date:work.admission_date,days_employed:work.days_employed,day_count:work.day_count,
      salary_reference:work.salary_reference,
      salary_proportional_preview:work.salary_proportional_preview,
      salary_event_reference:calc?.salary_base_reference??null,
      proventos_eventos:calc?.proventos_eventos??null,
      descontos_eventos:calc?.descontos_eventos??null,
      subtotal_aritmetico:subtotalCents===null?null:centsToMoney(subtotalCents),
      occurrences_count:work.occurrences_count,segments:work.segments||[],
      occurrences:work.occurrences||[],events:calc?.events||[],
      pending_event_count:calc?.pending_count??null,
      tax_scenario:taxAllowed?{
        base_inss:fiscal.base_inss,inss_estimate:fiscal.inss_estimate,
        base_irrf_gross:fiscal.base_irrf_gross,irrf_base:fiscal.irrf_base,
        irrf_estimate:fiscal.irrf_estimate,base_fgts:fiscal.base_fgts,
        fgts_estimate:fiscal.fgts_estimate,dependent_count:fiscal.dependent_count,
        irrf_deduction:fiscal.irrf_deduction,irrf_deduction_type:fiscal.irrf_deduction_type
      }:null,
      status:issues?'PENDENTE':'CONFERENCIA',pendencias:reasons,observacoes:notices,
      salario_liquido:null,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false};
  });
  // Não silenciar lançamentos órfãos ou funcionários que não puderam ser incluídos.
  if(events.orphan_movement_count>0)pending+=events.orphan_movement_count;
  return {kind:'CONFERENCIA_DEMONSTRATIVO_FOLHA',competence:labor.competence,
    payment_date:paid,tables:tax.tables,items,
    employee_count:items.length,pending_employee_count:pending,
    arithmetic_subtotal_count:arithmetics,tax_scenario_count:eligibleTax,
    orphan_movement_count:events.orphan_movement_count||0,
    read_only:true,scenario_only:true,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,
    message:'Demonstrativo de conferência: proventos, descontos, referências, tributos ilustrativos e pendências. Não é contracheque, remuneração homologada ou valor líquido a pagar.'};
}


// SAGAS Folha Etapa 11 — revisao explicita de ocorrencias e envelope de conferencia.
// Classificar uma ocorrencia NAO autoriza, por si so, desconto, pagamento ou fechamento.
const PAYROLL_OCCURRENCE_TREATMENTS={
  FALTA:['PENDENTE','ABONADA','DESCONTO_A_CONFERIR'],
  AFASTAMENTO:['PENDENTE','EMPRESA_A_CONFERIR','BENEFICIO_A_CONFERIR'],
  FERIAS:['PENDENTE','FERIAS_A_CONFERIR'],
  LICENCA:['PENDENTE','REMUNERADA_A_CONFERIR','NAO_REMUNERADA_A_CONFERIR']
};
async function ensurePayrollOccurrenceReviewSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_occurrence_reviews (
      company_id TEXT NOT NULL,occurrence_id TEXT NOT NULL,
      treatment TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(company_id,occurrence_id),
      FOREIGN KEY(occurrence_id) REFERENCES payroll_employee_occurrences(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_occurrence_reviews_company
      ON payroll_occurrence_reviews(company_id,occurrence_id)`)
  ]);
}
async function payrollOccurrenceReviewSave(env,request,auth,companyId,occurrenceId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  await ensureSchemaRevision(env,'payroll-occurrence-reviews',1,()=>ensurePayrollOccurrenceReviewSchema(env));
  const occurrence=await env.DB.prepare(`SELECT id,kind,employee_id,start_date,end_date
    FROM payroll_employee_occurrences WHERE company_id=? AND id=?`).bind(companyId,occurrenceId).first();
  if(!occurrence)throw new HttpError(404,'Ocorrencia nao encontrada nesta empresa.','NOT_FOUND');
  const treatment=String(required(body?.treatment,'tratamento')||'').trim().toUpperCase();
  if(!(PAYROLL_OCCURRENCE_TREATMENTS[occurrence.kind]||[]).includes(treatment))
    throw new HttpError(400,'Tratamento incompativel com o tipo da ocorrencia.','VALIDATION_ERROR');
  const notes=cleanText(body?.notes||'',500)||'';
  const before=await env.DB.prepare(`SELECT * FROM payroll_occurrence_reviews
    WHERE company_id=? AND occurrence_id=?`).bind(companyId,occurrenceId).first();
  await env.DB.prepare(`INSERT INTO payroll_occurrence_reviews
    (company_id,occurrence_id,treatment,notes,updated_by,updated_at)
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,occurrence_id) DO UPDATE SET
      treatment=excluded.treatment,notes=excluded.notes,
      updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(companyId,occurrenceId,treatment,notes,auth.user.id).run();
  const after=await env.DB.prepare(`SELECT * FROM payroll_occurrence_reviews
    WHERE company_id=? AND occurrence_id=?`).bind(companyId,occurrenceId).first();
  await audit(env,{companyId,userId:auth.user.id,action:before?'UPDATE':'CREATE',
    entity:'payroll_occurrence_reviews',entityId:occurrenceId,before,after,request});
  return {occurrence_id:occurrenceId,employee_id:occurrence.employee_id,kind:occurrence.kind,
    treatment:after.treatment,notes:after.notes,updated_at:after.updated_at,
    pay_calculated:false,ready_for_payroll:false};
}
function payrollCalendarDayIndex(date){
  const [y,m,d]=date.split('-').map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}
async function payrollEnvelopePreview(env,companyId,competenceId,paymentDate){
  await ensureSchemaRevision(env,'payroll-occurrence-reviews',1,()=>ensurePayrollOccurrenceReviewSchema(env));
  const conference=await payrollConferencePreview(env,companyId,competenceId,paymentDate);
  const month=conference.competence.competence;
  const [year,number]=month.split('-').map(Number);
  const first=month+'-01';
  const last=month+'-'+String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,'0');
  const r=await env.DB.prepare(`SELECT o.id,o.employee_id,o.kind,o.start_date,o.end_date,o.notes,
      v.treatment,v.notes AS review_notes,v.updated_at AS reviewed_at
    FROM payroll_employee_occurrences o
    LEFT JOIN payroll_occurrence_reviews v ON v.company_id=o.company_id AND v.occurrence_id=o.id
    WHERE o.company_id=? AND o.start_date<=? AND o.end_date>=?
    ORDER BY o.employee_id,o.start_date,o.id LIMIT 5001`).bind(companyId,last,first).all();
  if((r.results||[]).length>5000)
    throw new HttpError(409,'Ocorrencias numerosas demais; selecione uma competencia menor.','PREVIEW_LIMIT');
  const grouped=new Map();
  for(const rec of r.results||[]){
    if(!grouped.has(rec.employee_id))grouped.set(rec.employee_id,[]);
    grouped.get(rec.employee_id).push(rec);
  }
  let occurrencesCount=0,pendingOccurrences=0,overlapEmployeeCount=0;
  const items=conference.items.map(employee=>{
    const source=grouped.get(employee.employee_id)||[];
    const days=new Set();let overlap=false;
    const occurrences=source.map(o=>{
      const from=o.start_date>first?o.start_date:first;
      const to=o.end_date<last?o.end_date:last;
      const qty=payrollCalendarDayIndex(to)-payrollCalendarDayIndex(from)+1;
      if(qty<=0||qty>31)throw new HttpError(409,'Intervalo da ocorrencia inconsistente.','DATA_INVALID');
      for(let dt=payrollCalendarDayIndex(from);dt<=payrollCalendarDayIndex(to);dt++){
        if(days.has(dt))overlap=true;
        days.add(dt);
      }
      const treatment=(PAYROLL_OCCURRENCE_TREATMENTS[o.kind]||[]).includes(o.treatment)
        ?o.treatment:'PENDENTE';
      const pending=treatment==='PENDENTE';
      if(pending)pendingOccurrences++;
      occurrencesCount++;
      return {id:o.id,employee_id:o.employee_id,kind:o.kind,
        start_date:o.start_date,end_date:o.end_date,
        within_competence_from:from,within_competence_to:to,days_in_competence:qty,
        treatment,notes:o.notes||'',review_notes:o.review_notes||'',reviewed_at:o.reviewed_at||null,
        treatment_options:PAYROLL_OCCURRENCE_TREATMENTS[o.kind]||['PENDENTE'],pending,
        remuneration_impact:null,dsr_impact:null,tax_impact:null};
    });
    if(overlap)overlapEmployeeCount++;
    const blockers=[...new Set(employee.pendencias||[])];
    if(occurrences.some(o=>o.pending))blockers.push('Ha ocorrencias sem classificacao remuneratoria.');
    if(overlap)blockers.push('Ha dias de ocorrencias sobrepostos; nao somar dias por registro.');
    if(occurrences.some(o=>!o.pending))
      blockers.push('Tratamentos registrados ainda exigem calculo e validacao dos reflexos (DSR, previdencia e outros).');
    return {employee_id:employee.employee_id,employee_name:employee.employee_name,
      admission_date:employee.admission_date,base_reference:employee.salary_reference,
      salary_proportional_preview:employee.salary_proportional_preview,
      proventos_eventos:employee.proventos_eventos,descontos_eventos:employee.descontos_eventos,
      subtotal_aritmetico:employee.subtotal_aritmetico,
      events:employee.events||[],salary_segments:employee.segments||[],
      occurrences,occurrences_count:occurrences.length,distinct_occurrence_days:days.size,
      overlapping_occurrence_days:overlap,
      pending_count:blockers.length,status:blockers.length?'PENDENTE':'EM_CONFERENCIA',
      pendencias:blockers,observacoes:employee.observacoes||[],tax_scenario:employee.tax_scenario,
      remuneration_from_occurrences:null,net_pay:null,
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false};
  });
  // Nunca incluir registros de funcionarios nao contemplados pela competencia nem
  // tentar montar envelopes para colaboradores de empresa diversa.
  const matched=new Set(items.map(i=>i.employee_id));
  const orphanOccurrenceCount=(r.results||[]).filter(o=>!matched.has(o.employee_id)).length;
  return {kind:'ENVELOPE_PRELIMINAR_ETAPA_11',competence:conference.competence,
    payment_date:conference.payment_date,items,
    employee_count:items.length,occurrence_count:occurrencesCount,
    pending_occurrence_count:pendingOccurrences,
    overlapping_employee_count:overlapEmployeeCount,orphan_occurrence_count:orphanOccurrenceCount,
    pending_employee_count:items.filter(i=>i.status==='PENDENTE').length,
    read_only:true,preview_only:true,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,
    message:'Envelopes preliminares de conferencia: dias de faltas, ferias, licencas e afastamentos, classificacoes e pendencias. Nenhum desconto de ausencia, DSR, liquido, fechamento, financeiro ou contabilizacao e efetuado.'};
}

// ===== SAGAS Folha Etapa 12: projeção remuneratória controlada =====
// Este cálculo NÃO lança eventos, descontos, DSR, verbas a pagar ou contabilidade.
// Divisor 30: estimativa apenas para mensalistas, exige confirmação das regras
// contratuais/coletivas e das justificativas antes da folha efetiva.
function payrollRemunerationRoundCents(numerator,divisor){
  if(numerator<0n||divisor<=0n)throw new HttpError(409,'Base monetária inválida.','DATA_INVALID');
  const result=(numerator+divisor/2n)/divisor;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new HttpError(409,'Valor monetário excede limite seguro.','DATA_INVALID');
  return Number(result);
}
function payrollRemunerationWeek(date){
  const index=payrollCalendarDayIndex(date);
  // Segunda-feira da semana civil: etiqueta para CONFERÊNCIA de DSR.
  const day=new Date(index*86400000).getUTCDay();
  return new Date((index-(day+6)%7)*86400000).toISOString().slice(0,10);
}
function payrollRemunerationDay(dateIndex){return new Date(dateIndex*86400000).toISOString().slice(0,10);}
async function payrollRemunerationPreview(env,companyId,competenceId,paymentDate){
  const envelope=await payrollEnvelopePreview(env,companyId,competenceId,paymentDate);
  const items=envelope.items.map(employee=>{
    const issues=[],warnings=[],daysToDeduct=new Set(),affectedWeeks=new Set();
    const occurrences=employee.occurrences||[];
    const salarySegments=employee.salary_segments||[];
    let eligible=true;
    if(employee.overlapping_occurrence_days){
      issues.push('Ocorrências sobrepostas: não é possível apurar dias sem resolver a sobreposição.');
      eligible=false;
    }
    const missingSalary=employee.base_reference===null||!Number.isFinite(employee.base_reference);
    if(missingSalary){
      issues.push('Histórico salarial não cobre o período de referência.');eligible=false;
    }
    const admission=employee.admission_date||null;
    const findSalary=(day)=>{
      const seg=salarySegments.find(x=>x.start_date<=day&&x.end_date>=day);
      return seg&&Number.isSafeInteger(seg.salary_cents)&&seg.salary_cents>=0?seg.salary_cents:null;
    };
    let hasPendingTreatment=false,hasNonCalculable=false;
    const breakdown=[];
    for(const o of occurrences){
      const status=o.treatment||'PENDENTE';
      if(status==='PENDENTE'){hasPendingTreatment=true;issues.push('Ocorrência sem tratamento: '+o.kind+' ('+o.start_date+').');}
      const row={id:o.id,kind:o.kind,treatment:status,from:o.within_competence_from,to:o.within_competence_to,
        days:o.days_in_competence,estimated_discount:null,method:null,dsr_pending:false,
        company_first15_days:null,benefit_after15_days:null};
      if(o.kind==='FALTA'&&status==='ABONADA'){
        row.estimated_discount=0;row.method='SEM_DESCONTO_POR_ABONO_CONFERIDO';
      }else if(o.kind==='FALTA'&&status==='DESCONTO_A_CONFERIR'){
        row.method='SALARIO_HISTORICO_DIVIDIDO_POR_30';row.dsr_pending=true;
        for(let n=payrollCalendarDayIndex(row.from);n<=payrollCalendarDayIndex(row.to);n++){
          const day=payrollRemunerationDay(n);
          if(!admission||day<admission){eligible=false;issues.push('Falta anterior à admissão na competência.');}
          daysToDeduct.add(day);affectedWeeks.add(payrollRemunerationWeek(day));
        }
      }else if(o.kind==='AFASTAMENTO'){
        // A contagem desde o início do afastamento é informativa: sem pressupor causa
        // médica, concessão do benefício, continuidade ou responsabilidade da empresa.
        let first=0,after=0;
        for(let n=payrollCalendarDayIndex(row.from);n<=payrollCalendarDayIndex(row.to);n++){
          const since=n-payrollCalendarDayIndex(o.start_date)+1;
          if(since>=1&&since<=15)first++;else if(since>15)after++;
        }
        row.company_first15_days=first;row.benefit_after15_days=after;
        hasNonCalculable=true;
        warnings.push('Afastamento: 15 primeiros dias e período posterior são informativos; confirmar espécie, vínculo e continuidade.');
      }else if(o.kind==='FERIAS'||o.kind==='LICENCA'){
        hasNonCalculable=true;
        warnings.push(o.kind==='FERIAS'?'Férias precisam de verbas, períodos e incidências próprios.':'Licença depende de fundamento legal e remuneração acordada.');
      }
      breakdown.push(row);
    }
    if(daysToDeduct.size>30){
      eligible=false;issues.push('Mais de 30 dias de faltas no mês: regra com divisor 30 exige tratamento específico.');
    }
    if(hasPendingTreatment){eligible=false;}
    if(hasNonCalculable){eligible=false;issues.push('Outras ocorrências exigem cálculo específico antes de fechar a remuneração.');}
    let numerator=0n,found=0;
    for(const day of daysToDeduct){
      const cents=findSalary(day);
      if(cents===null){eligible=false;issues.push('Vigência salarial indisponível para o dia '+day+'.');continue;}
      numerator+=BigInt(cents);found++;
    }
    // Mesmo sem faltas, '0' só é afirmado quando há histórico suficiente e todas
    // as ocorrências foram classificadas. O contrário seria falso zero.
    const calculated=eligible&&found===daysToDeduct.size;
    const discountCents=calculated?payrollRemunerationRoundCents(numerator,30n):null;
    if(daysToDeduct.size)warnings.push('Estimativa = soma dos salários diários históricos / 30; DSR e incidências ainda pendentes.');
    if(daysToDeduct.size)issues.push('Possível perda de DSR: verificar jornada semanal, justificativas, feriados e norma coletiva.');
    // A estimativa nunca vira desconto definitivo e não interfere no subtotal anterior.
    return {...employee,remuneration_preview:{
      method:'DIAS_DE_FALTA_X_SALARIO_VIGENTE_DIV_30',
      deduction_days:daysToDeduct.size,
      absence_discount_estimate:discountCents===null?null:centsToMoney(discountCents),
      absence_discount_calculated:calculated,
      dsr_weeks_to_review:[...affectedWeeks].sort(),
      dsr_discount:null,fgts_adjustment:null,inss_adjustment:null,irrf_adjustment:null,
      company_benefit_adjustment:null,net_pay:null,
      breakdown,issues:[...new Set(issues)],warnings:[...new Set(warnings)],
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false
    }};
  });
  return {...envelope,kind:'REMUNERACAO_PRELIMINAR_ETAPA_12',items,
    eligible_absence_estimate_count:items.filter(x=>x.remuneration_preview.absence_discount_calculated).length,
    pending_remuneration_count:items.filter(x=>x.remuneration_preview.issues.length>0).length,
    read_only:true,preview_only:true,ready_for_payroll:false,ready_for_closure:false,
    ready_for_payment:false,ready_for_accounting:false,folha_liquida:null,
    message:'Etapa 12: estimativa não homologada de faltas descontáveis, sem DSR, encargos, líquido, pagamentos, fechamento ou contabilidade.'};
}

// ===== SAGAS Folha Etapa 13: conferência do DSR por semana e afastamentos =====
// SIMULAÇÃO, nunca gera rubrica, pagamento, fechamento ou contabilidade.
// Repouso semanal não se confunde com sua remuneração; feriados, escalas e CCT
// exigem conferência externa. Uma semana jamais duplica seu DSR neste cenário.
const PAYROLL_DSR_TREATMENTS=['PENDENTE','MANTER_REMUNERACAO','DESCONTO_A_CONFERIR'];
async function ensurePayrollDsrReviewSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_dsr_reviews (
      company_id TEXT NOT NULL,competence_id TEXT NOT NULL,employee_id TEXT NOT NULL,
      week_start TEXT NOT NULL,rest_date TEXT,
      treatment TEXT NOT NULL CHECK(treatment IN ('PENDENTE','MANTER_REMUNERACAO','DESCONTO_A_CONFERIR')),
      notes TEXT NOT NULL DEFAULT '',updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(company_id,competence_id,employee_id,week_start),
      FOREIGN KEY(employee_id) REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      FOREIGN KEY(competence_id) REFERENCES payroll_competences(id) ON DELETE RESTRICT
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_dsr_review_comp
      ON payroll_dsr_reviews(company_id,competence_id,employee_id)`)
  ]);
}
async function payrollDsrReviewSave(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const competenceId=String(required(body?.competence_id,'competência'));
  const employeeId=String(required(body?.employee_id,'funcionário'));
  const weekStart=payrollStrictDate(body?.week_start,'início da semana');
  if(payrollRemunerationWeek(weekStart)!==weekStart)
    throw new HttpError(400,'A semana precisa iniciar na segunda-feira.','VALIDATION_ERROR');
  const treatment=String(required(body?.treatment,'tratamento')).trim().toUpperCase();
  if(!PAYROLL_DSR_TREATMENTS.includes(treatment))
    throw new HttpError(400,'Tratamento de DSR inválido.','VALIDATION_ERROR');
  const restDate=body?.rest_date?payrollStrictDate(body.rest_date,'data do repouso'):null;
  const notes=cleanText(body?.notes||'',500)||'';
  if(treatment==='DESCONTO_A_CONFERIR'&&(!restDate||notes.trim().length<5))
    throw new HttpError(400,'Para estimar DSR, informe data do repouso e justificativa da conferência.','VALIDATION_ERROR');
  if(restDate){
    const diff=payrollCalendarDayIndex(restDate)-payrollCalendarDayIndex(weekStart);
    if(diff<0||diff>13)throw new HttpError(400,'Data do repouso incompatível com a semana informada.','VALIDATION_ERROR');
  }
  await payrollReadOpenCompetence(env,companyId,competenceId);
  await ensureSchemaRevision(env,'payroll-dsr-reviews',1,()=>ensurePayrollDsrReviewSchema(env));
  const period=await env.DB.prepare(`SELECT competence FROM payroll_competences WHERE company_id=? AND id=?`)
    .bind(companyId,competenceId).first();
  // Não pode selecionar semana desconectada da competência.
  if(weekStart>period.competence+'-31' ||
     payrollCalendarDayIndex(weekStart)+6<payrollCalendarDayIndex(period.competence+'-01'))
    throw new HttpError(400,'Semana fora da competência selecionada.','VALIDATION_ERROR');
  const employee=await env.DB.prepare(`SELECT id FROM payroll_employees WHERE company_id=? AND id=?`)
    .bind(companyId,employeeId).first();
  if(!employee)throw new HttpError(404,'Funcionário não encontrado na empresa.','NOT_FOUND');
  // Aceita somente semana realmente afetada por falta classificada na competência.
  // A API jamais cria revisões arbitrárias para semanas sem ocorrência.
  const month=period.competence;
  const [year,number]=month.split('-').map(Number);
  const first=month+'-01',last=month+'-'+String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,'0');
  const occ=await env.DB.prepare(`SELECT o.start_date,o.end_date,o.kind,v.treatment
    FROM payroll_employee_occurrences o
    LEFT JOIN payroll_occurrence_reviews v ON v.company_id=o.company_id AND v.occurrence_id=o.id
    WHERE o.company_id=? AND o.employee_id=? AND o.kind='FALTA' AND
      v.treatment='DESCONTO_A_CONFERIR' AND o.start_date<=? AND o.end_date>=?`)
    .bind(companyId,employeeId,last,first).all();
  const matched=(occ.results||[]).some(o=>{
    const start=o.start_date>first?o.start_date:first;
    const end=o.end_date<last?o.end_date:last;
    for(let i=payrollCalendarDayIndex(start);i<=payrollCalendarDayIndex(end);i++)
      if(payrollRemunerationWeek(payrollRemunerationDay(i))===weekStart)return true;
    return false;
  });
  if(!matched)throw new HttpError(409,'Semana sem falta classificada para desconto. Atualize as ocorrências.','NOT_REVIEWABLE');
  const existing=await env.DB.prepare(`SELECT * FROM payroll_dsr_reviews
    WHERE company_id=? AND competence_id=? AND employee_id=? AND week_start=?`)
    .bind(companyId,competenceId,employeeId,weekStart).first();
  // Repouso escolhido não pode já estar associado a outra semana da mesma competência.
  if(restDate && treatment==='DESCONTO_A_CONFERIR'){
    const dup=await env.DB.prepare(`SELECT week_start FROM payroll_dsr_reviews
      WHERE company_id=? AND employee_id=? AND rest_date=? AND treatment='DESCONTO_A_CONFERIR'
      AND NOT(competence_id=? AND week_start=?) LIMIT 1`)
      .bind(companyId,employeeId,restDate,competenceId,weekStart).first();
    if(dup)throw new HttpError(409,'Data de DSR já vinculada a outra semana.','DSR_DUPLICATE');
  }
  await env.DB.prepare(`INSERT INTO payroll_dsr_reviews
    (company_id,competence_id,employee_id,week_start,rest_date,treatment,notes,updated_by)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(company_id,competence_id,employee_id,week_start) DO UPDATE SET
    rest_date=excluded.rest_date,treatment=excluded.treatment,notes=excluded.notes,
    updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(companyId,competenceId,employeeId,weekStart,
      treatment==='DESCONTO_A_CONFERIR'?restDate:null,treatment,notes,auth.user.id).run();
  const after=await env.DB.prepare(`SELECT * FROM payroll_dsr_reviews
    WHERE company_id=? AND competence_id=? AND employee_id=? AND week_start=?`)
    .bind(companyId,competenceId,employeeId,weekStart).first();
  await audit(env,{companyId,userId:auth.user.id,action:existing?'UPDATE':'CREATE',
    entity:'payroll_dsr_reviews',entityId:employeeId+':'+weekStart,before:existing,after,request});
  return {...after,ready_for_payment:false,ready_for_accounting:false,ready_for_payroll:false};
}
async function payrollDsrAndLeavePreview(env,companyId,competenceId,paymentDate){
  await ensureSchemaRevision(env,'payroll-dsr-reviews',1,()=>ensurePayrollDsrReviewSchema(env));
  const view=await payrollRemunerationPreview(env,companyId,competenceId,paymentDate);
  const month=view.competence.competence;
  const rows=await env.DB.prepare(`SELECT r.* FROM payroll_dsr_reviews r
    WHERE r.company_id=? AND r.competence_id=? ORDER BY r.employee_id,r.week_start LIMIT 5001`)
    .bind(companyId,competenceId).all();
  if((rows.results||[]).length>5000)throw new HttpError(409,'Muitas revisões de DSR.','PREVIEW_LIMIT');
  const reviews=new Map((rows.results||[]).map(x=>[x.employee_id+':'+x.week_start,x]));
  let weeksPending=0,weeksReviewed=0;
  const items=view.items.map(employee=>{
    const preview=employee.remuneration_preview;
    const salarySegments=employee.salary_segments||[];
    const missingHistory=employee.base_reference===null||!Number.isFinite(employee.base_reference);
    const issues=[],warnings=[];
    let dsrSum=0n,complete=true;
    const weeks=(preview.dsr_weeks_to_review||[]).map(weekStart=>{
      const review=reviews.get(employee.employee_id+':'+weekStart)||null;
      const treatment=review?.treatment||'PENDENTE';
      const restDate=review?.rest_date||null;
      const details={week_start:weekStart,rest_date:restDate,treatment,notes:review?.notes||'',
        estimated_discount:null,days_in_week:0,carried_to_other_competence:false,
        flags:[]};
      for(const occurrence of employee.occurrences||[]){
        if(occurrence.kind!=='FALTA'||occurrence.treatment!=='DESCONTO_A_CONFERIR')continue;
        const from=payrollCalendarDayIndex(occurrence.within_competence_from);
        const to=payrollCalendarDayIndex(occurrence.within_competence_to);
        for(let d=from;d<=to;d++)
          if(payrollRemunerationWeek(payrollRemunerationDay(d))===weekStart)details.days_in_week++;
      }
      if(employee.overlapping_occurrence_days){details.flags.push('Ocorrências sobrepostas: DSR não apurado.');complete=false;}
      if(!preview.absence_discount_calculated){
        details.flags.push('Prévia de faltas incompleta: revisar ocorrências e histórico.');complete=false;
      }
      if(treatment==='PENDENTE'){
        details.flags.push('Repouso e convenção/escala ainda não conferidos.');
        weeksPending++;complete=false;
      }else if(treatment==='MANTER_REMUNERACAO'){
        weeksReviewed++;
        details.estimated_discount=0;
      }else if(treatment==='DESCONTO_A_CONFERIR'){
        weeksReviewed++;
        if(!restDate){details.flags.push('Data do repouso ausente.');complete=false;}
        else if(restDate.slice(0,7)!==month){
          details.flags.push('Repouso em outra competência: não projetar o valor nesta folha.');
          details.carried_to_other_competence=true;complete=false;
        }else if(employee.admission_date&&restDate<employee.admission_date){
          details.flags.push('Repouso anterior à admissão.');complete=false;
        }else if((employee.occurrences||[]).some(o=>o.within_competence_from<=restDate&&o.within_competence_to>=restDate)){
          details.flags.push('Repouso sobreposto a ocorrência: verificar duplicidade.');complete=false;
        }else{
          const segment=salarySegments.find(s=>s.start_date<=restDate&&s.end_date>=restDate);
          if(missingHistory||!segment||!Number.isSafeInteger(segment.salary_cents)||segment.salary_cents<0){
            details.flags.push('Histórico salarial incompleto para a data do repouso.');complete=false;
          }else{
            const amount=payrollRemunerationRoundCents(BigInt(segment.salary_cents),30n);
            details.estimated_discount=centsToMoney(amount);
            dsrSum+=BigInt(amount);
          }
        }
      }
      if(details.flags.length)issues.push(...details.flags.map(f=>weekStart+': '+f));
      return details;
    });
    // Afastamentos podem representar doenças sucessivas, acidente, maternidade,
    // licenças etc. A mesma causa ou benefício são DESCONHECIDOS nesse cadastro.
    const allLeaves=(employee.occurrences||[]).filter(o=>o.kind==='AFASTAMENTO')
      .sort((a,b)=>a.start_date.localeCompare(b.start_date));
    const leaves=allLeaves.map((o,i)=>{
      const prev=i>0?allLeaves[i-1]:null;
      const gap=prev?payrollCalendarDayIndex(o.start_date)-payrollCalendarDayIndex(prev.end_date)-1:null;
      const possibleContinuation=gap!==null&&gap>=0&&gap<=60;
      const first15=preview.breakdown.find(x=>x.id===o.id)?.company_first15_days??null;
      const after15=preview.breakdown.find(x=>x.id===o.id)?.benefit_after15_days??null;
      if(possibleContinuation)warnings.push('Afastamentos com intervalo até 60 dias: verificar se foram pelo mesmo motivo e se houve benefício anterior.');
      return {id:o.id,start_date:o.start_date,end_date:o.end_date,
        days_first15_in_competence:first15,days_after15_in_competence:after15,
        potential_related_return:possibleContinuation,previous_end:prev?.end_date||null,
        income_responsibility:'PENDENTE_CLASSIFICACAO',inss_benefit:null};
    });
    const total=complete&&weeks.length>0?centsToMoney(Number(dsrSum)):
      weeks.length===0&&!missingHistory&&preview.absence_discount_calculated?0:null;
    const status=total===null?'PENDENTE':'PREVIA_PARA_CONFERENCIA';
    if(weeks.length)warnings.push('Estimativa DSR somente para mensalista com repouso e tratamento informados. Feriados, escala e CCT podem alterar o resultado.');
    return {...employee,dsr_review:{weeks,weeks_count:weeks.length,
        estimated_discount:total,status,issues:[...new Set(issues)],warnings:[...new Set(warnings)],
        homologated:false,holiday_impacts:null,ready_for_payroll:false},
      leave_review:{items:leaves,benefit_calculated:false,first15_amount:null},
      net_pay:null,ready_for_payment:false,ready_for_accounting:false,ready_for_payroll:false};
  });
  return {...view,kind:'REMUNERACAO_DSR_CONFERENCIA_ETAPA_13',items,
    dsr_weeks_pending:weeksPending,dsr_weeks_reviewed:weeksReviewed,
    read_only:true,preview_only:true,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,message:'Etapa 13: DSR por semana apenas para conferência, sem feriados, convenções coletivas, fechamento, encargos ou folha líquida.'};
}

// ===== SAGAS Folha Etapa 14: mapa de conferência de componentes =====
// A finalidade é detectar pendências e conciliar referências. Não existe
// desconto aplicado, folha líquida, obrigação financeira nem contabilização.
function payrollCompositionCents(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
  const scaled=value*100,rounded=Math.round(scaled);
  return Number.isSafeInteger(rounded)&&Math.abs(scaled-rounded)<0.000001?rounded:null;
}
function payrollCompositionItem(item){
  const problems=[],notices=[];
  const add=(list,value)=>{
    if(typeof value==='string'&&value.trim()&&!list.includes(value)&&list.length<80)list.push(value);
  };
  const o=item.occurrences||[],events=item.events||[],r=item.remuneration_preview||{},dsr=item.dsr_review||{};
  const salary=payrollCompositionCents(item.salary_proportional_preview);
  const historical=payrollCompositionCents(item.base_reference);
  const plus=payrollCompositionCents(item.proventos_eventos);
  const minus=payrollCompositionCents(item.descontos_eventos);
  const absence=payrollCompositionCents(r.absence_discount_estimate);
  const dsrAmount=payrollCompositionCents(dsr.estimated_discount);
  const originalSubtotal=payrollCompositionCents(item.subtotal_aritmetico);
  const eventPendencies=events.filter(x=>x.status==='PENDENTE'||x.value_preview===null||x.value_preview===undefined);
  const duplicateSalaryEvent=events.some(x=>x.type==='PROVENTO'&&/^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test(String(x.event_name||'').trim()));
  if(historical===null)add(problems,'Falta referência salarial histórica completa para a competência.');
  if(salary===null)add(problems,'Salário proporcional ainda não está liberado para composição aritmética.');
  if(duplicateSalaryEvent)add(problems,'Evento de salário-base pode duplicar salário do cadastro.');
  if(eventPendencies.length)add(problems,eventPendencies.length+' evento(s) precisam de fórmula ou valorização.');
  if(plus===null||minus===null)add(problems,'Totais de eventos indisponíveis ou inválidos.');
  if(item.overlapping_occurrence_days)add(problems,'Ocorrências sobrepostas impedem composição.');
  if(o.some(x=>x.pending||x.treatment==='PENDENTE'))add(problems,'Existe ocorrência sem classificação.');
  if(o.some(x=>['AFASTAMENTO','FERIAS','LICENCA'].includes(x.kind)))
    add(problems,'Afastamentos, férias e licenças dependem de cálculo e regras próprias.');
  if(absence===null)add(problems,'Estimativa de faltas indisponível ou ainda não validada.');
  if(dsrAmount===null)add(problems,'DSR necessita de conferência antes da composição.');
  if(dsr.weeks?.some(w=>w.flags?.length))add(problems,'Semanas de DSR possuem alertas de conferência.');
  for(const msg of r.issues||[])add(problems,msg);
  for(const msg of dsr.issues||[])add(problems,msg);
  for(const msg of item.pendencias||[])add(problems,msg);
  for(const msg of r.warnings||[])add(notices,msg);
  for(const msg of dsr.warnings||[])add(notices,msg);
  if(!item.tax_scenario)add(problems,'Cenário tributário ainda indisponível ou não validado.');
  else add(notices,'INSS, IRRF e FGTS são cenários; não estão homologados nem consolidados com as faltas.');
  // Conferir SOMENTE o subtotal sem ocorrências, quando o demonstrativo anterior
  // possui referência integral e a soma de eventos é consistente.
  let subtotal=null;
  if(o.length===0&&salary!==null&&plus!==null&&minus!==null&&
      originalSubtotal!==null&&!duplicateSalaryEvent&&!eventPendencies.length&&
      salary+plus-minus===originalSubtotal&&Number.isSafeInteger(salary+plus-minus))
    subtotal=originalSubtotal;
  if(originalSubtotal!==null&&subtotal===null)
    add(problems,'Subtotal de eventos não conciliado com os parâmetros da etapa anterior.');
  if(o.length)add(notices,'Descontos indicativos de faltas e DSR são exibidos separadamente, sem abatê-los do salário.');
  if(item.leave_review?.items?.length)add(notices,'Afastamentos carecem de espécie, motivo e responsabilidade remuneratória.');
  const checks=[
    {area:'SALARIO',status:salary!==null?'CONFERENCIA':'PENDENTE',detail:salary!==null?'Referência proporcional disponível.':'Histórico, admissão ou ocorrências impedem base definitiva.'},
    {area:'EVENTOS',status:plus!==null&&minus!==null&&!eventPendencies.length&&!duplicateSalaryEvent?'CONFERENCIA':'PENDENTE',detail:eventPendencies.length+' evento(s) pendentes de valorização; confirmar duplicidades e incidências.'},
    {area:'OCORRENCIAS',status:!o.length?'NAO_APLICAVEL':
      (absence!==null&&!item.overlapping_occurrence_days&&o.every(x=>!x.pending)&&!o.some(x=>['AFASTAMENTO','FERIAS','LICENCA'].includes(x.kind)))?'CONFERENCIA':'PENDENTE',detail:o.length+' ocorrência(s) identificada(s).'},
    {area:'DSR',status:dsrAmount!==null&&!(dsr.issues||[]).length?'CONFERENCIA':'PENDENTE',detail:'DSR sujeito à escala, feriados e acordo coletivo.'},
    {area:'TRIBUTOS',status:item.tax_scenario?'CENARIO':'PENDENTE',detail:'Incidências de ausências e outros pagamentos ainda não consolidadas.'},
    {area:'FOLHA_FINAL',status:'BLOQUEADO',detail:'Pagamento, encargos, fechamento, contabilidade e eSocial não liberados.'}
  ];
  return {...item,composition:{
    salary_reference:item.base_reference??null,
    salary_proportional_preview:item.salary_proportional_preview??null,
    event_earnings:item.proventos_eventos??null,
    event_deductions:item.descontos_eventos??null,
    absence_discount_estimate:r.absence_discount_estimate??null,
    dsr_discount_estimate:dsr.estimated_discount??null,
    prior_subtotal:item.subtotal_aritmetico??null,
    reconciled_event_subtotal:subtotal===null?null:centsToMoney(subtotal),
    net_pay:null,tax_approved:false,checks,issues:problems,warnings:notices,
    status:problems.length?'PENDENTE':'CONFERENCIA',
    ready_for_payment:false,ready_for_accounting:false,ready_for_payroll:false,
    ready_for_closure:false
  },ready_for_payment:false,ready_for_accounting:false,ready_for_payroll:false,net_pay:null};
}
async function payrollCompositionPreview(env,companyId,competenceId,paymentDate){
  const dsr=await payrollDsrAndLeavePreview(env,companyId,competenceId,paymentDate);
  const items=dsr.items.map(payrollCompositionItem);
  const tally={};
  for(const item of items)for(const check of item.composition.checks){
    tally[check.area]??={pendente:0,conferencia:0,cenario:0,nao_aplicavel:0,bloqueado:0};
    const field=({PENDENTE:'pendente',CONFERENCIA:'conferencia',CENARIO:'cenario',NAO_APLICAVEL:'nao_aplicavel',BLOQUEADO:'bloqueado'})[check.status];
    if(field)tally[check.area][field]++;
  }
  return {...dsr,kind:'MAPA_CONFERENCIA_FOLHA_ETAPA_14',items,
    employee_count:items.length,
    composition_pending_count:items.filter(x=>x.composition.issues.length>0).length,
    reconciled_event_subtotal_count:items.filter(x=>x.composition.reconciled_event_subtotal!==null).length,
    checks_summary:tally,read_only:true,preview_only:true,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,
    message:'Mapa de conferência de componentes; valores independentes e estimados, sem somatório com faltas, DSR e impostos e sem folha líquida.'};
}

// ===== SAGAS Folha Etapa 15: mapa de incidências INSS / IRRF / FGTS =====
// Somente consulta: usa a versão vigente das regras, mas não homologa a sua
// correção fiscal, não aplica faltas/DSR nem realiza retenções ou pagamentos.
function payrollIncidenceItem15(item,ruleByEvent){
  const risks=[],notes=[],records=[];
  const add=(list,value)=>{if(typeof value==='string'&&value&&!list.includes(value)&&list.length<100)list.push(value)};
  const component=item.composition||{};
  const salary=payrollCompositionCents(component.salary_proportional_preview);
  const noOccurrences=!(item.occurrences||[]).length && !(item.overlapping_occurrence_days);
  const salaryReady=noOccurrences && salary!==null &&
    payrollCompositionCents(component.reconciled_event_subtotal)!==null;
  if(!salaryReady)add(risks,'Salário proporcional, subtotal ou ocorrências impedem bases fiscais conciliadas.');
  let pendingRules=0,pendingAmounts=0;
  const contributions={inss:0,irrf:0,fgts:0};
  const pending={inss:false,irrf:false,fgts:false};
  for(const event of item.events||[]){
    const version=ruleByEvent.get(event.event_id)||null;
    const actualVersion=version?version.effective_from+'#'+version.revision:null;
    const versionMatched=!!version && actualVersion===event.rule_version;
    const amount=payrollCompositionCents(event.value_preview);
    const flags={};
    for(const field of ['inss','irrf','fgts']){
      flags[field]=versionMatched&&['SIM','NAO'].includes(version[field])?version[field]:'PENDENTE';
      if(flags[field]==='PENDENTE')pending[field]=true;
    }
    if(Object.values(flags).includes('PENDENTE')){
      pendingRules++;
      add(risks,'Incidência sem regra vigente conciliada para o evento '+String(event.event_code||event.event_id||'').slice(0,40)+'.');
    }
    if(amount===null){
      pendingAmounts++;
      add(risks,'Evento sem valorização válida: '+String(event.event_code||event.event_id||'').slice(0,40)+'.');
      for(const field of ['inss','irrf','fgts'])pending[field]=true;
    }
    if(event.type==='PROVENTO'){
      for(const field of ['inss','irrf','fgts']){
        if(flags[field]==='SIM' && amount!==null){
          const next=contributions[field]+amount;
          if(!Number.isSafeInteger(next)||next>99999999999){
            pending[field]=true;add(risks,'Soma de incidências excedeu limite permitido.');
          }else contributions[field]=next;
        }
      }
    }else if(event.type==='DESCONTO'){
      // Descontos não são redutores automáticos das bases: natureza jurídica
      // própria e documentação são necessárias para validar abatimentos.
      if(Object.values(flags).includes('SIM')){
        for(const field of ['inss','irrf','fgts'])if(flags[field]==='SIM')pending[field]=true;
        add(risks,'Evento de desconto com incidência SIM exige avaliação de redutor: '+String(event.event_code||'').slice(0,40)+'.');
      }
    }else if(event.type==='INFORMATIVO' && Object.values(flags).includes('SIM')){
      for(const field of ['inss','irrf','fgts'])if(flags[field]==='SIM')pending[field]=true;
      add(risks,'Evento informativo com incidência SIM precisa ser classificado: '+String(event.event_code||'').slice(0,40)+'.');
    }else if(event.type!=='INFORMATIVO'){
      for(const field of ['inss','irrf','fgts'])pending[field]=true;
      add(risks,'Tipo de evento desconhecido: '+String(event.event_code||'').slice(0,40)+'.');
    }
    records.push({movement_id:event.id,event_id:event.event_id,event_code:event.event_code,
      event_name:event.event_name,event_type:event.type,value_preview:amount===null?null:centsToMoney(amount),
      rule_version:versionMatched?actualVersion:null,
      inss:flags.inss,irrf:flags.irrf,fgts:flags.fgts,
      validation_status:amount===null||Object.values(flags).includes('PENDENTE')?'PENDENTE':'CONFERENCIA'});
  }
  if((component.issues||[]).length)add(notes,'A composição da Etapa 14 possui pendências; nenhuma base é homologada.');
  add(notes,'Valores demonstrativos: incidências conforme regras cadastradas, sem validação jurídica automática.');
  add(notes,'IRRF usa data de pagamento; INSS/FGTS usam competência. Múltiplos vínculos, pagamentos e verbas específicas exigem conferência.');
  const bases={};
  for(const field of ['inss','irrf','fgts']){
    const cents=salaryReady&&!pending[field] ? salary+contributions[field] : null;
    if(cents!==null&&!Number.isSafeInteger(cents)){
      bases[field]=null;pending[field]=true;add(risks,'Valor fora do limite seguro para '+field.toUpperCase()+'.');
    }else bases[field]=cents===null?null:centsToMoney(cents);
  }
  return {...item,incidence_review:{
    salary_portion:salaryReady?centsToMoney(salary):null,
    event_contributions:{inss:centsToMoney(contributions.inss),irrf:centsToMoney(contributions.irrf),fgts:centsToMoney(contributions.fgts)},
    potential_bases:bases,
    statuses:Object.fromEntries(['inss','irrf','fgts'].map(x=>[x,bases[x]===null?'PENDENTE':'CENARIO'])),
    event_rows:records,pending_rules:pendingRules,pending_event_values:pendingAmounts,
    issues:risks,warnings:notes,homologated:false,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false
  },ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,net_pay:null};
}
async function payrollIncidencePreview15(env,companyId,competenceId,paymentDate){
  const prior=await payrollCompositionPreview(env,companyId,competenceId,paymentDate);
  const competence=prior.competence?.competence;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competence||'')))
    throw new HttpError(409,'Competência inválida para consulta de incidências.','INVALID_COMPETENCE');
  const rows=await env.DB.prepare(`SELECT r.event_id,r.effective_from,r.revision,r.inss,r.irrf,r.fgts
    FROM payroll_event_rule_versions r WHERE r.company_id=? AND r.effective_from<=?
      AND r.event_id IN (SELECT DISTINCT event_id FROM payroll_movements
        WHERE company_id=? AND competence_id=?)
    ORDER BY r.event_id,r.effective_from DESC,r.revision DESC LIMIT 5001`)
    .bind(companyId,competence,companyId,competenceId).all();
  if((rows.results||[]).length>5000)throw new HttpError(409,'Histórico de incidências superior ao limite da consulta.','RULES_LIMIT');
  const byEvent=new Map();
  for(const row of rows.results||[])if(!byEvent.has(row.event_id))byEvent.set(row.event_id,row);
  const items=prior.items.map(x=>payrollIncidenceItem15(x,byEvent));
  return {...prior,kind:'INCIDENCIAS_PRELIMINARES_ETAPA_15',items,
    reviewed_employee_count:items.length,
    pending_employee_count:items.filter(x=>Object.values(x.incidence_review.statuses).includes('PENDENTE')).length,
    rules_pending_count:items.reduce((n,x)=>n+x.incidence_review.pending_rules,0),
    bases_are_scenarios:true,read_only:true,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,folha_liquida:null,taxes_calculated:false,
    message:'Regras de incidência por evento e bases apenas indicativas. Não foram calculados tributos a recolher ou salário líquido.'};
}

// ===== SAGAS Folha Etapa 16: SIMULACAO de INSS, IRRF e FGTS =====
// Sempre read-only; não autoriza descontos, depósitos, pagamentos ou fechamento.
// INSS: tabela da competência; IRRF: data do pagamento; FGTS: cenário geral 8%.
// As bases vêm exclusivamente das incidências verificáveis da Etapa 15.
function payrollTaxSimulationItem16(item,competence,paymentDate){
  const source=item.incidence_review||{};
  const bases=source.potential_bases||{};
  const issues=[],warnings=[];
  const add=(list,msg)=>{if(msg&&!list.includes(msg)&&list.length<80)list.push(msg)};
  const cents={};
  for(const key of ['inss','irrf','fgts']){
    cents[key]=payrollCompositionCents(bases[key]);
    if(cents[key]===null)add(issues,'Base '+key.toUpperCase()+' pendente ou sem conciliação.');
  }
  const dependents=Number(item.eligible_dependents??0);
  if(!Number.isSafeInteger(dependents)||dependents<0||dependents>100)
    add(issues,'Dependentes para IRRF inconsistentes.');
  // Todos os valores são cenários. Nunca pressupor que cadastro de incidência
  // SIM/NAO da rubrica é prova de incidência legal.
  add(warnings,'Rubricas e incidências cadastradas exigem homologação fiscal.');
  add(warnings,'O cálculo não contempla múltiplos vínculos, pensão alimentícia, pagamentos acumulados, férias, 13º, rescisões ou descontos específicos.');
  add(warnings,'FGTS usa alíquota geral ilustrativa de 8%; verificar categoria especial, aprendiz e natureza de cada verba.');
  if(dependents>0)add(warnings,'A dedução provisória de '+dependents+' dependente(s) depende de confirmação documental e da data de pagamento.');
  if((item.occurrences||[]).length)add(issues,'Existem ocorrências que exigem ajuste das bases; simulação bloqueada.');
  if((source.issues||[]).length)add(issues,'Existem pendências de classificação de incidências; simulação não é liberada.');
  let calculated=null;
  if(issues.length===0){
    try{
      const result=payrollTaxHistoricalWithDependents(cents.inss,cents.irrf,cents.fgts,
        competence,paymentDate,dependents);
      calculated={
        inss_estimate:centsToMoney(result.inss_cents),
        irrf_estimate:centsToMoney(result.irrf_cents),
        fgts_estimate:centsToMoney(result.fgts_cents),
        irrf_base_estimate:centsToMoney(result.irrf_base_cents),
        irrf_before_reduction:centsToMoney(result.irrf_original_cents),
        irrf_reduction:centsToMoney(result.irrf_reduction_cents),
        irrf_deduction:centsToMoney(result.irrf_deduction_cents),
        irrf_deduction_type:result.irrf_deduction_type,
        inss_table_from:result.inss_table_from,
        irrf_table_from:result.irrf_table_from,
        inss_mode:result.inss_mode,
        // Este FGTS não é um desconto do trabalhador.
        fgts_is_employee_discount:false
      };
    }catch(err){
      add(issues,'Tabelas ou parâmetros insuficientes: '+String(err?.message||'cálculo indisponível').slice(0,120));
    }
  }
  return {...item,tax_simulation:{
    status:calculated?'SIMULACAO_PARA_CONFERENCIA':'BLOQUEADO',
    estimated_values:calculated,
    potential_bases:{inss:bases.inss??null,irrf:bases.irrf??null,fgts:bases.fgts??null},
    dependents_considered:Number.isSafeInteger(dependents)&&dependents>=0&&dependents<=100?dependents:null,
    issues,warnings,
    calculated:!!calculated,
    approved:false,homologated:false,
    net_pay:null,net_pay_calculated:false,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false
  },ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,net_pay:null};
}
async function payrollTaxSimulationPreview16(env,companyId,competenceId,paymentDate){
  // Reaproveita o fluxo de autenticação, validação de competência e da data,
  // abrangência da empresa e todas as pendências da Etapa 15.
  const prior=await payrollIncidencePreview15(env,companyId,competenceId,paymentDate);
  const competence=prior.competence?.competence;
  const date=histPaymentDate(paymentDate);
  histTable(HIST_INSS,competence);histTable(HIST_IRRF,date.slice(0,7));
  const items=prior.items.map(item=>payrollTaxSimulationItem16(item,competence,date));
  return {...prior,kind:'SIMULACAO_TRIBUTOS_ETAPA_16',items,
    simulated_employee_count:items.filter(x=>x.tax_simulation.calculated).length,
    blocked_employee_count:items.filter(x=>!x.tax_simulation.calculated).length,
    employee_count:items.length,competence_month:competence,payment_date:date,
    read_only:true,simulation_only:true,taxes_calculated:false,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,folha_liquida:null,
    message:'Simulação sem homologação de INSS, IRRF e FGTS. Não gera retenções, depósitos, salário líquido, pagamentos ou lançamentos.'};
}

// ===== SAGAS Folha Etapa 17: envelope consolidado de CONFERENCIA =====
// Consolida os resultados independentes das etapas 11–16 sem criar um
// salario liquido e sem registrar verbas, encargo ou lancamentos no banco.
function payrollConsolidationItem17(item){
  const cmp=item.composition||{},sim=item.tax_simulation||{},tax=sim.estimated_values||{};
  const inc=item.incidence_review||{},rem=item.remuneration_preview||{},dsr=item.dsr_review||{};
  const reasons=[],advisories=[];
  const add=(list,code,detail)=>{
    if(!list.some(x=>x.code===code)&&list.length<100)list.push({code,detail});
  };
  const amount=(v)=>{
    const cents=payrollCompositionCents(v);
    return cents===null?null:centsToMoney(cents);
  };
  const hasOccurrences=(item.occurrences||[]).length>0;
  const salary=payrollCompositionCents(cmp.salary_proportional_preview);
  const earnings=payrollCompositionCents(cmp.event_earnings);
  const deductions=payrollCompositionCents(cmp.event_deductions);
  const previous=payrollCompositionCents(cmp.reconciled_event_subtotal);
  let gross=null,subtotal=null;
  if(salary!==null&&earnings!==null&&deductions!==null&&!hasOccurrences){
    const sum=salary+earnings;
    const result=sum-deductions;
    if(Number.isSafeInteger(sum)&&Number.isSafeInteger(result)&&sum>=0&&result>=0){
      gross=centsToMoney(sum);
      if(previous!==null&&previous===result)subtotal=centsToMoney(result);
      else add(reasons,'EVENTOS_NAO_CONCILIADOS','O subtotal do mapa de eventos nao coincide com a soma conciliada.');
    }else add(reasons,'VALORES_FORA_LIMITE','Composicao monetaria negativa ou fora do limite numerico seguro.');
  }else add(reasons,'SALARIO_EVENTOS_PENDENTES','Salario, eventos ou ocorrencias nao permitem compor os valores.');
  if(hasOccurrences)add(reasons,'OCORRENCIAS_PENDENTES','Faltas, ferias, licencas ou afastamentos exigem tratamento antes de consolidar a folha.');
  if((item.overlapping_occurrence_days||0)>0)add(reasons,'OCORRENCIAS_SOBREPOSTAS','Existem dias de ocorrencia sobrepostos.');
  if((cmp.issues||[]).length)add(reasons,'COMPOSICAO_COM_PENDENCIAS',cmp.issues.length+' pendencia(s) identificada(s) no mapa de composicao.');
  if((inc.issues||[]).length)add(reasons,'INCIDENCIAS_COM_PENDENCIAS',inc.issues.length+' problema(s) de regras de incidencia.');
  if(!sim.calculated)add(reasons,'TRIBUTOS_SEM_CENARIO','Nao existe simulacao tributaria integral disponivel para conferencia.');
  if((rem.issues||[]).length)add(reasons,'REMUNERACAO_COM_PENDENCIAS',rem.issues.length+' pendencia(s) na previa remuneratoria.');
  if((dsr.issues||[]).length)add(reasons,'DSR_COM_PENDENCIAS',dsr.issues.length+' pendencia(s) na conferencia do DSR.');
  if(subtotal!==null&&sim.calculated)
    add(advisories,'COMPONENTES_PARA_CONFERENCIA','Subtotal aritmetico e tributos simulados estao disponiveis para conferencia; nao sao liquido ou pagamento.');
  if((item.events||[]).some(x=>x.rule_version===null||x.rule_version===undefined))
    add(advisories,'VERSOES_A_CONFERIR','Existem eventos sem identificacao de versao de regra no demonstrativo.');
  add(advisories,'ENCARGOS_NAO_HOMOLOGADOS','Confirmar tabelas, incidencia legal das rubricas, escala, categoria e convenção coletiva.');
  add(advisories,'FGTS_NAO_DESCONTA_EMPREGADO','FGTS e encargo patronal e nao integra descontos do empregado.');
  const eventLines=(item.events||[]).map(x=>({
    movement_id:x.id??null,event_id:x.event_id??null,
    code:x.event_code??null,name:x.event_name??null,type:x.type??null,
    value_preview:amount(x.value_preview),status:x.status??'PENDENTE',
    rule_version:x.rule_version??null,
    fiscal_rule_version:(inc.event_rows||[]).find(y=>y.movement_id===x.id)?.rule_version??null
  }));
  const gates=[
    {code:'SALARIO_E_EVENTOS',status:subtotal!==null?'CONFERENCIA':'PENDENTE'},
    {code:'OCORRENCIAS',status:!hasOccurrences?'NAO_APLICAVEL':'PENDENTE'},
    {code:'DSR_E_AFASTAMENTOS',status:!hasOccurrences?'NAO_APLICAVEL':'PENDENTE'},
    {code:'INCIDENCIAS',status:(inc.issues||[]).length===0?'CONFERENCIA':'PENDENTE'},
    {code:'TRIBUTOS',status:sim.calculated?'SIMULACAO':'PENDENTE'},
    {code:'HOMOLOGACAO',status:'BLOQUEADO'},
    {code:'PAGAMENTO_E_CONTABILIDADE',status:'BLOQUEADO'}
  ];
  return {...item,consolidation:{
    status:reasons.length?'PENDENTE':'CONFERENCIA',
    event_lines:eventLines,
    remuneration:{salary_reference:amount(cmp.salary_reference),salary_proportional:amount(cmp.salary_proportional_preview),
      event_earnings:amount(cmp.event_earnings),event_deductions:amount(cmp.event_deductions),
      gross_event_reference:gross,event_subtotal_reconciled:subtotal},
    occurrence_review:{count:(item.occurrences||[]).length,
      absence_discount_estimate:amount(rem.absence_discount_estimate),dsr_discount_estimate:amount(dsr.estimated_discount),
      applied_to_subtotal:false},
    taxes:{inss_estimate:amount(tax.inss_estimate),irrf_estimate:amount(tax.irrf_estimate),
      fgts_employer_estimate:amount(tax.fgts_estimate),simulated:sim.calculated===true,
      applied_as_employee_deduction:false},
    gates,blockers:reasons,notes:advisories,
    net_pay:null,approved:false,homologated:false,read_only:true,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false
  },net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollConsolidationPreview17(env,companyId,competenceId,paymentDate){
  const prior=await payrollTaxSimulationPreview16(env,companyId,competenceId,paymentDate);
  // Reutiliza os IDs humanos persistentes da Etapa 11.1; jamais deriva o
  // codigo do UUID nem do indice de ordenacao da consulta.
  const employees=await listPayroll(env,companyId,'employees');
  const codes=new Map(employees.map(x=>[x.id,x.employee_code||null]));
  const items=prior.items.map(x=>payrollConsolidationItem17({...x,
    employee_code:codes.get(x.employee_id)||null}));
  return {...prior,kind:'CONSOLIDACAO_ENVELOPE_ETAPA_17',items,
    employee_count:items.length,
    blocked_employee_count:items.filter(x=>x.consolidation.status==='PENDENTE').length,
    conference_employee_count:items.filter(x=>x.consolidation.status==='CONFERENCIA').length,
    total_event_lines:items.reduce((n,x)=>n+x.consolidation.event_lines.length,0),
    read_only:true,preview_only:true,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,folha_liquida:null,
    message:'Consolidacao informativa do envelope; sem salario liquido, pagamento, recolhimentos, contabilizacao ou fechamento.'};
}

// ===== SAGAS Folha Etapa 18: validacao orientada por evidencias =====
// Diagnostico de impedimentos para o calculo futuro, sem reconhecer
// simulacoes como tributos homologados e sem atualizar registros de negocio.
function payrollValidationItem18(item){
  const con=item.consolidation||{},cmp=item.composition||{},inc=item.incidence_review||{};
  const tax=item.tax_simulation||{},ev=item.events||[],occ=item.occurrences||[];
  const rules=inc.event_rows||[],checks=[];
  const add=(code,title,status,detail,action,source)=>{
    checks.push({code,title,status,detail,required_action:action,source});
  };
  const salary=payrollCompositionCents(cmp.salary_reference);
  const salaryPart=payrollCompositionCents(cmp.salary_proportional_preview);
  const salaryGood=salary!==null&&salaryPart!==null;
  add('HISTORICO_SALARIAL','Historico salarial',salaryGood?'CONFERENCIA':'PENDENTE',
    salaryGood?'Salario historico e proporcional disponiveis, ainda sujeitos a conferencia.':
      'Ausencia ou invalidade de salario historico ou proporcional para a competencia.',
    salaryGood?'Conferir vigencia, admissao, categoria e jornada.':'Completar historico salarial e verificar vigencia, admissao e jornada.',
    'Cadastro do funcionario / Historico salarial');
  const missingEvents=ev.filter(x=>payrollCompositionCents(x.value_preview)===null||x.status==='PENDENTE');
  const missingFormulas=ev.filter(x=>!x.rule_version);
  const duplicateBase=(cmp.issues||[]).some(x=>/duplic|sal[aá]rio.base/i.test(String(x)));
  const reconciled=payrollCompositionCents(con.remuneration?.event_subtotal_reconciled)!==null;
  const eventsGood=reconciled&&!missingEvents.length&&!missingFormulas.length&&!duplicateBase;
  add('EVENTOS_E_SUBTOTAL','Eventos e subtotal',eventsGood?'CONFERENCIA':'PENDENTE',
    'Eventos sem valor: '+missingEvents.length+'; sem versao de formula: '+missingFormulas.length+
    '; subtotal conciliado: '+(reconciled?'sim':'nao')+'; duplicidade salarial: '+(duplicateBase?'possivel':'nao detectada')+'.',
    eventsGood?'Conferir formulas, rubricas e valores lançados.':
      'Revisar eventos, historico das formulas, possivel salario duplicado e divergencia do subtotal.',
    'Lancamentos e versoes das formulas');
  const overlapped=Number(item.overlapping_occurrence_days||0);
  const untreated=occ.filter(x=>x.pending||!x.treatment||x.treatment==='PENDENTE');
  add('OCORRENCIAS','Faltas e ocorrencias',occ.length?'PENDENTE':'NAO_APLICAVEL',
    occ.length?occ.length+' ocorrencia(s), '+untreated.length+' sem tratamento; '+overlapped+' dia(s) sobreposto(s).':
      'Sem ocorrencias registradas na competencia.',
    occ.length?'Conferir classificacoes e reflexos remuneratorios antes de fechar a folha.':'Nenhuma acao nesta competencia.',
    'Historico de ocorrencias / Revisao das faltas');
  const dsr=item.dsr_review||{},weeks=dsr.weeks||[];
  add('DSR_E_FERIADOS','Repousos e feriados',occ.length?'PENDENTE':'NAO_APLICAVEL',
    occ.length?weeks.length+' semana(s) de DSR a conferir; escala, feriados e norma coletiva nao homologados.':
      'Sem ocorrencias com reflexos a analisar neste diagnostico.',
    occ.length?'Validar semana, repouso real, feriados, abono e norma coletiva.':'Nenhuma acao nesta competencia.',
    'Revisao semanal do DSR');
  const leaves=occ.filter(x=>['AFASTAMENTO','FERIAS','LICENCA'].includes(x.kind));
  add('FERIAS_E_AFASTAMENTOS','Ferias e afastamentos',leaves.length?'PENDENTE':'NAO_APLICAVEL',
    leaves.length?leaves.length+' ocorrencia(s) exigem especie, direitos e responsabilidade remuneratoria.':
      'Nao ha ferias, licencas ou afastamentos neste envelope.',
    leaves.length?'Conferir tipo, limites, periodos, retorno e efeitos previdenciarios.':'Nenhuma acao nesta competencia.',
    'Historico funcional / Ocorrencias');
  const fiscalNoVersion=ev.filter(x=>!rules.find(y=>y.movement_id===x.id)?.rule_version);
  const taxFlags=(inc.issues||[]).length;
  const incidentsGood=taxFlags===0&&fiscalNoVersion.length===0;
  add('INCIDENCIAS','Incidencias dos eventos',incidentsGood?'CONFERENCIA':'PENDENTE',
    taxFlags+' alerta(s) de incidencias; '+fiscalNoVersion.length+' evento(s) sem versao fiscal rastreavel.',
    incidentsGood?'Conferir a natureza legal das incidencias INSS, IRRF e FGTS.':
      'Completar revisoes de incidencias com vigencia e verificar rubricas sem versao fiscal.',
    'Regras fiscais de eventos');
  const taxOk=tax.calculated===true&&tax.estimated_values!==null&&(tax.issues||[]).length===0;
  add('TRIBUTOS','Contribuicoes e imposto',taxOk?'SIMULACAO':'PENDENTE',
    taxOk?'Existe somente simulacao tributaria, sem base homologada nem desconto efetivo.':
      'Simulacao nao disponivel ou inconsistente.',
    taxOk?'Validar bases, tabelas legais, deducoes, multiplo vinculo e periodos de pagamento.':
      'Conferir bases e incidencias e gerar nova simulacao para analise.',
    'Simulacao INSS / IRRF / FGTS');
  add('VALIDACAO_LEGAL','Homologacao e normas', 'NAO_IMPLEMENTADO',
    'Nao ha fluxo completo de homologacao de folha, validacao de convenio coletivo ou calculo definitivo.',
    'Implementar e homologar regras de categorias, descontos e bases antes de liberar a folha.',
    'Controle de processamento da folha');
  add('PAGAMENTO_CONTABIL','Pagamentos e contabilizacao','NAO_IMPLEMENTADO',
    'Integracao de folha fechada com contas a pagar e contabilidade nao esta habilitada.',
    'Concluir apuracao e homologacao antes de programar pagamento e lancamentos contabeis.',
    'Integracao financeira e contabil');
  const pending=checks.filter(x=>x.status==='PENDENTE');
  const unimplemented=checks.filter(x=>x.status==='NAO_IMPLEMENTADO');
  const preview=checks.filter(x=>x.status==='CONFERENCIA'||x.status==='SIMULACAO');
  const nextActions=pending.concat(unimplemented).map(x=>({code:x.code,title:x.title,required_action:x.required_action,source:x.source}));
  const displayCode=/^\d{5}$/.test(String(item.employee_code||''))?item.employee_code:null;
  if(!displayCode)nextActions.unshift({code:'CODIGO_FUNCIONARIO',title:'Codigo unico',required_action:'Verificar geracao do codigo sequencial do funcionario.',source:'Cadastro de funcionarios'});
  return {...item,validation:{status:pending.length||!displayCode?'PENDENTE':'CONFERENCIA_PRELIMINAR',
    employee_code:displayCode,checks,next_actions:nextActions,
    pending_count:pending.length+(!displayCode?1:0),not_implemented_count:unimplemented.length,
    conference_count:preview.length,blocked_for_final:true,
    calculated_net_pay:null,homologated:false,approved:false,read_only:true,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false};
}
async function payrollValidationPreview18(env,companyId,competenceId,paymentDate){
  const base=await payrollConsolidationPreview17(env,companyId,competenceId,paymentDate);
  const items=base.items.map(payrollValidationItem18);
  const issuesByType={};
  for(const item of items){
    for(const ch of item.validation.checks){
      const summary=issuesByType[ch.code]??={code:ch.code,title:ch.title,pendente:0,conferencia:0,nao_aplicavel:0,nao_implementado:0,simulacao:0};
      const key=({PENDENTE:'pendente',CONFERENCIA:'conferencia',NAO_APLICAVEL:'nao_aplicavel',NAO_IMPLEMENTADO:'nao_implementado',SIMULACAO:'simulacao'})[ch.status];
      if(key)summary[key]++;
    }
  }
  return {...base,kind:'MAPA_VALIDACAO_ENVELOPES_ETAPA_18',items,
    validation_summary:Object.values(issuesByType),
    employee_count:items.length,
    pending_employee_count:items.filter(x=>x.validation.pending_count>0).length,
    conference_employee_count:items.filter(x=>x.validation.pending_count===0).length,
    total_pending_checks:items.reduce((n,x)=>n+x.validation.pending_count,0),
    approved_employee_count:0,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,read_only:true,preview_only:true,
    message:'Checklist objetivo de pendencias e evidencias por funcionario; nenhum processamento definitivo disponivel.'};
}

// ===== SAGAS Folha Etapa 19: saneamento dirigido de salario e eventos =====
// A revisão informa o REGISTRO e a TELA existentes para cada pendência;
// nunca substitui lançamento, fórmula, salário, tributo nem homologa a folha.
function payrollRemediationItem19(employee){
  const existing=employee.validation||{};
  const comp=employee.composition||{};
  const inc=employee.incidence_review||{};
  const events=employee.events||[];
  const fiscalByMovement=new Map((inc.event_rows||[]).map(x=>[x.movement_id,x]));
  const tasks=[];
  const add=(code,area,priority,detail,action,actionKind,recordId,eventId)=>{
    if(tasks.length>=250)throw new HttpError(409,'Quantidade de pendências acima do limite de conferência.','REMEDIATION_LIMIT');
    tasks.push({code,area,priority,detail,action,action_kind:actionKind,
      employee_id:employee.employee_id,record_id:recordId||null,event_id:eventId||null});
  };
  if(payrollCompositionCents(comp.salary_reference)===null){
    add('HISTORICO_SALARIAL','SALARIO','ALTA',
      'Referência salarial indisponível no período consultado.',
      'Conferir vigência do histórico salarial desde a admissão e todas as alterações do mês.',
      'ABRIR_HISTORICO_SALARIAL',employee.employee_id,null);
  }else if(payrollCompositionCents(comp.salary_proportional_preview)===null){
    add('SALARIO_PROPORCIONAL','SALARIO','ALTA',
      'Salário proporcional ainda não pode ser consolidado.',
      'Revisar admissão, situações funcionais, jornada e ocorrências. O histórico salarial pode estar correto.',
      'ABRIR_HISTORICO_FUNCIONAL',employee.employee_id,null);
  }
  for(const ev of events){
    const code=String(ev.event_code||ev.event_id||'—').slice(0,70);
    const name=String(ev.event_name||'').slice(0,100);
    const label='Evento '+code+(name?' — '+name:'');
    const manual=ev.unit==='VALOR';
    const value=payrollCompositionCents(ev.value_preview);
    const note=String(ev.note||'');
    if(value===null||ev.status==='PENDENTE'){
      if(manual){
        add('LANCAMENTO_VALOR_PENDENTE','EVENTO','ALTA',label+': valor manual pendente ou inválido.',
          'Conferir o lançamento original e corrigir seu valor ou excluí-lo e lançar novamente conforme os controles atuais.',
          'ABRIR_LANCAMENTOS',ev.id,ev.event_id);
      }else if(!ev.rule_version){
        add('FORMULA_SEM_VIGENCIA','EVENTO','ALTA',label+': não há fórmula com versão vigente.',
          'Cadastrar ou revisar a fórmula do evento com vigência igual ou anterior à competência.',
          'ABRIR_REGRA_EVENTO',ev.id,ev.event_id);
      }else if(/c[oó]digo de c[aá]lculo especial/i.test(note)){
        add('CODIGO_CALCULO_NAO_SUPORTADO','EVENTO','ALTA',label+': código de cálculo especial ainda sem motor.',
          'Conferir a parametrização; alterar a fórmula isoladamente não implementa o código especial.',
          'ABRIR_REGRA_EVENTO',ev.id,ev.event_id);
      }else if(/JORNADA_MENSAL|jornada/i.test(note)){
        add('JORNADA_NECESSARIA','EVENTO','ALTA',label+': jornada mensal é necessária para avaliar a fórmula.',
          'Completar o histórico de jornada e reconferir a regra de cálculo.',
          'ABRIR_HISTORICO_JORNADA',employee.employee_id,ev.event_id);
      }else{
        add('FORMULA_NAO_AVALIADA','EVENTO','ALTA',label+': '+(note||'prévia de valor indisponível').slice(0,160),
          'Abrir a regra do evento na competência e conferir sintaxe, variáveis e referência lançada.',
          'ABRIR_REGRA_EVENTO',ev.id,ev.event_id);
      }
    }
    // Salário lançado em provento pode duplicar a remuneração de cadastro.
    if(ev.type==='PROVENTO'&&/^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test(name.trim())){
      add('POSSIVEL_SALARIO_DUPLICADO','EVENTO','ALTA',label+': pode duplicar o salário já obtido do histórico.',
        'Conferir se o evento representa salário-base que já integra a composição; não excluir automaticamente.',
        'ABRIR_LANCAMENTOS',ev.id,ev.event_id);
    }
    const f=fiscalByMovement.get(ev.id);
    if(!f||!f.rule_version||f.validation_status==='PENDENTE'||
      ['inss','irrf','fgts'].some(k=>!f||f[k]==='PENDENTE')){
      add('INCIDENCIA_NAO_CONFERIDA','INCIDENCIA','MEDIA',label+': incidências INSS/IRRF/FGTS sem confirmação para a competência.',
        'Abrir regra do evento e conferir a vigência e a natureza tributária de cada incidência.',
        'ABRIR_REGRA_EVENTO',ev.id,ev.event_id);
    }
  }
  if(!(existing.checks||[]).some(c=>c.code==='EVENTOS_E_SUBTOTAL')){
    add('VALIDACAO_ANTERIOR_AUSENTE','CONTROLE','ALTA','Mapa anterior sem o bloco de eventos.',
      'Reexecutar a validação após conferir a competência.','ABRIR_LANCAMENTOS',null,null);
  }
  const ordering={ALTA:0,MEDIA:1,BAIXA:2};
  tasks.sort((a,b)=>ordering[a.priority]-ordering[b.priority]||
    a.area.localeCompare(b.area)||a.code.localeCompare(b.code)||
    String(a.record_id||'').localeCompare(String(b.record_id||'')));
  const count=(area)=>tasks.filter(x=>x.area===area).length;
  return {employee_id:employee.employee_id,employee_code:employee.employee_code||null,
    employee_name:employee.employee_name,
    remediation:{tasks,task_count:tasks.length,needs_salary_review:count('SALARIO')>0,
      needs_event_review:count('EVENTO')>0,needs_incidence_review:count('INCIDENCIA')>0,
      has_further_legal_blockers:true,ready_for_payroll:false,
      ready_for_payment:false,ready_for_accounting:false,net_pay:null}};
}
async function payrollRemediationPreview19(env,companyId,competenceId,paymentDate){
  const prior=await payrollValidationPreview18(env,companyId,competenceId,paymentDate);
  const items=prior.items.map(payrollRemediationItem19);
  const totals={salary:0,events:0,incidences:0};
  for(const emp of items)for(const task of emp.remediation.tasks){
    if(task.area==='SALARIO')totals.salary++;
    if(task.area==='EVENTO')totals.events++;
    if(task.area==='INCIDENCIA')totals.incidences++;
  }
  return {kind:'SANEAMENTO_REMUNERACAO_EVENTOS_ETAPA_19',competence:prior.competence,
    payment_date:prior.payment_date,items,employee_count:items.length,
    employees_with_tasks:items.filter(x=>x.remediation.task_count>0).length,
    total_tasks:items.reduce((n,x)=>n+x.remediation.task_count,0),totals,
    read_only:true,preview_only:true,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    folha_liquida:null,net_pay:null,
    message:'Pendencias tecnicas vinculadas aos cadastros existentes; consultar ou corrigir registros pelos formularios existentes, sem fechamento automatico.'};
}

// ===== SAGAS Folha Etapa 20: memoria de calculo evento a evento =====
// Apenas rastreia resultados ja calculados no motor aritmetico SAGAS, com
// conferencia em centavos e bloqueios. Nao altera cadastro ou contabiliza.
function payrollCalculationMemoryItem20(item){
  const c=item.composition||{}, original=item.consolidation||{};
  const lines=[],issues=[],notes=[];
  const LIMIT=99999999999n;
  const addIssue=(code,detail)=>{if(issues.length<150)issues.push({code,detail});};
  const toCents=payrollCompositionCents;
  const show=n=>n===null?null:centsToMoney(Number(n));
  const salary=toCents(c.salary_proportional_preview);
  if(salary===null)addIssue('SALARIO_NAO_APURADO','Nao foi possivel apurar salario proporcional historico para a competencia.');
  const events=item.events||[];
  if(events.length>500)addIssue('MUITOS_EVENTOS','Mais de 500 movimentos por funcionario; memoria bloqueada para conferência detalhada.');
  let earning=0n,deduction=0n,information=0n,eventsKnown=true;
  const seen=new Set();
  lines.push({line:1,origin:'HISTORICO_SALARIAL',record_id:item.employee_id,
    event_id:null,code:'SALARIO',description:'Salario proporcional do historico',
    type:'PROVENTO',unit:'VALOR',reference:null,expression:null,rule_version:null,
    value:salary===null?null:centsToMoney(salary),status:salary===null?'PENDENTE':'CONFERENCIA',
    detail:salary===null?'Historico salarial sem cobertura ou com impedimento.':'Referencia historica; nao e salario liquido.'});
  for(const e of events){
    if(!e.id||seen.has(e.id))addIssue('MOVIMENTO_DUPLICADO','Lancamento sem ID ou ID repetido na memoria de calculo.');
    seen.add(e.id);
    const amount=toCents(e.value_preview),type=e.type||null;
    const validType=['PROVENTO','DESCONTO','INFORMATIVO'].includes(type);
    const pending=e.status==='PENDENTE'||amount===null||!validType;
    if(pending){
      eventsKnown=false;
      addIssue('EVENTO_PENDENTE','Lancamento '+String(e.event_code||e.id||'?').slice(0,60)+' sem valor seguro ou tipo valido.');
    }else{
      if(type==='PROVENTO')earning+=BigInt(amount);
      else if(type==='DESCONTO')deduction+=BigInt(amount);
      else information+=BigInt(amount);
    }
    lines.push({line:lines.length+1,origin:e.unit==='VALOR'?'LANCAMENTO_MANUAL':'FORMULA_VERSIONADA',
      record_id:e.id||null,event_id:e.event_id||null,code:e.event_code||null,
      description:e.event_name||null,type,unit:e.unit||null,reference:e.reference??null,
      expression:e.unit==='VALOR'?null:e.formula_text||null,
      rule_version:e.rule_version||null,
      value:amount===null?null:centsToMoney(amount),status:pending?'PENDENTE':e.status||'CONFERENCIA',
      detail:String(e.note||'').slice(0,240)});
  }
  if(earning>LIMIT||deduction>LIMIT||information>LIMIT){
    eventsKnown=false;addIssue('TOTAL_FORA_LIMITE','Soma dos valores dos movimentos excedeu o limite monetario seguro.');
  }
  if((item.occurrences||[]).length||item.overlapping_occurrence_days)
    addIssue('OCORRENCIAS_TRABALHISTAS','Existem faltas, ferias, afastamentos, licencas ou sobreposicoes que impedem compor o subtotal para pagamento.');
  const expectedEarnings=toCents(c.event_earnings),expectedDeductions=toCents(c.event_deductions);
  if(expectedEarnings===null||expectedDeductions===null)
    addIssue('TOTAIS_FONTE_AUSENTES','A composicao anterior nao apresenta totais validos de proventos e descontos.');
  else if(eventsKnown&&(earning!==BigInt(expectedEarnings)||deduction!==BigInt(expectedDeductions)))
    addIssue('EVENTOS_DIVERGENTES','Soma por lancamento diverge dos totais apurados pela composicao anterior.');
  const amountReady=salary!==null&&eventsKnown&&earning<=LIMIT&&deduction<=LIMIT&&
    (item.occurrences||[]).length===0&&!item.overlapping_occurrence_days;
  const gross=amountReady?BigInt(salary)+earning:null;
  const beforeTaxes=gross===null?null:gross-deduction;
  if(gross!==null&&(gross>LIMIT||beforeTaxes<0n||beforeTaxes>LIMIT))
    addIssue('SUBTOTAL_INVALIDO','Subtotal aritmetico negativo ou acima do limite; nao exibir como remuneração.');
  const prior=toCents(c.reconciled_event_subtotal);
  if(beforeTaxes!==null&&beforeTaxes>=0n&&beforeTaxes<=LIMIT&&prior!==null&&beforeTaxes!==BigInt(prior))
    addIssue('SUBTOTAL_NAO_CONCILIADO','O subtotal por lancamento difere do subtotal da etapa 14/17.');
  if(prior===null)addIssue('SUBTOTAL_FONTE_PENDENTE','O demonstrativo anterior nao liberou subtotal aritmetico conciliado.');
  if((item.remediation?.tasks||[]).length)
    notes.push('Ha '+item.remediation.tasks.length+' tarefa(s) de saneamento dos cadastros e eventos na Etapa 19.');
  notes.push('Faltas, DSR e simulacoes de INSS/IRRF nao foram descontados. FGTS e encargo patronal.');
  const ready=issues.length===0&&beforeTaxes!==null&&beforeTaxes>=0n&&beforeTaxes<=LIMIT;
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,processing_preview:{
      status:ready?'CONCILIADO_PARA_CONFERENCIA':'PENDENTE',lines,
      salary_reference:c.salary_reference??null,
      salary_proportional:salary===null?null:centsToMoney(salary),
      event_earnings:eventsKnown&&earning<=LIMIT?show(earning):null,
      event_deductions:eventsKnown&&deduction<=LIMIT?show(deduction):null,
      informative_events:eventsKnown&&information<=LIMIT?show(information):null,
      gross_arithmetic:ready?show(gross):null,
      subtotal_before_absences_taxes:ready?show(beforeTaxes):null,
      source_subtotal:prior===null?null:centsToMoney(prior),
      reconciled:ready,issues,notes,
      // Este subtotal NAO e o valor liquido devido ao funcionario.
      net_pay:null,homologated:false,read_only:true,
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false};
}
async function payrollCalculationMemoryPreview20(env,companyId,competenceId,paymentDate){
  // Valida as fontes e isola empresa, competência e data usando todo o pipeline.
  const previous=await payrollValidationPreview18(env,companyId,competenceId,paymentDate);
  const items=previous.items.map(x=>payrollCalculationMemoryItem20({
    ...x,remediation:payrollRemediationItem19(x).remediation}));
  return {kind:'MEMORIA_CALCULO_EVENTOS_ETAPA_20',competence:previous.competence,
    payment_date:previous.payment_date,items,employee_count:items.length,
    reconciled_employee_count:items.filter(e=>e.processing_preview.reconciled).length,
    pending_employee_count:items.filter(e=>!e.processing_preview.reconciled).length,
    movement_line_count:items.reduce((a,e)=>a+e.processing_preview.lines.length-1,0),
    read_only:true,preview_only:true,folha_liquida:null,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    message:'Memoria aritmetica rastreavel por lancamento; nao e processamento final, folha liquida ou aprovacao.'};
}

// ===== SAGAS Folha Etapa 21: projecao aritmetica condicionada =====
// NAO e salario liquido homologado. Continua somente leitura.
// Quando houver incidencias e bases pendentes, nao se cria valor substituto.
function payrollBalanceScenarioItem21(item){
  const mem=item.processing_preview||{};
  const tax=item.tax_simulation||{};
  const sim=tax.estimated_values||{};
  const inc=item.incidence_review||{};
  const reasons=[],warnings=[];
  const add=(code,detail)=>{if(!reasons.some(x=>x.code===code)&&reasons.length<100)reasons.push({code,detail});};
  const toCents=payrollCompositionCents;
  const toAmount=n=>n===null?null:centsToMoney(Number(n));
  const max=99999999999n;
  const salary=toCents(mem.salary_proportional);
  const earning=toCents(mem.event_earnings);
  const deduction=toCents(mem.event_deductions);
  const gross=toCents(mem.gross_arithmetic);
  const beforeTax=toCents(mem.subtotal_before_absences_taxes);
  const inss=toCents(sim.inss_estimate);
  const irrf=toCents(sim.irrf_estimate);
  const fgts=toCents(sim.fgts_estimate);
  if(!mem.reconciled||(mem.issues||[]).length)
    add('MEMORIA_PENDENTE','Memoria da Etapa 20 sem conciliacao completa.');
  if([salary,earning,deduction,gross,beforeTax].some(x=>x===null))
    add('REMUNERACAO_INCOMPLETA','Salario e proventos/descontos precisam estar conciliados.');
  if((item.occurrences||[]).length||item.overlapping_occurrence_days)
    add('OCORRENCIAS_PENDENTES','Faltas, ferias, licencas e afastamentos requerem calculo especifico.');
  if((item.remediation?.tasks||[]).length)
    add('SANEAMENTO_PENDENTE','Ha pendencias de historico ou eventos sem tratamento.');
  if((item.composition?.issues||[]).length)
    add('COMPOSICAO_PENDENTE','A composicao salarial apresenta impedimentos.');
  if(!tax.calculated||(tax.issues||[]).length||[inss,irrf,fgts].some(x=>x===null))
    add('TRIBUTOS_INCOMPLETOS','Cenario de INSS, IRRF e FGTS sem base conferivel.');
  if((inc.issues||[]).length||['inss','irrf','fgts'].some(x=>inc.statuses?.[x]!=='CENARIO'))
    add('INCIDENCIAS_PENDENTES','As tres bases tributarias precisam estar classificadas.');
  if(!sim.inss_table_from||!sim.irrf_table_from)
    add('TABELAS_NAO_IDENTIFICADAS','A versao da tabela previdenciaria e de IRRF deve constar na simulacao.');
  if(sim.fgts_is_employee_discount!==false)
    add('FGTS_SEM_SEPARACAO','Confirmar que FGTS nao sera deduzido do trabalhador.');
  const rows=inc.event_rows||[];
  for(const e of item.events||[]){
    const rule=rows.find(x=>x.movement_id===e.id);
    if(!rule||rule.validation_status!=='CONFERENCIA'||
       !['SIM','NAO'].includes(rule.inss)||!['SIM','NAO'].includes(rule.irrf)||
       !['SIM','NAO'].includes(rule.fgts))
      add('EVENTO_SEM_INCIDENCIA','Ha evento sem classificacao fiscal revisavel.');
    const description=String(e.event_name||'')+' '+String(e.event_code||'');
    // Evita simular tributo em dobro ou usar o fluxo mensal em verbas especiais.
    if(/13\s*(?:º|O|\.|-)?\s*SAL|DECIMO\s+TERCEIRO|F[ÉE]RIAS|RESCIS|AFASTAMENTO|LICEN[ÇC]A|PENS[ÃA]O|JUDICIAL/i.test(description))
      add('RUBRICA_ESPECIAL','Evento com tratamento especifico: 13o, ferias, rescisao, afastamento ou pensao.');
    if(e.type==='DESCONTO'&&/\b(?:INSS|IRRF|FGTS|PREVID[ÊE]NCIA|IMPOSTO\s+DE\s+RENDA)\b/i.test(description))
      add('TRIBUTO_JA_LANCADO','Existe desconto tributario lancado como evento: risco de desconto duplicado.');
  }
  let balance=null;
  if([salary,earning,deduction,gross,beforeTax,inss,irrf,fgts].every(x=>x!==null)){
    const sg=BigInt(salary)+BigInt(earning);
    const sb=sg-BigInt(deduction);
    if(sg!==BigInt(gross)||sb!==BigInt(beforeTax))
      add('MEMORIA_DIVERGENTE','Bruto, eventos e subtotal da memoria nao fecham em centavos.');
    const after=sb-BigInt(inss)-BigInt(irrf);
    if(after<0n)add('PROJECAO_NEGATIVA','Os descontos simulados excederiam o subtotal aritmetico.');
    if([sg,sb,after,BigInt(fgts)].some(x=>x>max||x<0n))
      add('VALOR_FORA_LIMITE','Valor fora do limite monetario seguro.');
    if(reasons.length===0)balance=toAmount(after);
  }
  warnings.push('Resultado apenas hipotetico: incidencias e tabelas ainda dependem de validacao fiscal e trabalhista.');
  warnings.push('FGTS e encargo do empregador e nunca reduz o valor demonstrado ao empregado.');
  warnings.push('Nao contempla ferias, 13o, rescisao, multiplos vinculos, pensao ou pagamentos acumulados.');
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,
    balance_scenario:{status:balance===null?'BLOQUEADO':'CENARIO_ARITMETICO',
      salary_preview:salary===null?null:centsToMoney(salary),
      earnings_preview:earning===null?null:centsToMoney(earning),
      deductions_preview:deduction===null?null:centsToMoney(deduction),
      gross_before_deductions:gross===null?null:centsToMoney(gross),
      subtotal_before_taxes:beforeTax===null?null:centsToMoney(beforeTax),
      inss_scenario:inss===null?null:centsToMoney(inss),
      irrf_scenario:irrf===null?null:centsToMoney(irrf),
      fgts_employer_scenario:fgts===null?null:centsToMoney(fgts),
      arithmetic_balance_preview:balance,
      inss_table_from:sim.inss_table_from||null,
      irrf_table_from:sim.irrf_table_from||null,
      issues:reasons,warnings,net_pay:null,net_pay_calculated:false,
      approved:false,homologated:false,read_only:true,
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
      ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollBalanceScenarioPreview21(env,companyId,competenceId,paymentDate){
  const previous=await payrollValidationPreview18(env,companyId,competenceId,paymentDate);
  const items=previous.items.map(item=>{
    const remediation=payrollRemediationItem19(item).remediation;
    const memory=payrollCalculationMemoryItem20({...item,remediation});
    return payrollBalanceScenarioItem21({...item,remediation,
      processing_preview:memory.processing_preview});
  });
  return {kind:'SALDO_ARITMETICO_SIMULADO_ETAPA_21',competence:previous.competence,
    payment_date:previous.payment_date,items,employee_count:items.length,
    scenario_employee_count:items.filter(x=>x.balance_scenario.status==='CENARIO_ARITMETICO').length,
    blocked_employee_count:items.filter(x=>x.balance_scenario.status==='BLOQUEADO').length,
    read_only:true,preview_only:true,folha_liquida:null,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Saldo aritmetico apenas hipotetico: nao constitui salario liquido homologado, pagamento ou contabilizacao.'};
}

// ===== SAGAS Folha Etapa 22: soma das referencias revisadas de faltas e DSR =====
// TOTAL EXCLUSIVAMENTE INFORMATIVO. Nunca desconta do salario, nao recalcula
// tributos e nao grava eventos, contas a pagar, fechamento ou contabilidade.
function payrollAbsenceDsrReviewItem22(item){
  const occurrences=item.occurrences||[];
  const rem=item.remuneration_preview||{};
  const dsr=item.dsr_review||{};
  const issues=[],warnings=[];
  const add=(code,detail)=>{if(!issues.some(x=>x.code===code)&&issues.length<100)issues.push({code,detail});};
  const val=payrollCompositionCents;
  const MAX=99999999999n;
  const absenceCents=val(rem.absence_discount_estimate);
  const dsrCents=val(dsr.estimated_discount);
  const weeks=dsr.weeks||[];
  const affected=rem.dsr_weeks_to_review||[];
  const absenceRows=rem.breakdown||[];
  const days=Number(rem.deduction_days);
  if(item.overlapping_occurrence_days)add('OCORRENCIAS_SOBREPOSTAS','Ocorrencias sobrepostas requerem correcao antes de estimar descontos.');
  if(occurrences.some(o=>o.kind!=='FALTA'))
    add('OUTRAS_OCORRENCIAS','Ferias, licencas e afastamentos exigem calculos proprios; esta soma nao se aplica.');
  if(occurrences.some(o=>!['ABONADA','DESCONTO_A_CONFERIR'].includes(o.treatment)))
    add('TRATAMENTO_INCOMPLETO','Classifique todas as faltas como abonadas ou desconto a conferir.');
  if(!Array.isArray(rem.breakdown)||absenceRows.length!==occurrences.length ||
     occurrences.some(o=>!absenceRows.some(x=>x.id===o.id&&x.kind===o.kind&&x.treatment===o.treatment)))
    add('DETALHE_INCONSISTENTE','Detalhamento das faltas nao corresponde aos registros da competencia.');
  if(rem.absence_discount_calculated!==true||absenceCents===null)
    add('FALTAS_NAO_APURADAS','Historico salarial ou contagem de faltas nao permite apuracao integral.');
  if(!Number.isSafeInteger(days)||days<0||days>30)
    add('DIAS_INVALIDOS','Contagem de dias de falta ausente ou fora do limite 0 a 30.');
  if(occurrences.some(o=>o.kind==='FALTA'&&o.treatment==='DESCONTO_A_CONFERIR')&&days===0)
    add('FALTA_SEM_DIAS','Ha falta descontavel mas nenhum dia de desconto registrado.');
  if(dsrCents===null||!Array.isArray(dsr.weeks))
    add('DSR_NAO_APURADO','Semanas de DSR ainda precisam de tratamento e base salarial.');
  if(!Array.isArray(rem.dsr_weeks_to_review))
    add('SEMANAS_NAO_APURADAS','Semanas afetadas pelas faltas nao foram identificadas.');
  const seenWeek=new Set(),seenRest=new Set(),expected=new Set(affected);
  let totalReviewed=0n;
  for(const w of weeks){
    if(seenWeek.has(w.week_start))add('SEMANA_DUPLICADA','A mesma semana aparece repetida na conferencia.');
    seenWeek.add(w.week_start);
    if(!expected.has(w.week_start))add('SEMANA_INDEVIDA','Semana sem falta descontavel consta na conferencia de DSR.');
    if(w.flags?.length)add('DSR_COM_ALERTAS','Existem semanas com alertas de escala, vigencia ou datas.');
    if(w.carried_to_other_competence)add('DSR_OUTRA_COMPETENCIA','Repouso pertencente a outra competencia deve ser tratado separadamente.');
    if(!['MANTER_REMUNERACAO','DESCONTO_A_CONFERIR'].includes(w.treatment))
      add('DSR_PENDENTE','Falta decisao registrada para uma ou mais semanas de DSR.');
    const value=val(w.estimated_discount);
    if(value===null)add('SEM_VALOR_DSR','Uma das semanas nao possui valor indicativo calculavel.');
    else totalReviewed+=BigInt(value);
    if(w.treatment==='MANTER_REMUNERACAO'&&value!==0)
      add('ABONO_DSR_DIVERGENTE','DSR mantido nao pode gerar valor de desconto.');
    if(w.treatment==='DESCONTO_A_CONFERIR'){
      if(!w.rest_date||!w.notes?.trim())
        add('DSR_SEM_JUSTIFICATIVA','Desconto de DSR deve ter data de repouso e justificativa registradas.');
      if(w.rest_date){
        if(seenRest.has(w.rest_date))add('REPOUSO_DUPLICADO','Data de repouso foi usada em mais de uma semana.');
        seenRest.add(w.rest_date);
        if(item.competence_month && w.rest_date.slice(0,7)!==item.competence_month)
          add('REPOUSO_FORA_DA_COMPETENCIA','Repouso informado nao pertence ao mes da conferencia.');
      }
    }
  }
  if(seenWeek.size!==expected.size||[...expected].some(w=>!seenWeek.has(w)))
    add('REVISÕES_INCOMPLETAS','Ha semana de falta sem conferencia correspondente de DSR.');
  if(dsrCents!==null && BigInt(dsrCents)!==totalReviewed)
    add('DSR_TOTAL_DIVERGENTE','Soma das semanas nao corresponde ao total da conferencia de DSR.');
  if(occurrences.length && (rem.issues||[]).some(x=>!/poss.vel perda de dsr/i.test(x)))
    add('FALTAS_COM_PENDENCIAS','A pre-via de faltas possui impedimentos adicionais.');
  if((dsr.issues||[]).length)
    add('DSR_COM_PENDENCIAS','A revisao do DSR possui impedimentos ainda nao resolvidos.');
  // Os valores monetarios so sao exibidos em conjunto se TODAS as verificacoes
  // passaram. Os campos individuais podem continuar visiveis como referencias.
  let total=null;
  if(absenceCents!==null&&dsrCents!==null&&issues.length===0){
    const joined=BigInt(absenceCents)+BigInt(dsrCents);
    if(joined>MAX)add('SOMA_FORA_LIMITE','Total indicativo excede o limite seguro.');
    else total=centsToMoney(Number(joined));
  }
  if(issues.length)total=null;
  warnings.push('Referencia para mensalista: faltas pelo salario historico / 30 e DSR por semana conferida.');
  warnings.push('Exige validacao de jornada, feriados, justificativas, norma coletiva e eventual repercussao nas bases de INSS, IRRF e FGTS.');
  warnings.push('Sem recalculo de tributos, sem abatimento efetivo do salario e sem calculo de salario liquido.');
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,absence_dsr_adjustment:{
      status:issues.length?'PENDENTE':occurrences.length?'CONFERENCIA_DE_VALORES':'SEM_OCORRENCIAS',
      occurrence_count:occurrences.length,deduction_days:Number.isSafeInteger(days)?days:null,
      reviewed_weeks:weeks.length,absence_estimate:absenceCents===null?null:centsToMoney(absenceCents),
      dsr_estimate:dsrCents===null?null:centsToMoney(dsrCents),
      combined_discount_reference:total,
      dsr_weeks:weeks.map(w=>({week_start:w.week_start,rest_date:w.rest_date||null,
        days_in_week:w.days_in_week||0,treatment:w.treatment,notes:w.notes||'',
        amount:w.estimated_discount??null,flags:w.flags||[]})),
      occurrence_lines:absenceRows.map(o=>({id:o.id,kind:o.kind,treatment:o.treatment,
        from:o.from,to:o.to,days:o.days,estimated_discount:o.estimated_discount})),
      issues,warnings,net_pay:null,applied_discount:null,approved:false,homologated:false,
      read_only:true,ready_for_payroll:false,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollAbsenceDsrPreview22(env,companyId,competenceId,paymentDate){
  const data=await payrollDsrAndLeavePreview(env,companyId,competenceId,paymentDate);
  // Os IDs humanos vêm da tabela de sequencia ja utilizada desde o Worker v49.
  // A previa da Etapa 13 nao os inclui diretamente.
  const employees=await listPayroll(env,companyId,'employees');
  const codes=new Map(employees.map(e=>[e.id,e.employee_code||null]));
  const items=data.items.map(x=>payrollAbsenceDsrReviewItem22({...x,
    employee_code:codes.get(x.employee_id)||null,
    competence_month:data.competence.competence}));
  return {kind:'DESCONTOS_FALTAS_DSR_CONFERENCIA_ETAPA_22',competence:data.competence,
    payment_date:data.payment_date,items,employee_count:items.length,
    pending_employee_count:items.filter(x=>x.absence_dsr_adjustment.status==='PENDENTE').length,
    reviewed_employee_count:items.filter(x=>x.absence_dsr_adjustment.status==='CONFERENCIA_DE_VALORES').length,
    read_only:true,preview_only:true,net_pay:null,folha_liquida:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Conferencia de faltas e DSR somente como referencias monetarias; nenhum desconto aplicado, tributo recalculado, pagamento ou contabilizacao.'};
}

// ===== SAGAS Folha Etapa 23: recomposicao tributaria indicativa apos faltas/DSR =====
// Read-only: nao altera incidencias, nao calcula tributos a descontar e nao
// homologa bases previdenciarias, de IRRF ou FGTS.
function payrollTaxBaseRecompositionItem23(item,absenceItem,competence){
  const inc=item.incidence_review||{},comp=item.composition||{};
  const review=absenceItem?.absence_dsr_adjustment||{};
  const errors=[],warnings=[];
  const add=(code,detail)=>{if(!errors.some(x=>x.code===code)&&errors.length<80)errors.push({code,detail});};
  const cents=payrollCompositionCents;
  const MAX=99999999999n;
  const sal=cents(comp.salary_reference);
  const absence=cents(review.absence_estimate);
  const dsr=cents(review.dsr_estimate);
  const discount=cents(review.combined_discount_reference);
  const kinds=['inss','irrf','fgts'];
  const contributions={},original={},before={},adjusted={},status={};
  const events=inc.event_rows||[];
  if(!absenceItem||absenceItem.employee_id!==item.employee_id)
    add('FUNCIONARIO_NAO_CONCILIADO','Funcionario sem referencia correspondente na conferencia de faltas/DSR.');
  if(absenceItem&&absenceItem.employee_name!==item.employee_name)
    add('IDENTIDADE_DIVERGENTE','Nome divergente entre bases da mesma competencia.');
  if(sal===null)add('SALARIO_INCOMPLETO','Historico salarial proporcional nao cobre a referencia necessaria.');
  const segmentList=item.salary_segments||[];
  if(segmentList.length!==1||!segmentList[0].start_date?.startsWith(competence)||
    !segmentList[0].end_date?.startsWith(competence))
    add('SEGMENTOS_NAO_HOMOLOGADOS','Admissao proporcional, mudanca de salario ou lacuna de historico requer regra especifica.');
  if(item.admission_date && item.admission_date>competence+'-01')
    add('ADMISSAO_PARCIAL','Admissao no mes exige base proporcional a conferir.');
  if(item.overlapping_occurrence_days)
    add('OCORRENCIAS_SOBREPOSTAS','Ocorrencias sobrepostas impedem recomposicao segura.');
  if((item.occurrences||[]).some(x=>x.kind!=='FALTA'))
    add('OCORRENCIA_ESPECIAL','Ferias, licencas e afastamentos nao usam este ajuste simplificado.');
  if(review.status==='PENDENTE'||discount===null||absence===null||dsr===null)
    add('FALTAS_DSR_NAO_CONFERIDOS','Etapa 22 nao liberou total de faltas e DSR para conferencia.');
  if((review.issues||[]).length)
    add('REVISAO_COM_ERROS','Existem alertas impeditivos na conferencia de faltas e DSR.');
  if(sal!==null&&discount!==null&&BigInt(discount)>BigInt(sal))
    add('ABATIMENTO_EXCEDE_SALARIO','Abatimento indicativo ultrapassa a parcela salarial historica.');
  if(sal!==null&&discount!==null && BigInt(sal)>MAX)
    add('LIMITE_MONETARIO','Referencia excede o limite monetario da simulacao.');
  const duplicateSalary=(item.events||[]).some(x=>x.type==='PROVENTO'&&
    /^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test(String(x.event_name||'').trim()));
  if(duplicateSalary)add('SALARIO_EM_DUPLICIDADE','Evento de salario base pode duplicar a parcela historica.');
  if((item.events||[]).some(x=>x.type==='DESCONTO'&&
     /(falta|dsr|repouso|descanso\s+semanal)/i.test(String(x.event_name||''))))
    add('ABATIMENTO_JA_LANCADO','Desconto de faltas/DSR existente nos eventos: impedir aplicacao duplicada.');
  if((item.events||[]).length!==events.length)
    add('EVENTOS_NAO_CONCILIADOS','Incidencias e eventos possuem quantidades divergentes.');
  for(const ev of events){
    if(cents(ev.value_preview)===null || ev.validation_status==='PENDENTE')
      add('EVENTO_PENDENTE','Ha eventos sem valor valido ou sem regra vigente.');
    if(kinds.some(k=>!['SIM','NAO'].includes(ev[k])))
      add('INCIDENCIA_PENDENTE','Evento sem classificacao confirmada para todas as bases.');
    if(ev.event_type==='DESCONTO'&&kinds.some(k=>ev[k]==='SIM'))
      add('REDUTOR_ESPECIFICO','Desconto com incidencia requer tratamento legal especifico.');
    if(ev.event_type==='INFORMATIVO'&&kinds.some(k=>ev[k]==='SIM'))
      add('INFORMATIVO_TRIBUTAVEL','Evento informativo com incidencia depende de classificacao.');
    if(!['PROVENTO','DESCONTO','INFORMATIVO'].includes(ev.event_type))
      add('TIPO_EVENTO_INVALIDO','Tipo de evento nao reconhecido.');
  }
  for(const kind of kinds){
    contributions[kind]=cents(inc.event_contributions?.[kind]);
    original[kind]=inc.potential_bases?.[kind]??null;
    if(contributions[kind]===null)add('CONTRIBUICAO_INCONSISTENTE','Soma de proventos tributaveis indisponivel para '+kind.toUpperCase()+'.');
    if(sal!==null&&contributions[kind]!==null){
      const beforeValue=BigInt(sal)+BigInt(contributions[kind]);
      before[kind]=beforeValue<=MAX?centsToMoney(Number(beforeValue)):null;
      if(before[kind]===null)add('LIMITE_MONETARIO','Soma inicial excede o limite seguro.');
    }else before[kind]=null;
    adjusted[kind]=null;
    status[kind]='PENDENTE';
  }
  // Teste da etapa anterior quando nao ha faltas. Com ocorrencias, a Etapa 15
  // intencionalmente devolve base nula; nunca interpretar nulo como 0.
  if(!(item.occurrences||[]).length){
    for(const kind of kinds){
      const baseline=cents(original[kind]);
      if(before[kind]!==null&&baseline!==null&&baseline!==cents(before[kind]))
        add('BASE_ORIGINAL_DIVERGENTE','Base da Etapa 15 difere do salario + proventos para '+kind.toUpperCase()+'.');
    }
  }
  if(errors.length===0){
    for(const kind of kinds){
      const gross=cents(before[kind]);
      if(gross===null){add('BASE_INCOMPLETA','Componente '+kind.toUpperCase()+' nao pode ser somado.');continue;}
      // Desconto potencial apenas sobre parcela salarial; nunca sobre proventos
      // extras e nunca converte este valor em base fiscal homologada.
      const result=BigInt(gross)-BigInt(discount);
      if(result<0n||result>MAX){add('BASE_FORA_LIMITE','Desconto excede a base de '+kind.toUpperCase()+'.');continue;}
      adjusted[kind]=centsToMoney(Number(result));
      status[kind]='HIPOTESE_A_CONFERIR';
    }
  }
  if(errors.length){for(const k of kinds){adjusted[k]=null;status[k]='PENDENTE';}}
  warnings.push('Incidencia de faltas e DSR nas bases de INSS, IRRF e FGTS e apenas hipotese, sujeita a rubrica, legislacao, feriados e convencao coletiva.');
  warnings.push('IRRF depende de regime de caixa e deducoes legais; esta etapa nao calcula IRRF devido.');
  warnings.push('Nenhum ajuste foi aplicado a eventos, salario, tributos, fechamento, pagamentos ou contabilidade.');
  return {employee_id:item.employee_id,employee_code:absenceItem?.employee_code||null,
    employee_name:item.employee_name,tax_base_recomposition:{
      status:errors.length?'PENDENTE':'HIPOTESE_A_CONFERIR',salary_reference:sal===null?null:centsToMoney(sal),
      absence_reference:absence===null?null:centsToMoney(absence),
      dsr_reference:dsr===null?null:centsToMoney(dsr),
      total_reference:discount===null?null:centsToMoney(discount),
      event_contributions:Object.fromEntries(kinds.map(k=>[k,contributions[k]===null?null:centsToMoney(contributions[k])])),
      original_bases:original,bases_before_absence:before,scenario_after_absence:adjusted,
      statuses:status,issues:errors,warnings,
      read_only:true,applied:false,net_pay:null,approved:false,homologated:false,
      taxes_due:null,ready_for_payroll:false,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false
    },net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollTaxBaseRecompositionPreview23(env,companyId,competenceId,paymentDate){
  const [inc,abs]=await Promise.all([
    payrollIncidencePreview15(env,companyId,competenceId,paymentDate),
    payrollAbsenceDsrPreview22(env,companyId,competenceId,paymentDate)
  ]);
  if(inc.competence?.competence!==abs.competence?.competence||inc.payment_date!==abs.payment_date)
    throw new HttpError(409,'Competencia ou pagamento divergente entre conferencias.','PREVIEW_MISMATCH');
  const absMap=new Map();
  for(const i of abs.items){
    if(absMap.has(i.employee_id))throw new HttpError(409,'Funcionario duplicado na conferencia de faltas.','PREVIEW_MISMATCH');
    absMap.set(i.employee_id,i);
  }
  const items=inc.items.map(x=>payrollTaxBaseRecompositionItem23(x,absMap.get(x.employee_id)||null,inc.competence.competence));
  if(items.length!==abs.items.length||items.some(x=>!absMap.has(x.employee_id)))
    throw new HttpError(409,'Listas de funcionarios nao coincidem nas conferencias.','PREVIEW_MISMATCH');
  return {kind:'RECOMPOSICAO_BASES_FALTAS_DSR_ETAPA_23',competence:inc.competence,
    payment_date:inc.payment_date,items,employee_count:items.length,
    preview_employee_count:items.filter(x=>x.tax_base_recomposition.status==='HIPOTESE_A_CONFERIR').length,
    pending_employee_count:items.filter(x=>x.tax_base_recomposition.status==='PENDENTE').length,
    read_only:true,preview_only:true,folha_liquida:null,net_pay:null,taxes_calculated:false,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Recomposicao apenas ilustrativa de bases; nenhuma incidencia fiscal ou desconto esta homologado.'};
}

// ===== SAGAS Folha Etapa 24: simulacao sobre as bases recompostas =====
// A Etapa 23 fornece apenas cenarios matematicos de incidencia. Estes valores
// nao sao bases homologadas e NUNCA geram descontos reais ou salario liquido.
function payrollRecomposedTaxItem24(item,dependents,competence,paymentDate){
  const source=item.tax_base_recomposition||{};
  const bases=source.scenario_after_absence||{};
  const kinds=['inss','irrf','fgts'];
  const issues=[],warnings=[];
  const add=(code,detail)=>{if(!issues.some(x=>x.code===code)&&issues.length<80)issues.push({code,detail});};
  if(!item.employee_id || !item.employee_code || !/^\d{5}$/.test(item.employee_code))
    add('FUNCIONARIO_INCONSISTENTE','Funcionário sem ID sequencial válido para conferência.');
  if(source.status!=='HIPOTESE_A_CONFERIR'||(source.issues||[]).length)
    add('RECOMPOSICAO_PENDENTE','A Etapa 23 não liberou todas as bases para a hipótese fiscal.');
  const cents={};
  for(const kind of kinds){
    cents[kind]=payrollCompositionCents(bases[kind]);
    if(cents[kind]===null || cents[kind]>99999999999)
      add('BASE_'+kind.toUpperCase()+'_PENDENTE','Base recomposta de '+kind.toUpperCase()+' não é segura ou está pendente.');
    if(source.statuses?.[kind]!=='HIPOTESE_A_CONFERIR')
      add('CLASSIFICACAO_'+kind.toUpperCase()+'_PENDENTE','Conferência de incidência da base '+kind.toUpperCase()+' incompleta.');
  }
  if(!Number.isSafeInteger(dependents)||dependents<0||dependents>100)
    add('DEPENDENTES_INVALIDOS','Quantidade de dependentes na data do pagamento é inconsistente.');
  warnings.push('As bases de INSS, IRRF e FGTS após faltas/DSR são apenas hipóteses: conferir natureza legal das rubricas, escala, feriados e instrumentos coletivos.');
  warnings.push('Considera somente o vínculo examinado. Verificar múltiplos vínculos, pensão judicial, pagamentos acumulados, férias, 13º, rescisão e categorias especiais.');
  warnings.push('O IRRF usa o rendimento mensal recomposto como hipótese, com deduções da simulação; exige validação pelo regime de caixa e demais rendimentos.');
  warnings.push('FGTS na alíquota geral ilustrativa de 8% é encargo do empregador e não desconto do trabalhador.');
  let results=null;
  if(issues.length===0){
    try{
      const tax=payrollTaxHistoricalWithDependents(cents.inss,cents.irrf,cents.fgts,
        competence,paymentDate,dependents);
      const deductionSum=BigInt(tax.inss_cents)+BigInt(tax.irrf_cents);
      if(deductionSum>99999999999n)throw new Error('Soma de descontos simulados excede limite.');
      results={
        inss_estimate:centsToMoney(tax.inss_cents),
        irrf_estimate:centsToMoney(tax.irrf_cents),
        fgts_employer_estimate:centsToMoney(tax.fgts_cents),
        sum_employee_tax_simulations:centsToMoney(Number(deductionSum)),
        irrf_base_estimate:centsToMoney(tax.irrf_base_cents),
        irrf_before_reduction:centsToMoney(tax.irrf_original_cents),
        irrf_reduction:centsToMoney(tax.irrf_reduction_cents),
        irrf_deduction:centsToMoney(tax.irrf_deduction_cents),
        irrf_deduction_type:tax.irrf_deduction_type,
        irrf_dependents:dependents,
        inss_table_from:tax.inss_table_from,irrf_table_from:tax.irrf_table_from,
        inss_mode:tax.inss_mode,fgts_employee_discount:false
      };
    }catch(err){
      add('SIMULACAO_INDISPONIVEL',String(err?.message||'Cálculo tributário pendente.').slice(0,160));
    }
  }
  return {...item,recomposed_tax_simulation:{
    status:results?'HIPOTESE_TRIBUTARIA_A_CONFERIR':'PENDENTE',
    bases_recomposed:{inss:bases.inss??null,irrf:bases.irrf??null,fgts:bases.fgts??null},
    dependents_considered:Number.isSafeInteger(dependents)&&dependents>=0&&dependents<=100?dependents:null,
    estimates:results,issues,warnings,read_only:true,calculated:!!results,
    bases_homologated:false,taxes_due:null,taxes_withheld:null,fgts_deposited:false,
    applied:false,approved:false,homologated:false,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollRecomposedTaxPreview24(env,companyId,competenceId,paymentDate){
  const date=histPaymentDate(paymentDate);
  const prior=await payrollTaxBaseRecompositionPreview23(env,companyId,competenceId,date);
  const competence=prior.competence?.competence;
  histTable(HIST_INSS,competence);
  histTable(HIST_IRRF,date.slice(0,7));
  // Dependentes vigentes no pagamento; consulta limitada exclusivamente à empresa.
  const employees=prior.items.map(x=>x.employee_id);
  if(employees.length>2000)throw new HttpError(409,'Prévia excedeu limite de funcionários.','PREVIEW_LIMIT');
  const dependentRows=await env.DB.prepare(`SELECT employee_id,COUNT(*) AS total
    FROM payroll_employee_dependents
    WHERE company_id=? AND irrf_eligible=1 AND effective_from<=?
      AND (effective_to IS NULL OR effective_to>=?)
    GROUP BY employee_id LIMIT 2001`).bind(companyId,date,date).all();
  if((dependentRows.results||[]).length>2000)
    throw new HttpError(409,'Dependentes excedem limite da prévia.','PREVIEW_LIMIT');
  const dependents=new Map((dependentRows.results||[]).map(x=>[x.employee_id,Number(x.total)]));
  const items=prior.items.map(x=>payrollRecomposedTaxItem24(x,dependents.get(x.employee_id)||0,competence,date));
  return {kind:'TRIBUTOS_BASES_RECOMPOSTAS_ETAPA_24',competence:prior.competence,
    payment_date:date,items,employee_count:items.length,
    scenario_employee_count:items.filter(x=>x.recomposed_tax_simulation.calculated).length,
    pending_employee_count:items.filter(x=>!x.recomposed_tax_simulation.calculated).length,
    read_only:true,preview_only:true,simulated:true,taxes_calculated:false,
    taxes_due:null,folha_liquida:null,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Hipóteses de INSS/IRRF/FGTS sobre bases recompostas, sem desconto, depósito, homologação ou efeitos fiscais.'};
}

// ===== SAGAS Folha Etapa 25: conciliacao aritmetica de remuneracao recomposta =====
// Estritamente read-only: os eventos continuam cadastrados, as faltas/DSR e
// os tributos continuam hipoteticos e nenhuma conta a pagar recebe o saldo.
function payrollReconciledRemunerationItem25(item){
  const recomposition=item.tax_base_recomposition||{};
  const tax=item.recomposed_tax_simulation||{};
  const amounts=tax.estimates||{};
  const inc=item.incidence_review||{};
  const events=item.events||[];
  const incidenceRows=inc.event_rows||[];
  const issues=[],warnings=[];
  const limit=99999999999n;
  const add=(code,detail)=>{
    if(!issues.some(x=>x.code===code)&&issues.length<100)issues.push({code,detail});
  };
  const val=payrollCompositionCents;
  const money=n=>n===null?null:centsToMoney(Number(n));
  if(!item.employee_id||!/^[0-9]{5}$/.test(String(item.employee_code||'')))
    add('IDENTIFICACAO_PENDENTE','Identificador do funcionario ausente ou fora da mascara de cinco digitos.');
  if(recomposition.status!=='HIPOTESE_A_CONFERIR'||(recomposition.issues||[]).length)
    add('BASES_PENDENTES','Etapa 23 nao disponibilizou as tres bases recompostas para conferencia.');
  if(tax.status!=='HIPOTESE_TRIBUTARIA_A_CONFERIR'||!tax.calculated||(tax.issues||[]).length)
    add('TRIBUTOS_PENDENTES','Etapa 24 nao apresentou simulacoes fiscais consistentes.');
  const salary=val(recomposition.salary_reference);
  const absence=val(recomposition.absence_reference);
  const dsr=val(recomposition.dsr_reference);
  const absenceTotal=val(recomposition.total_reference);
  const inss=val(amounts.inss_estimate);
  const irrf=val(amounts.irrf_estimate);
  const fgts=val(amounts.fgts_employer_estimate);
  const taxSum=val(amounts.sum_employee_tax_simulations);
  for(const [name,n] of [['SALARIO',salary],['FALTAS',absence],['DSR',dsr],
    ['ABATIMENTOS',absenceTotal],['INSS',inss],['IRRF',irrf],['FGTS',fgts],['SOMA_TRIBUTOS',taxSum]]){
    if(n===null)add(name+'_INCOMPLETO','Componente '+name+' nao tem valor em centavos conciliavel.');
    else if(BigInt(n)>limit)add(name+'_EXCEDE_LIMITE','Componente '+name+' excede o limite seguro.');
  }
  if(salary!==null&&absenceTotal!==null&&BigInt(absenceTotal)>BigInt(salary))
    add('ABATIMENTO_EXCEDE_SALARIO','Faltas e DSR hipoteticos excedem a referencia salarial.');
  if([absence,dsr,absenceTotal].every(n=>n!==null)&&
    BigInt(absence)+BigInt(dsr)!==BigInt(absenceTotal))
    add('SOMA_FALTAS_DSR_DIVERGENTE','Soma das faltas e DSR difere do total da Etapa 23 por pelo menos um centavo.');
  if([inss,irrf,taxSum].every(n=>n!==null)&&BigInt(inss)+BigInt(irrf)!==BigInt(taxSum))
    add('SOMA_INSS_IRRF_DIVERGENTE','Soma tributaria simulada difere dos descontos INSS e IRRF.');
  if(amounts.fgts_employee_discount!==false)
    add('FGTS_SEM_SEPARACAO','A origem nao confirmou FGTS como encargo exclusivo do empregador.');
  if(!amounts.inss_table_from||!amounts.irrf_table_from)
    add('TABELAS_PENDENTES','As versoes das tabelas de INSS e IRRF precisam acompanhar a simulacao.');
  if(events.length>500||incidenceRows.length>500)
    add('LIMITE_EVENTOS','Conferencia por funcionario limitada a 500 eventos.');
  const seen=new Set(),matched=new Map(),rows=[];
  for(const r of incidenceRows){
    if(!r.movement_id||matched.has(r.movement_id))
      add('REGRA_DUPLICADA','Ha eventos repetidos ou sem ID na conferencia de incidencias.');
    else matched.set(r.movement_id,r);
  }
  if(events.length!==incidenceRows.length)
    add('TOTAL_LINHAS_DIVERGENTE','Quantidade de movimentos difere da lista de incidencias.');
  let earnings=0n,deductions=0n,informative=0n,allKnown=true;
  for(const event of events){
    const id=event.id||null, rule=id?matched.get(id):null;
    const cents=val(event.value_preview);
    const type=event.type||null;
    const validType=['PROVENTO','DESCONTO','INFORMATIVO'].includes(type);
    if(!id||seen.has(id))add('MOVIMENTO_DUPLICADO','ID ausente ou repetido na lista de movimentos.');
    if(id)seen.add(id);
    if(!validType||cents===null||event.status==='PENDENTE'){
      allKnown=false;add('EVENTO_SEM_VALOR','Um evento esta sem valorizacao valida ou tipo confirmado.');
    }else{
      if(type==='PROVENTO')earnings+=BigInt(cents);
      else if(type==='DESCONTO')deductions+=BigInt(cents);
      else informative+=BigInt(cents);
    }
    if(!rule||rule.event_type!==type||val(rule.value_preview)!==cents||
      rule.validation_status!=='CONFERENCIA'||!rule.rule_version||
      ['inss','irrf','fgts'].some(k=>!['SIM','NAO'].includes(rule[k])))
      add('INCIDENCIA_NAO_CONCILIADA','Movimento e regra fiscal nao coincidem para '+String(event.event_code||id||'?').slice(0,55)+'.');
    const name=String(event.event_name||'')+' '+String(event.event_code||'');
    if(type==='PROVENTO'&&/^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test(String(event.event_name||'').trim()))
      add('SALARIO_DUPLICADO','Evento de salario base pode duplicar a referencia historica.');
    if(type==='DESCONTO'&&/(?:falta|\bdsr\b|repouso|descanso\s+semanal|\binss\b|\birrf\b|\bfgts\b|previd[êe]ncia|imposto\s+de\s+renda)/i.test(name))
      add('DESCONTO_REPETIDO','Existe desconto possivelmente duplicado de falta, DSR ou tributo em evento lancado.');
    if(/13\s*(?:º|o|\.|-)?\s*sal|d[eé]cimo\s+terceiro|f[ée]rias|rescis|afastamento|licen[çc]a|pens[ãa]o|judicial/i.test(name))
      add('VERBA_ESPECIAL','Existe rubrica especial que exige apuracao especifica fora do cenario mensal.');
    rows.push({movement_id:id,event_code:event.event_code||null,
      event_name:event.event_name||null,type,unit:event.unit||null,
      value_preview:cents===null?null:centsToMoney(cents),
      inss:rule?.inss||'PENDENTE',irrf:rule?.irrf||'PENDENTE',
      fgts:rule?.fgts||'PENDENTE',rule_version:rule?.rule_version||null,
      status:cents!==null&&validType&&rule?.validation_status==='CONFERENCIA'?'CONFERENCIA':'PENDENTE'});
  }
  if([earnings,deductions,informative].some(n=>n>limit))
    add('EVENTOS_FORA_LIMITE','Soma das verbas excede limite monetario seguro.');
  if(!allKnown)add('MOVIMENTOS_PENDENTES','Totais por tipo de evento nao puderam ser conferidos.');
  // Se houver total na Etapa 14, conferir em centavos; em meses com faltas
  // essa fonte pode ser nula sem invalidar os movimentos rastreados.
  for(const [label,origin,computed] of [
    ['PROVENTOS',item.composition?.event_earnings,earnings],
    ['DESCONTOS',item.composition?.event_deductions,deductions]]){
    const prior=val(origin);
    if(prior!==null&&allKnown&&BigInt(prior)!==computed)
      add('TOTAL_'+label+'_DIVERGENTE','Soma dos eventos de '+label+' difere da composicao anterior.');
  }
  // A base recomposta considera exclusivamente proventos incidentes, que
  // podem diferir do total de proventos; confirmar internamente sua origem.
  for(const type of ['inss','irrf','fgts']){
    const income=val(inc.event_contributions?.[type]);
    const base=val(recomposition.scenario_after_absence?.[type]);
    if(income===null||base===null||salary===null||absenceTotal===null){
      add('BASE_'+type.toUpperCase()+'_PENDENTE','Base '+type.toUpperCase()+' ou parcela incidente nao conciliavel.');
    }else if(BigInt(salary)+BigInt(income)-BigInt(absenceTotal)!==BigInt(base))
      add('BASE_'+type.toUpperCase()+'_DIVERGENTE','Base '+type.toUpperCase()+' nao fecha em centavos com salario + proventos incidentes - faltas/DSR.');
    if(base!==null&&val(tax.bases_recomposed?.[type])!==base)
      add('BASE_'+type.toUpperCase()+'_TRIBUTO_DIVERGENTE','Base de '+type.toUpperCase()+' da Etapa 24 nao coincide com a recomposicao.');
  }
  let gross=null,afterAbsence=null,afterEvents=null,projected=null;
  if(salary!==null&&absenceTotal!==null&&allKnown&&earnings<=limit&&deductions<=limit){
    const g=BigInt(salary)+earnings;
    const a=g-BigInt(absenceTotal);
    const subtotal=a-deductions;
    if(g>limit||a<0n||a>limit||subtotal<0n||subtotal>limit)
      add('SUBTOTAL_FORA_LIMITE','Remuneracao e descontos produzem saldo negativo ou superior ao limite.');
    else{gross=g;afterAbsence=a;afterEvents=subtotal;}
  }
  if(afterEvents!==null&&inss!==null&&irrf!==null){
    const p=afterEvents-BigInt(inss)-BigInt(irrf);
    if(p<0n||p>limit)add('DESCONTOS_EXCEDEM_REMUNERACAO','Descontos simulados ultrapassam a remuneracao da hipotese.');
    else if(!issues.length)projected=p;
  }
  warnings.push('A soma e apenas hipotese matematica; faltas, DSR, incidencias e tributos precisam de homologacao trabalhista e fiscal.');
  warnings.push('INSS e IRRF continuam simulacoes, nao retencoes. FGTS e encargo do empregador e nunca reduz a remuneracao.');
  warnings.push('Nao contempla ferias, 13o, rescisao, afastamentos, multiplos vinculos, pensoes ou normas coletivas especiais.');
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,remuneration_reconciliation:{
      status:projected===null?'PENDENTE':'HIPOTESE_ARITMETICA_A_CONFERIR',
      salary_reference:money(salary),event_earnings:allKnown&&earnings<=limit?money(earnings):null,
      event_deductions:allKnown&&deductions<=limit?money(deductions):null,
      informative_events:allKnown&&informative<=limit?money(informative):null,
      absence_reference:money(absence),dsr_reference:money(dsr),
      absence_dsr_reference:money(absenceTotal),
      gross_before_absence:money(gross),
      balance_after_absence:money(afterAbsence),
      balance_after_event_deductions:money(afterEvents),
      inss_simulated:money(inss),irrf_simulated:money(irrf),
      fgts_employer_simulated:money(fgts),
      arithmetic_balance_projection:money(projected),
      inss_table_from:amounts.inss_table_from||null,
      irrf_table_from:amounts.irrf_table_from||null,
      lines:rows,issues,warnings,
      read_only:true,preview_only:true,approved:false,homologated:false,
      net_pay:null,net_pay_calculated:false,taxes_withheld:null,fgts_deposited:false,
      ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
      ready_for_closure:false
    },net_pay:null,folha_liquida:null,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false};
}
async function payrollReconciledRemunerationPreview25(env,companyId,competenceId,paymentDate){
  // O pipeline anterior confere empresa, competencia, pagamento e versoes de
  // regras, sem expor dados de outra coligada.
  const previous=await payrollRecomposedTaxPreview24(env,companyId,competenceId,paymentDate);
  const items=previous.items.map(payrollReconciledRemunerationItem25);
  return {kind:'CONCILIACAO_REMUNERACAO_RECOMPOSTA_ETAPA_25',competence:previous.competence,
    payment_date:previous.payment_date,items,employee_count:items.length,
    projected_employee_count:items.filter(x=>x.remuneration_reconciliation.status==='HIPOTESE_ARITMETICA_A_CONFERIR').length,
    pending_employee_count:items.filter(x=>x.remuneration_reconciliation.status==='PENDENTE').length,
    read_only:true,preview_only:true,homologated:false,net_pay:null,folha_liquida:null,
    taxes_withheld:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Conciliacao aritmetica das referencias e impostos simulados: nao e folha liquida, nao desconta, nao paga nem contabiliza.'};
}

// ===== SAGAS Folha Etapa 31: versoes IMUTAVEIS de demonstrativos nao homologados =====
// Este documento nao constitui folha liquida. Nao altera payroll_movements,
// financeiro, contabilidade ou estados de competencias. Conteudos em centavos.
async function ensurePayrollCalculationVersionsSchema31(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_calculation_versions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      competence_id TEXT NOT NULL REFERENCES payroll_competences(id) ON DELETE RESTRICT,
      payment_date TEXT NOT NULL,
      run_id TEXT NOT NULL REFERENCES payroll_processing_runs(id) ON DELETE RESTRICT,
      run_fingerprint TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version>0),
      fingerprint TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,run_id),
      UNIQUE(company_id,competence_id,payment_date,version)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_calc_versions_competence
      ON payroll_calculation_versions(company_id,competence_id,payment_date,version DESC)`)
  ]);
}
function payrollCalculationVersionMeta31(r){
  return {id:r.id,competence_id:r.competence_id,payment_date:r.payment_date,
    run_id:r.run_id,run_fingerprint:r.run_fingerprint,version:Number(r.version),
    fingerprint:r.fingerprint,created_by:r.created_by,created_at:r.created_at,
    kind:'VERSAO_DEMONSTRATIVA_ETAPA_31',homologated:false,approved:false,
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
function payrollCalculationVersionSnapshot31(run,snapshot,reconciliation){
  if(!run||!snapshot||snapshot.kind!=='PROTOCOLO_CONFERENCIA_ETAPA_28'||
     snapshot.employee_count<1||!Array.isArray(snapshot.items)||
     snapshot.items.length!==snapshot.employee_count||
     !reconciliation||!Array.isArray(reconciliation.items)||
     reconciliation.competence?.id!==run.competence_id||
     reconciliation.approved!==undefined&&reconciliation.approved!==false||
     reconciliation.ready_for_payment!==false||reconciliation.ready_for_accounting!==false)
    throw new HttpError(409,'Origem da versao demonstrativa inconsistente.','INVALID_CALCULATION_SOURCE');
  const lookup=new Map();
  for(const e of reconciliation.items){
    if(!e.employee_id||lookup.has(e.employee_id))
      throw new HttpError(409,'Lista de funcionarios repetida ou incompleta.','INVALID_CALCULATION_EMPLOYEE');
    lookup.set(e.employee_id,e);
  }
  if(lookup.size!==snapshot.items.length)
    throw new HttpError(409,'Quantidade de funcionarios divergente entre fontes.','CALCULATION_SOURCE_MISMATCH');
  const fields=['salary_reference','event_earnings','gross_before_absence',
    'absence_reference','dsr_reference','absence_dsr_reference',
    'balance_after_absence','event_deductions','balance_after_event_deductions',
    'inss_simulated','irrf_simulated','fgts_employer_simulated',
    'arithmetic_balance_projection'];
  const items=[];
  for(const emp of snapshot.items){
    const live=lookup.get(emp.employee_id);
    if(!live||live.employee_code!==emp.employee_code||
       !/^[0-9]{5}$/.test(String(emp.employee_code||'')))
      throw new HttpError(409,'ID do funcionario diverge do protocolo.','EMPLOYEE_ID_MISMATCH');
    const calc=live.remuneration_reconciliation||{};
    const amounts={};
    for(const field of fields){
      const v=calc[field];
      const cents=v===null||v===undefined?null:payrollCompositionCents(v);
      if(v!==null&&v!==undefined&&cents===null)
        throw new HttpError(409,'Valor invalido no demonstrativo: '+field,'INVALID_CALCULATION_AMOUNT');
      amounts[field]=cents;
    }
    const reference=emp.arithmetic_reference_cents;
    if(reference!==null&&(!Number.isSafeInteger(reference)||reference<0))
      throw new HttpError(409,'Referencia tecnica invalida no protocolo.','INVALID_CALCULATION_REFERENCE');
    // Referencia anterior nao e salario liquido. A propria versao fica pendente
    // quando a origem fiscal/aritmetica nao disponibiliza todas as parcelas.
    const confirmed=calc.status==='HIPOTESE_ARITMETICA_A_CONFERIR'&&
      Array.isArray(calc.issues)&&calc.issues.length===0&&
      fields.every(field=>amounts[field]!==null)&&
      emp.state==='CONFERENCIA_TECNICA'&&emp.technical_pending_count===0;
    // Etapa 32: arquivar a fotografia dos EVENTOS das novas versoes.
    // Versoes antigas nao contem estas linhas e NAO podem ser reconstruidas
    // a partir de lancamentos atuais (que poderiam ja ter mudado).
    // Apenas movimentos com identidade unica sao aceitos como historico detalhado.
    let events=null;
    if(Array.isArray(calc.lines)&&calc.lines.length<=500){
      const eventIds=new Set();
      const extracted=[];
      let reliable=true;
      for(const line of calc.lines){
        const movementId=typeof line.movement_id==='string'?line.movement_id.trim():'';
        if(!movementId||eventIds.has(movementId)){
          reliable=false;break;
        }
        eventIds.add(movementId);
        const value=line.value_preview===null||line.value_preview===undefined?
          null:payrollCompositionCents(line.value_preview);
        if(line.value_preview!==null&&line.value_preview!==undefined&&value===null){
          reliable=false;break;
        }
        extracted.push({movement_id:movementId,event_code:String(line.event_code??'').slice(0,50),
          event_name:String(line.event_name??'').slice(0,200),
          type:String(line.type??'').slice(0,30),unit:String(line.unit??'').slice(0,30),
          value_cents:value,inss:String(line.inss??'PENDENTE'),
          irrf:String(line.irrf??'PENDENTE'),fgts:String(line.fgts??'PENDENTE'),
          rule_version:line.rule_version===null?null:String(line.rule_version??'').slice(0,160),
          status:String(line.status??'PENDENTE').slice(0,40)});
      }
      if(reliable)events=extracted.sort((a,b)=>a.movement_id.localeCompare(b.movement_id));
    }
    // A memoria aritmetica e demonstrativa, e nunca vira saldo homologado.
    items.push({employee_id:emp.employee_id,employee_code:emp.employee_code,
      employee_name:emp.employee_name,technical_state:emp.state,
      technical_reference_cents:reference,
      calculation_status:confirmed?'DEMONSTRATIVO_CONCILIADO':'PENDENTE_CONFERENCIA',
      amounts_cents:amounts,events,issues:Array.isArray(calc.issues)?
        calc.issues.slice(0,100).map(i=>({code:String(i.code||'PENDENTE').slice(0,80),
          detail:String(i.detail||'Conferencia necessaria').slice(0,500)})):
        [{code:'CALCULO_INCOMPLETO',detail:'Demonstrativo ainda sem fonte completa.'}],
      net_pay:null,homologated:false,approved:false,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false});
  }
  items.sort((a,b)=>a.employee_id.localeCompare(b.employee_id));
  return {kind:'DOCUMENTO_RESULTADOS_PRELIMINARES_ETAPA_31',
    run_id:run.id,run_fingerprint:run.fingerprint,
    competence_id:run.competence_id,payment_date:run.payment_date,
    employee_count:items.length,pending_count:items.filter(x=>x.calculation_status!=='DEMONSTRATIVO_CONCILIADO').length,
    items,approved:false,homologated:false,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Versao arquivada somente para conferencias. Salario liquido e integracoes indisponiveis.'};
}
async function payrollCalculationVersionsList31(env,companyId,competenceId,paymentDate){
  if(!competenceId)throw new HttpError(400,'Selecione uma competencia.','VALIDATION_ERROR');
  const period=await env.DB.prepare(`SELECT id,competence FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,competenceId).first();
  if(!period)throw new HttpError(404,'Competencia nao encontrada.','NOT_FOUND');
  if(paymentDate)payrollStrictDate(paymentDate,'data do pagamento');
  const q=paymentDate?
    env.DB.prepare(`SELECT id,competence_id,payment_date,run_id,run_fingerprint,version,fingerprint,created_by,created_at
      FROM payroll_calculation_versions WHERE company_id=? AND competence_id=? AND payment_date=?
      ORDER BY version DESC LIMIT 100`).bind(companyId,competenceId,paymentDate):
    env.DB.prepare(`SELECT id,competence_id,payment_date,run_id,run_fingerprint,version,fingerprint,created_by,created_at
      FROM payroll_calculation_versions WHERE company_id=? AND competence_id=?
      ORDER BY created_at DESC,version DESC LIMIT 100`).bind(companyId,competenceId);
  const found=await q.all();
  return {kind:'HISTORICO_VERSOES_DEMONSTRATIVAS_ETAPA_31',competence:period,
    items:(found.results||[]).map(payrollCalculationVersionMeta31),read_only:true,
    homologated:false,approved:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollCalculationVersionDetail31(env,companyId,id){
  const row=await env.DB.prepare(`SELECT * FROM payroll_calculation_versions
    WHERE company_id=? AND id=?`).bind(companyId,id).first();
  if(!row)throw new HttpError(404,'Versao de demonstrativo nao encontrada.','NOT_FOUND');
  // Confere a integridade do protocolo vinculado E do demonstrativo.
  const source=await payrollProcessingRunDetail28(env,companyId,row.run_id);
  if(source.run.fingerprint!==row.run_fingerprint||
     source.run.competence_id!==row.competence_id||source.run.payment_date!==row.payment_date)
    throw new HttpError(409,'Versao nao corresponde ao protocolo historico.','VERSION_SOURCE_MISMATCH');
  let document;
  try{document=JSON.parse(row.document_json)}catch{
    throw new HttpError(409,'Documento de calculo invalido.','VERSION_INTEGRITY_ERROR');
  }
  const digest=await payrollProcessingSnapshotHash28(document);
  if(digest!==row.fingerprint||document.run_id!==row.run_id||
     document.run_fingerprint!==row.run_fingerprint||
     document.competence_id!==row.competence_id||
     document.payment_date!==row.payment_date||
     document.kind!=='DOCUMENTO_RESULTADOS_PRELIMINARES_ETAPA_31'||
     document.net_pay!==null||document.approved!==false||document.homologated!==false)
    throw new HttpError(409,'Integridade da versao de calculo comprometida.','VERSION_INTEGRITY_ERROR');
  return {kind:'DETALHE_VERSAO_DEMONSTRATIVA_ETAPA_31',
    version:payrollCalculationVersionMeta31(row),document,read_only:true,
    homologated:false,approved:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollCalculationVersionCreate31(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const runId=String(body?.run_id||'');
  if(!runId)throw new HttpError(400,'Informe o protocolo de origem.','VALIDATION_ERROR');
  const status=await payrollProcessingReviewStatus29(env,companyId,runId);
  const run=status.run;
  // Somente protocolo atual, tecnicamente conciliado e com ciencia vigente.
  if(!status.snapshot_current||!status.technical_complete||
     !status.technical_acknowledgment_current||status.competence_status!=='OPEN')
    throw new HttpError(409,'O protocolo precisa estar atual, sem pendencias e com ciencia tecnica vigente.','VERSION_PREREQUISITES');
  const existing=await env.DB.prepare(`SELECT id FROM payroll_calculation_versions
    WHERE company_id=? AND run_id=?`).bind(companyId,runId).first();
  if(existing)return {kind:'VERSAO_DEMONSTRATIVA_ETAPA_31',created:false,
    ...await payrollCalculationVersionDetail31(env,companyId,existing.id)};
  const runDetail=await payrollProcessingRunDetail28(env,companyId,runId);
  const reconciliation=await payrollReconciledRemunerationPreview25(env,companyId,
    run.competence_id,run.payment_date);
  // Rechecar atualidade depois dos calculos para reduzir riscos de dados velhos;
  // nao equivale a trava transacional de homologacao, que ainda nao existe.
  const again=await payrollProcessingReviewStatus29(env,companyId,runId);
  if(!again.snapshot_current||!again.technical_acknowledgment_current)
    throw new HttpError(409,'Dados alterados durante a conferência; registre novo protocolo.','VERSION_SOURCE_CHANGED');
  const doc=payrollCalculationVersionSnapshot31(run,runDetail.snapshot,reconciliation);
  const json=JSON.stringify(doc);
  if(json.length>1500000)throw new HttpError(413,'Demonstrativo excede limite de tamanho.','VERSION_TOO_LARGE');
  const fingerprint=await payrollProcessingSnapshotHash28(doc);
  const id=uuid();
  // Numero sequencial atribuido em um INSERT atomico no SQLite/D1.
  const inserted=await env.DB.prepare(`INSERT INTO payroll_calculation_versions
    (id,company_id,competence_id,payment_date,run_id,run_fingerprint,version,fingerprint,document_json,created_by)
    SELECT ?,r.company_id,r.competence_id,r.payment_date,r.id,r.fingerprint,
      COALESCE((SELECT MAX(v.version) FROM payroll_calculation_versions v
        WHERE v.company_id=r.company_id AND v.competence_id=r.competence_id
          AND v.payment_date=r.payment_date),0)+1,?,?,?
    FROM payroll_processing_runs r JOIN payroll_competences c
      ON c.id=r.competence_id AND c.company_id=r.company_id
    WHERE r.id=? AND r.company_id=? AND c.status='OPEN' AND r.state='CONFERENCIA_TECNICA'
      AND r.pending_count=0 AND r.technical_count=r.employees_count AND r.employees_count>0
    ON CONFLICT(company_id,run_id) DO NOTHING`)
    .bind(id,fingerprint,json,auth.user.id,runId,companyId).run();
  const row=await env.DB.prepare(`SELECT id FROM payroll_calculation_versions
    WHERE company_id=? AND run_id=?`).bind(companyId,runId).first();
  if(!row)throw new HttpError(409,'Competencia bloqueada ou versao nao registrada.','VERSION_WRITE_BLOCKED');
  const created=Number(inserted?.meta?.changes??inserted?.changes??0)>0;
  if(created)await audit(env,{companyId,userId:auth.user.id,action:'CREATE',
    entity:'payroll_calculation_versions',entityId:row.id,
    after:{run_id:runId,run_fingerprint:run.fingerprint,fingerprint,
      kind:'DEMONSTRATIVO_NAO_HOMOLOGADO'},request});
  const detail=await payrollCalculationVersionDetail31(env,companyId,row.id);
  return {kind:'VERSAO_DEMONSTRATIVA_ETAPA_31',created,...detail};
}

// ===== SAGAS Folha Etapa 32: comparacao HISTORICA de versoes demonstrativas =====
// NUNCA usa movimentos atuais para inferir mudancas do passado.
// O comparador valida o hash de CADA documento por meio do leitor da Etapa 31.
const PAYROLL_COMPARISON_FIELDS_32=[
  'salary_reference','event_earnings','gross_before_absence',
  'absence_reference','dsr_reference','absence_dsr_reference',
  'balance_after_absence','event_deductions','balance_after_event_deductions',
  'inss_simulated','irrf_simulated','fgts_employer_simulated',
  'arithmetic_balance_projection'
];
function payrollComparisonValue32(value){
  // null e ausencia de valor; NUNCA equivale a zero.
  if(value===null||value===undefined)return null;
  if(!Number.isSafeInteger(value))
    throw new HttpError(409,'Valor historico invalido para comparacao.','VERSION_INVALID_AMOUNT');
  return value;
}
function payrollComparisonDiff32(before,after){
  const a=payrollComparisonValue32(before),b=payrollComparisonValue32(after);
  return {before_cents:a,after_cents:b,
    delta_cents:a===null||b===null?null:b-a,
    status:a===null&&b===null?'SEM_ALTERACAO':
      a===null?'AGORA_DISPONIVEL':b===null?'AGORA_INDISPONIVEL':
      a===b?'SEM_ALTERACAO':'ALTERADO'};
}
function payrollComparisonEventsIndex32(items){
  if(!Array.isArray(items))return null;
  const entries=new Map();
  for(const item of items){
    if(!item||typeof item.movement_id!=='string'||!item.movement_id||
      entries.has(item.movement_id))
      throw new HttpError(409,'Eventos historicos com IDs ambiguos.','VERSION_EVENTS_AMBIGUOUS');
    entries.set(item.movement_id,item);
  }
  return entries;
}
function payrollComparisonEmployeeIndex32(document){
  const map=new Map();
  if(!document||!Array.isArray(document.items))
    throw new HttpError(409,'Documento historico sem funcionarios.','VERSION_INVALID_DOCUMENT');
  for(const item of document.items){
    if(!item||typeof item.employee_id!=='string'||!item.employee_id||map.has(item.employee_id))
      throw new HttpError(409,'Funcionarios historicos duplicados.','VERSION_INVALID_DOCUMENT');
    map.set(item.employee_id,item);
  }
  return map;
}
function payrollComparisonEventChanges32(before,after){
  const a=payrollComparisonEventsIndex32(before?.events);
  const b=payrollComparisonEventsIndex32(after?.events);
  if(!a||!b)return {available:false,
    reason:'Pelo menos uma das versoes nao arquivou os eventos. Nao e possivel identificar mudancas historicas por evento sem inventar dados.',
    added:0,removed:0,changed:0,unchanged:0,items:[]};
  const keys=[...new Set([...a.keys(),...b.keys()])].sort();
  const items=[],summary={available:true,reason:null,added:0,removed:0,changed:0,unchanged:0};
  for(const id of keys){
    const x=a.get(id)||null,y=b.get(id)||null;
    const value=payrollComparisonDiff32(x?.value_cents,y?.value_cents);
    const changedFields=[];
    for(const field of ['event_code','event_name','type','unit','inss','irrf','fgts','rule_version','status']){
      if(x&&y&&(x[field]??null)!==(y[field]??null))changedFields.push(field);
    }
    if(x&&y&&value.status!=='SEM_ALTERACAO')changedFields.push('value_cents');
    const state=!x?'INCLUIDO':!y?'EXCLUIDO':changedFields.length?'ALTERADO':'SEM_ALTERACAO';
    if(state==='INCLUIDO')summary.added++;
    else if(state==='EXCLUIDO')summary.removed++;
    else if(state==='ALTERADO')summary.changed++;
    else summary.unchanged++;
    if(state!=='SEM_ALTERACAO')items.push({movement_id:id,state,
      event_code_before:x?.event_code??null,event_code_after:y?.event_code??null,
      event_name_before:x?.event_name??null,event_name_after:y?.event_name??null,
      type_before:x?.type??null,type_after:y?.type??null,
      fields_changed:changedFields,value,
      before:x,after:y});
  }
  return {...summary,items};
}
function payrollComparisonIssueChanges32(before,after){
  const codes=(x)=>new Set((Array.isArray(x?.issues)?x.issues:[]).map(i=>
    String(i?.code||'')+'|'+String(i?.detail||'')));
  const a=codes(before),b=codes(after);
  return {added:[...b].filter(x=>!a.has(x)),removed:[...a].filter(x=>!b.has(x))};
}
function payrollComparisonTotals32(document){
  const totals={};
  for(const field of PAYROLL_COMPARISON_FIELDS_32){
    let sum=0,missing=0;
    for(const emp of document.items){
      const v=payrollComparisonValue32(emp.amounts_cents?.[field]);
      if(v===null)missing++;else sum+=v;
      if(!Number.isSafeInteger(sum))
        throw new HttpError(409,'Total historico excede precisao segura.','VERSION_AMOUNT_OVERFLOW');
    }
    totals[field]={total_cents:missing?null:sum,missing_employees:missing};
  }
  return totals;
}
function payrollCalculationCompareDocuments32(left,right){
  const before=payrollComparisonEmployeeIndex32(left);
  const after=payrollComparisonEmployeeIndex32(right);
  const leftTotals=payrollComparisonTotals32(left),rightTotals=payrollComparisonTotals32(right);
  const totals={};
  let totalFieldsChanged=0;
  for(const field of PAYROLL_COMPARISON_FIELDS_32){
    const diff=payrollComparisonDiff32(leftTotals[field].total_cents,rightTotals[field].total_cents);
    if(diff.status!=='SEM_ALTERACAO')totalFieldsChanged++;
    totals[field]={...diff,left_missing_employees:leftTotals[field].missing_employees,
      right_missing_employees:rightTotals[field].missing_employees};
  }
  const ids=[...new Set([...before.keys(),...after.keys()])].sort();
  const employees=[];
  const summary={employees_added:0,employees_removed:0,employees_changed:0,
    employees_unchanged:0,amount_fields_changed:0,event_changes:0,
    employees_with_unavailable_event_detail:0,total_fields_changed:totalFieldsChanged};
  for(const id of ids){
    const a=before.get(id)||null,b=after.get(id)||null;
    const fields={};
    let changed=0;
    for(const field of PAYROLL_COMPARISON_FIELDS_32){
      const d=payrollComparisonDiff32(a?.amounts_cents?.[field],b?.amounts_cents?.[field]);
      if(a&&b&&d.status!=='SEM_ALTERACAO'){
        changed++;summary.amount_fields_changed++;
      }
      if(d.status!=='SEM_ALTERACAO')fields[field]=d;
    }
    const events=payrollComparisonEventChanges32(a,b);
    if(!events.available&&a&&b)summary.employees_with_unavailable_event_detail++;
    if(events.available)summary.event_changes+=events.added+events.removed+events.changed;
    const issues=payrollComparisonIssueChanges32(a,b);
    const metadataChanged=!!a&&!!b&&(
      a.employee_code!==b.employee_code||a.employee_name!==b.employee_name||
      a.technical_state!==b.technical_state||a.calculation_status!==b.calculation_status||
      issues.added.length>0||issues.removed.length>0);
    const state=!a?'INCLUIDO':!b?'EXCLUIDO':
      changed||metadataChanged||events.available&&(events.added+events.removed+events.changed)>0?
      'ALTERADO':events.available?'SEM_ALTERACAO':'SEM_ALTERACAO_COM_RESSALVA';
    if(state==='INCLUIDO')summary.employees_added++;
    else if(state==='EXCLUIDO')summary.employees_removed++;
    else if(state==='ALTERADO')summary.employees_changed++;
    else summary.employees_unchanged++;
    if(state!=='SEM_ALTERACAO')employees.push({employee_id:id,
      employee_code_before:a?.employee_code??null,employee_code_after:b?.employee_code??null,
      employee_name_before:a?.employee_name??null,employee_name_after:b?.employee_name??null,
      state,calculation_status_before:a?.calculation_status??null,
      calculation_status_after:b?.calculation_status??null,
      technical_state_before:a?.technical_state??null,
      technical_state_after:b?.technical_state??null,
      changed_fields_count:changed,amounts_cents:fields,events,issues});
  }
  return {summary,totals_cents:totals,employees,
    events_fully_comparable:summary.employees_with_unavailable_event_detail===0,
    historical_limitation:summary.employees_with_unavailable_event_detail?
      'Versoes da Etapa 31 anteriores ao v70 nao guardam os eventos individuais. Apenas valores consolidados sao comparaveis nesses registros.':null};
}
async function payrollCalculationVersionsCompare32(env,companyId,leftId,rightId){
  if(!leftId||!rightId)throw new HttpError(400,
    'Informe left_id e right_id das duas versoes.','VALIDATION_ERROR');
  if(leftId===rightId)throw new HttpError(400,
    'Selecione duas versoes diferentes.','VALIDATION_ERROR');
  // Conferencia de hash, protocolo e escopo da empresa em AMBAS as versoes.
  const [left,right]=await Promise.all([
    payrollCalculationVersionDetail31(env,companyId,leftId),
    payrollCalculationVersionDetail31(env,companyId,rightId)
  ]);
  if(left.version.competence_id!==right.version.competence_id||
     left.version.payment_date!==right.version.payment_date)
    throw new HttpError(400,
      'Compare somente versoes da mesma competencia e data de pagamento.',
      'VERSION_SCOPE_MISMATCH');
  // Apresenta em ordem cronologica: antes e depois. O usuario pode passar IDs em qualquer ordem.
  const older=left.version.version<right.version.version?left:right;
  const newer=older===left?right:left;
  const result=payrollCalculationCompareDocuments32(older.document,newer.document);
  return {kind:'COMPARACAO_VERSOES_DEMONSTRATIVAS_ETAPA_32',
    competence_id:older.version.competence_id,payment_date:older.version.payment_date,
    previous_version:older.version,current_version:newer.version,
    ...result,read_only:true,homologated:false,approved:false,net_pay:null,
    ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Comparacao informativa de demonstrativos nao homologados. Nenhum lancamento, pagamento ou fechamento foi executado.'};
}

// ===== SAGAS Folha Etapa 30: matriz de preparacao para homologacao =====
// Somente leitura, nunca transforma ciencia tecnica em folha aprovada.
// Toda regra ainda nao implementada deve permanecer visivelmente bloqueada.
async function payrollHomologationReadiness30(env,companyId,runId){
  // Inclui verificacao SHA-256, isolamento de empresa e confronto com dados atuais.
  const reviewStatus=await payrollProcessingReviewStatus29(env,companyId,runId);
  const run=reviewStatus.run||{};
  const review=reviewStatus.review||null;
  const employees=Number(run.employee_count||0);
  const noTechnicalPending=reviewStatus.technical_complete===true;
  const updated=reviewStatus.consistency==='ATUAL'&&reviewStatus.snapshot_current===true;
  const periodOpen=reviewStatus.competence_status==='OPEN';
  const acknowledged=!!review&&reviewStatus.technical_acknowledgment_current===true&&
    review.fingerprint===run.fingerprint;
  // A regra para futura aprovacao deve exigir pessoa independente da preparacao
  // e da ciencia tecnica. Ainda nao existe cadastro/assinatura de homologadores.
  const preparer=String(run.created_by||'');
  const technicalReviewer=String(review?.reviewed_by||'');
  const separateTechnicalReview=!!preparer&&!!technicalReviewer&&preparer!==technicalReviewer;
  const gates=[];
  const add=(code,title,status,detail,required_action,source)=>{
    gates.push({code,title,status,detail,required_action,source});
  };
  add('INTEGRIDADE_PROTOCOLO','Integridade do protocolo','CONFERIDO',
    'Fotografia arquivada validada por SHA-256; hash: '+String(run.fingerprint||''),
    'Nenhuma acao enquanto o hash permanecer valido.','ETAPA_28');
  add('ATUALIDADE_DADOS','Atualidade dos dados',updated?'CONFERIDO':'PENDENTE',
    updated?'Dados atuais equivalentes aos do protocolo.':
      'Estado: '+String(reviewStatus.consistency||'INDETERMINADO')+'.',
    'Se desatualizado, registre um novo protocolo e realize a conferencia tecnica novamente.','ETAPA_29');
  add('COMPETENCIA_ABERTA','Situacao da competencia',periodOpen?'CONFERIDO':'PENDENTE',
    'Situacao: '+String(reviewStatus.competence_status||'NAO_LOCALIZADA')+'.',
    'A competencia deve estar aberta para qualquer etapa preparatoria.','COMPETENCIA');
  add('ENVELOPES_CONFERIDOS','Conferencia tecnica dos envelopes',noTechnicalPending?'CONFERIDO':'PENDENTE',
    noTechnicalPending?'Todos os '+employees+' envelopes tecnicamente conferidos.':
      String(run.pending_employee_count??'indefinido')+' envelopes com pendencias; total '+employees+'.',
    'Corrija pendencias e gere um novo protocolo de conferencia.','ETAPA_27');
  add('CIENCIA_DOCUMENTADA','Ciencia tecnica documentada',acknowledged?'CONFERIDO':'PENDENTE',
    acknowledged?'Ciencia registrada em '+String(review.created_at||'data indisponivel')+'.':
      review?'Existe ciencia historica, mas nao vigente sobre os dados atuais.':
      'Nao ha ciencia tecnica registrada para este protocolo.',
    'Depois de corrigir e arquivar a conferencia, registre ciencia tecnica.','ETAPA_29');
  add('SEGREGACAO_CONFERENCIA','Segregacao entre preparacao e conferencia',
    separateTechnicalReview?'CONFERIDO':'PENDENTE',
    !review?'Ainda nao existe revisor tecnico.':separateTechnicalReview?
      'Preparador e revisor tecnico sao pessoas distintas.':
      'Mesmo usuario preparou o protocolo e registrou ciencia tecnica.',
    'Para futura homologacao, exija revisao independente e aprovador distinto; nao reutilize ciencia de protocolo desatualizado.',
    'GOVERNANCA');
  for(const item of [
    ['CALCULO_LIQUIDO','Calculo liquido definitivo',
      'Implementar folha definitiva com tratamento integral de verbas e reconciliacao dos descontos.'],
    ['VERBAS_ESPECIAIS','Tratamento de verbas especiais',
      'Concluir as regras de ferias, 13o, rescisao e afastamentos pertinentes ao periodo.'],
    ['HOMOLOGACAO_TRIBUTARIA','Validacao legal das bases e encargos',
      'Homologar incidencias, INSS, IRRF, FGTS, deducoes e demais particularidades do empregado.'],
    ['APROVACAO_INDEPENDENTE','Alcada formal de aprovacao',
      'Criar permissao propria, atribuicao de responsavel independente e aprovacao versionada.'],
    ['TRAVA_TRANSACIONAL','Protecao de concorrencia e versao dos dados',
      'Garantir versao atomica das origens antes de permitir assinatura ou processamento definitivo.']
  ]){
    add(item[0],item[1],'NAO_IMPLEMENTADO',
      'Requisito obrigatorio de homologacao nao concluido nesta etapa.',item[2],'IMPLEMENTACAO_FUTURA');
  }
  const pending=gates.filter(g=>g.status==='PENDENTE').length;
  const notImplemented=gates.filter(g=>g.status==='NAO_IMPLEMENTADO').length;
  const prepared=gates.filter(g=>g.status==='CONFERIDO').length;
  const critical=gates.filter(g=>g.status!=='CONFERIDO').map(g=>({code:g.code,required_action:g.required_action,source:g.source}));
  const responsibilities={
    protocol_preparer:{user_id:run.created_by||null,created_at:run.created_at||null,
      responsibility:'Registro da fotografia tecnica, sem aprovacao'},
    technical_reviewer:{user_id:review?.reviewed_by||null,reviewed_at:review?.created_at||null,
      responsibility:'Ciencia tecnica, nao homologacao'},
    independent_approver:{user_id:null,assigned:false,
      responsibility:'Aprovacao formal independente; fluxo NAO_IMPLEMENTADO'},
    preparer_and_reviewer_distinct:separateTechnicalReview,
    required_future_approver_distinct:true
  };
  return {kind:'MATRIZ_PRE_HOMOLOGACAO_ETAPA_30',run_id:run.id,
    competence_id:run.competence_id,payment_date:run.payment_date,
    fingerprint:run.fingerprint,protocol_state:run.state,
    snapshot_consistency:reviewStatus.consistency,
    technical_acknowledgment_current:acknowledged,
    employee_count:employees,roles:responsibilities,gates,
    summary:{verified:prepared,pending,not_implemented:notImplemented,total:gates.length},
    next_actions:critical,read_only:true,preparation_status:
      pending?'PENDENCIAS_TECNICAS':'CONTROLES_A_IMPLEMENTAR',
    // BLOQUEIOS FIXOS: nenhuma modalidade deste relatorio autoriza homologacao.
    approved:false,homologated:false,ready_for_homologation:false,
    ready_for_payroll:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Matriz de requisitos; a ciencia tecnica nao constitui homologacao da folha.'};
}

// ===== SAGAS Folha Etapa 29: ciencia tecnica de protocolo atual, SEM homologacao =====
// Distincao: ciencia da conferencia nao constitui folha aprovada, calculo liquido,
// retencao, quitacao, fechamento, integracao nem assinatura digital.
async function ensurePayrollProcessingReviewsSchema29(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_processing_reviews (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      run_id TEXT NOT NULL REFERENCES payroll_processing_runs(id) ON DELETE RESTRICT,
      review_kind TEXT NOT NULL CHECK(review_kind='CIENCIA_TECNICA'),
      fingerprint TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,run_id,review_kind)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_reviews_company_run
      ON payroll_processing_reviews(company_id,run_id,created_at DESC)`)
  ]);
}
function payrollProcessingReviewMeta29(row){
  if(!row)return null;
  return {id:row.id,run_id:row.run_id,review_kind:row.review_kind,
    reviewed_by:row.reviewed_by,created_at:row.created_at,notes:row.notes,
    fingerprint:row.fingerprint,technical_acknowledgement:true,
    homologated:false,approved:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollProcessingReviewStatus29(env,companyId,runId){
  // Detalhe valida empresa e SHA-256 antes de qualquer outra operacao.
  const detail=await payrollProcessingRunDetail28(env,companyId,runId);
  const run=detail.run;
  const reviewRow=await env.DB.prepare(`SELECT * FROM payroll_processing_reviews
    WHERE company_id=? AND run_id=? AND review_kind='CIENCIA_TECNICA'`)
    .bind(companyId,runId).first();
  const period=await env.DB.prepare(`SELECT id,status,competence FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,run.competence_id).first();
  let liveFingerprint=null,consistency='INDETERMINADO',liveError=null;
  if(period){
    try{
      const preview=await payrollProcessingControlPreview27(env,companyId,run.competence_id,run.payment_date);
      const current=payrollProcessingSnapshot28(preview);
      liveFingerprint=await payrollProcessingSnapshotHash28(current);
      consistency=liveFingerprint===run.fingerprint?'ATUAL':'DESATUALIZADO';
    }catch(err){liveError='Nao foi possivel conferir novamente os dados atuais da competencia.';}
  }else liveError='Competencia original nao encontrada.';
  const technicalComplete=run.state==='CONFERENCIA_TECNICA'&&
    run.pending_employee_count===0&&run.employee_count>0&&
    run.technical_employee_count===run.employee_count&&
    detail.snapshot?.items?.every(e=>e.state==='CONFERENCIA_TECNICA'&&e.technical_pending_count===0);
  const current=consistency==='ATUAL';
  const open=period?.status==='OPEN';
  const review=payrollProcessingReviewMeta29(reviewRow);
  const acknowledgmentCurrent=!!review&&current&&review.fingerprint===run.fingerprint;
  const canAcknowledge=technicalComplete&&current&&open&&!review;
  const blockers=[];
  if(!technicalComplete)blockers.push({code:'PENDENCIAS_TECNICAS',detail:'Os envelopes possuem pendencias tecnicas ou nao ha funcionarios.'});
  if(!current)blockers.push({code:consistency==='DESATUALIZADO'?'PROTOCOLO_DESATUALIZADO':'CONFERENCIA_INDETERMINADA',
    detail:liveError||'O protocolo nao corresponde mais aos dados atuais. Registre nova conferencia.'});
  if(!open)blockers.push({code:'COMPETENCIA_NAO_ABERTA',detail:'Somente competencias abertas permitem registrar ciencia tecnica.'});
  if(review)blockers.push({code:'CIENCIA_JA_REGISTRADA',detail:'Este protocolo ja possui ciencia tecnica; o registro e imutavel.'});
  return {kind:'REVISAO_TECNICA_PROTOCOLO_ETAPA_29',run,review,
    snapshot_current:current,consistency,competence_status:period?.status||null,
    can_acknowledge:canAcknowledge,technical_complete:technicalComplete,
    technical_acknowledgment_current:acknowledgmentCurrent,blockers,
    approved:false,homologated:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Ciencia tecnica nao homologa calculo liquido, pagamento, fechamento ou contabilidade.'};
}
async function payrollProcessingReviewCreate29(env,request,auth,companyId,runId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  if(body?.acknowledge!=='CIENCIA_TECNICA_SEM_HOMOLOGACAO')
    throw new HttpError(400,'Confirme explicitamente a ciencia tecnica, sem homologacao.','VALIDATION_ERROR');
  const notes=String(body?.notes??'').trim();
  if(notes.length>1000)throw new HttpError(400,'Observacao com mais de 1000 caracteres.','VALIDATION_ERROR');
  const status=await payrollProcessingReviewStatus29(env,companyId,runId);
  if(status.review){
    // Idempotencia nunca permite que uma ciencia antiga se torne vigente de novo.
    if(!status.technical_acknowledgment_current)
      throw new HttpError(409,'Ciencia historica desatualizada; registre nova conferencia.','STALE_TECHNICAL_REVIEW');
    return {kind:'CIENCIA_TECNICA_ETAPA_29',created:false,review:status.review,
      current:status.technical_acknowledgment_current,homologated:false,approved:false,
      ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false};
  }
  if(!status.can_acknowledge)
    throw new HttpError(409,'Protocolo sem elegibilidade tecnica ou desatualizado.','TECHNICAL_REVIEW_BLOCKED');
  const id=uuid();
  // Persistencia atomica vinculada ao protocolo original e competencia ABERTA.
  const insert=await env.DB.prepare(`INSERT INTO payroll_processing_reviews
    (id,company_id,run_id,review_kind,fingerprint,reviewed_by,notes)
    SELECT ?,r.company_id,r.id,'CIENCIA_TECNICA',r.fingerprint,?,?
    FROM payroll_processing_runs r JOIN payroll_competences c
      ON c.id=r.competence_id AND c.company_id=r.company_id
    WHERE r.id=? AND r.company_id=? AND r.state='CONFERENCIA_TECNICA'
      AND r.pending_count=0 AND r.technical_count=r.employees_count
      AND r.employees_count>0 AND c.status='OPEN'
    ON CONFLICT(company_id,run_id,review_kind) DO NOTHING`)
    .bind(id,auth.user.id,notes,runId,companyId).run();
  const row=await env.DB.prepare(`SELECT * FROM payroll_processing_reviews
    WHERE company_id=? AND run_id=? AND review_kind='CIENCIA_TECNICA'`)
    .bind(companyId,runId).first();
  if(!row)throw new HttpError(409,'Competencia bloqueada ou ciencia tecnica nao registrada.','TECHNICAL_REVIEW_BLOCKED');
  const created=Number(insert?.meta?.changes??insert?.changes??0)>0;
  if(created)await audit(env,{companyId,userId:auth.user.id,action:'CREATE',
    entity:'payroll_processing_reviews',entityId:row.id,
    after:{run_id:runId,fingerprint:row.fingerprint,review_kind:'CIENCIA_TECNICA',notes},request});
  return {kind:'CIENCIA_TECNICA_ETAPA_29',created,review:payrollProcessingReviewMeta29(row),
    current:created||status.technical_acknowledgment_current,approved:false,homologated:false,
    net_pay:null,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    message:'Ciencia registrada somente para conferencia tecnica. A folha nao esta homologada.'};
}

// ===== SAGAS Folha Etapa 28: protocolo persistente de conferencia tecnica =====
// A gravacao e uma fotografia auditavel, NAO e fechamento, calculo definitivo,
// homologacao, retencao, pagamento ou integracao financeira/contabil.
async function ensurePayrollProcessingRunsSchema28(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_processing_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      competence_id TEXT NOT NULL REFERENCES payroll_competences(id) ON DELETE RESTRICT,
      payment_date TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PENDENTE_TECNICO','CONFERENCIA_TECNICA')),
      employees_count INTEGER NOT NULL CHECK(employees_count>=0),
      pending_count INTEGER NOT NULL CHECK(pending_count>=0),
      technical_count INTEGER NOT NULL CHECK(technical_count>=0),
      snapshot_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,competence_id,payment_date,fingerprint)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_competence
      ON payroll_processing_runs(company_id,competence_id,payment_date,created_at DESC)`)
  ]);
}
function payrollProcessingSnapshot28(control){
  if(!control||control.kind!=='CONTROLE_PROCESSAMENTO_COMPETENCIA_ETAPA_27'||
     control.approved!==false||control.homologated!==false||
     control.ready_for_payment!==false||control.ready_for_accounting!==false||
     control.ready_for_closure!==false||control.ready_for_payroll!==false||
     !Array.isArray(control.items))
    throw new HttpError(409,'A conferencia de origem nao permite registrar um protocolo.','UNSAFE_PAYROLL_SOURCE');
  const employees=control.items.map(e=>{
    const c=e.processing_control||{};
    if(!e.employee_id||!/^[0-9]{5}$/.test(String(e.employee_code||''))||
       !['PENDENTE_TECNICO','CONFERENCIA_TECNICA'].includes(c.status)||
       c.approved!==false||c.homologated!==false||c.ready_for_payment!==false||
       c.ready_for_closure!==false||c.ready_for_accounting!==false||
       !Array.isArray(c.checks)||!Array.isArray(c.next_actions))
      throw new HttpError(409,'Envelope com informacoes incompletas para protocolo.','UNSAFE_PAYROLL_ITEM');
    const cents=c.arithmetic_reference===null?null:payrollCompositionCents(c.arithmetic_reference);
    if(c.arithmetic_reference!==null&&cents===null)
      throw new HttpError(409,'Referencia aritmetica invalida para arquivar.','INVALID_REFERENCE');
    return {employee_id:e.employee_id,employee_code:e.employee_code,employee_name:e.employee_name,
      state:c.status,technical_pending_count:c.pending_technical_count,
      implementation_blocker_count:c.implementation_blocker_count,
      arithmetic_reference_cents:cents,validation_warnings:c.validation_warnings||[],
      checks:c.checks,next_actions:c.next_actions,
      homologated:false,approved:false,net_pay:null,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false};
  });
  // Ordenacao estavel: mesma competencia/dados devem gerar o mesmo identificador.
  employees.sort((a,b)=>a.employee_id.localeCompare(b.employee_id));
  const pending=employees.filter(x=>x.state==='PENDENTE_TECNICO').length;
  const technical=employees.length-pending;
  if(pending!==control.pending_technical_employee_count||
     technical!==control.technical_review_employee_count||
     employees.length!==control.employee_count)
    throw new HttpError(409,'Contagem dos envelopes divergente.','INCONSISTENT_PAYROLL_TOTALS');
  return {kind:'PROTOCOLO_CONFERENCIA_ETAPA_28',competence:control.competence,
    payment_date:control.payment_date,employee_count:employees.length,
    pending_count:pending,technical_count:technical,items:employees,
    homologated:false,approved:false,net_pay:null,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Fotografia da conferencia tecnica. Pagamento, fechamento e contabilizacao indisponiveis.'};
}
async function payrollProcessingSnapshotHash28(snapshot){
  // JSON contem apenas dados calculados no servidor. Protocolo possui versao fixa.
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
function payrollProcessingRunMeta28(row){
  return {id:row.id,competence_id:row.competence_id,payment_date:row.payment_date,
    fingerprint:row.fingerprint,state:row.state,employee_count:Number(row.employees_count),
    pending_employee_count:Number(row.pending_count),technical_employee_count:Number(row.technical_count),
    created_by:row.created_by,created_at:row.created_at,
    approval_status:'NAO_HOMOLOGADO',payment_status:'BLOQUEADO',closure_status:'BLOQUEADO',
    accounting_status:'BLOQUEADO',net_pay:null,homologated:false,approved:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false};
}
async function payrollProcessingRunsList28(env,companyId,competenceId,paymentDate){
  if(!competenceId)throw new HttpError(400,'Selecione uma competencia.','VALIDATION_ERROR');
  // A empresa e verificada ANTES da leitura do historico.
  const period=await env.DB.prepare(`SELECT id,competence FROM payroll_competences WHERE company_id=? AND id=?`)
    .bind(companyId,competenceId).first();
  if(!period)throw new HttpError(404,'Competencia nao encontrada.','NOT_FOUND');
  if(paymentDate)payrollStrictDate(paymentDate,'data do pagamento');
  const q=paymentDate?
    env.DB.prepare(`SELECT id,competence_id,payment_date,fingerprint,state,employees_count,pending_count,
      technical_count,created_by,created_at FROM payroll_processing_runs
      WHERE company_id=? AND competence_id=? AND payment_date=?
      ORDER BY created_at DESC,id DESC LIMIT 100`).bind(companyId,competenceId,paymentDate):
    env.DB.prepare(`SELECT id,competence_id,payment_date,fingerprint,state,employees_count,pending_count,
      technical_count,created_by,created_at FROM payroll_processing_runs
      WHERE company_id=? AND competence_id=? ORDER BY created_at DESC,id DESC LIMIT 100`).bind(companyId,competenceId);
  const r=await q.all();
  return {kind:'HISTORICO_CONFERENCIAS_ETAPA_28',competence:period,
    items:(r.results||[]).map(payrollProcessingRunMeta28),read_only:true,
    homologated:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false};
}
async function payrollProcessingRunDetail28(env,companyId,id){
  if(!id)throw new HttpError(400,'Protocolo nao informado.','VALIDATION_ERROR');
  const row=await env.DB.prepare(`SELECT * FROM payroll_processing_runs WHERE company_id=? AND id=?`)
    .bind(companyId,id).first();
  if(!row)throw new HttpError(404,'Protocolo nao encontrado.','NOT_FOUND');
  const payload=JSON.parse(row.snapshot_json);
  const digest=await payrollProcessingSnapshotHash28(payload);
  if(digest!==row.fingerprint)
    throw new HttpError(409,'Integridade do protocolo comprometida.','PAYROLL_SNAPSHOT_INTEGRITY');
  return {kind:'DETALHE_PROTOCOLO_ETAPA_28',run:payrollProcessingRunMeta28(row),snapshot:payload,
    read_only:true,homologated:false,ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false};
}
async function payrollProcessingRunCreate28(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const competenceId=String(body?.competence_id||'');
  const paymentDate=String(body?.payment_date||'');
  const period=await payrollReadOpenCompetence(env,companyId,competenceId);
  payrollStrictDate(paymentDate,'data do pagamento');
  const preview=await payrollProcessingControlPreview27(env,companyId,competenceId,paymentDate);
  if(preview.competence?.id!==period.id)
    throw new HttpError(409,'Competencia inconsistente.','INVALID_COMPETENCE');
  const snapshot=payrollProcessingSnapshot28(preview);
  const snapshotJson=JSON.stringify(snapshot);
  if(snapshotJson.length>1500000)throw new HttpError(413,'Protocolo muito grande.','PAYROLL_SNAPSHOT_TOO_LARGE');
  const fingerprint=await payrollProcessingSnapshotHash28(snapshot);
  const state=snapshot.pending_count?'PENDENTE_TECNICO':'CONFERENCIA_TECNICA';
  const id=uuid();
  // Um comando atomico de INSERT, condicionado a competencia aberta.
  // CONFLICT somente da chave de idempotencia, nao mascara outros erros.
  const inserted=await env.DB.prepare(`INSERT INTO payroll_processing_runs
    (id,company_id,competence_id,payment_date,fingerprint,state,employees_count,
     pending_count,technical_count,snapshot_json,created_by)
    SELECT ?,?,?,?,?,?,?,?,?,?,? FROM payroll_competences c
    WHERE c.id=? AND c.company_id=? AND c.status='OPEN'
    ON CONFLICT(company_id,competence_id,payment_date,fingerprint) DO NOTHING`)
    .bind(id,companyId,competenceId,paymentDate,fingerprint,state,
      snapshot.employee_count,snapshot.pending_count,snapshot.technical_count,snapshotJson,
      auth.user.id,competenceId,companyId).run();
  const row=await env.DB.prepare(`SELECT id,competence_id,payment_date,fingerprint,state,employees_count,pending_count,
    technical_count,created_by,created_at FROM payroll_processing_runs
    WHERE company_id=? AND competence_id=? AND payment_date=? AND fingerprint=?`)
    .bind(companyId,competenceId,paymentDate,fingerprint).first();
  if(!row)throw new HttpError(409,'Competencia bloqueada ou protocolo nao registrado.','PERIOD_LOCKED');
  const created=Number(inserted?.meta?.changes??inserted?.changes??0)>0;
  if(created)await audit(env,{companyId,userId:auth.user.id,action:'CREATE',
    entity:'payroll_processing_runs',entityId:row.id,
    after:{competence:period.competence,payment_date:paymentDate,state,fingerprint,
      employee_count:snapshot.employee_count},request});
  return {kind:'PROTOCOLO_PROCESSAMENTO_TECNICO_ETAPA_28',created,run:payrollProcessingRunMeta28(row),
    snapshot,homologated:false,approved:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false,
    message:'Registro de conferencia criado. E proibido usar como folha liquida, aprovacao ou pagamento.'};
}

// ===== SAGAS Folha Etapa 27: controle de conferencia tecnica por competencia =====
// O estado e derivado em tempo de consulta. NAO grava aprovacao, nao cria
// lote e nao transforma simples conciliacao aritmetica em folha homologada.
const PAYROLL_TECHNICAL_CHECKS_27=[
  'IDENTIFICACAO','REMUNERACAO','EVENTOS','FALTAS_DSR',
  'BASES_INCIDENTES','TABELAS_TRIBUTOS','CONCILIACAO','VERBAS_ESPECIAIS'
];
const PAYROLL_NOT_IMPLEMENTED_27=['HOMOLOGACAO_LEGAL','INTEGRACOES'];
function payrollProcessingControlItem27(item){
  const raw=item.final_validation||{};
  const checks=Array.isArray(raw.checks)?raw.checks:[];
  const seen=new Set();
  const warnings=[];
  const validStatuses=new Set(['CONFERENCIA','PENDENTE','NAO_IMPLEMENTADO']);
  const normalized=[];
  for(const c of checks){
    const code=String(c?.code||'').trim();
    const state=String(c?.status||'').trim();
    if(!code||seen.has(code)||!validStatuses.has(state)){
      warnings.push('DIAGNOSTICO_INCONSISTENTE');
      continue;
    }
    seen.add(code);
    normalized.push({code,title:String(c.title||code),status:state,
      evidence:String(c.evidence||''),required_action:String(c.required_action||''),
      source:String(c.source||''),issue_codes:Array.isArray(c.issue_codes)?c.issue_codes:[]});
  }
  const required=new Set([...PAYROLL_TECHNICAL_CHECKS_27,...PAYROLL_NOT_IMPLEMENTED_27]);
  if(normalized.some(c=>!required.has(c.code) && c.status==='CONFERENCIA'))
    warnings.push('AREA_NOVA_A_CONFERIR');
  if(!/^\d{5}$/.test(String(item.employee_code||''))||!item.employee_id)
    warnings.push('IDENTIFICACAO_INCOMPLETA');
  for(const code of PAYROLL_TECHNICAL_CHECKS_27){
    if(!seen.has(code)||normalized.find(c=>c.code===code)?.status!=='CONFERENCIA')
      warnings.push('PENDENCIA_'+code);
  }
  for(const code of PAYROLL_NOT_IMPLEMENTED_27){
    if(!seen.has(code)||normalized.find(c=>c.code===code)?.status!=='NAO_IMPLEMENTADO')
      warnings.push('BLOQUEIO_'+code);
  }
  if(raw.status!=='CONFERENCIA_PRELIMINAR' && raw.status!=='PENDENTE')
    warnings.push('ESTADO_ORIGEM_INVALIDO');
  if(raw.status==='PENDENTE')warnings.push('ORIGEM_PENDENTE');
  const unknown=normalized.filter(c=>!required.has(c.code));
  if(unknown.length)warnings.push('OUTRAS_VERIFICACOES');
  if(raw.homologated!==false || raw.approved!==false || raw.ready_for_payment!==false ||
     raw.ready_for_accounting!==false || raw.ready_for_closure!==false)
    warnings.push('SINALIZADORES_INSEGUROS');
  const technicalPending=normalized.filter(c=>c.status==='PENDENTE' ||
    (!PAYROLL_NOT_IMPLEMENTED_27.includes(c.code)&&c.status!=='CONFERENCIA'));
  const implementation=normalized.filter(c=>c.status==='NAO_IMPLEMENTADO');
  if(raw.technical_pending_count!==technicalPending.length ||
     raw.implementation_blocker_count!==implementation.length)
    warnings.push('CONTAGENS_INCONSISTENTES');
  const preliminary=warnings.length===0&&technicalPending.length===0&&
    raw.status==='CONFERENCIA_PRELIMINAR';
  const canShowReference=preliminary && payrollCompositionCents(raw.arithmetic_reference)!==null;
  if(preliminary && !canShowReference)warnings.push('REFERENCIA_ARITMETICA_INDISPONIVEL');
  const technicalStatus=warnings.length?'PENDENTE_TECNICO':'CONFERENCIA_TECNICA';
  const todo=normalized.filter(c=>c.status!=='CONFERENCIA').map(c=>({code:c.code,title:c.title,
    status:c.status,required_action:c.required_action,source:c.source}));
  if(warnings.length)todo.unshift({code:'VERIFICAR_DIAGNOSTICO',title:'Verificar consistencia da validacao',
    status:'PENDENTE',required_action:'Abrir Validar pre-fechamento e corrigir inconsistencias da origem antes de prosseguir.',
    source:'Folha / Validar pre-fechamento'});
  const arithmetic=technicalStatus==='CONFERENCIA_TECNICA'&&canShowReference?raw.arithmetic_reference:null;
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,
    processing_control:{status:technicalStatus,technical_review_only:true,
      pending_technical_count:technicalPending.length+ (warnings.length?1:0),
      implementation_blocker_count:implementation.length,
      unresolved_count:todo.length,validation_warnings:[...new Set(warnings)],
      checks:normalized,next_actions:todo,arithmetic_reference:arithmetic,
      approval_status:'HOMOLOGACAO_NAO_IMPLEMENTADA',payment_status:'BLOQUEADO',
      accounting_status:'BLOQUEADO',closure_status:'BLOQUEADO',
      not_approved:true,read_only:true,preview_only:true,homologated:false,approved:false,
      net_pay:null,ready_for_payroll:false,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false},
    net_pay:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollProcessingControlPreview27(env,companyId,competenceId,paymentDate){
  const previous=await payrollFinalValidationPreview26(env,companyId,competenceId,paymentDate);
  const items=previous.items.map(payrollProcessingControlItem27);
  const pending=items.filter(x=>x.processing_control.status==='PENDENTE_TECNICO');
  const preliminary=items.filter(x=>x.processing_control.status==='CONFERENCIA_TECNICA');
  const areaSummary=[];
  for(const item of items){
    for(const c of item.processing_control.checks){
      let area=areaSummary.find(x=>x.code===c.code);
      if(!area){area={code:c.code,title:c.title,conferencia:0,pendente:0,nao_implementado:0};areaSummary.push(area)}
      if(c.status==='CONFERENCIA')area.conferencia++;
      else if(c.status==='PENDENTE')area.pendente++;
      else area.nao_implementado++;
    }
  }
  return {kind:'CONTROLE_PROCESSAMENTO_COMPETENCIA_ETAPA_27',competence:previous.competence,
    payment_date:previous.payment_date,items,employee_count:items.length,
    pending_technical_employee_count:pending.length,technical_review_employee_count:preliminary.length,
    homologated_employee_count:0,approved_employee_count:0,
    technical_issue_total:items.reduce((a,x)=>a+x.processing_control.pending_technical_count,0),
    implementation_blocker_total:items.reduce((a,x)=>a+x.processing_control.implementation_blocker_count,0),
    area_summary:areaSummary,processing_status:'FECHAMENTO_BLOQUEADO',
    read_only:true,preview_only:true,homologated:false,approved:false,
    net_pay:null,folha_liquida:null,ready_for_payroll:false,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    message:'Controle tecnico dinamico: conferencia nao e homologacao. Nenhum envelope pode ser pago, fechado ou contabilizado.'};
}

// ===== SAGAS Folha Etapa 26: checklist de pre-homologacao (somente leitura) =====
// A conformidade aritmetica e apenas uma evidencia; jamais autoriza por si
// so a homologacao trabalhista/fiscal ou o processamento de pagamentos.
function payrollFinalValidationItem26(item){
  const previous=item.remuneration_reconciliation||{};
  const problems=Array.isArray(previous.issues)?previous.issues:[];
  const issueCodes=new Set(problems.map(x=>String(x.code||'').trim()));
  const checks=[];
  const add=(code,title,pattern,completed,evidence,needed,source)=>{
    const matches=problems.filter(x=>pattern.test(String(x.code||'')));
    const ok=!!completed&&matches.length===0;
    checks.push({code,title,status:ok?'CONFERENCIA':'PENDENTE',
      evidence:ok?evidence:(matches.length?matches.map(x=>String(x.code)+': '+String(x.detail||'')).join(' | ').slice(0,2000):evidence),
      required_action:ok?'Conferir os documentos e confirmar a regra aplicavel.':needed,
      source,issue_codes:matches.map(x=>x.code)});
  };
  const monetary=payrollCompositionCents;
  const codeOk=/^\d{5}$/.test(String(item.employee_code||''))&&!!item.employee_id;
  add('IDENTIFICACAO','Identificacao do funcionario',/IDENTIFICACAO|CODIGO_FUNCIONARIO/i,codeOk,
    codeOk?'Codigo interno estavel '+String(item.employee_code)+'.':'Codigo humano ou identificador tecnico ausente.',
    'Conferir codigo sequencial de cinco digitos e empresa do funcionario.',
    'Cadastro de funcionarios');
  add('REMUNERACAO','Historico salarial e remuneracao',/SALARIO|SUBTOTAL_FORA|ABATIMENTO_EXCEDE|_EXCEDE_LIMITE/i,
    monetary(previous.salary_reference)!==null&&monetary(previous.gross_before_absence)!==null,
    'Salario historico e bruto aritmetico identificados; ainda nao homologados.',
    'Verificar salario historico, admissao, vigencia e proventos da competencia.',
    'Cadastro de funcionarios / Historico salarial');
  add('EVENTOS','Movimentos e formulas',/EVENTO|MOVIMENTO|LINHAS|INCIDENCIA_NAO_CONCILIADA|REGRA_DUPLICADA|TOTAL_PROVENTOS|TOTAL_DESCONTOS|SALARIO_DUPLICADO|DESCONTO_REPETIDO/i,
    Array.isArray(previous.lines)&&previous.event_earnings!==null&&previous.event_deductions!==null,
    (previous.lines||[]).length+' lancamento(s) rastreados com valores e regras.',
    'Revisar eventos e lancamentos, origem do valor, versao da formula, incidencia e possiveis duplicidades.',
    'Folha / Lancamentos / Regras de eventos');
  add('FALTAS_DSR','Faltas, DSR e reflexos',/FALTAS|DSR|ABATIMENTO|OCORRENCIA/i,
    monetary(previous.absence_reference)!==null&&monetary(previous.dsr_reference)!==null&&
    monetary(previous.absence_dsr_reference)!==null,
    'Faltas e repousos possuem referencias aritmeticas, sem efeito definitivo.',
    'Rever justificativas de faltas, repouso por semana, calendario, feriados e norma coletiva.',
    'Folha / Conferencia faltas/DSR');
  add('BASES_INCIDENTES','Bases de INSS IRRF e FGTS',/BASE_|INCIDENCIA|FGTS_SEM_SEPARACAO/i,
    monetary(previous.inss_simulated)!==null&&monetary(previous.irrf_simulated)!==null&&
    monetary(previous.fgts_employer_simulated)!==null,
    'Bases tiveram reconciliacao previa; incidencia legal requer confirmacao.',
    'Validar incidencias de todas as verbas e comparar bases recompostas.',
    'Folha / Recompor bases / Tributos recompostos');
  add('TABELAS_TRIBUTOS','Tabelas, deducoes e descontos simulados',/INSS|IRRF|TRIBUTO|TABELAS|SOMA_|FGTS/i,
    monetary(previous.inss_simulated)!==null&&monetary(previous.irrf_simulated)!==null&&
    !!previous.inss_table_from&&!!previous.irrf_table_from,
    'Tabelas indicadas: INSS '+String(previous.inss_table_from||'')+', IRRF '+String(previous.irrf_table_from||'')+'.',
    'Validar competencia, pagamento, dependentes, multiplos vinculos e deducoes legais.',
    'Folha / Tributos recompostos');
  add('CONCILIACAO','Conferencia aritmetica do envelope',/DIVERGENTE|FORA_LIMITE|INCOMPLETO|EXCEDEM|PENDENTE|SUBTOTAL/i,
    previous.status==='HIPOTESE_ARITMETICA_A_CONFERIR'&&
    monetary(previous.arithmetic_balance_projection)!==null,
    'Subtotal hipotetico fechado em centavos, sem constituir liquido.',
    'Resolver os impedimentos e comparar cada valor da memoria de calculo.',
    'Folha / Conciliar remuneracao / Memoria de calculo');
  add('VERBAS_ESPECIAIS','Ferias, 13o, rescisao e outras verbas',/VERBA_ESPECIAL/i,
    !issueCodes.has('VERBA_ESPECIAL'),
    'Nenhuma verba especial detectada pelo rastreio de nomes dos eventos; confirmar manualmente.',
    'Encaminhar ferias, 13o, rescisoes e afastamentos para rotinas proprias com bases especificas.',
    'Folha / Eventos / Ocorrencias');
  // Uma nova divergencia nunca pode ficar ignorada por ausencia de mapeamento.
  const known=new Set(checks.flatMap(x=>x.issue_codes));
  const unknown=problems.filter(x=>!known.has(x.code));
  if(unknown.length)checks.push({code:'OUTROS_BLOQUEIOS',title:'Outras inconsistencias',status:'PENDENTE',
    evidence:unknown.map(x=>String(x.code)+': '+String(x.detail||'')).join(' | ').slice(0,2000),
    required_action:'Examinar os alertas da conciliacao e tratar cada origem antes de processar.',
    source:'Folha / Conciliar remuneracao',issue_codes:unknown.map(x=>x.code)});
  checks.push({code:'HOMOLOGACAO_LEGAL',title:'Revisao legal e homologacao',status:'NAO_IMPLEMENTADO',
    evidence:'As simulacoes nao cobrem homologacao trabalhista e fiscal integral, nem normas coletivas ou multiplos vinculos.',
    required_action:'Concluir regras de apuracao e instituir processo de homologacao autorizado antes de calcular o liquido.',
    source:'Processamento da folha',issue_codes:[]});
  checks.push({code:'INTEGRACOES',title:'Fechamento, pagamento e contabilizacao',status:'NAO_IMPLEMENTADO',
    evidence:'Ainda nao existe autorizacao de geracao de contas a pagar, retencoes, contabilizacao ou fechamento a partir dessas simulacoes.',
    required_action:'Implementar integracoes somente apos processamento e homologacao da folha.',
    source:'Folha / Integracoes financeira e contabil',issue_codes:[]});
  const pending=checks.filter(x=>x.status==='PENDENTE');
  const unimplemented=checks.filter(x=>x.status==='NAO_IMPLEMENTADO');
  const actions=pending.concat(unimplemented).map(x=>({code:x.code,title:x.title,
    required_action:x.required_action,source:x.source,issue_codes:x.issue_codes}));
  const status=pending.length?'PENDENTE':'CONFERENCIA_PRELIMINAR';
  return {employee_id:item.employee_id,employee_code:item.employee_code||null,
    employee_name:item.employee_name,final_validation:{status,
      checks,required_actions:actions,technical_pending_count:pending.length,
      implementation_blocker_count:unimplemented.length,
      total_blocker_count:pending.length+unimplemented.length,
      arithmetic_reference:status==='CONFERENCIA_PRELIMINAR'?previous.arithmetic_balance_projection:null,
      reference_only:true,read_only:true,preview_only:true,homologated:false,approved:false,
      net_pay:null,ready_for_payroll:false,ready_for_payment:false,
      ready_for_accounting:false,ready_for_closure:false},
    net_pay:null,folha_liquida:null,ready_for_payroll:false,ready_for_payment:false,
    ready_for_accounting:false,ready_for_closure:false};
}
async function payrollFinalValidationPreview26(env,companyId,competenceId,paymentDate){
  const previous=await payrollReconciledRemunerationPreview25(env,companyId,competenceId,paymentDate);
  const items=previous.items.map(payrollFinalValidationItem26);
  const summary=[];
  for(const item of items){
    for(const check of item.final_validation.checks){
      let r=summary.find(x=>x.code===check.code);
      if(!r){r={code:check.code,title:check.title,pendente:0,conferencia:0,nao_implementado:0};summary.push(r);}
      if(check.status==='PENDENTE')r.pendente++;
      else if(check.status==='CONFERENCIA')r.conferencia++;
      else if(check.status==='NAO_IMPLEMENTADO')r.nao_implementado++;
    }
  }
  return {kind:'VALIDACAO_PRE_FECHAMENTO_ETAPA_26',competence:previous.competence,
    payment_date:previous.payment_date,items,employee_count:items.length,
    pending_employee_count:items.filter(x=>x.final_validation.technical_pending_count>0).length,
    preliminary_employee_count:items.filter(x=>x.final_validation.technical_pending_count===0).length,
    technical_pending_total:items.reduce((n,x)=>n+x.final_validation.technical_pending_count,0),
    implementation_blocker_total:items.reduce((n,x)=>n+x.final_validation.implementation_blocker_count,0),
    validation_summary:summary,read_only:true,preview_only:true,homologated:false,
    net_pay:null,folha_liquida:null,approved_employee_count:0,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    ready_for_closure:false,
    message:'Validacao tecnica de pre-fechamento. Ausencia de divergencias matematicas NAO equivale a homologacao ou autorizacao de pagamento.'};
}


// ===== SAGAS Folha Etapa 34: base operacional para futuros calculos definitivos =====
// A migracao cria tabelas isoladas, sem escrever valores de folha nem afetar
// registros financeiros/contabeis. Os INSERTs de processamento virao na Etapa 35.
async function ensurePayrollCalculationFoundation34(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_calc_runs (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,
      competence_id TEXT NOT NULL REFERENCES payroll_competences(id) ON DELETE RESTRICT,
      process_kind TEXT NOT NULL CHECK(process_kind IN ('MONTHLY','VACATION','THIRTEENTH','TERMINATION')),
      payment_date TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),
      status TEXT NOT NULL CHECK(status IN ('CALCULATED','REVIEWED','APPROVED','VOID')),
      source_fingerprint TEXT NOT NULL,created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,competence_id,process_kind,revision)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_calc_runs_company_period
      ON payroll_calc_runs(company_id,competence_id,process_kind)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_calc_envelopes (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,
      run_id TEXT NOT NULL REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      earnings_cents INTEGER NOT NULL CHECK(earnings_cents>=0),
      deductions_cents INTEGER NOT NULL CHECK(deductions_cents>=0),
      net_cents INTEGER NOT NULL CHECK(net_cents>=0),
      inss_cents INTEGER NOT NULL CHECK(inss_cents>=0),
      irrf_cents INTEGER NOT NULL CHECK(irrf_cents>=0),
      fgts_cents INTEGER NOT NULL CHECK(fgts_cents>=0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(run_id,employee_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_calc_envelopes_company_employee
      ON payroll_calc_envelopes(company_id,employee_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_calc_lines (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL REFERENCES payroll_calc_envelopes(id) ON DELETE RESTRICT,
      event_id TEXT REFERENCES payroll_events(id) ON DELETE RESTRICT,
      event_code TEXT NOT NULL,event_name TEXT NOT NULL,
      line_type TEXT NOT NULL CHECK(line_type IN ('PROVENTO','DESCONTO','INFORMATIVO')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
      reference_text TEXT,rule_version TEXT,sequence INTEGER NOT NULL CHECK(sequence>=1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(envelope_id,sequence)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_calc_lines_company_envelope
      ON payroll_calc_lines(company_id,envelope_id)`)
  ]);
}

// Diagnostico de cadastro — nao confundir com autorizacao de calcular/pagar.
// As verificacoes sao feitas por empresa e competencia, incluindo empregados
// sem lancamentos variaveis. Situacoes especiais permanecem bloqueadas.
async function payrollMonthlyPreparation34(env,companyId,competenceId,paymentDate){
  if(!competenceId)throw new HttpError(400,'Selecione a competencia.','VALIDATION_ERROR');
  const payment=payrollStrictDate(paymentDate,'Data prevista de pagamento');
  const period=await env.DB.prepare(`SELECT id,competence,status FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,competenceId).first();
  if(!period)throw new HttpError(404,'Competencia nao encontrada nesta empresa.','NOT_FOUND');
  const first=period.competence+'-01';
  const [year,month]=period.competence.split('-').map(Number);
  const last=period.competence+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
  const candidates=(await listPayroll(env,companyId,'employees')).filter(e=>e.admission_date<=last);
  if(candidates.length>2000)throw new HttpError(409,'Mais de 2.000 funcionarios na competencia. Consulte em lotes.','LIMIT');
  const history=await payrollEmployeeHistoricalContext(env,companyId,first,last);
  await ensureSchemaRevision(env,'payroll-admission-proration46',1,()=>payrollAdmissionSchema46(env));
  const prorationSettings=await payrollAdmissionRead46(env,companyId,period.competence);
  await payrollAdmissionHistory46(env,companyId,candidates,first,last,history,HttpError);
  await ensureSchemaRevision(env,'payroll-salary-change47',1,()=>payrollSalarySchema47(env));
  const salarySettings=await payrollSalaryRead47(env,companyId,period.competence);
  const salaryMode=salarySettings?.mode||'RM_NEXT_MONTH';
  const salaryChangesByEmployee=await payrollSalaryHistory47(env,companyId,candidates,history,first,last,HttpError);
  await ensureSchemaRevision(env,'payroll-absence48',1,()=>payrollAbsenceSchema48(env));
  const absenceSnapshot=await payrollAbsenceSnapshot48(env,companyId,period.competence,{HttpError});
  await ensureSchemaRevision(env,'payroll-leave49',1,()=>payrollLeaveSchema49(env));
  const leaveSnapshot=await payrollLeaveSnapshot49(env,companyId,period.competence,{HttpError});
  // Funcionarios ja desligados no inicio da competencia nao compoem a folha mensal.
  // Quem foi desligado DURANTE o mes permanece para conferencia das verbas proporcionais.
  const allEmployees=candidates.filter(e=>history.functional.get(e.id)?.[0]?.situation!=='DESLIGADO');
  const movements=await env.DB.prepare(`SELECT m.id,m.employee_id,m.event_id,m.unit,m.amount_cents,m.quantity_milli,
      v.code AS event_code,v.name AS event_name,v.event_type,v.active AS event_active
    FROM payroll_movements m JOIN payroll_events v
      ON v.id=m.event_id AND v.company_id=m.company_id
    WHERE m.company_id=? AND m.competence_id=? ORDER BY m.employee_id,v.code,m.id LIMIT 5001`)
      .bind(companyId,competenceId).all();
  const eventRows=movements.results||[];
  if(eventRows.length>5000)throw new HttpError(409,'Ha mais de 5.000 eventos na competencia.','LIMIT');
  const rulesRes=await env.DB.prepare(`SELECT event_id,effective_from,revision,inss,irrf,fgts,calculation_code,formula_text
    FROM payroll_event_rule_versions WHERE company_id=? AND effective_from<=?
      AND event_id IN (SELECT DISTINCT event_id FROM payroll_movements
        WHERE company_id=? AND competence_id=?)
    ORDER BY event_id,effective_from DESC,revision DESC LIMIT 5001`)
      .bind(companyId,period.competence,companyId,competenceId).all();
  if((rulesRes.results||[]).length>5000)throw new HttpError(409,'Historico de parametros excede o limite.','LIMIT');
  const latest=new Map();
  for(const rule of rulesRes.results||[])if(!latest.has(rule.event_id))latest.set(rule.event_id,rule);
  const byEmployee=new Map();
  for(const m of eventRows){
    if(!byEmployee.has(m.employee_id))byEmployee.set(m.employee_id,[]);
    byEmployee.get(m.employee_id).push(m);
  }
  const common=[];
  const commonAdd=(code,message)=>common.push({code,message,level:'BLOCKER'});
  if(period.status!=='OPEN')commonAdd('COMPETENCIA_BLOQUEADA','A competencia esta bloqueada para processamento.');
  try{histTable(HIST_INSS,period.competence)}
  catch(_){commonAdd('TABELA_INSS_AUSENTE','Tabela INSS nao disponivel para esta competencia.');}
  try{histTable(HIST_IRRF,payment.slice(0,7))}
  catch(_){commonAdd('TABELA_IRRF_AUSENTE','Tabela IRRF nao disponivel para a data de pagamento.');}
  if(!allEmployees.length)commonAdd('SEM_FUNCIONARIOS','Nao ha funcionarios admitidos ate o fim desta competencia.');
  const items=[];
  for(const emp of allEmployees){
    const issues=[],notes=[];
    const add=(code,message)=>{if(!issues.some(x=>x.code===code))issues.push({code,message,level:'BLOCKER'});};
    const note=(code,message)=>{if(!notes.some(x=>x.code===code))notes.push({code,message,level:'INFO'});};
    const salary=history.salary.get(emp.id)?.[0]||null;
    const schedule=history.schedule.get(emp.id)?.[0]||null;
    const functional=history.functional.get(emp.id)?.[0]||null;
    const changedSalary=salaryChangesByEmployee.get(emp.id)||[];
    const otherChanges=[...(history.changesSchedule.get(emp.id)||[]),...(history.changesFunctional.get(emp.id)||[])];
    const occurrences=history.occurrences.get(emp.id)||[];
    const absence=absenceSnapshot.get(emp.id)||null;
    const leave=leaveSnapshot.get(emp.id)||null;
    if(leave?.blockers?.length)for(const message of leave.blockers)add('AFASTAMENTO',message);
    if(leave?.warnings?.length)for(const message of leave.warnings)note('AFASTAMENTO',message);
    if(leave?.dates?.length && absence &&
       ((absence.absences||[]).some(x=>leave.dates.includes(x.date))||
        (absence.adjustments||[]).some(x=>leave.dates.includes(x.event_date))))
      add('SOBREPOSICAO_AFASTAMENTO','Licença/afastamento sobreposto a falta ou atraso na competência.');
    if(absence?.blockers?.length)for(const message of absence.blockers)add('FREQUENCIA',message);
    if(absence?.warnings?.length)for(const message of absence.warnings)note('FREQUENCIA',message);
    const events=byEmployee.get(emp.id)||[];
    if(leave?.leave?.some(x=>x.treatment==='UNPAID')){
      for(const m of events)if(m.event_type==='DESCONTO'&&/licen[cç]a|afastamento|falta|desconto salarial/i.test((m.event_name||'')+' '+(m.event_code||'')))
        add('DUPLICIDADE_LICENCA','O evento '+m.event_code+' pode repetir desconto de licença sem remuneração. Remova ou concilie.');
    }
    if(absence&&((absence.absences||[]).some(x=>x.classification==='INJUSTIFICADA')||(absence.adjustments||[]).length)){
      for(const m of events)if(m.event_type==='DESCONTO'&&/falta|atraso|dsr|repouso semanal/i.test((m.event_name||'')+' '+(m.event_code||'')))
        add('DUPLICIDADE_FREQUENCIA','O evento '+m.event_code+' parece descontar falta, atraso ou DSR já lançado automaticamente. Remova a duplicidade antes de calcular.');
    }
    if(!/^\d{5}$/.test(String(emp.employee_code||'')))add('ID_FUNCIONARIO','Funcionario sem ID sequencial valido.');
    if(!emp.cost_center_id||!emp.cost_center_code)
      add('CENTRO_CUSTO','Cadastre um centro de custo analítico para este funcionário antes do cálculo.');
    else {
      try{await validateCostCenterForEntry(env,companyId,emp.cost_center_id)}
      catch(_){add('CENTRO_CUSTO_INVALIDO','Centro de custo inativo, sintético ou de outra empresa.');}
    }
    if(!emp.active && !functional)add('SITUACAO_INATIVA','Funcionario inativo sem historico funcional que comprove o vinculo na competencia.');
    if(!functional)add('HISTORICO_FUNCIONAL','Cadastre a situacao funcional com vigencia anterior ou igual ao inicio da competencia.');
    else if(functional.situation!=='ATIVO')add('SITUACAO_FUNCIONAL','Situacao funcional na competencia: '+functional.situation+'. Exige processamento especifico.');
    if(!salary||!Number.isSafeInteger(salary.salary_cents)||salary.salary_cents<=0)
      add('HISTORICO_SALARIAL','Cadastre um salario historico positivo vigente no inicio da competencia.');
    if(!schedule||!Number.isSafeInteger(schedule.monthly_hours_milli)||schedule.monthly_hours_milli<=0)
      add('JORNADA','Cadastre uma jornada mensal valida vigente no inicio da competencia.');
    if(emp.admission_date>first){
      if(!prorationSettings?.mode)add('PARAMETRO_ADMISSAO','Configure o método de salário proporcional na admissão da empresa antes do cálculo.');
      else if(prorationSettings.mode==='COMMERCIAL_30'&&Number(emp.admission_date.slice(8,10))===31)
        add('ADMISSAO_DIA_31','Admissão no dia 31 com mês comercial exige tratamento específico; consulte o departamento pessoal.');
      else note('ADMISSAO_PROPORCIONAL','Salário proporcional por '+(prorationSettings.mode==='COMMERCIAL_30'?'30 dias comerciais':'dias efetivos do mês')+'.');
    }
    if(otherChanges.length)add('ALTERACAO_FUNCIONAL_OU_JORNADA','Mudança de jornada ou situação no mês ainda exige processamento específico.');
    if(changedSalary.length){
      if(salaryMode==='RM_NEXT_MONTH')note('REAJUSTE_MES_SEGUINTE','Padrão RM: '+changedSalary.length+' alteração(ões) salarial(is) aplicadas na folha seguinte.');
      else {
        if(emp.admission_date>first&&prorationSettings?.mode!=='CALENDAR')
          add('ADMISSAO_REAJUSTE','Para admissão com reajuste no mesmo mês, configure admissão pelos dias do calendário.');
        if(events.some(x=>x.unit!=='VALOR'))
          add('FORMULAS_COM_REAJUSTE','Existem eventos por hora, dia ou percentual: confira as fórmulas por vigência antes de proporcionalizar.');
        note('REAJUSTE_PROPORCIONAL','Salário-base proporcional aos períodos do histórico, com divisor dos dias reais do mês.');
      }
    }
    // Faltas individuais confirmadas entram no desconto. Férias, licenças e
    // afastamentos seguem bloqueados pelo controle de frequência acima.
    for(const ev of events){
      const rule=latest.get(ev.event_id);
      const evLabel=(ev.event_code||'?')+' ('+(ev.event_name||'evento')+')';
      if(!ev.event_active)add('EVENTO_INATIVO_'+ev.event_id,'Evento inativo lancado: '+evLabel+'.');
      if(!rule){add('REGRA_'+ev.event_id,'Sem parametros vigentes para o evento '+evLabel+'.');continue;}
      if([rule.inss,rule.irrf,rule.fgts].some(x=>!['SIM','NAO'].includes(x)))
        add('INCIDENCIA_'+ev.event_id,'Confirme INSS, IRRF e FGTS para o evento '+evLabel+'.');
      if(ev.unit==='VALOR'){
        if(!Number.isSafeInteger(ev.amount_cents)||ev.amount_cents<0)add('VALOR_'+ev.id,'Valor monetario invalido: '+evLabel+'.');
      }else if(!rule.formula_text||Number(rule.calculation_code)!==0){
        add('FORMULA_'+ev.id,'Evento '+evLabel+' requer formula aritmetica suportada para '+ev.unit+'.');
      }else note('CONFERIR_FORMULA_'+ev.id,'Verifique resultado e referencia da formula de '+evLabel+'.');
      if(ev.event_type==='PROVENTO'&&/^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test((ev.event_name||'').trim()))
        add('SALARIO_DUPLICADO','Ha possivel duplicidade entre salario cadastrado e evento '+evLabel+'.');
    }
    if((history.dependents.get(emp.id)||[]).some(x=>Number(x.irrf_eligible)===1))
      note('DEPENDENTES','Revise a elegibilidade e comprovacao dos dependentes para o IRRF.');
    if(!events.length)note('SEM_EVENTOS','Sem lancamentos variaveis; considerar o salario do historico na etapa de calculo.');
    items.push({employee_id:emp.id,employee_code:emp.employee_code||null,
      cost_center_id:emp.cost_center_id||null,cost_center_code:emp.cost_center_code||null,
      employee_name:emp.name,admission_date:emp.admission_date,
      salary_history:salary?centsToMoney(salary.salary_cents):null,
      monthly_hours:schedule?Number(schedule.monthly_hours_milli)/1000:null,
      movement_count:events.length,leave_days:leave?.leave?.reduce((n,x)=>n+x.days,0)||0,absence_days:absence?.absences?.filter(x=>x.classification==='INJUSTIFICADA').length||0,
      lateness_count:absence?.adjustments?.filter(x=>x.kind==='LATE').length||0,
      dsr_count:absence?.adjustments?.filter(x=>x.kind==='DSR_LOSS').length||0,salary_changes:changedSalary.length,
      salary_change_mode:salaryMode,status:issues.length||common.length?'PENDENTE':'CADASTROS_COMPLETOS',
      blockers:issues,warnings:notes,blocker_count:issues.length});
  }
  const totalBlockers=items.reduce((n,x)=>n+x.blocker_count,0)+common.length;
  return {kind:'PREPARACAO_MENSAL_ETAPA_34',competence:period,payment_date:payment,
    proration_settings:prorationSettings?{effective_from:prorationSettings.effective_from,revision:prorationSettings.revision,mode:prorationSettings.mode}:null,
    salary_change_settings:salarySettings?{effective_from:salarySettings.effective_from,revision:salarySettings.revision,mode:salarySettings.mode}:{mode:'RM_NEXT_MONTH',default:true},
    first_date:first,last_date:last,employees:items,employee_count:items.length,
    complete_employee_count:common.length?0:items.filter(x=>x.blocker_count===0).length,
    pending_employee_count:items.filter(x=>x.blocker_count>0).length,
    blocker_count:totalBlockers,global_blockers:common,
    infrastructure_prepared:true,read_only:true,calculation_executed:false,
    ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
    message:'Conferencia de cadastros e parametros. Nenhuma folha, salario liquido, titulo financeiro ou contabilizacao foi gerado.'};
}

// ===== SAGAS Folha Etapa 35: processamento mensal versionado e NAO homologado =====
// O cálculo mensal aceita admissão proporcional e histórico salarial conforme
// parâmetros por empresa. Ocorrências e mudanças de jornada permanecem bloqueadas.
function payrollMonthlyEmployeeCalc35(employee, movements, rules, dependents, competence, paymentDate, prorationMode,salaryMode,salaryChanges,attendance,leave){
  const moneySafe=(value,label)=>{
    if(!Number.isSafeInteger(value)||value<0||value>99999999999)
      throw new HttpError(409,'Valor invalido no calculo de '+label+'.','DATA_INVALID');
    return value;
  };
  const salary=moneySafe(employee.salary_cents,'salario');
  if(salary===0)throw new HttpError(409,'Salario historico zerado.','CALCULATION_BLOCKED');
  const hours=Number(employee.monthly_hours_milli);
  if(!Number.isSafeInteger(hours)||hours<=0)throw new HttpError(409,'Jornada mensal ausente.','CALCULATION_BLOCKED');
  const computedPay=payrollSalaryAmount47(salary,employee.admission_date,competence,prorationMode,
    salaryMode,salaryChanges,payrollAdmissionSalary46,HttpError);
  const paid=computedPay.salary_cents;
  let earnings=paid,manualDiscounts=0,baseInss=paid,baseIrrf=paid,baseFgts=paid;
  const lines=[{event_id:null,event_code:'SALARIO_BASE',event_name:'Salario mensal',
    line_type:'PROVENTO',amount_cents:paid,reference_text:computedPay.reference_text,rule_version:null}];
  for(const mov of movements){
    const rule=rules.get(mov.event_id);
    if(!rule||[rule.inss,rule.irrf,rule.fgts].some(x=>!['SIM','NAO'].includes(x)))
      throw new HttpError(409,'Evento sem parametros fiscais vigentes: '+mov.event_code+'.','CALCULATION_BLOCKED');
    let value;
    if(salaryMode==='PRORATE_CALENDAR'&&salaryChanges?.length&&mov.unit!=='VALOR')
      throw new HttpError(409,'Evento com fórmula depende de vigências salariais: '+mov.event_code+'. Confira antes de calcular.','SALARY_FORMULA_REQUIRES_REVIEW');
    if(mov.unit==='VALOR')value=moneySafe(Number(mov.amount_cents),mov.event_code);
    else{
      if(Number(rule.calculation_code)!==0||!String(rule.formula_text||'').trim())
        throw new HttpError(409,'Formula especial nao suportada em '+mov.event_code+'.','CALCULATION_BLOCKED');
      if(!Number.isSafeInteger(mov.quantity_milli)||mov.quantity_milli<0)
        throw new HttpError(409,'Referencia invalida em '+mov.event_code+'.','CALCULATION_BLOCKED');
      const ref={a:BigInt(mov.quantity_milli),b:1000n};
      const variables={SALARIO:{a:BigInt(salary),b:100n},REFERENCIA:ref,QUANTIDADE:ref,
        JORNADA_MENSAL:{a:BigInt(hours),b:1000n}};
      if(mov.unit==='HORAS')variables.HORAS=ref;
      if(mov.unit==='DIAS')variables.DIAS=ref;
      if(mov.unit==='PERCENTUAL')variables.PERCENTUAL=ref;
      try{value=payrollExprCents(rule.formula_text,variables)}
      catch(e){throw new HttpError(409,'Formula nao calculavel para '+mov.event_code+': '+String(e?.message||e),'CALCULATION_BLOCKED');}
      moneySafe(value,mov.event_code);
    }
    if(mov.event_type==='PROVENTO'){
      earnings+=value;
      if(rule.inss==='SIM')baseInss+=value;
      if(rule.irrf==='SIM')baseIrrf+=value;
      if(rule.fgts==='SIM')baseFgts+=value;
    }else if(mov.event_type==='DESCONTO'){
      // Faltas, pensoes e outros descontos que ajustam bases legais exigem
      // implementacao propria; proibir tratá-los como descontos simples.
      if([rule.inss,rule.irrf,rule.fgts].includes('SIM'))
        throw new HttpError(409,'Desconto com reflexo tributario requer regra especifica: '+mov.event_code+'.','CALCULATION_BLOCKED');
      manualDiscounts+=value;
    }else if(mov.event_type==='INFORMATIVO'){
      if([rule.inss,rule.irrf,rule.fgts].includes('SIM'))
        throw new HttpError(409,'Evento informativo com incidencia fiscal nao pode compor a folha: '+mov.event_code+'.','CALCULATION_BLOCKED');
    }else throw new HttpError(409,'Tipo de evento invalido.','CALCULATION_BLOCKED');
    lines.push({event_id:mov.event_id,event_code:mov.event_code,event_name:mov.event_name,
      line_type:mov.event_type,amount_cents:value,
      reference_text:mov.unit==='VALOR'?'Valor informado':mov.unit+': '+(mov.quantity_milli/1000),
      rule_version:rule.effective_from+'#'+rule.revision});
  }
  // Frequência: descontos automáticos com classificação documental e DSR explícito.
  const abs=payrollAbsenceAmounts48(salary,hours,competence,attendance,salaryChanges,salaryMode,{HttpError});
  if(abs.discount_cents>paid)throw new HttpError(409,'Descontos de faltas, atrasos e DSR excedem o salário devido no período.','ABSENCE_EXCEEDS_PAY');
  for(const x of abs.entries){
    manualDiscounts+=x.amount_cents;
    baseInss-=x.amount_cents; baseIrrf-=x.amount_cents; baseFgts-=x.amount_cents;
    lines.push({event_id:null,event_code:x.event_code,event_name:x.event_name,
      line_type:'DESCONTO',amount_cents:x.amount_cents,reference_text:x.reference_text,rule_version:'FREQUENCIA48'});
  }
  // Licenças: classificações gravadas e fotografia histórica; sem inferir INSS.
  const leaveAmounts=payrollLeaveAmounts49(salary,paid,competence,leave,attendance,salaryChanges,
    salaryMode,employee.admission_date,movements,{HttpError});
  if(abs.discount_cents+leaveAmounts.discount_cents>paid)
    throw new HttpError(409,'Descontos de frequência e licença excedem o salário do período.','LEAVE_EXCEEDS_PAY');
  for(const x of leaveAmounts.entries){
    if(x.line_type==='DESCONTO'){
      manualDiscounts+=x.amount_cents;
      baseInss-=x.amount_cents;baseIrrf-=x.amount_cents;baseFgts-=x.amount_cents;
    }
    lines.push({event_id:null,event_code:x.event_code,event_name:x.event_name,
      line_type:x.line_type,amount_cents:x.amount_cents,reference_text:x.reference_text,rule_version:'LICENCA49'});
  }
  for(const [n,v] of Object.entries({earnings,manualDiscounts,baseInss,baseIrrf,baseFgts}))moneySafe(v,n);
  // Para o caso mensal padrao, INSS do segurado incide sobre o total da base
  // contribuinte e IRRF sobre rendimentos tributaveis no mes de pagamento.
  const tax=payrollTaxHistoricalWithDependents(baseInss,baseIrrf,baseFgts,competence,paymentDate,dependents);
  const discounts=manualDiscounts+tax.inss_cents+tax.irrf_cents;
  if(discounts>earnings)throw new HttpError(409,'Descontos excedem os proventos do funcionario.','CALCULATION_BLOCKED');
  lines.push({event_id:null,event_code:'INSS_EMP',event_name:'INSS empregado',line_type:'DESCONTO',
    amount_cents:tax.inss_cents,reference_text:'Base '+centsToMoney(baseInss),rule_version:tax.inss_table_from});
  lines.push({event_id:null,event_code:'IRRF_EMP',event_name:'IRRF empregado',line_type:'DESCONTO',
    amount_cents:tax.irrf_cents,reference_text:'Base '+centsToMoney(tax.irrf_base_cents),rule_version:tax.irrf_table_from});
  lines.push({event_id:null,event_code:'FGTS_PATRONAL',event_name:'FGTS do empregador',line_type:'INFORMATIVO',
    amount_cents:tax.fgts_cents,reference_text:'Base '+centsToMoney(baseFgts),rule_version:competence});
  return {employee_id:employee.employee_id,employee_code:employee.employee_code,employee_name:employee.employee_name,
    cost_center_id:employee.cost_center_id||null,earnings_cents:earnings,deductions_cents:discounts,net_cents:earnings-discounts,
    inss_cents:tax.inss_cents,irrf_cents:tax.irrf_cents,fgts_cents:tax.fgts_cents,
    inss_base_cents:baseInss,irrf_gross_cents:baseIrrf,irrf_base_cents:tax.irrf_base_cents,
    fgts_base_cents:baseFgts,dependent_count:dependents,lines};
}
async function payrollMonthlySource35(env,companyId,competenceId,paymentDate){
  const prep=await payrollMonthlyPreparation34(env,companyId,competenceId,paymentDate);
  if(prep.blocker_count>0||prep.global_blockers.length>0){
    const example=prep.global_blockers[0]?.message||prep.employees.find(e=>e.blocker_count)?.blockers[0]?.message||'Cadastros incompletos';
    throw new HttpError(409,'Corrija as pendencias de Preparar folha mensal antes de calcular: '+example,'PREPARATION_PENDING');
  }
  if(prep.employee_count===0||prep.employee_count>100)
    throw new HttpError(409,'Esta rotina processa de 1 a 100 funcionarios por competencia.','LIMIT');
  const employees=prep.employees;
  const ids=new Set(employees.map(e=>e.employee_id));
  const mov=await env.DB.prepare(`SELECT m.id,m.employee_id,m.event_id,m.unit,m.amount_cents,m.quantity_milli,
      e.code AS event_code,e.name AS event_name,e.event_type
    FROM payroll_movements m JOIN payroll_events e ON e.id=m.event_id AND e.company_id=m.company_id
    WHERE m.company_id=? AND m.competence_id=? ORDER BY m.employee_id,e.code,m.id LIMIT 501`)
    .bind(companyId,competenceId).all();
  const movements=mov.results||[];
  if(movements.length>500)throw new HttpError(409,'Mais de 500 eventos no periodo: calcule por lote em versao futura.','LIMIT');
  if(movements.some(m=>!ids.has(m.employee_id)))
    throw new HttpError(409,'Existem eventos lancados para funcionario nao elegivel para folha mensal.','CALCULATION_BLOCKED');
  const rulesResult=await env.DB.prepare(`SELECT event_id,effective_from,revision,inss,irrf,fgts,calculation_code,formula_text
    FROM payroll_event_rule_versions WHERE company_id=? AND effective_from<=?
      AND event_id IN (SELECT DISTINCT event_id FROM payroll_movements WHERE company_id=? AND competence_id=?)
    ORDER BY event_id,effective_from DESC,revision DESC LIMIT 5001`)
    .bind(companyId,prep.competence.competence,companyId,competenceId).all();
  if((rulesResult.results||[]).length>5000)throw new HttpError(409,'Historico de versoes dos eventos excede o limite.','LIMIT');
  const rules=new Map();for(const rule of rulesResult.results||[])if(!rules.has(rule.event_id))rules.set(rule.event_id,rule);
  const depResult=await env.DB.prepare(`SELECT employee_id,COUNT(*) AS total FROM payroll_employee_dependents
    WHERE company_id=? AND irrf_eligible=1 AND effective_from<=?
      AND (effective_to IS NULL OR effective_to>=?) GROUP BY employee_id LIMIT 101`)
    .bind(companyId,paymentDate,paymentDate).all();
  if((depResult.results||[]).length>100)throw new HttpError(409,'Mais de 100 funcionarios com dependentes.','LIMIT');
  const dependents=new Map((depResult.results||[]).map(x=>[x.employee_id,Number(x.total)]));
  const history=await payrollEmployeeHistoricalContext(env,companyId,prep.first_date,prep.last_date);
  await payrollAdmissionHistory46(env,companyId,employees,prep.first_date,prep.last_date,history,HttpError);
  const changedSalary=await payrollSalaryHistory47(env,companyId,employees,history,prep.first_date,prep.last_date,HttpError);
  const attendance=await payrollAbsenceSnapshot48(env,companyId,prep.competence.competence,{HttpError});
  const leave=await payrollLeaveSnapshot49(env,companyId,prep.competence.competence,{HttpError});
  // v100: utilizacao apenas de memorias STAGED, com recibo VACATION aprovado,
  // fontes e encargos conciliados. Demais empregados seguem motor v35.
  const vacation100=await payrollVacationMonthly100(env,companyId,competenceId,paymentDate,{
    HttpError,ensureSchemaRevision,taxes:payrollTaxHistoricalWithDependents,
    monthlyIrrf:(gross,inssBalance,dep,date)=>{
      const t=histTable(HIST_IRRF,date.slice(0,7));
      const legal=inssBalance+dep*18959;
      const deduction=Math.max(legal,t[2]);
      const taxable=Math.max(0,gross-deduction);
      const band=t[1].find(x=>taxable<=x[0]);
      const before=Math.max(0,payrollTaxRound(taxable*band[1],10000)-band[2]);
      let reduction=0;
      if(t[3]){
        if(gross<=500000)reduction=Math.min(before,31289);
        else if(gross<=735000)reduction=Math.min(before,Math.max(0,97862-payrollTaxRound(gross*133145,1000000)));
      }
      return {irrf_cents:Math.max(0,before-reduction),base_cents:taxable,deduction_cents:deduction};
    }});
  if(vacation100.records.some(r=>!ids.has(r.employee_id)))
    throw new HttpError(409,'Férias preparadas para funcionário que não participa da folha mensal.','VACATION_EMPLOYEE_INELIGIBLE');
  const items=[];
  for(const emp of employees){
    const salary=history.salary.get(emp.employee_id)?.[0]||null;
    const schedule=history.schedule.get(emp.employee_id)?.[0]||null;
    if(!salary||!schedule)throw new HttpError(409,'Historico de salario e jornada foi alterado durante a preparacao.','SOURCE_CHANGED');
    const count=dependents.get(emp.employee_id)||0;
    const relevant=movements.filter(m=>m.employee_id===emp.employee_id);
    const staged=vacation100.byEmployee.get(emp.employee_id);
    if(staged&&relevant.length)
      throw new HttpError(409,'Movimentos manuais ainda não conciliados com férias.','VACATION_EXTRA_MOVEMENT');
    const calculated=staged?{...staged,employee_code:emp.employee_code,employee_name:emp.employee_name}:
      payrollMonthlyEmployeeCalc35({...emp,salary_cents:salary.salary_cents,
      monthly_hours_milli:schedule.monthly_hours_milli},relevant,rules,count,
      prep.competence.competence,paymentDate,prep.proration_settings?.mode||null,
      prep.salary_change_settings?.mode||'RM_NEXT_MONTH',changedSalary.get(emp.employee_id)||[],
      attendance.get(emp.employee_id)||null,leave.get(emp.employee_id)||null);
    items.push(calculated);
  }
  const financialSafe=items.every(x=>[x.earnings_cents,x.deductions_cents,x.net_cents,x.inss_cents,
    x.irrf_cents,x.fgts_cents].every(n=>Number.isSafeInteger(n)&&n>=0));
  if(!financialSafe)throw new HttpError(409,'Total fora da faixa monetaria permitida.','DATA_INVALID');
  // O fingerprint inclui todas as entradas relevantes e a saida deterministica.
  const rawFingerprint=await payrollProcessingSnapshotHash28({version:vacation100.records.length?100:35,company_id:companyId,
    competence_id:competenceId,competence:prep.competence.competence,payment_date:paymentDate,
    proration_settings:prep.proration_settings,salary_change_settings:prep.salary_change_settings,
    salary_changes:[...changedSalary.entries()],attendance:[...attendance.entries()],
    leave:[...leave.entries()],employee_inputs:employees,history_salary:items.map(x=>[x.employee_id,history.salary.get(x.employee_id)]),
    history_schedule:items.map(x=>[x.employee_id,history.schedule.get(x.employee_id)]),
    history_functional:items.map(x=>[x.employee_id,history.functional.get(x.employee_id)]),
    movements,rules:[...rulesResult.results||[]],dependents:[...dependents.entries()],
    ...(vacation100.records.length?{vacation_stages:vacation100.records}:{}),items});
  const fingerprint=vacation100.records.length?'VACATION100:'+rawFingerprint:rawFingerprint;
  return {prep,items,fingerprint,vacation_records:vacation100.records,employee_count:items.length,
    totals:{earnings_cents:items.reduce((a,x)=>a+x.earnings_cents,0),
      deductions_cents:items.reduce((a,x)=>a+x.deductions_cents,0),
      net_cents:items.reduce((a,x)=>a+x.net_cents,0),
      inss_cents:items.reduce((a,x)=>a+x.inss_cents,0),
      irrf_cents:items.reduce((a,x)=>a+x.irrf_cents,0),
      fgts_cents:items.reduce((a,x)=>a+x.fgts_cents,0)}};
}
async function payrollMonthlyRunDetail35(env,companyId,runId){
  await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
  const run=await env.DB.prepare(`SELECT r.id,r.competence_id,c.competence,r.payment_date,r.revision,r.status,
    r.source_fingerprint,r.created_at FROM payroll_calc_runs r
    JOIN payroll_competences c ON c.id=r.competence_id AND c.company_id=r.company_id
    WHERE r.id=? AND r.company_id=? AND r.process_kind='MONTHLY'`).bind(runId,companyId).first();
  if(!run)throw new HttpError(404,'Processamento mensal nao encontrado.','NOT_FOUND');
  const rows=await env.DB.prepare(`SELECT e.*,n.number AS employee_number,p.name AS employee_name,
      cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM payroll_calc_envelopes e
    JOIN payroll_employees p ON p.id=e.employee_id AND p.company_id=e.company_id
    LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id
    LEFT JOIN payroll_employee_numbers n ON n.employee_id=e.employee_id AND n.company_id=e.company_id
    WHERE e.company_id=? AND e.run_id=? ORDER BY p.name COLLATE NOCASE,e.id`)
    .bind(companyId,runId).all();
  const envelopes=[];
  for(const envp of rows.results||[]){
    const result=await env.DB.prepare(`SELECT event_code,event_name,line_type,amount_cents,reference_text,rule_version,sequence
      FROM payroll_calc_lines WHERE company_id=? AND envelope_id=? ORDER BY sequence`)
      .bind(companyId,envp.id).all();
    envelopes.push({employee_id:envp.employee_id,
      employee_code:envp.employee_number==null?null:String(envp.employee_number).padStart(5,'0'),
      employee_name:envp.employee_name,cost_center_id:envp.cost_center_id||null,
      cost_center_code:envp.cost_center_code||null,cost_center_name:envp.cost_center_name||null,
      earnings_cents:envp.earnings_cents,deductions_cents:envp.deductions_cents,
      net_cents:envp.net_cents,inss_cents:envp.inss_cents,irrf_cents:envp.irrf_cents,
      fgts_cents:envp.fgts_cents,lines:result.results||[]});
  }
  return {kind:'FOLHA_MENSAL_CALCULADA_ETAPA_35',run,envelopes,employee_count:envelopes.length,
    totals:{earnings_cents:envelopes.reduce((a,x)=>a+x.earnings_cents,0),
      deductions_cents:envelopes.reduce((a,x)=>a+x.deductions_cents,0),
      net_cents:envelopes.reduce((a,x)=>a+x.net_cents,0),
      inss_cents:envelopes.reduce((a,x)=>a+x.inss_cents,0),
      irrf_cents:envelopes.reduce((a,x)=>a+x.irrf_cents,0),
      fgts_cents:envelopes.reduce((a,x)=>a+x.fgts_cents,0)},
    approved:run.status==='APPROVED',ready_for_payment:false,ready_for_accounting:false,
    message:run.status==='APPROVED'?'Folha fechada internamente. Ainda nao foi gerado pagamento ou contabilizacao.':'Calculo armazenado para conferencia; pagamentos e contabilizacao bloqueados.'};
}
async function payrollMonthlyRuns35(env,companyId,competenceId){
  const c=await env.DB.prepare(`SELECT id FROM payroll_competences WHERE company_id=? AND id=?`)
    .bind(companyId,competenceId).first();
  if(!c)throw new HttpError(404,'Competencia nao encontrada.','NOT_FOUND');
  const r=await env.DB.prepare(`SELECT id,revision,status,payment_date,created_at FROM payroll_calc_runs
    WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 100`)
    .bind(companyId,competenceId).all();
  return {runs:r.results||[]};
}
async function payrollMonthlyRunCreate35(env,request,auth,companyId,competenceId,paymentDate){
  await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));

  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const date=payrollStrictDate(paymentDate,'Data prevista de pagamento');
  await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
  await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
  await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
  await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
  const source=await payrollMonthlySource35(env,companyId,competenceId,date);
  const previous=await env.DB.prepare(`SELECT id,revision,source_fingerprint,payment_date,status
    FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY'
    ORDER BY revision DESC LIMIT 1`).bind(companyId,competenceId).first();
  if(previous?.status!=='VOID' && previous?.source_fingerprint===source.fingerprint && previous.payment_date===date){
    const detail=await payrollMonthlyRunDetail35(env,companyId,previous.id);
    return {...detail,reused:true};
  }
  if(previous && !['CALCULATED','VOID'].includes(previous.status))
    throw new HttpError(409,'Ha um processamento ja revisado ou aprovado. Nao e permitido substitui-lo automaticamente.','RUN_LOCKED');
  const revision=previous?Number(previous.revision)+1:1;
  if(!Number.isSafeInteger(revision)||revision>99999)throw new HttpError(409,'Limite de revisoes atingido.','LIMIT');
  const runId=uuid();
  const statements=[env.DB.prepare(`INSERT INTO payroll_calc_runs
      (id,company_id,competence_id,process_kind,payment_date,revision,status,source_fingerprint,created_by)
      SELECT ?,?,?,'MONTHLY',?,?,'CALCULATED',?,? WHERE EXISTS(
        SELECT 1 FROM payroll_competences WHERE id=? AND company_id=? AND status='OPEN')`)
      .bind(runId,companyId,competenceId,date,revision,source.fingerprint,auth.user.id,competenceId,companyId)];
  for(const emp of source.items){
    const envelopeId=uuid();
    statements.push(env.DB.prepare(`INSERT INTO payroll_calc_envelopes
      (id,company_id,run_id,employee_id,earnings_cents,deductions_cents,net_cents,inss_cents,irrf_cents,fgts_cents,cost_center_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(envelopeId,companyId,runId,emp.employee_id,emp.earnings_cents,emp.deductions_cents,emp.net_cents,
        emp.inss_cents,emp.irrf_cents,emp.fgts_cents,emp.cost_center_id));
    for(let i=0;i<emp.lines.length;i++){
      const line=emp.lines[i];
      statements.push(env.DB.prepare(`INSERT INTO payroll_calc_lines
        (id,company_id,envelope_id,event_id,event_code,event_name,line_type,amount_cents,reference_text,rule_version,sequence)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),companyId,envelopeId,line.event_id,
          line.event_code,line.event_name,line.line_type,line.amount_cents,line.reference_text,line.rule_version,i+1));
    }
  }
  // Vinculo auditavel, na MESMA transacao dos envelopes MONTHLY.
  for(const stage of source.vacation_records||[]){
    statements.push(env.DB.prepare(
      "INSERT INTO payroll_vacation_monthly_usage100(id,company_id,run_id,stage_id,employee_id,competence_id,source_fingerprint) VALUES (?,?,?,?,?,?,?)"
    ).bind(uuid(),companyId,runId,stage.id,stage.employee_id,competenceId,stage.source_fingerprint));
  }
  try{await env.DB.batch(statements)}
  catch(err){
    if(/UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(String(err?.message||err)))
      throw new HttpError(409,'Outro processamento ou alteracao de competencia ocorreu. Atualize e tente novamente.','CONFLICT');
    throw err;
  }
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_calc_runs',entityId:runId,
    after:{competence_id:competenceId,revision,employee_count:source.employee_count,
      source_fingerprint:source.fingerprint,totals:source.totals,approved:false},request});
  return {...await payrollMonthlyRunDetail35(env,companyId,runId),reused:false};
}

// ===== SAGAS Folha Etapa 36 — conferencia e fechamento da folha mensal =====
// Nao executa pagamentos, contabilizacao ou envio de obrigacoes fiscais.
// A conferencia compara a fotografia gravada com as fontes atuais antes de fechar.
async function ensurePayrollMonthlyReviewSchema36(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_calc_monthly_reviews (
      run_id TEXT PRIMARY KEY REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,
      company_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_by TEXT,
      closed_at TEXT,
      CHECK ((closed_by IS NULL AND closed_at IS NULL) OR
             (closed_by IS NOT NULL AND closed_at IS NOT NULL))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_calc_monthly_reviews_company
      ON payroll_calc_monthly_reviews(company_id,run_id)`)
  ]);
}
function payrollMonthlyNumbersAgree36(actual,expected){
  return ['earnings_cents','deductions_cents','net_cents','inss_cents','irrf_cents','fgts_cents']
    .every(k=>Number.isSafeInteger(Number(actual[k]))&&Number(actual[k])===Number(expected[k]));
}
function payrollMonthlyEnvelopeAgree36(stored,source){
  if(!payrollMonthlyNumbersAgree36(stored,source))return false;
  const a=stored.lines||[],b=source.lines||[];
  if(a.length!==b.length)return false;
  return a.every((row,i)=>{
    const line=b[i];
    return line&&row.event_code===line.event_code&&row.event_name===line.event_name&&
      row.line_type===line.line_type&&Number(row.amount_cents)===Number(line.amount_cents)&&
      (row.reference_text||null)===(line.reference_text||null)&&
      (row.rule_version||null)===(line.rule_version||null);
  });
}
async function payrollMonthlyReadReview36(env,companyId,runId){
  return await env.DB.prepare(`SELECT run_id,source_fingerprint,snapshot_json,reviewed_by,reviewed_at,
    closed_by,closed_at FROM payroll_calc_monthly_reviews WHERE run_id=? AND company_id=?`)
    .bind(runId,companyId).first();
}
async function payrollMonthlyConference36(env,companyId,runId){
  const detail=await payrollMonthlyRunDetail35(env,companyId,runId);
  const run=detail.run;
  const review=await payrollMonthlyReadReview36(env,companyId,runId);
  const latest=await env.DB.prepare(`SELECT id,revision FROM payroll_calc_runs
    WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY'
    ORDER BY revision DESC LIMIT 1`).bind(companyId,run.competence_id).first();
  const problems=[];
  const block=(code,message)=>problems.push({code,message});
  // Um processamento de férias precisa ter vinculo auditavel por estágio.
  const used=run.source_fingerprint.startsWith('VACATION100:')?
    (await env.DB.prepare(
      "SELECT u.stage_id,u.employee_id,u.source_fingerprint,s.source_fingerprint AS current_source,s.status AS stage_status FROM payroll_vacation_monthly_usage100 u JOIN payroll_vacation_monthly_stage61 s ON s.id=u.stage_id AND s.company_id=u.company_id WHERE u.company_id=? AND u.run_id=?"
    ).bind(companyId,runId).all()).results||[]:[];
  if(run.source_fingerprint.startsWith('VACATION100:')&&!used.length)
    block('FERIAS_SEM_VINCULO','Processamento com férias sem memória de compensação.');
  if(used.some(x=>x.source_fingerprint!==x.current_source||x.stage_status!=='STAGED'))
    block('FERIAS_ORIGEM_ALTERADA','Memória de férias usada no envelope foi anulada ou modificada.');
  if(!detail.employee_count)block('SEM_ENVELOPES','Nenhum envelope foi gravado.');
  if(!latest||latest.id!==runId)block('VERSAO_ANTERIOR','Somente a revisao mais recente pode ser conferida ou fechada.');
  for(const e of detail.envelopes){
    const proventos=(e.lines||[]).filter(x=>x.line_type==='PROVENTO').reduce((n,x)=>n+Number(x.amount_cents),0);
    const descontos=(e.lines||[]).filter(x=>x.line_type==='DESCONTO').reduce((n,x)=>n+Number(x.amount_cents),0);
    const inss=(e.lines||[]).filter(x=>x.event_code==='INSS_EMP').reduce((n,x)=>n+Number(x.amount_cents),0);
    const irrf=(e.lines||[]).filter(x=>x.event_code==='IRRF_EMP').reduce((n,x)=>n+Number(x.amount_cents),0);
    const fgts=(e.lines||[]).filter(x=>x.event_code==='FGTS_PATRONAL').reduce((n,x)=>n+Number(x.amount_cents),0);
    if(![proventos,descontos,inss,irrf,fgts].every(Number.isSafeInteger)||
      proventos!==Number(e.earnings_cents)||descontos!==Number(e.deductions_cents)||
      proventos-descontos!==Number(e.net_cents)||inss!==Number(e.inss_cents)||
      irrf!==Number(e.irrf_cents)||fgts!==Number(e.fgts_cents))
      block('ENVELOPE_DIVERGENTE','Valores ou eventos do envelope '+(e.employee_code||e.employee_id)+' nao conciliam.');
  }
  const currentStatus=await env.DB.prepare(`SELECT status FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,run.competence_id).first();
  if(!currentStatus)block('COMPETENCIA_INEXISTENTE','Competencia nao encontrada.');
  const approved=run.status==='APPROVED';
  let source=null;
  if(approved){
    if(currentStatus?.status!=='LOCKED')block('COMPETENCIA_NAO_BLOQUEADA','Competencia aprovada nao esta bloqueada.');
    if(!review?.closed_at)block('FECHAMENTO_SEM_REGISTRO','Falta o registro de fechamento.');
  }else{
    if(currentStatus?.status!=='OPEN')block('COMPETENCIA_FECHADA','Competencia nao esta aberta.');
    try{
      source=await payrollMonthlySource35(env,companyId,run.competence_id,run.payment_date);
      if(source.fingerprint!==run.source_fingerprint)
        block('FONTES_ALTERADAS','Cadastros, eventos ou parametros mudaram apos o calculo. Recalcule antes de conferir.');
      if(run.source_fingerprint.startsWith('VACATION100:')){
        const expectedStages=source.vacation_records||[];
        if(expectedStages.length!==used.length||
           expectedStages.some(x=>!used.some(u=>u.stage_id===x.id&&u.employee_id===x.employee_id&&u.source_fingerprint===x.source_fingerprint)))
          block('FERIAS_VINCULOS_INCOMPLETOS','Faltam vínculos entre o cálculo mensal e as memórias de férias.');
      }
      if(source.items.length!==detail.envelopes.length)block('FUNCIONARIOS_DIVERGENTES','Numero de funcionarios foi alterado.');
      const expected=new Map(source.items.map(x=>[x.employee_id,x]));
      for(const saved of detail.envelopes){
        const current=expected.get(saved.employee_id);
        if(!current||!payrollMonthlyEnvelopeAgree36(saved,current))
          block('VALORES_MODIFICADOS','Envelopes gravados nao coincidem com o calculo atual.');
      }
      if(!payrollMonthlyNumbersAgree36(detail.totals,source.totals))
        block('TOTAL_DIVERGENTE','Somatorios da folha nao coincidem com o processamento atual.');
    }catch(e){
      block('REPROCESSAMENTO_PENDENTE',String(e?.message||'Nao foi possivel validar as entradas atuais.').slice(0,320));
    }
  }
  if(review && review.source_fingerprint!==run.source_fingerprint)
    block('REVISAO_DIVERGENTE','A revisao nao corresponde a fotografia gravada.');
  if(run.status==='REVIEWED'&&!review)block('REVISAO_AUSENTE','Folha marcada como revisada sem registro de conferencia.');
  const canReview=run.status==='CALCULATED'&&!problems.length;
  const canClose=run.status==='REVIEWED'&&!!review&&!problems.length;
  return {kind:'CONFERENCIA_FOLHA_MENSAL_ETAPA_36',run,employee_count:detail.employee_count,
    totals:detail.totals,problems,ready_for_review:canReview,ready_for_closure:canClose,
    review:review?{reviewed_by:review.reviewed_by,reviewed_at:review.reviewed_at,
      closed_by:review.closed_by,closed_at:review.closed_at}:null,
    approved,source,ready_for_payment:false,ready_for_accounting:false,
    note:approved?'Fechamento operacional registrado; a integridade das fontes futuras nao substitui esta fotografia.':
      'Conferencia interna; revisar bases e direitos trabalhistas antes do fechamento. Nao autoriza pagamento.'};
}
async function payrollMonthlyReview36(env,request,auth,companyId,runId){

  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
  const conf=await payrollMonthlyConference36(env,companyId,runId);
  if(conf.run.status==='REVIEWED'&&conf.review&&!conf.problems.length)return conf;
  if(!conf.ready_for_review)throw new HttpError(409,'A folha possui pendencias ou nao esta calculada: '+(conf.problems[0]?.message||conf.run.status),'REVIEW_BLOCKED');
  const snapshot=conf.source.items.map(e=>({employee_id:e.employee_id,
    employee_name:e.employee_name,employee_code:e.employee_code}));
  const stmts=[
    env.DB.prepare(`INSERT INTO payroll_calc_monthly_reviews
      (run_id,company_id,source_fingerprint,snapshot_json,reviewed_by)
      VALUES (?,?,?,?,?)`).bind(runId,companyId,conf.run.source_fingerprint,JSON.stringify(snapshot),auth.user.id),
    env.DB.prepare(`UPDATE payroll_calc_runs SET status='REVIEWED' WHERE id=? AND company_id=?
      AND status='CALCULATED'`).bind(runId,companyId)
  ];
  try{await env.DB.batch(stmts)}catch(err){
    if(/UNIQUE constraint|constraint failed/i.test(String(err)))
      throw new HttpError(409,'A folha foi conferida por outra operacao. Atualize a consulta.','CONFLICT');
    throw err;
  }
  await audit(env,{companyId,userId:auth.user.id,action:'REVIEW',entity:'payroll_calc_runs',entityId:runId,
    after:{status:'REVIEWED',source_fingerprint:conf.run.source_fingerprint,employee_count:snapshot.length},request});
  return payrollMonthlyConference36(env,companyId,runId);
}
async function payrollMonthlyUndoReview36(env,request,auth,companyId,runId){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
  const conf=await payrollMonthlyConference36(env,companyId,runId);
  if(conf.run.status!=='REVIEWED')throw new HttpError(409,'Somente uma conferencia nao fechada pode ser desfeita.','REVIEW_LOCKED');
  const results=await env.DB.batch([
    env.DB.prepare(`DELETE FROM payroll_calc_monthly_reviews WHERE run_id=? AND company_id=? AND closed_at IS NULL`)
      .bind(runId,companyId),
    env.DB.prepare(`UPDATE payroll_calc_runs SET status='CALCULATED'
      WHERE id=? AND company_id=? AND status='REVIEWED'`).bind(runId,companyId)
  ]);
  if(!results[1]?.meta?.changes)throw new HttpError(409,'A situacao da revisao mudou. Atualize.','CONFLICT');
  await audit(env,{companyId,userId:auth.user.id,action:'UNDO_REVIEW',entity:'payroll_calc_runs',entityId:runId,
    after:{status:'CALCULATED'},request});
  return payrollMonthlyConference36(env,companyId,runId);
}
async function payrollMonthlyClose36(env,request,auth,companyId,runId,body){

  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  if(String(body?.confirmation||'').trim()!=='FECHAR')
    throw new HttpError(400,'Confirme o fechamento digitando FECHAR.','CONFIRMATION_REQUIRED');
  await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
  const conf=await payrollMonthlyConference36(env,companyId,runId);
  if(!conf.ready_for_closure)
    throw new HttpError(409,'Nao foi possivel fechar: '+(conf.problems[0]?.message||'Folha ainda nao conferida.'),'CLOSURE_BLOCKED');
  const stmts=[
    env.DB.prepare(`UPDATE payroll_competences SET status='LOCKED'
      WHERE id=? AND company_id=? AND status='OPEN'`).bind(conf.run.competence_id,companyId),
    env.DB.prepare(`UPDATE payroll_calc_runs SET status='APPROVED'
      WHERE id=? AND company_id=? AND status='REVIEWED' AND source_fingerprint=?`)
      .bind(runId,companyId,conf.run.source_fingerprint),
    env.DB.prepare(`UPDATE payroll_calc_monthly_reviews
      SET closed_by=?,closed_at=CURRENT_TIMESTAMP
      WHERE run_id=? AND company_id=? AND closed_at IS NULL AND source_fingerprint=?`)
      .bind(auth.user.id,runId,companyId,conf.run.source_fingerprint)
  ];
  const results=await env.DB.batch(stmts);
  if(results.some(x=>Number(x?.meta?.changes)!==1))
    throw new HttpError(409,'O fechamento nao foi confirmado integralmente. Nao utilize a folha e solicite conferencia da competencia.','CLOSURE_CONFLICT');
  await audit(env,{companyId,userId:auth.user.id,action:'CLOSE',entity:'payroll_calc_runs',entityId:runId,
    after:{status:'APPROVED',competence_status:'LOCKED',employee_count:conf.employee_count,
      totals:conf.totals,ready_for_payment:false,ready_for_accounting:false},request});
  return payrollMonthlyConference36(env,companyId,runId);
}
async function payrollMonthlyReceipt36(env,companyId,runId,employeeId){
  const detail=await payrollMonthlyRunDetail35(env,companyId,runId);
  const envelope=detail.envelopes.find(x=>x.employee_id===employeeId);
  if(!envelope)throw new HttpError(404,'Funcionario nao consta deste processamento.','NOT_FOUND');
  const review=await payrollMonthlyReadReview36(env,companyId,runId);
  if(review){
    let snap=[];
    try{snap=JSON.parse(review.snapshot_json||'[]')}catch(_){snap=[]}
    const row=snap.find(x=>x.employee_id===employeeId);
    if(row){envelope.employee_name=row.employee_name;envelope.employee_code=row.employee_code;}
  }
  return {kind:'HOLERITE_MENSAL_ETAPA_36',run:detail.run,employee:envelope,
    document_status:detail.run.status==='APPROVED'?'FOLHA_FECHADA':'PRELIMINAR',
    totals:detail.totals,review:review?{reviewed_at:review.reviewed_at,closed_at:review.closed_at}:null,
    ready_for_payment:false,paid:false,ready_for_accounting:false,
    message:'Demonstrativo de folha, nao e comprovante de deposito ou pagamento.'};
}

// ===== SAGAS Folha: Etapa 01 da integração operacional (sem cálculo) =====
async function ensurePayrollOperationsSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_competences (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,competence TEXT NOT NULL
      CHECK (length(competence)=7 AND substr(competence,5,1)='-' AND substr(competence,6,2) BETWEEN '01' AND '12'),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','LOCKED')),
      created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,competence))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_competences_company ON payroll_competences(company_id,competence)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_movements (
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,
      competence_id TEXT NOT NULL REFERENCES payroll_competences(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
      event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,
      unit TEXT NOT NULL CHECK(unit IN ('VALOR','DIAS','HORAS','PERCENTUAL')),
      amount_cents INTEGER,quantity_milli INTEGER,request_key TEXT NOT NULL,
      created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((unit='VALOR' AND amount_cents IS NOT NULL AND quantity_milli IS NULL AND amount_cents>=0)
          OR (unit<>'VALOR' AND quantity_milli IS NOT NULL AND amount_cents IS NULL AND quantity_milli>=0)),
      UNIQUE(company_id,request_key))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_movements_company_competence ON payroll_movements(company_id,competence_id,employee_id)`)
  ]);
}
function payrollCompetence(value){
  const s=String(value||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)||Number(s.slice(0,4))<2000||Number(s.slice(0,4))>2100)
    throw new HttpError(400,'Competência inválida. Use AAAA-MM.','VALIDATION_ERROR');
  return s;
}
async function payrollCompetencesList(env,companyId){
  const r=await env.DB.prepare(`SELECT id,competence,status,created_at FROM payroll_competences
    WHERE company_id=? ORDER BY competence DESC`).bind(companyId).all();
  return r.results||[];
}
async function payrollCompetenceCreate(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const competence=payrollCompetence(body.competence),id=uuid();
  try{
    await env.DB.prepare(`INSERT INTO payroll_competences (id,company_id,competence,created_by)
      VALUES (?,?,?,?)`).bind(id,companyId,competence,auth.user.id).run();
  }catch(err){
    if(/UNIQUE constraint failed/i.test(String(err?.message||err)))
      throw new HttpError(409,'Esta competência já existe.','DUPLICATE');
    throw err;
  }
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_competences',entityId:id,after:{competence},request});
  return {id,competence,status:'OPEN'};
}
async function payrollReadOpenCompetence(env,companyId,id){
  const p=await env.DB.prepare(`SELECT id,competence,status FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,id).first();
  if(!p)throw new HttpError(404,'Competência não encontrada.','NOT_FOUND');
  if(p.status!=='OPEN')throw new HttpError(409,'Competência bloqueada para lançamentos.','PERIOD_LOCKED');
  return p;
}
async function payrollMovementsList(env,companyId,competenceId){
  if(!competenceId)throw new HttpError(400,'Selecione uma competência.','VALIDATION_ERROR');
  const period=await env.DB.prepare(`SELECT id,competence,status FROM payroll_competences WHERE id=? AND company_id=?`).bind(competenceId,companyId).first();
  if(!period)throw new HttpError(404,'Competência não encontrada.','NOT_FOUND');
  const r=await env.DB.prepare(`SELECT m.id,m.competence_id,m.employee_id,m.event_id,m.unit,m.amount_cents,m.quantity_milli,
      m.created_at,e.name AS employee_name,v.code AS event_code,v.name AS event_name,v.event_type
    FROM payroll_movements m
    JOIN payroll_employees e ON e.id=m.employee_id AND e.company_id=m.company_id
    JOIN payroll_events v ON v.id=m.event_id AND v.company_id=m.company_id
    WHERE m.company_id=? AND m.competence_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 1000`).bind(companyId,competenceId).all();
  return {competence:period,items:(r.results||[]).map(m=>({...m,
    value:m.unit==='VALOR'?centsToMoney(m.amount_cents):Number(m.quantity_milli)/1000}))};
}
// ===== Folha SAGAS — Etapa 02: prévia analítica somente de leitura =====
// NÃO calcula salário-base, INSS, IRRF, FGTS ou líquido. Não gera obrigação nem contabilização.
async function payrollMovementPreview(env,companyId,competenceId){
  if(!competenceId)throw new HttpError(400,'Selecione uma competência.','VALIDATION_ERROR');
  const period=await env.DB.prepare(`SELECT id,competence,status FROM payroll_competences
    WHERE company_id=? AND id=?`).bind(companyId,competenceId).first();
  if(!period)throw new HttpError(404,'Competência não encontrada na empresa.','NOT_FOUND');
  // Garante que a conferência não deixe movimentações de fora por um LIMIT implícito.
  const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM payroll_movements
    WHERE company_id=? AND competence_id=?`).bind(companyId,competenceId).first();
  if(Number(count?.total||0)>5000)
    throw new HttpError(409,'A competência possui mais de 5.000 lançamentos. Use uma consulta paginada antes de conferir.','PREVIEW_LIMIT');
  const result=await env.DB.prepare(`SELECT m.id,m.employee_id,m.event_id,m.unit,m.amount_cents,m.quantity_milli,
      e.name AS employee_name,e.salary_cents,e.admission_date,e.active AS employee_active,
      v.code AS event_code,v.name AS event_name,v.event_type
    FROM payroll_movements m
    JOIN payroll_employees e ON e.id=m.employee_id AND e.company_id=m.company_id
    JOIN payroll_events v ON v.id=m.event_id AND v.company_id=m.company_id
    WHERE m.company_id=? AND m.competence_id=?
    ORDER BY e.name COLLATE NOCASE,v.code,m.id`).bind(companyId,competenceId).all();
  const byEmployee=new Map();
  let unsettled=0;
  for(const row of result.results||[]){
    let item=byEmployee.get(row.employee_id);
    if(!item){
      item={employee_id:row.employee_id,employee_name:row.employee_name,
        salary_registered:centsToMoney(row.salary_cents),admission_date:row.admission_date,
        event_proventos_cents:0,event_descontos_cents:0,event_informativos_cents:0,
        pending_quantities:[],events:[],warnings:[]};
      byEmployee.set(row.employee_id,item);
      if(!row.employee_active)item.warnings.push('Cadastro de funcionário inativo: verificar vínculo na competência.');
      if(row.admission_date>period.competence+'-01')item.warnings.push('Admissão durante ou depois da competência: exigir apuração proporcional.');
    }
    const amount=row.unit==='VALOR'?Number(row.amount_cents):null;
    if(amount!==null && (!Number.isSafeInteger(amount)||amount<0))
      throw new HttpError(409,'Registro monetário inválido na competência.','DATA_INVALID');
    if(amount===null){
      unsettled++;
      item.pending_quantities.push({event_code:row.event_code,unit:row.unit,quantity:Number(row.quantity_milli)/1000});
    }else{
      if(row.event_type==='PROVENTO')item.event_proventos_cents+=amount;
      else if(row.event_type==='DESCONTO')item.event_descontos_cents+=amount;
      else if(row.event_type==='INFORMATIVO')item.event_informativos_cents+=amount;
      else throw new HttpError(409,'Tipo de evento inválido na base.','DATA_INVALID');
    }
    item.events.push({id:row.id,event_code:row.event_code,event_name:row.event_name,
      type:row.event_type,unit:row.unit,amount:amount===null?null:centsToMoney(amount),
      quantity:amount===null?Number(row.quantity_milli)/1000:null});
  }
  const items=[];
  for(const employee of byEmployee.values()){
    for(const key of ['event_proventos_cents','event_descontos_cents','event_informativos_cents'])
      if(!Number.isSafeInteger(employee[key]))throw new HttpError(409,'Total fora da faixa segura.','DATA_INVALID');
    employee.event_proventos=centsToMoney(employee.event_proventos_cents);
    employee.event_descontos=centsToMoney(employee.event_descontos_cents);
    employee.event_informativos=centsToMoney(employee.event_informativos_cents);
    delete employee.event_proventos_cents;delete employee.event_descontos_cents;delete employee.event_informativos_cents;
    if(employee.pending_quantities.length)employee.warnings.push('Eventos em horas/dias/percentual dependem de fórmulas e não estão valorizados.');
    employee.warnings.push('Salário-base exibido somente como referência, não somado aos eventos lançados.');
    employee.warnings.push('INSS, IRRF, FGTS, férias, 13º e incidências ainda não foram apurados.');
    items.push(employee);
  }
  return {competence:period,employees:items,movement_count:Number(count?.total||0),
    unresolved_quantity_count:unsettled,ready_for_payment:false,ready_for_accounting:false,
    payroll_net:null,kind:'EVENT_MOVEMENT_PREVIEW',
    message:'Prévia somente dos eventos lançados em valor. NÃO é folha calculada, envelope ou líquido a pagar.'};
}

// Etapa 03 — prévia somente de leitura para salário mensal integral.
// Não calcula remuneração proporcional, bases legais, INSS, IRRF, FGTS ou líquido.
async function payrollSalaryPreview(env,companyId,competenceId){
  const source=await payrollMovementPreview(env,companyId,competenceId);
  const period=source.competence;
  const [year,month]=period.competence.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const firstDate=period.competence+'-01';
  const lastDate=period.competence+'-'+String(lastDay).padStart(2,'0');
  const empQuery=await env.DB.prepare(`SELECT id,name,salary_cents,admission_date,active
    FROM payroll_employees WHERE company_id=? AND admission_date<=?
    ORDER BY name COLLATE NOCASE,id LIMIT 2001`).bind(companyId,lastDate).all();
  if((empQuery.results||[]).length>2000)throw new HttpError(409,'Prévia excede 2.000 funcionários. Consulte por lotes antes de calcular.','PREVIEW_LIMIT');
  const historical=await payrollEmployeeHistoricalContext(env,companyId,firstDate,lastDate);
  const movementsByEmployee=new Map(source.employees.map(e=>[e.employee_id,e]));
  const items=[];
  let fullMonthCount=0,unresolvedCount=0, salaryIncludedCents=0;
  for(const emp of empQuery.results||[]){
    // Funcionário hoje inativo entra em competência antiga somente com histórico funcional ATIVO.
    if(!emp.active && historical.functional.get(emp.id)?.[0]?.situation!=='ATIVO')continue;
    if(!Number.isSafeInteger(emp.salary_cents)||emp.salary_cents<0)
      throw new HttpError(409,'Salário cadastrado inválido.','DATA_INVALID');
    const mov=movementsByEmployee.get(emp.id);
    const events=mov?.events||[];
    const warnings=[];
    const flags=[];
    const midMonth=emp.admission_date>firstDate;
    const pending=(mov?.pending_quantities||[]).length;
    const duplicatedSalary=events.some(e=>e.type==='PROVENTO'&&e.unit==='VALOR'&&/^(sal[aá]rio(\s*-?\s*base|\s*mensal)?|vencimento\s*mensal)$/i.test(e.event_name.trim()));
    if(midMonth){flags.push('ADMISSAO_NO_MES');warnings.push('Admissão durante a competência: proporcionalidade ainda não implementada.');}
    if(pending){flags.push('FORMULA_PENDENTE');warnings.push('Eventos em horas, dias ou percentual ainda dependem de fórmulas.');}
    if(duplicatedSalary){flags.push('SALARIO_EVENTO_DUPLICADO');warnings.push('Há evento de salário e salário cadastrado: conferir duplicidade antes de somar.');}
    const proventos=mov?.event_proventos_cents!==undefined?mov.event_proventos_cents:Math.round((mov?.event_proventos||0)*100);
    const descontos=mov?.event_descontos_cents!==undefined?mov.event_descontos_cents:Math.round((mov?.event_descontos||0)*100);
    const valid=Number.isSafeInteger(proventos)&&Number.isSafeInteger(descontos)&&proventos>=0&&descontos>=0;
    if(!valid)throw new HttpError(409,'Valores lançados inválidos.','DATA_INVALID');
    const salaryRecord=historical.salary.get(emp.id)?.[0]||null;
    const scheduleRecord=historical.schedule.get(emp.id)?.[0]||null;
    const functionalRecord=historical.functional.get(emp.id)?.[0]||null;
    const dependents=historical.dependents.get(emp.id)||[];
    const occurrences=historical.occurrences.get(emp.id)||[];
    const changes=[...(historical.changesSalary.get(emp.id)||[]),
      ...(historical.changesSchedule.get(emp.id)||[]),...(historical.changesFunctional.get(emp.id)||[])];
    if(!salaryRecord){flags.push('HISTORICO_SALARIAL_PENDENTE');warnings.push('Informe o salário com vigência nesta competência. O salário atual não será usado retroativamente.');}
    if(changes.length){flags.push('MUDANCA_NA_COMPETENCIA');warnings.push('Há alteração salarial, de jornada ou funcional durante o mês; cálculo proporcional pendente.');}
    if(occurrences.length){flags.push('OCORRENCIA_NA_COMPETENCIA');warnings.push('Há faltas, férias, licença ou afastamento no mês; efeitos precisam de cálculo específico.');}
    if(functionalRecord&&functionalRecord.situation!=='ATIVO'){flags.push('SITUACAO_FUNCIONAL');warnings.push('Situação funcional diferente de ATIVO nesta competência.');}
    if(!scheduleRecord){flags.push('JORNADA_NAO_INFORMADA');warnings.push('Jornada histórica não informada; fórmulas dependentes da jornada ficarão pendentes.');}
    const eligibleDependents=dependents.filter(x=>Number(x.irrf_eligible)===1).length;
    if(eligibleDependents)warnings.push('Existem dependentes cadastrados; o abatimento no IRRF ainda não está implementado.');
    const salary=(!midMonth && salaryRecord && !changes.length && !occurrences.length &&
      (!functionalRecord||functionalRecord.situation==='ATIVO'))?salaryRecord.salary_cents:null;
    const subtotal=salary!==null&&!pending&&!duplicatedSalary?salary+proventos-descontos:null;
    if(subtotal!==null&&!Number.isSafeInteger(subtotal))throw new HttpError(409,'Subtotal fora da faixa segura.','DATA_INVALID');
    warnings.push('Confira ocorrências, admissões e situações funcionais antes de homologar a competência.');
    warnings.push('Não foram calculados INSS, IRRF, FGTS, incidências, reflexos nem líquido.');
    if(salary!==null){fullMonthCount++;salaryIncludedCents+=salary;}
    if(subtotal===null)unresolvedCount++;
    items.push({employee_id:emp.id,employee_name:emp.name,admission_date:emp.admission_date,
      salary_registered:centsToMoney(emp.salary_cents),salary_historical_effective_from:salaryRecord?.effective_from||null,
      salary_base_preview:salary===null?null:centsToMoney(salary),
      weekly_hours:scheduleRecord?Number(scheduleRecord.weekly_hours_milli)/1000:null,
      monthly_hours:scheduleRecord?Number(scheduleRecord.monthly_hours_milli)/1000:null,
      eligible_dependents:eligibleDependents,occurrences_count:occurrences.length,
      additional_proventos: centsToMoney(proventos),informed_discounts:centsToMoney(descontos),
      subtotal_informative:subtotal===null?null:centsToMoney(subtotal),
      pending_event_count:pending,flags,warnings,events});
  }
  const excluded=source.employees.filter(e=>!items.some(i=>i.employee_id===e.employee_id));
  const warnings=[];
  if(excluded.length)warnings.push('Existem lançamentos para funcionários não ativos nesta competência; confira os vínculos antes de calcular.');
  return {kind:'SALARY_PREVIEW',competence:period,items,
    active_employee_count:items.length,full_month_count:fullMonthCount,
    unresolved_employee_count:unresolvedCount,excluded_movement_employee_count:excluded.length,
    salary_full_month_reference_total:centsToMoney(salaryIncludedCents),warnings,
    ready_for_payment:false,ready_for_accounting:false,ready_for_closure:false,
    payroll_net:null,requires_homologation:true,
    message:'Prévia informativa do salário cadastrado e dos lançamentos em valor; não é folha calculada nem líquido a pagar.'};
}

async function payrollMovementCreate(env,request,auth,companyId,body){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const period=await payrollReadOpenCompetence(env,companyId,required(body.competence_id,'competência'));
  const employee=await payrollReference(env,companyId,'employees',required(body.employee_id,'funcionário'),'Funcionário');
  const event=await payrollReference(env,companyId,'events',required(body.event_id,'evento'),'Evento');
  if(['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL','FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO','LICENCA_REMUNERADA','LICENCA_NAO_REMUNERADA','DOENCA_EMPRESA_15'].includes(event.code))
    throw new HttpError(409,'Este evento é calculado automaticamente: não lance manualmente.','AUTO_EVENT_MOVEMENT_BLOCKED');
  const unit=event.reference_unit;
  const requestKey=String(required(body.request_key,'identificador da operação'));
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey))throw new HttpError(400,'Identificador da operação inválido.','VALIDATION_ERROR');
  let amountCents=null,quantityMilli=null;
  if(unit==='VALOR'){
    amountCents=moneyToCents(required(body.value,'valor'));
    if(amountCents<0||amountCents>99999999999)throw new HttpError(400,'Valor fora do limite.','VALIDATION_ERROR');
  }else{
    const value=Number(body.value);
    if(body.value===undefined||body.value===null||body.value===''||!Number.isFinite(value)||value<0||value>1000000||Math.abs(value*1000-Math.round(value*1000))>1e-6)
      throw new HttpError(400,'Quantidade inválida; use no máximo três casas decimais.','VALIDATION_ERROR');
    quantityMilli=Math.round(value*1000);
  }
  // A mesma chave de operação só pode representar o mesmo lançamento, inclusive em reconexão.
  const existing=await env.DB.prepare(`SELECT id,competence_id,employee_id,event_id,unit,amount_cents,quantity_milli
    FROM payroll_movements WHERE company_id=? AND request_key=?`).bind(companyId,requestKey).first();
  function same(m){return m&&m.competence_id===period.id&&m.employee_id===employee.id&&m.event_id===event.id&&m.unit===unit&&m.amount_cents===amountCents&&m.quantity_milli===quantityMilli;}
  if(existing){
    if(!same(existing))throw new HttpError(409,'Identificador já usado em outra operação.','IDEMPOTENCY_CONFLICT');
    return {id:existing.id,reused:true};
  }
  const id=uuid();
  try{
    await env.DB.prepare(`INSERT INTO payroll_movements
      (id,company_id,competence_id,employee_id,event_id,unit,amount_cents,quantity_milli,request_key,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,companyId,period.id,employee.id,event.id,unit,amountCents,quantityMilli,requestKey,auth.user.id).run();
  }catch(err){
    if(/UNIQUE constraint failed/i.test(String(err?.message||err))){
      const retried=await env.DB.prepare(`SELECT id,competence_id,employee_id,event_id,unit,amount_cents,quantity_milli
        FROM payroll_movements WHERE company_id=? AND request_key=?`).bind(companyId,requestKey).first();
      if(same(retried))return {id:retried.id,reused:true};
      throw new HttpError(409,'Operação duplicada.','IDEMPOTENCY_CONFLICT');
    }
    throw err;
  }
  await audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_movements',entityId:id,
    after:{competence:period.competence,employee_id:employee.id,event_id:event.id,unit,amount_cents:amountCents,quantity_milli:quantityMilli},request});
  return {id,reused:false};
}
async function payrollMovementDelete(env,request,auth,companyId,id){
  await requirePermission(env,auth.user.id,companyId,'payroll.manage');
  const m=await env.DB.prepare(`SELECT id,competence_id,employee_id,event_id,unit,amount_cents,quantity_milli
    FROM payroll_movements WHERE company_id=? AND id=?`).bind(companyId,id).first();
  if(!m)throw new HttpError(404,'Lançamento não encontrado.','NOT_FOUND');
  await payrollReadOpenCompetence(env,companyId,m.competence_id);
  await env.DB.prepare(`DELETE FROM payroll_movements WHERE id=? AND company_id=?`).bind(id,companyId).run();
  await audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'payroll_movements',entityId:id,before:m,request});
  return {deleted:true,id};
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

  // Cadastros da folha são migrados somente ao acessar uma rota da folha
  // ou quando o sistema consulta as permissões, não em todas as chamadas do Worker.
  if(path.startsWith('/api/payroll/') || path==='/api/auth/permissions' || path==='/api/permissions'){
    await ensureSchemaRevision(env,'payroll',1,()=>ensurePayrollSchema(env));
    await ensureSchemaRevision(env,'payroll-operations',1,()=>ensurePayrollOperationsSchema(env));
    if(path==='/api/payroll/event-rules')
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
  }

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
    await ensureSchemaRevision(env, 'purchasing', 1, async () => {
      await ensurePurchasingSchema(env);
      await ensurePurchaseIntegrationSchema(env);
      await ensureRmPurchasingSchema(env);
    });
  }

  if (path.startsWith("/api/financial-accounting-events") || path.startsWith("/api/financial-cash-accounts") || path.startsWith("/api/financial-payables") || path==="/api/auth/permissions") {
    await ensureSchemaRevision(env, 'financial', 1, async () => {
      await ensureFinancialAccountingEventSchema(env);
      await ensureFinancialCashAccountSchema(env);
    });
  }

  // Em bancos novos, o cadastro das permissões pode acontecer antes de existir
  // financial_payables. Confere as colunas da baixa depois da criação da tabela.
  if (path.startsWith("/api/financial-payables")) {
    await ensureSchemaRevision(env, 'financial_payment_columns', 1,
      () => ensureFinancialCashAccountSchema(env));
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


  if(path.startsWith('/api/purchase-invoices'))await ensurePurchaseInvoiceInstallmentsSchema(env);

  // ---- Lançamento direto de Nota Fiscal ----
  if(method==="GET"&&path==="/api/purchase-invoices"){
    await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");
    return ok({invoices:await listPurchaseInvoices(env,companyId)});
  }
  if(method==="POST"&&path==="/api/purchase-invoices"){
    return ok({invoice:await createPurchaseInvoice(env,request,auth,companyId,await readJson(request))},201);
  }
  p=routeMatch(path,"/api/purchase-invoices/:id");
  if(p&&method==="GET"){
    await requirePermission(env,auth.user.id,companyId,"purchasing.receipt.read");
    return ok({invoice:await getPurchaseInvoice(env,companyId,p.id)});
  }
  if(p&&method==='DELETE')return ok(await deletePurchaseInvoice(env,request,auth,companyId,p.id));

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

  if(method==="GET"&&path==="/api/financial-payables"){await requirePermission(env,auth.user.id,companyId,"financial.payable.read");const allPermissions=await getEffectivePermissions(env,auth.user.id,companyId);return ok({payables:await listFinancialPayables(env,companyId,allPermissions.includes("payroll.read"))});}
  p=routeMatch(path,"/api/financial-payables/:id/pay"); if(p&&method==="POST")return ok({payable:await payFinancialPayable(env,request,auth,companyId,p.id,await readJson(request))});
  p=routeMatch(path,"/api/financial-payables/:id/unpay"); if(p&&method==="POST")return ok({payable:await undoFinancialPayablePayment(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/financial-payables/:id/cancel"); if(p&&method==="POST")return ok({payable:await cancelFinancialPayable(env,request,auth,companyId,p.id)});
  p=routeMatch(path,"/api/financial-payables/:id"); if(p&&method==="GET"){await requirePermission(env,auth.user.id,companyId,"financial.payable.read");const payable=await getFinancialPayable(env,companyId,p.id);if(["PAYROLL_MONTHLY","PAYROLL_THIRTEENTH","PAYROLL_TERMINATION","PAYROLL_TERMINATION_FGTS"].includes(payable.source_type))await requirePermission(env,auth.user.id,companyId,"payroll.read");return ok({payable});}

  // Etapa 58 (v96): envelope próprio VACATION, vinculado ao recibo conciliado.
  if(path==='/api/payroll/vacation-envelope'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-absence48',1,()=>payrollAbsenceSchema48(env));
    await ensureSchemaRevision(env,'payroll-salary-change47',1,()=>payrollSalarySchema47(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    await ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-vacation-envelope58',1,()=>payrollVacationSchema58(env));
    await payrollFinance39('catalog',{env,companyId,auth,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacationEnvelope58(method==='GET'?'read':String(body.action||''),{
      env,companyId,auth,request,body,occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,hash:payrollProcessingSnapshotHash28,
        validateCenter:validateCostCenterForEntry}
    }));
  }

  // v97-99: conferencia de envelope VACATION, simulacao e memoria de eventos.
  // NAO alteram o calculo MONTHLY nem autorizam financeira ou contabilizacao.
  if(['/api/payroll/vacation-review','/api/payroll/vacation-monthly-bridge',
      '/api/payroll/vacation-monthly-stage'].includes(path)&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    await ensureSchemaRevision(env,'payroll-salary-change47',1,()=>payrollSalarySchema47(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-absence48',1,()=>payrollAbsenceSchema48(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    await ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-vacation-envelope58',1,()=>payrollVacationSchema58(env));
    await payrollFinance39('catalog',{env,companyId,auth,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const body=method==='POST'?await readJson(request):{};
    const monthlyIrrf=(gross,inssBalance,dependents,paymentDate)=>{
      const t=histTable(HIST_IRRF,paymentDate.slice(0,7));
      const legal=inssBalance+dependents*18959;
      const deduction=Math.max(legal,t[2]);
      const taxable=Math.max(0,gross-deduction);
      const band=t[1].find(x=>taxable<=x[0]);
      const before=Math.max(0,payrollTaxRound(taxable*band[1],10000)-band[2]);
      let reduction=0;
      if(t[3]){
        if(gross<=500000)reduction=Math.min(before,31289);
        else if(gross<=735000)reduction=Math.min(before,Math.max(0,97862-payrollTaxRound(gross*133145,1000000)));
      }
      return {irrf_cents:Math.max(0,before-reduction),base_cents:taxable,deduction_cents:deduction};
    };
    const ctx={env,companyId,auth,request,body,
      occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        hash:payrollProcessingSnapshotHash28,validateCenter:validateCostCenterForEntry,
        taxes:payrollTaxHistoricalWithDependents,monthlyIrrf}};
    if(path==='/api/payroll/vacation-review')
      return ok(await payrollVacationReview59(method==='GET'?'read':String(body.action||'approve'),ctx));
    if(path==='/api/payroll/vacation-monthly-bridge')
      return ok(await payrollVacationBridge60(method==='GET'?'prepare':'simulate',ctx));
    return ok(await payrollVacationStage61(method==='GET'?'read':String(body.action||'record'),ctx));
  }
  // Etapa 56 (v94): simulação determinística do envelope com férias, sem gravação.
  if(path==='/api/payroll/vacation-monthly-preview'&&(method==='GET'||method==='POST')){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-salary-change47',1,()=>payrollSalarySchema47(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-absence48',1,()=>payrollAbsenceSchema48(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    await ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
    await payrollFinance39('catalog',{env,companyId,auth,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const body=method==='POST'?await readJson(request):{};
    const monthlyIrrf=(gross,inssBalance,dependents,paymentDate)=>{
      const t=histTable(HIST_IRRF,paymentDate.slice(0,7));
      const legal=inssBalance+dependents*18959;
      const deduction=Math.max(legal,t[2]);
      const taxable=Math.max(0,gross-deduction);
      const band=t[1].find(x=>taxable<=x[0]);
      const before=Math.max(0,payrollTaxRound(taxable*band[1],10000)-band[2]);
      let reduction=0;
      if(t[3]){
        if(gross<=500000)reduction=Math.min(before,31289);
        else if(gross<=735000)reduction=Math.min(before,Math.max(0,97862-payrollTaxRound(gross*133145,1000000)));
      }
      return {irrf_cents:Math.max(0,before-reduction),base_cents:taxable,deduction_cents:deduction};
    };
    return ok(await payrollVacation56(method==='GET'?'prepare':'simulate',{
      env,companyId,auth,request,body,occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        hash:payrollProcessingSnapshotHash28,taxes:payrollTaxHistoricalWithDependents,monthlyIrrf}
    }));
  }
  // Etapa 55 (v93): conciliação formal do recibo com rubricas por competência.
  if(path==='/api/payroll/vacation-reconciliation'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    await ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-vacation-envelope58',1,()=>payrollVacationSchema58(env));
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacation55(method==='GET'?'read':String(body.action||''),{
      env,companyId,auth,request,body,occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,hash:payrollProcessingSnapshotHash28}
    }));
  }
  // Etapa 54 (v92): preparação auditável e adiantamento documental, sem integração real.
  if(path==='/api/payroll/vacation-processing'&&(method==='GET'||method==='POST')){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    await ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-vacation-envelope58',1,()=>payrollVacationSchema58(env));
    await payrollFinance39('catalog',{env,companyId,auth,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacation54(method==='GET'?'read':String(body.action||''),{
      env,companyId,auth,request,body,
      occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,hash:payrollProcessingSnapshotHash28}
    }));
  }
  // Etapa 53 (v91): conciliação de férias com envelopes sem lançamento.
  if(path==='/api/payroll/vacation-integration'&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-envelope-cost-center39',1,()=>ensurePayrollEnvelopeCostCenter39(env));
    return ok(await payrollVacationIntegration53({
      env,companyId,auth,request,occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,payrollFinance39}
    }));
  }
  // Etapa 52 (v90): tributos de férias — simulação exclusiva de conferência.
  if(path==='/api/payroll/vacation-tax'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacation90(method==='GET'?'prepare':'simulate',{
      env,companyId,auth,request,occurrenceId:url.searchParams.get('occurrence_id'),body,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // Etapa 51 (v89): médias, abono pecuniário e espelho bruto, sem financeiro.
  if(path==='/api/payroll/vacation-calculation'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacation89(method==='GET'?'read':String(body.action||''),{
      env,companyId,auth,request,occurrenceId:url.searchParams.get('occurrence_id'),body,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // Etapa 50 (v88): controle de períodos aquisitivos e saldos de férias.
  if(path==='/api/payroll/vacations'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
    await ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
    await ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacation50(method==='GET'?'read':String(body.action||''),{
      env,companyId,auth,request,employeeId:url.searchParams.get('employee_id'),
      occurrenceId:url.searchParams.get('occurrence_id'),body,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // Etapa 49: cadastro de tratamento de licenças, doença e afastamentos.
  if(path==='/api/payroll/leaves'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    return ok(await payrollLeave49(method==='GET'?(url.searchParams.get('view')==='vacation'?'vacation_preview':'list'):'classify',{
      env,companyId,auth,request,competence:url.searchParams.get('competence'),occurrenceId:url.searchParams.get('id'),
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // Etapa 48: conferência de falta, atraso e DSR com comprovação.
  if(path==='/api/payroll/absences'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    return ok(await payrollAbsence48(method==='GET'?'list':
      String(url.searchParams.get('action')||'add')==='classify'?'classify':'add',{
      env,companyId,auth,request,competence:url.searchParams.get('competence'),
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  p=routeMatch(path,'/api/payroll/absences/:id');
  if(p&&method==='DELETE')return ok(await payrollAbsence48('delete',{
    env,companyId,auth,request,id:p.id,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
  }));
  // Etapa 47: reajustes no mês — padrão RM ou fórmula proporcional explícita.
  if(path==='/api/payroll/salary-change-settings'&&(method==='GET'||method==='POST')){
    return ok(await payrollSalarySettings47(method==='GET'?'read':'save',{
      env,companyId,auth,request,competence:url.searchParams.get('competence'),
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // Etapa 46: divisor do salário proporcional na admissão (mensalista).
  if(path==='/api/payroll/monthly-proration'&&(method==='GET'||method==='POST')){
    return ok(await payrollAdmission46(method==='GET'?'read':'save',{
      env,companyId,auth,request,
      competence:url.searchParams.get('competence'),
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // v124: diagnostico D1 100% READ ONLY, sem inicializar tabelas nem alterar dados.
  if(path==='/api/payroll/audit/live124'&&method==='GET'){
    return ok(await payrollLiveAudit124({
      env,companyId,auth,d:{requirePermission,HttpError}
    }));
  }
  // v123: dispensa sem justa causa e multa FGTS Digital comprovada.
  // Libera apenas após TRCT homologado, guia/base conferida, naturezas
  // por centro de custo e vinculação documental das provisões.
  if(path==='/api/payroll/termination/dismissal123'&&(method==='GET'||method==='POST')||
     path==='/api/payroll/termination/dismissal123/settings'&&(method==='GET'||method==='POST')||
     path==='/api/payroll/termination/dismissal123/history'&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await ensureSchemaRevision(env,'financial',1,async()=>{
      await ensureFinancialAccountingEventSchema(env);await ensureFinancialCashAccountSchema(env);
    });
    await payrollFinance39('settings',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollProvisionAccounting45('use-settings',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d\d-\d\d-\d\d$/.test(String(input.termination_date||''))?
      input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    await payrollThirteenth71('history',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const action=path.endsWith('/settings')?method==='GET'?'settings':'save-setting':
      path.endsWith('/history')?'history':String(input.action||'preview');
    return ok(await payrollTermination123(action,{
      env,companyId,auth,request,body:input,
      employeeId:url.searchParams.get('employee_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        hash:payrollProcessingSnapshotHash28,
        centsToMoney,nextPayableNumber,buildEntry:buildInternalPostedEntry}
    }));
  }
  // v122: encerramento excepcional do pedido de demissão conferido por TRCT.
  // Grava baixa, diários POSTED, título residual e situação DESLIGADO
  // na mesma transação; sem guia, pagamento bancário ou eSocial.
  if(path==='/api/payroll/termination/closing122'&&method==='POST'||
     path==='/api/payroll/termination/closing122/history'&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await ensureSchemaRevision(env,'financial',1,async()=>{
      await ensureFinancialAccountingEventSchema(env);await ensureFinancialCashAccountSchema(env);
    });
    await payrollFinance39('settings',{
      env,companyId,auth,request,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollProvisionAccounting45('use-settings',{
      env,companyId,auth,request,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.termination_date||''))?
      input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    await payrollThirteenth71('history',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const action=method==='GET'?'history':String(input.action||'preview');
    return ok(await payrollTermination122(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),body:input,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28,centsToMoney,nextPayableNumber,
       buildEntry:buildInternalPostedEntry}
    }));
  }
  // v119: plano contábil e financeiro de rescisão: somente minutas, nunca baixa definitiva.
  const planned119=routeMatch(path,'/api/payroll/termination/integration-plans/:id');
  if(path==='/api/payroll/termination/integration-plan'&&method==='POST'||
     path==='/api/payroll/termination/plan/natures'&&(method==='GET'||method==='POST')||
     path==='/api/payroll/termination/integration-plans'&&(method==='GET'||method==='POST')||
     planned119&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.termination_date||''))?
      input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{env,companyId,auth,request,year,
       d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    await payrollThirteenth71('history',{env,companyId,auth,request,year,
       d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const action=planned119?'detail':path.endsWith('/plan/natures')?
      method==='GET'?'settings':'save-nature':
      path.endsWith('/integration-plan')?'preview':
      method==='GET'?'history':'record';
    return ok(await payrollTermination119(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),runId:planned119?.id,body:input,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v118: diagnóstico rescisório com saldos operacionais e mapeamentos, sempre DRAFT.
  const preclose118=routeMatch(path,'/api/payroll/termination/preclose-diagnostics/:id');
  if(path==='/api/payroll/termination/preclose'&&method==='POST'||
     path==='/api/payroll/termination/preclose-diagnostics'&&(method==='GET'||method==='POST')||
     preclose118&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.termination_date||''))?
      input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    await payrollThirteenth71('history',{env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}});
    const action=preclose118?'detail':method==='GET'?'history':
      path.endsWith('/preclose')?'preview':'record';
    return ok(await payrollTermination118(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),
      runId:preclose118?.id,body:input,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v117: cálculo orientativo de INSS/IRRF 2026 e comparação documental, sem fechamento.
  const taxWorkpaper117=routeMatch(path,'/api/payroll/termination/tax-workpapers/:id');
  if(path==='/api/payroll/termination/tax-review'&&method==='POST'||
     path==='/api/payroll/termination/tax-context'&&method==='POST'||
     path==='/api/payroll/termination/tax-workpapers'&&(method==='GET'||method==='POST')||
     taxWorkpaper117&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.termination_date||''))?
       input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{
      env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollThirteenth71('history',{
      env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const action=taxWorkpaper117?'detail':method==='GET'?'history':
      path.endsWith('/tax-review')?'preview':
      path.endsWith('/tax-context')?'save':'record';
    return ok(await payrollTermination117(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),
      runId:taxWorkpaper117?.id,body:input,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v116: descontos documentados e líquido de referência; SEM aprovar, pagar ou contabilizar.
  const netWorkpaper116=routeMatch(path,'/api/payroll/termination/net-workpapers/:id');
  if(path==='/api/payroll/termination/net-reconciliation'&&method==='POST'||
     path==='/api/payroll/termination/deductions'&&method==='POST'||
     path==='/api/payroll/termination/net-workpapers'&&(method==='GET'||method==='POST')||
     netWorkpaper116&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    const input=method==='POST'?await readJson(request):{};
    const year=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.termination_date||''))?
       input.termination_date.slice(0,4):String(new Date().getUTCFullYear());
    await payrollThirteenth70('advances',{
      env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollThirteenth71('history',{
      env,companyId,auth,request,year,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const action=netWorkpaper116?'detail':method==='GET'?'history':
      path.endsWith('/net-reconciliation')?'preview':
      path.endsWith('/deductions')?'save':'record';
    return ok(await payrollTermination116(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),
      runId:netWorkpaper116?.id,body:input,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v115: conciliação documental rescisória sem aprovação, pagamentos ou diário.
  const workpaper115=routeMatch(path,'/api/payroll/termination/workpapers/:id');
  if(path==='/api/payroll/termination/reconciliation'&&method==='POST'||
     path==='/api/payroll/termination/evidence'&&method==='POST'||
     path==='/api/payroll/termination/workpapers'&&(method==='GET'||method==='POST')||
     workpaper115&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await payrollThirteenth70('advances',{
      env,companyId,auth,request,year:'2026',
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollThirteenth71('history',{
      env,companyId,auth,request,year:'2026',
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const action=workpaper115?'detail':method==='GET'?'history':
      path.endsWith('/reconciliation')?'preview':
      path.endsWith('/evidence')?'save':'record';
    return ok(await payrollTermination115(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),
      runId:workpaper115?.id,
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v114: prévia de rescisão e registro DRAFT, sem alteração funcional/financeira.
  const terminationDetail=routeMatch(path,'/api/payroll/termination/drafts/:id');
  if(path==='/api/payroll/termination/preview'&&method==='POST'||
     path==='/api/payroll/termination/drafts'&&(method==='GET'||method==='POST')||
     terminationDetail&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await payrollThirteenth70('advances',{
      env,companyId,auth,request,year:'2026',
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollThirteenth71('history',{
      env,companyId,auth,request,year:'2026',
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const action=terminationDetail?'detail':method==='GET'?'history':
      path.endsWith('/preview')?'preview':'calculate';
    return ok(await payrollTermination114(action,{
      env,companyId,auth,request,
      employeeId:url.searchParams.get('employee_id'),
      runId:terminationDetail?.id,
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // v113: auditoria de leitura do 13º no D1: sem migração, postagem ou baixa.
  if(path==='/api/payroll/thirteenth/audit'&&method==='GET'){
    return ok(await payrollThirteenthAudit113({
      env,companyId,auth,request,year:url.searchParams.get('year'),
      d:{HttpError,requirePermission}
    }));
  }
  // v112: liquidação da 2ª parcela do 13º com provisão, retenções, FGTS e títulos.
  if((path==='/api/payroll/thirteenth/settlement'||
      path==='/api/payroll/thirteenth/settlement/settings')&&
     (method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    // Naturezas, plano de contas e financeiro precisam existir antes das
    // consultas de mapeamento 45/39, inclusive na primeira utilização.
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payrollProvisionAccounting45('use-settings',{
      env,companyId,auth,request,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await payrollFinance39('settings',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    const settings=path.endsWith('/settings');
    const action=settings?(method==='GET'?'settings':'save'):(method==='GET'?'preview':'integrate');
    const payload=method==='POST'?await readJson(request):{};
    return ok(await payrollThirteenth112(action,{
      env,companyId,auth,request,runId:payload.run_id||url.searchParams.get('run_id'),
      body:payload,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28,centsToMoney,nextPayableNumber,
       buildEntry:buildInternalPostedEntry,taxes:payrollTaxHistoricalWithDependents}
    }));
  }
  // v111: adiantamento do 13o em diário e títulos a pagar; segunda parcela continua bloqueada aqui.
  if(path==='/api/payroll/thirteenth/integration'&&
     (method==='GET'||method==='POST')||
     path==='/api/payroll/thirteenth/integration/settings'&&
     (method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    await payrollFinance39('settings',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    if(method==='POST'&&path.endsWith('/integration')){
      await ensureSchemaRevision(env,'purchasing',1,async()=>{
        await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
      });
    }
    const settings=path.endsWith('/settings');
    const action=settings?(method==='GET'?'settings':'save'):(method==='GET'?'preview':'integrate');
    const payload=method==='POST'?await readJson(request):{};
    return ok(await payrollThirteenth111(action,{
      env,companyId,auth,request,
      runId:payload.run_id||url.searchParams.get('run_id'),
      body:payload,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28,centsToMoney,nextPayableNumber,
       buildEntry:buildInternalPostedEntry,
       taxes:payrollTaxHistoricalWithDependents}
    }));
  }
  // v110: calculos versionados do 13o; aprovacao nao gera pagamento ou contabilizacao.
  const thirteenthRun=routeMatch(path,'/api/payroll/thirteenth/runs/:id');
  if(path==='/api/payroll/thirteenth/runs'&&method==='GET'||
     path==='/api/payroll/thirteenth/runs/calculate'&&method==='POST'||
     path==='/api/payroll/thirteenth/runs/approve'&&method==='POST'||
     thirteenthRun&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    const action=thirteenthRun?'detail':path.endsWith('/calculate')?'calculate':
      path.endsWith('/approve')?'approve':'history';
    return ok(await payrollThirteenth71(action,{
      env,companyId,auth,request,
      runId:thirteenthRun?.id,
      year:url.searchParams.get('year'),phase:url.searchParams.get('phase'),
      body:method==='POST'?await readJson(request):{},
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28,taxes:payrollTaxHistoricalWithDependents}
    }));
  }
  // v109: apuracao separada do 13o, com registro documental de adiantamento externo.
  if(path==='/api/payroll/thirteenth/preview'&&method==='GET'||
     path==='/api/payroll/thirteenth/advances'&&(method==='GET'||method==='POST')||
     path==='/api/payroll/thirteenth/advances/void'&&method==='POST'){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    const action=path.endsWith('/preview')?'preview':path.endsWith('/void')?'void':method==='POST'?'declare':'advances';
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollThirteenth70(action,{
      env,companyId,auth,request,body,
      year:url.searchParams.get('year'),phase:url.searchParams.get('phase'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       hash:payrollProcessingSnapshotHash28,taxes:payrollTaxHistoricalWithDependents}
    }));
  }
  // v106: roteiro completo de fechamento de folha em uma consulta.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/closing-audit');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payroll37Call('settings');
    return ok(await payrollMonthlyEndToEnd69({
      env,companyId,auth,runId:p.id,
      d:{
        HttpError,requirePermission,
        detail:id=>payrollMonthlyRunDetail35(env,companyId,id),
        conference:id=>payrollMonthlyConference36(env,companyId,id),
        finance:id=>payroll37Call('preview',id),
        employer:id=>payrollEmployer40('preview',{
          env,companyId,auth,request,runId:id,
          d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
            payrollMonthlyRunDetail35,payrollMonthlyConference36,payrollMonthlySource35}
        }),
        provision:id=>payrollProvisions42({
          env,companyId,auth,request,runId:id,
          d:{HttpError,requirePermission,payrollMonthlyRunDetail35,payrollMonthlyConference36,
            hash:payrollProcessingSnapshotHash28,
            readEmployerSettings:competence=>payrollEmployer40('read',{
              env,companyId,auth,request,competence,
              d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
            })}
        }),
        provisionPosting:(competence,kind)=>payrollProvisionAccounting45('preview',{
          env,companyId,auth,request,competence,kind,
          d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
            hash:payrollProcessingSnapshotHash28,
            preview44:competence=>payrollProvisionAccounting44('preview',{
              env,companyId,auth,request,competence,
              d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
            })}
        })
      }
    }));
  }
  // Etapa 45: contabilização explícita da constituição ou baixas; idempotência por movimento.
  if(path==='/api/payroll/provisions/accounting/use-settings'||
     path==='/api/payroll/provisions/accounting/posting-preview'||
     path==='/api/payroll/provisions/accounting/post'){
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    const isUse=path.endsWith('/use-settings');
    const isPreview=path.endsWith('/posting-preview');
    const isPost=path.endsWith('/post');
    const action=isUse?(method==='POST'?'save-use':'use-settings'):isPreview?'preview':'post';
    if((isUse&&(method==='GET'||method==='POST'))||(isPreview&&method==='GET')||(isPost&&method==='POST')){
      const body=method==='POST'?await readJson(request):{};
      const d={HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        hash:payrollProcessingSnapshotHash28,centsToMoney,buildEntry:buildInternalPostedEntry,
        preview44:competence=>payrollProvisionAccounting44('preview',{
          env,companyId,auth,request,competence,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
        })};
      return ok(await payrollProvisionAccounting45(action,{env,companyId,auth,request,
        body,kind:method==='POST'?body.kind:url.searchParams.get('kind'),
        competence:method==='POST'?body.competence:url.searchParams.get('competence'),d}));
    }
  }
  // Etapa 44: naturezas por componente e conferencia contabil read-only.
  if(path==='/api/payroll/provisions/accounting/settings'||
     path==='/api/payroll/provisions/accounting/preview'){
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    const settings=path.endsWith('/settings');
    if((settings&&(method==='GET'||method==='POST'))||(!settings&&method==='GET'))
      return ok(await payrollProvisionAccounting44(settings?(method==='POST'?'save':'settings'):'preview',{
        env,companyId,auth,request,
        competence:url.searchParams.get('competence'),
        body:settings&&method==='POST'?await readJson(request):{},
        d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
      }));
  }
  // Etapa 43 - somente livro operacional de provisoes (sem diario/titulo).
  if(path==='/api/payroll/provisions/ledger'&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-employee-numbers',1,()=>ensurePayrollEmployeeNumbersSchema(env));
    return ok(await payrollProvisions43('ledger',{
      env,companyId,auth,request,competence:url.searchParams.get('competence'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  if(path==='/api/payroll/provisions/movements'&&method==='POST'){
    await ensureSchemaRevision(env,'payroll-employee-cost-center39',1,()=>ensurePayrollCostCenter39(env));
    return ok(await payrollProvisions43('movement',{
      env,companyId,auth,request,body:await readJson(request),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/provisions-confirm');
  if(p&&method==='POST'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    return ok(await payrollProvisions43('accrue',{
      env,companyId,auth,request,runId:p.id,body:await readJson(request),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        detail35:run=>payrollMonthlyRunDetail35(env,companyId,run),
        preview42:run=>payrollProvisions42({
          env,companyId,auth,request,runId:run,
          d:{HttpError,requirePermission,payrollMonthlyRunDetail35,payrollMonthlyConference36,
            hash:payrollProcessingSnapshotHash28,
            readEmployerSettings:competence=>payrollEmployer40('read',{
              env,companyId,auth,request,competence,
              d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
            })}
        })
      }
    }));
  }
  // Etapa 42 - provisões da competência fechada: SOMENTE prévia (não contabiliza).
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/provisions-preview');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    const d={HttpError,requirePermission,payrollMonthlyRunDetail35,payrollMonthlyConference36,
      hash:payrollProcessingSnapshotHash28,
      readEmployerSettings:competence=>payrollEmployer40('read',{
        env,companyId,auth,request,competence,
        d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
      })};
    return ok(await payrollProvisions42({env,companyId,auth,request,runId:p.id,d}));
  }
  // v120: contabilização patrimonial e títulos dos encargos patronais documentados.
  const patronal120=routeMatch(path,'/api/payroll/monthly-runs/:id/employer-accounting');
  if(path==='/api/payroll/employer/accounting/settings'&&(method==='GET'||method==='POST')||
     path==='/api/payroll/employer/accounting/history'&&method==='GET'||
     patronal120&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await ensureSchemaRevision(env,'financial',1,async()=>{
      await ensureFinancialAccountingEventSchema(env);await ensureFinancialCashAccountSchema(env);
    });
    // As configurações das naturezas e do lote são as mesmas da folha mensal.
    await payrollFinance39('settings',{env,companyId,auth,request,
      d:{HttpError,requirePermission,audit,ensureSchemaRevision,
       payrollMonthlyRunDetail35,payrollMonthlyConference36,buildInternalPostedEntry,centsToMoney,nextPayableNumber,uuid}
    });
    const body=method==='POST'?await readJson(request):{};
    const action=patronal120?method==='GET'?'preview':'integrate':
      path.endsWith('/history')?'history':method==='GET'?'settings':'save';
    return ok(await payrollEmployer120(action,{env,companyId,auth,request,body,runId:patronal120?.id,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
       payrollMonthlyRunDetail35,payrollMonthlyConference36,
       buildInternalPostedEntry,centsToMoney,nextPayableNumber,
       hash:payrollProcessingSnapshotHash28}
    }));
  }
  // Etapas 40/41 - parametros patronais por empresa e previa somente de consulta.
  if(path==='/api/payroll/employer/settings'){
    if(method==='GET'||method==='POST')return ok(await payrollEmployer40(method==='GET'?'read':'save',{
      env,companyId,auth,request,
      body:method==='POST'?await readJson(request):{},
      competence:url.searchParams.get('competence'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/employer-preview');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    return ok(await payrollEmployer40('preview',{
      env,companyId,auth,request,runId:p.id,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        payrollMonthlyRunDetail35,payrollMonthlyConference36,payrollMonthlySource35}
    }));
  }
  // Etapa 37: integracao somente por confirmacao explicita de folha mensal FECHADA.
  if(method==='GET'&&path==='/api/payroll/accounting-natures'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    return ok({natures:await listBudgetNatures(env,companyId)});
  }
  if(method==='GET'&&path==='/api/payroll/employee-cost-centers'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    const rows=await env.DB.prepare("SELECT id,code,name,active FROM cost_centers WHERE company_id=? ORDER BY code").bind(companyId).all();
    return ok({cost_centers:rows.results||[]});
  }
  const payroll37Deps={HttpError,requirePermission,audit,ensureSchemaRevision,
    payrollMonthlyRunDetail35,payrollMonthlyConference36,
    buildInternalPostedEntry,centsToMoney,nextPayableNumber,uuid};
  const payroll37Call=async(action,runId,body,eventId)=>{
    // v100: integracao de ferias na FOLHA nao homologa novos pagamentos,
    // financeiro ou contabilizacao. A liberacao dessas partidas exige a etapa propria.
    if(runId&&['preview','integrate'].includes(action)){
      const use=await env.DB.prepare("SELECT source_fingerprint FROM payroll_calc_runs WHERE company_id=? AND id=? LIMIT 1").bind(companyId,runId).first();
      if(String(use?.source_fingerprint||'').startsWith('VACATION100:'))
        throw new HttpError(409,'Esta folha contém férias conciliadas; financeiro e contabilidade exigem homologação própria.','VACATION_FINANCE_NOT_READY');
    }
    return payrollFinance39(action,{
      env,companyId,auth,request,runId,body,eventId,d:payroll37Deps
    });
  };
  p=routeMatch(path,'/api/payroll/events/:id/accounting');
  if(p){
    // A natureza usa o cadastro de Compras. Garantir que ele exista mesmo
    // se esta empresa nunca acessou a tela de Naturezas antes.
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    if(method==='GET')return ok(await payroll37Call('event-settings',null,null,p.id));
    if(method==='POST')return ok(await payroll37Call('save-event',null,await readJson(request),p.id));
  }
  if(path==='/api/payroll/monthly-finance/settings'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    if(method==='GET')return ok(await payroll37Call('settings'));
    if(method==='POST')return ok(await payroll37Call('save',null,await readJson(request)));
  }
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/finance-preview');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    return ok(await payroll37Call('preview',p.id));
  }
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/integrate-finance');
  if(p&&method==='POST'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await ensureSchemaRevision(env,'financial',1,async()=>{
      await ensureFinancialAccountingEventSchema(env);await ensureFinancialCashAccountSchema(env);
    });
    await ensureSchemaRevision(env,'financial_payment_columns',1,()=>ensureFinancialCashAccountSchema(env));
    return ok(await payroll37Call('integrate',p.id,await readJson(request)));
  }

  // Etapa 34: preparar cadastros, eventos e tabelas para futuro calculo real.
  // A consulta instala somente tabelas novas vazias; nao gera folha nem lancamentos.
  if(method==='GET'&&path==='/api/payroll/monthly-preparation'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    return ok(await payrollMonthlyPreparation34(env,companyId,
      url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // v101: conferir a integração das férias no fechamento e a parametrização
  // por natureza orçamentária/centro de custo, sem gerar partidas ou pagamentos.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-closure-review');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payroll37Call('settings');
    return ok(await payrollVacationClosure63({
      env,companyId,auth,request,runId:p.id,
      d:{HttpError,requirePermission,
        monthlyRunDetail:payrollMonthlyRunDetail35,
        monthlyConference:payrollMonthlyConference36,
        employerPreview:runId=>payrollEmployer40('preview',{
          env,companyId,auth,request,runId,
          d:{HttpError,requirePermission,ensureSchemaRevision,
            payrollMonthlyRunDetail35,payrollMonthlyConference36}
        })}
    }));
  }
  // v102: concilia pagamento externo, folha mensal, provisões e
  // naturezas por centro de custo, apenas consulta documental (GET).
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-accounting-preview');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payroll37Call('settings');
    return ok(await payrollVacationAccounting64({
      env,companyId,auth,request,runId:p.id,
      d:{HttpError,requirePermission,
        monthlyRunDetail:payrollMonthlyRunDetail35,
        monthlyConference:payrollMonthlyConference36,
        employerPreview:runId=>payrollEmployer40('preview',{
          env,companyId,auth,request,runId,
          d:{HttpError,requirePermission,ensureSchemaRevision,
            payrollMonthlyRunDetail35,payrollMonthlyConference36}
        })}
    }));
  }
  // v104: vincular adiantamento de férias apenas a título já pago e
  // lançamento de baixa validado. Nenhum novo desembolso nesta rota.
  if(path==='/api/payroll/vacation-advance-finance-link'&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-vacation-reconciliation55',1,()=>payrollVacationSchema55(env));
    await ensureSchemaRevision(env,'payroll-vacation-advance-link66',1,()=>payrollVacationAdvanceSchema66(env));
    await ensureSchemaRevision(env,'financial_payment_columns',1,()=>ensureFinancialCashAccountSchema(env));
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacationAdvance66(method==='GET'?'read':String(body.action||'link'),{
      env,companyId,auth,request,body,
      occurrenceId:url.searchParams.get('occurrence_id'),
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    }));
  }
  // v105: conciliação da baixa de provisão com o diário real e com a
  // ocorrência específica de férias. Não efetua lançamento contábil.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-provision-reconciliation');
  const useLinkRoute=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-provision-use-links');
  if((p&&method==='GET')||(useLinkRoute&&(method==='GET'||method==='POST'))){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payroll37Call('settings');
    await payrollProvisionAccounting45('use-settings',{
      env,companyId,auth,request,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await ensureSchemaRevision(env,'payroll-vacation-use-link68',1,()=>payrollVacationUseLinkSchema68(env));
    if(useLinkRoute){
      const body=method==='POST'?await readJson(request):{};
      return ok(await payrollVacationUseLink68(method==='GET'?'read':String(body.action||'link'),{
        env,companyId,auth,request,runId:useLinkRoute.id,body,
        occurrenceId:url.searchParams.get('occurrence_id'),
        component:url.searchParams.get('component'),
        d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
      }));
    }
    const d={HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
      hash:payrollProcessingSnapshotHash28,
      monthlyRunDetail:payrollMonthlyRunDetail35,
      monthlyConference:payrollMonthlyConference36,
      employerPreview:runId=>payrollEmployer40('preview',{
        env,companyId,auth,request,runId,
        d:{HttpError,requirePermission,ensureSchemaRevision,
          payrollMonthlyRunDetail35,payrollMonthlyConference36}
      })};
    return ok(await payrollVacationProvision67({env,companyId,auth,request,runId:p.id,d}));
  }
  // v121: integração segura da FOLHA com férias, usando baixas já contabilizadas.
  // Não cria segundo pagamento de adiantamento. Reclassifica débito da despesa
  // para conta de liquidação ligada ao diário anterior, por funcionário/CC.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-final-integration');
  if(p&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));
    await ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>ensureProvisionLedger43(env));
    await ensureSchemaRevision(env,'payroll-vacation-advance-link66',1,()=>payrollVacationAdvanceSchema66(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await ensureSchemaRevision(env,'financial',1,async()=>{
      await ensureFinancialAccountingEventSchema(env);await ensureFinancialCashAccountSchema(env);
    });
    await ensureSchemaRevision(env,'financial_payment_columns',1,()=>ensureFinancialCashAccountSchema(env));
    await payroll37Call('settings');
    await payrollProvisionAccounting45('use-settings',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid}
    });
    await ensureSchemaRevision(env,'payroll-vacation-use-link68',1,()=>payrollVacationUseLinkSchema68(env));
    const body=method==='POST'?await readJson(request):{};
    const deps={HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
      hash:payrollProcessingSnapshotHash28,
      monthlyRunDetail:payrollMonthlyRunDetail35,monthlyConference:payrollMonthlyConference36,
      buildInternalPostedEntry,centsToMoney,nextPayableNumber,
      employerPreview:runId=>payrollEmployer40('preview',{
        env,companyId,auth,request,runId,d:{HttpError,requirePermission,ensureSchemaRevision,
         payrollMonthlyRunDetail35,payrollMonthlyConference36}
      })};
    return ok(await payrollVacation121(method==='GET'?'preview':'integrate',{
      env,companyId,auth,request,runId:p.id,body,d:deps
    }));
  }
  // v103: construir ou guardar conferência imutável de partidas propostas.
  // Não gera título financeiro, diário, provisão, pagamento nem guia.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/vacation-accounting-package');
  if(p&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    await ensureSchemaRevision(env,'payroll-vacation-monthly-use100',1,()=>payrollVacationMonthlySchema100(env));
    await ensureSchemaRevision(env,'purchasing',1,async()=>{
      await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
    });
    await payroll37Call('settings');
    const body=method==='POST'?await readJson(request):{};
    return ok(await payrollVacationPosting65(method==='GET'?'read':String(body.action||'record'),{
      env,companyId,auth,request,runId:p.id,body,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid,
        hash:payrollProcessingSnapshotHash28,
        monthlyRunDetail:payrollMonthlyRunDetail35,
        monthlyConference:payrollMonthlyConference36,
        employerPreview:runId=>payrollEmployer40('preview',{
          env,companyId,auth,request,runId,
          d:{HttpError,requirePermission,ensureSchemaRevision,
            payrollMonthlyRunDetail35,payrollMonthlyConference36}
        })}
    }));
  }
  // Etapa 36: conferencia da ultima revisao e fechamento controlado.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/conference');
  if(p&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    return ok(await payrollMonthlyConference36(env,companyId,p.id));
  }
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/review');
  if(p&&method==='POST')return ok(await payrollMonthlyReview36(env,request,auth,companyId,p.id));
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/undo-review');
  if(p&&method==='POST')return ok(await payrollMonthlyUndoReview36(env,request,auth,companyId,p.id));
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/close');
  if(p&&method==='POST')return ok(await payrollMonthlyClose36(env,request,auth,companyId,p.id,await readJson(request)));
  p=routeMatch(path,'/api/payroll/monthly-runs/:id/receipts/:employee_id');
  if(p&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-monthly-review',1,()=>ensurePayrollMonthlyReviewSchema36(env));
    return ok(await payrollMonthlyReceipt36(env,companyId,p.id,p.employee_id));
  }
  // Etapa 35: processamento mensal real, persistente e pendente de homologacao.
  p=routeMatch(path,'/api/payroll/monthly-runs/:id');
  if(p&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    return ok(await payrollMonthlyRunDetail35(env,companyId,p.id));
  }
  if(path==='/api/payroll/monthly-runs'&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-calculation-foundation',1,()=>ensurePayrollCalculationFoundation34(env));
    return ok(await payrollMonthlyRuns35(env,companyId,url.searchParams.get('competence_id')));
  }
  if(path==='/api/payroll/monthly-runs'&&method==='POST'){
    const body=await readJson(request);
    return ok(await payrollMonthlyRunCreate35(env,request,auth,companyId,body.competence_id,body.payment_date),201);
  }
  // Etapa 32: comparar duas fotografias historicas sem atualizar a folha.
  // Esta rota deve preceder o GET generico /:id.
  if(method==='GET'&&path==='/api/payroll/calculation-versions/compare'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await ensureSchemaRevision(env,'payroll-calculation-versions',1,()=>ensurePayrollCalculationVersionsSchema31(env));
    return ok(await payrollCalculationVersionsCompare32(env,companyId,
      url.searchParams.get('left_id'),url.searchParams.get('right_id')));
  }
  // Etapa 31: arquivo versionado e imutavel dos resultados apenas demonstrativos.
  p=routeMatch(path,'/api/payroll/calculation-versions/:id');
  if(p&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await ensureSchemaRevision(env,'payroll-calculation-versions',1,()=>ensurePayrollCalculationVersionsSchema31(env));
    return ok(await payrollCalculationVersionDetail31(env,companyId,p.id));
  }
  if(path==='/api/payroll/calculation-versions'){
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await ensureSchemaRevision(env,'payroll-calculation-versions',1,()=>ensurePayrollCalculationVersionsSchema31(env));
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok(await payrollCalculationVersionsList31(env,companyId,
        url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
    }
    if(method==='POST'){
      await ensureSchemaRevision(env,'payroll-processing-reviews',1,()=>ensurePayrollProcessingReviewsSchema29(env));
      return ok(await payrollCalculationVersionCreate31(env,request,auth,companyId,await readJson(request)),201);
    }
  }
  // Etapa 30: requisitos para homologacao, sem autorizar operacoes financeiras.
  p=routeMatch(path,'/api/payroll/processing-runs/:id/pre-homologation');
  if(p&&method==='GET'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await ensureSchemaRevision(env,'payroll-processing-reviews',1,()=>ensurePayrollProcessingReviewsSchema29(env));
    return ok(await payrollHomologationReadiness30(env,companyId,p.id));
  }
  // Etapa 29: ciencia tecnica documentada, sem homologacao da folha.
  p=routeMatch(path,'/api/payroll/processing-runs/:id/technical-review');
  if(p&&(method==='GET'||method==='POST')){
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await ensureSchemaRevision(env,'payroll-processing-reviews',1,()=>ensurePayrollProcessingReviewsSchema29(env));
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok(await payrollProcessingReviewStatus29(env,companyId,p.id));
    }
    return ok(await payrollProcessingReviewCreate29(env,request,auth,companyId,p.id,await readJson(request)),201);
  }
  // Etapa 28: protocolos tecnicos persistentes, sem homologacao.
  if(path==='/api/payroll/processing-runs'){
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok(await payrollProcessingRunsList28(env,companyId,
        url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
    }
    if(method==='POST')return ok(await payrollProcessingRunCreate28(env,request,auth,companyId,await readJson(request)),201);
  }
  p=routeMatch(path,'/api/payroll/processing-runs/:id');
  if(p&&method==='GET'){
    await ensureSchemaRevision(env,'payroll-processing-runs',1,()=>ensurePayrollProcessingRunsSchema28(env));
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    return ok(await payrollProcessingRunDetail28(env,companyId,p.id));
  }
  // Etapa 27: quadro de processamento por competencia (diagnostico somente leitura).
  if(method==='GET'&&path==='/api/payroll/processing-control'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollProcessingControlPreview27(env,companyId,
      url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 26: diagnostico tecnico de pre-fechamento (somente GET).
  if(method==='GET'&&path==='/api/payroll/final-validation-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollFinalValidationPreview26(env,companyId,
      url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 25: conciliacao aritmetica de salario, eventos, faltas/DSR e tributos, somente GET.
  if(method==='GET'&&path==='/api/payroll/remuneration-reconciliation'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollReconciledRemunerationPreview25(env,companyId,
      url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 24: tributos hipoteticos sobre bases recompostas (sem gravacoes).
  if(method==='GET'&&path==='/api/payroll/recomposed-tax-simulation'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollRecomposedTaxPreview24(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 23: bases tributarias indicativas apos faltas/DSR conferidos.
  if(method==='GET'&&path==='/api/payroll/tax-base-recomposition'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollTaxBaseRecompositionPreview23(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 22: referencias monetarias das faltas e do DSR conferido.
  if(method==='GET'&&path==='/api/payroll/absence-dsr-adjustment'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollAbsenceDsrPreview22(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 21: saldo aritmetico com bloqueios trabalhistas e fiscais.
  if(method==='GET'&&path==='/api/payroll/balance-scenario'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollBalanceScenarioPreview21(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 20: memoria de calculo aritmetico e rastreabilidade sem mutacoes.
  if(method==='GET'&&path==='/api/payroll/calculation-memory'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollCalculationMemoryPreview20(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 19: conferência de salário, evento e incidência com IDs de origem.
  if(method==='GET'&&path==='/api/payroll/remediation-map'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollRemediationPreview19(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 18: diagnostico e checklist somente leitura para futura homologacao.
  if(method==='GET'&&path==='/api/payroll/validation-map'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollValidationPreview18(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 17: envelope consolidado de conferencia, estritamente somente leitura.
  if(method==='GET'&&path==='/api/payroll/envelope-consolidation'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollConsolidationPreview17(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 16: cenários monetários de INSS/IRRF/FGTS, bloqueados para processamento.
  if(method==='GET'&&path==='/api/payroll/tax-simulation'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollTaxSimulationPreview16(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 15: bases potenciais INSS/IRRF/FGTS, sem tributos homologados.
  if(method==='GET'&&path==='/api/payroll/incidence-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollIncidencePreview15(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 14: composição informativa, sem fechar folha ou apurar líquido.
  if(method==='GET'&&path==='/api/payroll/composition-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollCompositionPreview(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 13: conferência de DSR e afastamentos, sem efeitos na folha.
  if(method==='GET'&&path==='/api/payroll/dsr-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollDsrAndLeavePreview(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  if(method==='PUT'&&path==='/api/payroll/dsr-review'){
    return ok({item:await payrollDsrReviewSave(env,request,auth,companyId,await readJson(request))});
  }
  // Etapa 12: prévia remuneratória sem lançamento de desconto, DSR ou líquido.
  if(method==='GET'&&path==='/api/payroll/remuneration-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollRemunerationPreview(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 11: envelope preliminar por funcionario e classificacao de ocorrencias.
  if(method==='GET'&&path==='/api/payroll/envelope-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollEnvelopePreview(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  p=routeMatch(path,'/api/payroll/occurrence-review/:id');
  if(p&&method==='PUT'){
    return ok({item:await payrollOccurrenceReviewSave(env,request,auth,companyId,p.id,await readJson(request))});
  }
  // Etapa 10: demonstrativo de conferência; GET isolado por empresa e sem escrita.
  if(method==='GET'&&path==='/api/payroll/conference-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollConferencePreview(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 09: proporcionalidade civil por histórico salarial/funcional, somente leitura.
  if(method==='GET'&&path==='/api/payroll/labor-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    return ok(await payrollLaborPreview(env,companyId,url.searchParams.get('competence_id')));
  }
  // Etapa 07: bases históricas 2020..2026; competência para INSS e pagamento para IRRF; somente GET.
  if(method==='GET'&&path==='/api/payroll/tax-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollTaxPreviewHistorical(env,companyId,url.searchParams.get('competence_id'),url.searchParams.get('payment_date')));
  }
  // Etapa 05: prévia aritmética somente leitura. Nunca publica cálculo de folha.
  if(method==='GET'&&path==='/api/payroll/events-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    await ensureSchemaRevision(env,'payroll-event-rules',1,()=>ensurePayrollEventRulesSchema(env));
    return ok(await payrollEventCalculationPreview(env,companyId,url.searchParams.get('competence_id')));
  }
  // Folha redesenhada: cadastros parametrizaveis e versionados de eventos/grupos.
  // Nao muda o calculador mensal antigo sem uma homologacao especifica.
  if(path==='/api/payroll/designer/groups'&&(method==='GET'||method==='POST'))
    return ok(await payrollDesigner127(method==='GET'?'groups':'group-save',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid},
      body:method==='POST'?await readJson(request):{}
    }));
  if(path==='/api/payroll/designer/simulate'&&method==='POST')
    return ok(await payrollDesigner127('simulate',{
      env,companyId,auth,request,d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid},
      body:await readJson(request)
    }));
  p=routeMatch(path,'/api/payroll/designer/events/:id');
  if(p&&(method==='GET'||method==='POST')){
    if(method==='POST'){
      await ensureSchemaRevision(env,'purchasing',1,async()=>{
        await ensurePurchasingSchema(env);await ensurePurchaseIntegrationSchema(env);await ensureRmPurchasingSchema(env);
      });
    }
    return ok(await payrollDesigner127(method==='GET'?'event-detail':'event-save',{
      env,companyId,auth,request,eventId:p.id==='new'?null:p.id,
      d:{HttpError,requirePermission,ensureSchemaRevision,audit,uuid},
      body:method==='GET'?{competence:url.searchParams.get('competence')} :await readJson(request)
    }));
  }
  // Configuração versionada; somente o avaliador aritmético restrito da simulação interpreta fórmulas.
  if(path==='/api/payroll/event-rules'){
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok(await payrollEventRulesList(env,companyId,required(url.searchParams.get('event_id'),'evento'),url.searchParams.get('competence')));
    }
    if(method==='POST')return ok({item:await payrollEventRuleCreate(env,request,auth,companyId,await readJson(request))},201);
  }
  // Prévia do salário-base, sempre somente leitura; sem cálculo de tributos ou quitação.
  if(method==='GET'&&path==='/api/payroll/salary-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    return ok(await payrollSalaryPreview(env,companyId,url.searchParams.get('competence_id')));
  }
  // Prévia de conferência: consulta autenticada e limitada à empresa ativa. Sem escrita.
  if(method==='GET'&&path==='/api/payroll/movements-preview'){
    await requirePermission(env,auth.user.id,companyId,'payroll.read');
    return ok(await payrollMovementPreview(env,companyId,url.searchParams.get('competence_id')));
  }
  // v125: reabertura segura apos conferencia das dependencias da folha.
  p=routeMatch(path,'/api/payroll/competences/:id/reopen');
  if(p&&(method==='GET'||method==='POST'))
    return ok(await payrollCompetenceReopen125(method==='GET'?'preview':'reopen',{
      env,companyId,competenceId:p.id,auth,request,
      d:{HttpError,requirePermission,audit},
      body:method==='POST'?await readJson(request):null
    }));
  // Folha — operação inicial; sempre antes das rotas genéricas :kind.
  if(path==='/api/payroll/competences'){
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok({items:await payrollCompetencesList(env,companyId)});
    }
    if(method==='POST')return ok({item:await payrollCompetenceCreate(env,request,auth,companyId,await readJson(request))},201);
  }
  if(path==='/api/payroll/movements'){
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok(await payrollMovementsList(env,companyId,url.searchParams.get('competence_id')));
    }
    if(method==='POST')return ok({item:await payrollMovementCreate(env,request,auth,companyId,await readJson(request))},201);
  }
  p=routeMatch(path,'/api/payroll/movements/:id');
  if(p&&method==='DELETE')return ok(await payrollMovementDelete(env,request,auth,companyId,p.id));

  // Etapa 08: histórico do funcionário, com vigência, isolamento e auditoria.
  p=routeMatch(path,'/api/payroll/employee-records/:employeeId/:kind/:id');
  if(p){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    if(method==='PATCH')return ok({item:await payrollEmployeeRecordSave(env,request,auth,companyId,p.employeeId,p.kind,p.id,await readJson(request))});
    if(method==='DELETE')return ok(await payrollEmployeeRecordDelete(env,request,auth,companyId,p.employeeId,p.kind,p.id));
  }
  p=routeMatch(path,'/api/payroll/employee-records/:employeeId/:kind');
  if(p){
    await ensureSchemaRevision(env,'payroll-employee-history',1,()=>ensurePayrollEmployeeRecordsSchema(env));
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok({items:await payrollEmployeeRecordList(env,companyId,p.employeeId,p.kind)});
    }
    if(method==='POST')return ok({item:await payrollEmployeeRecordSave(env,request,auth,companyId,p.employeeId,p.kind,null,await readJson(request))},201);
  }
  // Folha de Pagamento — apenas cadastros, sem rotinas de cálculo.
  p=routeMatch(path,'/api/payroll/:kind');
  if(p){
    payrollKindTable(p.kind);
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      if(p.kind==='events')return ok(await payroll37Call('catalog'));
      return ok({items:await listPayroll(env,companyId,p.kind)});
    }
    if(method==='POST')return ok({item:await savePayroll(env,request,auth,companyId,p.kind,null,await readJson(request))},201);
  }
  p=routeMatch(path,'/api/payroll/:kind/:id');
  if(p){
    payrollKindTable(p.kind);
    if(method==='GET'){
      await requirePermission(env,auth.user.id,companyId,'payroll.read');
      return ok({item:await getPayroll(env,companyId,p.kind,p.id)});
    }
    if(method==='PATCH')return ok({item:await savePayroll(env,request,auth,companyId,p.kind,p.id,await readJson(request))});
    if(method==='DELETE')return ok(await deletePayroll(env,request,auth,companyId,p.kind,p.id));
  }

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
