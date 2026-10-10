PRAGMA foreign_keys = ON;

-- GESTAOERP — Núcleo do ERP (Cloudflare D1 / SQLite)
-- Valores monetários são armazenados em centavos inteiros (INTEGER).

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  tax_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_tax_id ON companies(tax_id) WHERE tax_id IS NOT NULL AND tax_id <> '';

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS company_memberships (
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','BLOCKED')),
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, user_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON company_memberships(user_id);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_role INTEGER NOT NULL DEFAULT 0 CHECK (system_role IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, user_id, role_id),
  FOREIGN KEY (company_id, user_id) REFERENCES company_memberships(company_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_company ON user_roles(user_id, company_id);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_periods_company_dates ON accounting_periods(company_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  reduced_code TEXT,
  name TEXT NOT NULL,
  parent_id TEXT,
  account_class TEXT CHECK (account_class IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','RESULT','COMPENSATION','OTHER')),
  normal_side TEXT NOT NULL CHECK (normal_side IN ('D','C')),
  analytic INTEGER NOT NULL DEFAULT 1 CHECK (analytic IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_reduced ON accounts(company_id, reduced_code) WHERE reduced_code IS NOT NULL AND reduced_code <> '';
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company_name ON accounts(company_id, name);

CREATE TABLE IF NOT EXISTS cost_centers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id) REFERENCES cost_centers(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_parent ON cost_centers(parent_id);

CREATE TABLE IF NOT EXISTS history_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  complement_required INTEGER NOT NULL DEFAULT 0 CHECK (complement_required IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS journal_batches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
  created_by TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (company_id, code),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_batches_company_status ON journal_batches(company_id, status);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  branch_id TEXT,
  entry_date TEXT NOT NULL,
  document_number TEXT,
  description TEXT,
  source_module TEXT NOT NULL DEFAULT 'ACCOUNTING',
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','VOID')),
  total_debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_debit_cents >= 0),
  total_credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_credit_cents >= 0),
  created_by TEXT NOT NULL,
  posted_by TEXT,
  posted_at TEXT,
  voided_by TEXT,
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES journal_batches(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_entries_company_date ON journal_entries(company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_batch ON journal_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_entries_source ON journal_entries(company_id, source_module, source_reference);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('D','C')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  branch_id TEXT,
  cost_center_id TEXT,
  history_template_id TEXT,
  history_complement TEXT,
  document_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE RESTRICT,
  FOREIGN KEY (history_template_id) REFERENCES history_templates(id) ON DELETE RESTRICT,
  UNIQUE (entry_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(company_id, account_id);
CREATE INDEX IF NOT EXISTS idx_lines_cost_center ON journal_lines(company_id, cost_center_id);

CREATE TABLE IF NOT EXISTS allocation_lines (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  journal_line_id TEXT NOT NULL,
  cost_center_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  percentage_basis_points INTEGER NOT NULL CHECK (percentage_basis_points > 0 AND percentage_basis_points <= 10000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_line_id) REFERENCES journal_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_allocations_line ON allocation_lines(journal_line_id);

CREATE TABLE IF NOT EXISTS company_settings (
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, key),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_logs(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(company_id, entity, entity_id);

INSERT OR IGNORE INTO permissions (id, code, module, description) VALUES
('perm-core-company-manage','core.company.manage','CORE','Alterar dados da empresa'),
('perm-core-branch-read','core.branch.read','CORE','Consultar filiais'),
('perm-core-branch-manage','core.branch.manage','CORE','Cadastrar e alterar filiais'),
('perm-core-user-read','core.user.read','CORE','Consultar usuários da empresa'),
('perm-core-user-manage','core.user.manage','CORE','Cadastrar usuários e atribuir perfis'),
('perm-core-role-manage','core.role.manage','CORE','Gerenciar perfis e permissões'),
('perm-core-audit-read','core.audit.read','CORE','Consultar auditoria'),
('perm-acc-period-read','accounting.period.read','ACCOUNTING','Consultar períodos contábeis'),
('perm-acc-period-manage','accounting.period.manage','ACCOUNTING','Gerenciar períodos contábeis'),
('perm-acc-account-read','accounting.account.read','ACCOUNTING','Consultar plano de contas'),
('perm-acc-account-manage','accounting.account.manage','ACCOUNTING','Gerenciar plano de contas'),
('perm-acc-cc-read','accounting.cost_center.read','ACCOUNTING','Consultar centros de custo'),
('perm-acc-cc-manage','accounting.cost_center.manage','ACCOUNTING','Gerenciar centros de custo'),
('perm-acc-history-read','accounting.history.read','ACCOUNTING','Consultar históricos padrão'),
('perm-acc-history-manage','accounting.history.manage','ACCOUNTING','Gerenciar históricos padrão'),
('perm-acc-batch-read','accounting.batch.read','ACCOUNTING','Consultar lotes'),
('perm-acc-batch-manage','accounting.batch.manage','ACCOUNTING','Gerenciar lotes'),
('perm-acc-entry-read','accounting.entry.read','ACCOUNTING','Consultar lançamentos'),
('perm-acc-entry-create','accounting.entry.create','ACCOUNTING','Criar lançamentos em rascunho'),
('perm-acc-entry-post','accounting.entry.post','ACCOUNTING','Contabilizar lançamentos'),
('perm-acc-entry-void','accounting.entry.void','ACCOUNTING','Anular lançamentos contabilizados');
