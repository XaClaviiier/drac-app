import { useMemo, useState } from 'react';
import { Building2, Edit, Eye, KeyRound, Plus, Save, Search, Shield, Trash2, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';
import UserSessionsTab from '../components/UserSessionsTab';
import type { User, Role, Permission, Branch } from '../types';

type PermissionModule = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
};

const permissionModules: PermissionModule[] = [
  { id: 'dashboard', name: 'Dashboard', description: 'Ringkasan operasional', permissions: ['dashboard:view'] },
  { id: 'ai', name: 'Asisten AI', description: 'Pencarian data dan bantuan operasional', permissions: ['ai:view'] },
  { id: 'wo', name: 'Order Kerja', description: 'Pengecekan dan pengerjaan', permissions: ['wo:view', 'wo:create', 'wo:edit', 'wo:delete', 'wo:backdate'] },
  { id: 'invoice', name: 'Faktur Penjualan', description: 'Penerbitan dan perubahan faktur', permissions: ['invoice:view', 'invoice:create', 'invoice:edit', 'invoice:delete', 'invoice:backdate'] },
  { id: 'payment', name: 'Pembayaran Pelanggan', description: 'Penerimaan dan koreksi pembayaran', permissions: ['payment:view', 'payment:create', 'payment:edit', 'payment:delete', 'payment:backdate'] },
  { id: 'customer', name: 'Pelanggan', description: 'Master pelanggan', permissions: ['customer:view', 'customer:create', 'customer:edit', 'customer:delete'] },
  { id: 'vehicle', name: 'Kendaraan', description: 'Register kendaraan', permissions: ['vehicle:view', 'vehicle:create', 'vehicle:edit', 'vehicle:delete'] },
  { id: 'item', name: 'Barang & Jasa', description: 'Master barang, jasa, dan stok', permissions: ['item:view', 'item:create', 'item:edit', 'item:delete'] },
  { id: 'stock_opname', name: 'Stok Opname', description: 'Perintah, hitung fisik, persetujuan, dan penghapusan opname', permissions: ['stock_opname:view', 'stock_opname:create', 'stock_opname:count', 'stock_opname:post', 'stock_opname:delete'] },
  { id: 'supplier', name: 'Supplier', description: 'Master pemasok', permissions: ['supplier:view', 'supplier:create', 'supplier:edit', 'supplier:delete'] },
  { id: 'receipt', name: 'Penerimaan Barang', description: 'Barang masuk gudang', permissions: ['receipt:view', 'receipt:create', 'receipt:edit', 'receipt:delete'] },
  { id: 'purchase', name: 'Faktur Pembelian', description: 'Pembelian dan pembayaran', permissions: ['purchase:view', 'purchase:create', 'purchase:edit', 'purchase:delete', 'purchase:pay'] },
  { id: 'user', name: 'Pengguna', description: 'Akun pengguna', permissions: ['user:view', 'user:create', 'user:edit', 'user:delete'] },
  { id: 'role', name: 'Role & Hak Akses', description: 'Grup akses pengguna', permissions: ['role:view', 'role:create', 'role:edit', 'role:delete'] },
  { id: 'branch', name: 'Cabang', description: 'Master cabang', permissions: ['branch:view', 'branch:create', 'branch:edit', 'branch:delete', 'all_branches'] },
  { id: 'report', name: 'Laporan', description: 'Laporan operasional', permissions: ['report:view'] },
  { id: 'settings', name: 'Pengaturan', description: 'Konfigurasi sistem', permissions: ['settings:view', 'settings:edit'] },
];

const allPermissions: Permission[] = permissionModules.flatMap((module) => module.permissions);

const permLabels: Record<string, string> = {
  'dashboard:view': 'Lihat Dashboard',
  'ai:view': 'Akses Asisten AI',
  'invoice:view': 'Lihat Faktur', 'invoice:create': 'Buat Faktur', 'invoice:edit': 'Edit Faktur', 'invoice:delete': 'Hapus Faktur',
  'invoice:backdate': 'Input Faktur Tanggal Mundur',
  'payment:view': 'Lihat Pembayaran', 'payment:create': 'Buat Pembayaran', 'payment:edit': 'Edit Pembayaran', 'payment:delete': 'Hapus Pembayaran', 'payment:backdate': 'Input Pembayaran Tanggal Mundur',
  'wo:view': 'Lihat WO', 'wo:create': 'Buat WO', 'wo:edit': 'Edit WO', 'wo:delete': 'Hapus WO',
  'wo:backdate': 'Input WO Tanggal Mundur',
  'customer:view': 'Lihat Pelanggan', 'customer:create': 'Buat Pelanggan', 'customer:edit': 'Edit Pelanggan', 'customer:delete': 'Hapus Pelanggan',
  'vehicle:view': 'Lihat Kendaraan', 'vehicle:create': 'Buat Kendaraan', 'vehicle:edit': 'Edit Kendaraan', 'vehicle:delete': 'Hapus Kendaraan',
  'item:view': 'Lihat Barang/Jasa', 'item:create': 'Buat Barang/Jasa', 'item:edit': 'Edit Barang/Jasa', 'item:delete': 'Hapus Barang/Jasa',
  'stock_opname:view': 'Lihat Stok Opname', 'stock_opname:create': 'Buat Perintah Opname', 'stock_opname:count': 'Isi Hasil Hitung', 'stock_opname:post': 'Setujui dan Posting Opname', 'stock_opname:delete': 'Hapus Dokumen Opname',
  'user:view': 'Lihat User', 'user:create': 'Buat User', 'user:edit': 'Edit User', 'user:delete': 'Hapus User',
  'role:view': 'Lihat Role', 'role:create': 'Buat Role', 'role:edit': 'Edit Role', 'role:delete': 'Hapus Role',
  'branch:view': 'Lihat Cabang', 'branch:create': 'Buat Cabang', 'branch:edit': 'Edit Cabang', 'branch:delete': 'Hapus Cabang',
  'supplier:view': 'Lihat Supplier', 'supplier:create': 'Buat Supplier', 'supplier:edit': 'Edit Supplier', 'supplier:delete': 'Hapus Supplier',
  'receipt:view': 'Lihat Penerimaan', 'receipt:create': 'Buat Penerimaan', 'receipt:edit': 'Edit Penerimaan', 'receipt:delete': 'Hapus Penerimaan',
  'purchase:view': 'Lihat Pembelian', 'purchase:create': 'Buat Pembelian', 'purchase:edit': 'Edit Pembelian', 'purchase:delete': 'Hapus Pembelian', 'purchase:pay': 'Bayar Pembelian',
  'settings:view': 'Lihat Pengaturan', 'settings:edit': 'Edit Pengaturan',
  'report:view': 'Lihat Laporan',
  'all_branches': 'Akses Semua Cabang',
};

export default function UsersAndRoles() {
  const { data, addUser, updateUser, deleteUser, addRole, updateRole, deleteRole, addBranch, updateBranch, deleteBranch, currentUser, hasPermission } = useApp();

  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'branches' | 'sessions'>('users');
  const [search, setSearch] = useState('');

  // User modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: '', name: '', email: '', password: '', roleId: '', branchId: '', branchIds: [] as string[], isActive: true });
  const [showPw, setShowPw] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Role modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '', permissions: [] as Permission[], isActive: true });
  const [selectedPermissionModule, setSelectedPermissionModule] = useState('dashboard');
  const [permissionSearch, setPermissionSearch] = useState('');

  // Branch modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ code: '', name: '', address: '', phone: '', reviewUrl: '', isActive: true });

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return data.users.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.roleName.toLowerCase().includes(q));
  }, [data.users, search]);

  const openUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({ username: user.username, name: user.name, email: user.email, password: '', roleId: user.roleId, branchId: user.branchId, branchIds: user.branchIds?.length ? user.branchIds : [user.branchId], isActive: user.isActive });
    } else {
      setEditingUser(null);
      setUserForm({ username: '', name: '', email: '', password: '', roleId: data.roles[0]?.id || '', branchId: data.branches[0]?.id || '', branchIds: data.branches[0] ? [data.branches[0].id] : [], isActive: true });
    }
    setShowUserModal(true);
  };

  const openRoleModal = (role?: Role) => {
    setSelectedPermissionModule('dashboard');
    setPermissionSearch('');
    if (role) {
      setEditingRole(role);
      setRoleForm({ code: role.code, name: role.name, description: role.description, permissions: [...role.permissions], isActive: role.isActive });
    } else {
      setEditingRole(null);
      setRoleForm({ code: '', name: '', description: '', permissions: [], isActive: true });
    }
    setShowRoleModal(true);
  };

  const openBranchModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm({ code: branch.code, name: branch.name, address: branch.address, phone: branch.phone, reviewUrl: branch.reviewUrl || '', isActive: branch.isActive });
    } else {
      setEditingBranch(null);
      setBranchForm({ code: '', name: '', address: '', phone: '', reviewUrl: '', isActive: true });
    }
    setShowBranchModal(true);
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const role = data.roles.find((r) => r.id === userForm.roleId);
    const branch = data.branches.find((b) => b.id === userForm.branchId);
    const payload: User = {
      id: editingUser?.id || Date.now().toString(),
      username: userForm.username,
      name: userForm.name.toUpperCase(),
      email: userForm.email,
      password: editingUser ? (userForm.password || editingUser.password) : userForm.password,
      roleId: userForm.roleId,
      roleName: role?.name || '-',
      branchId: userForm.branchId,
      branchName: branch?.name || '-',
      branchIds: editingUser?.isOwner ? data.branches.filter(b=>b.isActive).map(b=>b.id) : userForm.branchIds,
      isActive: userForm.isActive,
      createdAt: editingUser?.createdAt || localDateKey(),
      lastLogin: editingUser?.lastLogin,
    };
    try {
      if (editingUser) await updateUser(editingUser.id, payload);
      else await addUser(payload);
      setShowUserModal(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Hak akses pengguna gagal disimpan');
    }
  };

  const saveRole = (e: React.FormEvent) => {
    e.preventDefault();
    const isAdministratorRole = roleForm.code.trim().toUpperCase() === 'ADM' || roleForm.name.trim().toLowerCase() === 'administrator';
    const permissions = isAdministratorRole
      ? roleForm.permissions
      : roleForm.permissions.filter(permission => !permission.startsWith('supplier:'));
    const payload: Role = { id: editingRole?.id || Date.now().toString(), ...roleForm, permissions };
    if (editingRole) updateRole(editingRole.id, payload);
    else addRole(payload);
    setShowRoleModal(false);
  };

  const saveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Branch = { id: editingBranch?.id || Date.now().toString(), ...branchForm };
    if (editingBranch) updateBranch(editingBranch.id, payload);
    else addBranch(payload);
    setShowBranchModal(false);
  };

  const togglePerm = (perm: Permission) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: (() => {
        const exists = prev.permissions.includes(perm);
        const module = permissionModules.find((item) => item.permissions.includes(perm));
        const viewPermission = module?.permissions.find((item) => item.endsWith(':view'));
        if (exists) {
          if (perm === viewPermission && module) {
            return prev.permissions.filter((item) => !module.permissions.includes(item));
          }
          return prev.permissions.filter((item) => item !== perm);
        }
        const next = [...prev.permissions, perm];
        if (viewPermission && perm !== viewPermission && !next.includes(viewPermission)) next.push(viewPermission);
        return next;
      })(),
    }));
  };

  const setModulePermissions = (module: PermissionModule, enabled: boolean) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: enabled
        ? Array.from(new Set([...prev.permissions, ...module.permissions]))
        : prev.permissions.filter((permission) => !module.permissions.includes(permission)),
    }));
  };

  const canEdit = hasPermission('user:edit');
  const canDelete = hasPermission('user:delete');
  const displayedPermissionModules = permissionModules.filter((module) => {
    const isAdministratorRole = roleForm.code.trim().toUpperCase() === 'ADM' || roleForm.name.trim().toLowerCase() === 'administrator';
    if (module.id === 'supplier' && !isAdministratorRole) return false;
    const query = permissionSearch.trim().toLowerCase();
    if (!query) return true;
    return module.name.toLowerCase().includes(query)
      || module.description.toLowerCase().includes(query)
      || module.permissions.some((permission) => (permLabels[permission] || permission).toLowerCase().includes(query));
  });
  const activePermissionModule = displayedPermissionModules.find((module) => module.id === selectedPermissionModule)
    || displayedPermissionModules[0]
    || permissionModules[0];

  return (
    <div className="space-y-3 lg:-mt-5">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { key: 'users' as const, label: 'Pengguna', icon: Users },
          { key: 'roles' as const, label: 'Grup Akses (Role)', icon: Shield },
          { key: 'branches' as const, label: 'Cabang', icon: Building2 },
          ...(currentUser?.isOwner ? [{ key: 'sessions' as const, label: 'Sesi Pengguna', icon: KeyRound }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); }}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'sessions' && <UserSessionsTab />}

      {/* ========== USERS TAB ========== */}
      {activeTab === 'users' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, username, role..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
            </div>
            {hasPermission('user:create') && (
              <button onClick={() => openUserModal()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> User Baru
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[2fr_1fr_2fr_1fr_auto] gap-3 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-600 md:grid"><span>Pengguna</span><span>Role</span><span>Akses Cabang</span><span>Status</span><span>Aksi</span></div>
            {filteredUsers.map((user) => (
              <div key={user.id} className="grid gap-3 border-t border-gray-100 p-4 first:border-0 md:grid-cols-[2fr_1fr_2fr_1fr_auto] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 font-bold text-white">{user.name.charAt(0)}</div>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{user.name} {user.isOwner && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">OWNER UTAMA</span>}</p>
                      <p className="text-xs text-gray-500">@{user.username} · {user.email}</p>
                    </div>
                  </div>
                </div>
                <span className="text-sm">{user.roleName}</span>
                <div className="flex flex-wrap gap-1">{(user.branchIds||[user.branchId]).map(id=><span key={id} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{data.branches.find(b=>b.id===id)?.name||id}</span>)}</div>
                <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{user.isActive ? 'Aktif' : 'Nonaktif'}</span>
                <div className="flex gap-2">
                  {canEdit && (
                    <><button title="Edit" onClick={() => openUserModal(user)} className="rounded-lg border p-2 text-gray-700"><Edit className="h-4 w-4" /></button><button title="Ubah password" onClick={()=>{setPasswordUser(user);setNewPassword('')}} className="rounded-lg border p-2 text-blue-600"><KeyRound className="h-4 w-4"/></button></>
                  )}
                  {canDelete && !user.isProtected && user.id !== currentUser?.id && (
                    <button title="Hapus" onClick={() => { if (window.confirm(`Hapus user ${user.name}?`)) deleteUser(user.id); }} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== ROLES TAB ========== */}
      {activeTab === 'roles' && (
        <>
          <div className="flex justify-end">
            {hasPermission('role:create') && (
              <button onClick={() => openRoleModal()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Role Baru
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{role.name}</p>
                      <p className="font-mono text-xs text-blue-600">{role.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {hasPermission('role:edit') && <button onClick={() => openRoleModal(role)} className="rounded p-1.5 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}
                    {hasPermission('role:delete') && <button onClick={() => { if (window.confirm(`Hapus role ${role.name}?`)) deleteRole(role.id); }} className="rounded p-1.5 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-500">{role.description || '-'}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 6).map((perm) => (
                    <span key={perm} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{permLabels[perm] || perm}</span>
                  ))}
                  {role.permissions.length > 6 && <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">+{role.permissions.length - 6}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== BRANCHES TAB ========== */}
      {activeTab === 'branches' && (
        <>
          <div className="flex justify-end">
            {hasPermission('branch:create') && (
              <button onClick={() => openBranchModal()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Cabang Baru
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.branches.map((branch) => (
              <div key={branch.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{branch.name}</p>
                      <p className="font-mono text-xs text-blue-600">{branch.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {hasPermission('branch:edit') && <button onClick={() => openBranchModal(branch)} className="rounded p-1.5 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}
                    {hasPermission('branch:delete') && <button onClick={() => { if (window.confirm(`Hapus cabang ${branch.name}?`)) deleteBranch(branch.id); }} className="rounded p-1.5 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <p><span className="text-gray-400">Alamat:</span> {branch.address}</p>
                  <p><span className="text-gray-400">Telepon:</span> {branch.phone}</p>
                </div>
                <div className="mt-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${branch.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {branch.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== USER MODAL ========== */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingUser ? 'Edit Pengguna' : 'Pengguna Baru'}</h3>
              <button onClick={() => setShowUserModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveUser} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Username *</label>
                  <input required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nama Lengkap *</label>
                  <input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                  <input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Password {editingUser ? '(kosongkan jika tidak diubah)' : '*'}</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><Eye className="h-4 w-4" /></button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
                  <select required value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {data.roles.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Cabang Utama *</label>
                  <select required value={userForm.branchId} onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {data.branches.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Hak Akses Cabang *</label><div className="grid gap-2 sm:grid-cols-2">{data.branches.filter(b=>b.isActive).map(b=><label key={b.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" disabled={!!editingUser?.isOwner} checked={!!editingUser?.isOwner||userForm.branchIds.includes(b.id)} onChange={e=>setUserForm({...userForm,branchIds:e.target.checked?[...userForm.branchIds,b.id]:userForm.branchIds.filter(id=>id!==b.id)})}/>{b.name}</label>)}</div></div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={userForm.isActive} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                Aktif
              </label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowUserModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={async e=>{e.preventDefault();const r=await api.update('users',passwordUser.id+'/password',{newPassword});if(r.success){setPasswordUser(null);alert('Password berhasil diubah')}else alert(r.message)}} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6"><h3 className="font-semibold">Ubah Password — {passwordUser.name}</h3><input required minLength={6} type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Password baru, minimal 6 karakter" className="w-full rounded-lg border px-3 py-2"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setPasswordUser(null)} className="rounded-lg border px-4 py-2">Batal</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-white">Simpan</button></div></form></div>}

      {/* ========== ROLE MODAL ========== */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editingRole ? 'Edit Role' : 'Role Baru'}</h3>
                <p className="text-xs text-gray-500">{roleForm.permissions.length} dari {allPermissions.length} hak akses dipilih</p>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveRole} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Kode Role *</label>
                    <input required value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Role *</label>
                    <input required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Keterangan</label>
                  <input value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 sm:max-w-md">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={permissionSearch}
                        onChange={(event) => setPermissionSearch(event.target.value)}
                        placeholder="Cari modul atau hak akses..."
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setRoleForm((prev) => ({ ...prev, permissions: [...allPermissions] }))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Aktifkan Semua</button>
                      <button type="button" onClick={() => setRoleForm((prev) => ({ ...prev, permissions: [] }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">Kosongkan</button>
                    </div>
                  </div>

                  <div className="grid min-h-[360px] grid-cols-1 md:grid-cols-[270px_1fr]">
                    <div className="border-b border-gray-200 bg-gray-50/70 p-2 md:border-b-0 md:border-r">
                      <div className="flex gap-2 overflow-x-auto md:block md:max-h-[420px] md:space-y-1 md:overflow-y-auto">
                        {displayedPermissionModules.map((module) => {
                          const activeCount = module.permissions.filter((permission) => roleForm.permissions.includes(permission)).length;
                          const isSelected = activePermissionModule.id === module.id;
                          return (
                            <button
                              key={module.id}
                              type="button"
                              onClick={() => setSelectedPermissionModule(module.id)}
                              className={`min-w-[190px] rounded-lg px-3 py-2.5 text-left transition-colors md:min-w-0 md:w-full ${
                                isSelected ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-white'
                              }`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold">{module.name}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {activeCount}/{module.permissions.length}
                                </span>
                              </span>
                              <span className={`mt-0.5 block truncate text-[10px] ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>{module.description}</span>
                            </button>
                          );
                        })}
                        {displayedPermissionModules.length === 0 && <p className="p-4 text-center text-sm text-gray-500">Modul tidak ditemukan</p>}
                      </div>
                    </div>

                    <div className="min-w-0 p-4 md:p-5">
                      {displayedPermissionModules.length > 0 && (
                        <>
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{activePermissionModule.name}</h4>
                              <p className="text-xs text-gray-500">{activePermissionModule.description}</p>
                            </div>
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                              <input
                                type="checkbox"
                                checked={activePermissionModule.permissions.every((permission) => roleForm.permissions.includes(permission))}
                                onChange={(event) => setModulePermissions(activePermissionModule, event.target.checked)}
                                className="h-4 w-4 rounded text-blue-600"
                              />
                              Pilih Semua Modul
                            </label>
                          </div>

                          <div className="overflow-hidden rounded-lg border border-gray-200">
                            <div className="grid grid-cols-[1fr_74px] bg-slate-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white">
                              <span>Hak Akses</span>
                              <span className="text-center">Aktif</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {activePermissionModule.permissions.map((permission) => {
                                const destructive = permission.endsWith(':delete') || permission === 'all_branches';
                                return (
                                  <label key={permission} className={`grid cursor-pointer grid-cols-[1fr_74px] items-center px-4 py-3 transition-colors hover:bg-gray-50 ${destructive ? 'bg-red-50/40' : ''}`}>
                                    <span>
                                      <span className={`block text-sm font-medium ${destructive ? 'text-red-700' : 'text-gray-800'}`}>{permLabels[permission] || permission}</span>
                                      <span className="block font-mono text-[10px] text-gray-400">{permission}</span>
                                    </span>
                                    <span className="flex justify-center">
                                      <input type="checkbox" checked={roleForm.permissions.includes(permission)} onChange={() => togglePerm(permission)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-gray-500">Mengaktifkan Buat, Ubah, atau Hapus akan otomatis mengaktifkan hak Lihat pada modul yang sama.</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={roleForm.isActive} onChange={(e) => setRoleForm({ ...roleForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                  Role Aktif
                </label>
                <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowRoleModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== BRANCH MODAL ========== */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingBranch ? 'Edit Cabang' : 'Cabang Baru'}</h3>
              <button onClick={() => setShowBranchModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveBranch} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kode Cabang *</label>
                  <input required value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nama Cabang *</label>
                  <input required value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Alamat</label>
                <input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Telepon</label>
                <input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Link Google Review</label>
                <input type="url" value={branchForm.reviewUrl} onChange={(e) => setBranchForm({ ...branchForm, reviewUrl: e.target.value })} placeholder="https://g.page/r/.../review" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                <p className="mt-1 text-xs text-gray-500">Dipakai pada template WhatsApp Minta Ulasan.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={branchForm.isActive} onChange={(e) => setBranchForm({ ...branchForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                Aktif
              </label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowBranchModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
