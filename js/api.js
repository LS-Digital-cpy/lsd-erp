// Supabase BaaS Mode
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_KEYS } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── 필드명 매핑: DB(snake_case) ↔ JS(camelCase) ── */
function toJs(row) {
  if (!row) return null;
  const r = { ...row };
  r._id        = r.id;           delete r.id;
  r.managerName = r.manager_name; delete r.manager_name;
  r.managerId  = r.manager_id;   delete r.manager_id;
  r.nextAction = r.next_action;  delete r.next_action;
  r.startDate  = r.start_date;   delete r.start_date;
  r.createdAt  = r.created_at;   delete r.created_at;
  r.updatedAt  = r.updated_at;   delete r.updated_at;
  return r;
}

function toDb(data) {
  const r = { ...data };
  if ('_id'         in r) { r.id           = r._id;         delete r._id; }
  if ('managerName' in r) { r.manager_name = r.managerName; delete r.managerName; }
  if ('managerId'   in r) { r.manager_id   = r.managerId;   delete r.managerId; }
  if ('nextAction'  in r) { r.next_action  = r.nextAction;  delete r.nextAction; }
  if ('startDate'   in r) { r.start_date   = r.startDate;   delete r.startDate; }
  delete r.createdAt;
  delete r.updatedAt;
  return r;
}

/* ── 인증 ── */
function getToken() { return localStorage.getItem(STORAGE_KEYS.token); }

function unauthorized() {
  const err = new Error('UNAUTHORIZED');
  err.code = 'UNAUTHORIZED';
  err.status = 401;
  return err;
}

export function isLoggedIn() { return !!getToken(); }

export function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  return raw ? JSON.parse(raw) : null;
}

export async function login(email, password) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .single();

  if (error || !data) throw unauthorized();

  const user = { id: data.id, email: data.email, name: data.name, role: data.role };
  localStorage.setItem(STORAGE_KEYS.token, 'sb-' + data.id + '-' + Date.now());
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  return user;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
}

export async function getMe() {
  return { data: getCurrentUser() };
}

/* ── 시드 데이터 자동 삽입 (sites 테이블이 비어있을 때 1회) ── */
let seeded = false;
async function seedIfEmpty() {
  if (seeded) return;
  seeded = true;
  const { count } = await sb.from('sites').select('*', { count: 'exact', head: true });
  if (count > 0) return;
  try {
    const res = await fetch('./seed/sites.seed.json');
    const seed = await res.json();
    const now = new Date().toISOString();
    const rows = (seed.sites || []).map((s, i) => toDb({
      ...s,
      _id: 'site_' + (i + 1),
      managerId: s.managerId === 'u1' ? 'admin' : (s.managerId || ''),
      createdAt: now,
      updatedAt: now,
    }));
    if (rows.length) await sb.from('sites').insert(rows);
  } catch (e) {
    console.warn('시드 데이터 로드 실패:', e);
  }
}

/* ── Sites ── */
export async function getSites(params = {}) {
  if (!isLoggedIn()) throw unauthorized();
  await seedIfEmpty();

  let query = sb.from('sites').select('*');

  if (params.q) {
    query = query.or(
      `site.ilike.%${params.q}%,customer.ilike.%${params.q}%,manager_name.ilike.%${params.q}%`
    );
  }
  if (params.stage) query = query.eq('stage', params.stage);
  if (params.type)  query = query.eq('type', params.type);

  switch (params.sort) {
    case 'amount':
      query = query.order('amount', { ascending: false });
      break;
    case 'deadline':
      query = query.order('deadline', { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { data: (data || []).map(toJs) };
}

export async function getSite(id) {
  if (!isLoggedIn()) throw unauthorized();
  const { data, error } = await sb.from('sites').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return { data: toJs(data) };
}

export async function createSite(data) {
  if (!isLoggedIn()) throw unauthorized();
  const now = new Date().toISOString();
  const row = { ...toDb(data), id: 'site_' + Date.now(), created_at: now, updated_at: now };
  const { data: created, error } = await sb.from('sites').insert(row).select().single();
  if (error) throw new Error(error.message);
  return { data: toJs(created) };
}

export async function updateSite(id, patch) {
  if (!isLoggedIn()) throw unauthorized();
  const row = { ...toDb(patch), updated_at: new Date().toISOString() };
  const { data: updated, error } = await sb.from('sites').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return { data: toJs(updated) };
}

export async function deleteSite(id) {
  if (!isLoggedIn()) throw unauthorized();
  const { error } = await sb.from('sites').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { data: true };
}

/* ── 사용자 관리 ── */
export async function getUsers() {
  if (!isLoggedIn()) throw unauthorized();
  const { data, error } = await sb.from('profiles').select('id, email, name, role');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function registerUser({ email, password, name, role }) {
  if (!isLoggedIn()) throw unauthorized();
  const { data: exists } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
  if (exists) throw new Error('이미 등록된 이메일입니다.');
  const id = 'user_' + Date.now();
  const { data, error } = await sb.from('profiles').insert({ id, email, password, name, role }).select().single();
  if (error) throw new Error(error.message);
  return { data };
}
