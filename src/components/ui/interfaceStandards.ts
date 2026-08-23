/**
 * Aturan visual bersama untuk layar administrasi.
 * Simpan class yang berulang di sini supaya tab, toolbar, pencarian, dan tabel
 * tidak memiliki versi berbeda di setiap modul.
 */
export const ui = {
  workspaceBar: 'app-workspace-bar',
  workspaceTab: 'app-workspace-tab',
  workspaceTabActive: 'app-workspace-tab app-workspace-tab--active',
  childBar: 'app-child-bar',
  childTab: 'app-child-tab',
  childTabActive: 'app-child-tab app-child-tab--active',
  childListTab: 'app-child-list-tab',
  toolbar: 'app-data-toolbar',
  field: 'app-control',
  search: 'app-search-control',
  tableShell: 'app-table-shell',
  documentAction: 'inline-flex h-9 w-[104px] items-center justify-center gap-1 rounded border border-blue-500 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400',
} as const;

export function workspaceTabClass(active: boolean) {
  return active ? ui.workspaceTabActive : ui.workspaceTab;
}

export function childTabClass(active: boolean) {
  return active ? ui.childTabActive : ui.childTab;
}
