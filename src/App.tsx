import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VehicleRegister from './pages/VehicleRegister';
import SalesInvoice from './pages/SalesInvoice';
import Customers from './pages/Customers';
import CustomerImportPage from './pages/CustomerImportPage';
import WorkOrders from './pages/WorkOrders';
import WorkOrderTimeline from './pages/WorkOrderTimeline';
import ItemsAndServices from './pages/ItemsAndServices';
import UsersAndRoles from './pages/UsersAndRoles';
import GoodsReceiptPage from './pages/GoodsReceipt';
import GoodsReceiptEntry from './pages/GoodsReceiptEntry';
import GoodsReceiptWorkspace from './pages/GoodsReceiptWorkspace';
import Suppliers from './pages/Suppliers';
import PurchaseInvoicesPage from './pages/PurchaseInvoices';
import AIAssistant from './pages/AIAssistant';
import Categories from './pages/Categories';
import SettingsPage from './pages/SettingsPage';
import Warehouses from './pages/Warehouses';
import WarehouseTransfers from './pages/WarehouseTransfersWorkspace';
import WorkOrderReport from './pages/WorkOrderReport';
import ReportsIndex from './pages/ReportsIndex';
import CustomerPayments from './pages/CustomerPayments';
import BranchDeposits from './pages/BranchDeposits';
import CashAccounts from './pages/CashAccounts';
import ChartOfAccounts from './pages/ChartOfAccounts';
import GeneralLedger from './pages/GeneralLedger';
import GeneralJournal from './pages/GeneralJournal';
import OpeningBalances from './pages/OpeningBalances';
import PerformanceBonus from './pages/PerformanceBonus';
import SalesReport from './pages/SalesReport';
import PurchaseReport from './pages/PurchaseReport';
import InventoryReport from './pages/InventoryReport';
import StockCardReport from './pages/StockCardReport';
import StockMovementReport from './pages/StockMovementReport';
import CashBankReport from './pages/CashBankReport';
import HistoricalQuickEntry from './pages/HistoricalQuickEntry';
import OpeningStockImport from './pages/OpeningStockImport';
import ItemUsages from './pages/ItemUsages';
import StockCountSheetReport from './pages/StockCountSheetReport';
import StockCountSheetPrintReport from './pages/StockCountSheetPrintReport';
import OnlineHelp from './pages/OnlineHelp';
import type { Permission } from './types';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const location = useLocation();
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { hasPermission, hasLoadedData } = useApp();
  // Hanya loading pertama yang boleh menahan halaman. Refresh CRUD berjalan di
  // latar belakang supaya editor aktif (mis. New WO) tidak di-unmount dan reset.
  if (!hasLoadedData) return <div className="min-h-[40vh]" />;
  if (!hasPermission(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireAnyPermission({ permissions, children }: { permissions: Permission[]; children: React.ReactNode }) {
  const { hasPermission, hasLoadedData } = useApp();
  if (!hasLoadedData) return <div className="min-h-[40vh]" />;
  if (!permissions.some((permission) => hasPermission(permission))) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const protectedPage = (permission: Permission, page: React.ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

const protectedAnyPage = (permissions: Permission[], page: React.ReactNode) => (
  <RequireAnyPermission permissions={permissions}>{page}</RequireAnyPermission>
);

function AppRoutes() {
  const { currentUser } = useApp();

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/workorders/timeline" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="vehicles" element={protectedPage('vehicle:view', <VehicleRegister />)} />
        <Route path="invoices" element={protectedPage('invoice:view', <SalesInvoice />)} />
        <Route path="customer-payments" element={protectedPage('payment:view', <CustomerPayments />)} />
        <Route path="branch-deposits" element={protectedAnyPage(['report:view', 'report:financial'], <BranchDeposits />)} />
        <Route path="cash-accounts" element={protectedAnyPage(['report:view', 'report:financial'], <CashAccounts mode="cash" />)} />
        <Route path="bank-accounts" element={protectedAnyPage(['report:view', 'report:financial'], <CashAccounts mode="bank" />)} />
        <Route path="chart-of-accounts" element={protectedPage('settings:view', <ChartOfAccounts />)} />
        <Route path="general-ledger" element={protectedAnyPage(['report:view', 'report:financial'], <GeneralLedger />)} />
        <Route path="general-journal" element={protectedAnyPage(['report:view', 'report:financial'], <GeneralJournal />)} />
        <Route path="opening-balances" element={protectedPage('settings:edit', <OpeningBalances />)} />
        <Route path="customers" element={protectedPage('customer:view', <Customers />)} />
        <Route path="customers/import" element={protectedPage('customer:create', <CustomerImportPage />)} />
        <Route path="workorders" element={protectedPage('wo:view', <WorkOrders />)} />
        <Route path="workorders/timeline" element={protectedPage('wo:view', <WorkOrderTimeline />)} />
        <Route path="historical-entry" element={protectedPage('invoice:create', <HistoricalQuickEntry />)} />
        <Route path="reports/workorders" element={protectedAnyPage(['report:view', 'report:workorders'], <WorkOrderReport />)} />
        <Route path="reports/sales" element={protectedAnyPage(['report:view', 'report:sales'], <SalesReport />)} />
        <Route path="reports/purchases" element={protectedAnyPage(['report:view', 'report:purchases'], <PurchaseReport />)} />
        <Route path="reports/inventory" element={protectedAnyPage(['report:view', 'report:inventory'], <InventoryReport />)} />
        <Route path="reports/stock-card" element={protectedAnyPage(['report:view', 'report:stock_card'], <StockCardReport />)} />
        <Route path="reports/stock-movements" element={protectedAnyPage(['report:view', 'report:stock_movements'], <StockMovementReport />)} />
        <Route path="reports/stock-count-sheet" element={protectedPage('stock_opname:view', <StockCountSheetReport />)} />
        <Route path="reports/stock-count-sheet-print" element={protectedAnyPage(['report:view', 'report:stock_opname'], <StockCountSheetPrintReport />)} />
        <Route path="reports/cash-bank" element={protectedAnyPage(['report:view', 'report:financial'], <CashBankReport />)} />
        <Route path="reports" element={protectedAnyPage(['report:view', 'report:workorders', 'report:sales', 'report:purchases', 'report:inventory', 'report:stock_card', 'report:stock_movements', 'report:stock_opname', 'report:financial', 'report:performance', 'report:audit'], <ReportsIndex />)} />
        <Route path="performance-bonus" element={protectedAnyPage(['report:view', 'report:performance'], <PerformanceBonus />)} />
        <Route path="items" element={protectedPage('item:view', <ItemsAndServices />)} />
        <Route path="suppliers" element={protectedPage('supplier:view', <Suppliers />)} />
        <Route path="receipts" element={protectedAnyPage(['receipt:view', 'receipt:create'], <GoodsReceiptWorkspace />)}>
          <Route index element={protectedPage('receipt:view', null)} />
          <Route path="new" element={protectedPage('receipt:create', <GoodsReceiptEntry />)} />
          <Route path="view/:id" element={protectedPage('receipt:view', null)} />
        </Route>
        <Route path="receipt-supplier-mapping" element={protectedPage('receipt:supplier', <GoodsReceiptPage key="supplier-mapping" mode="supplier-mapping" />)} />
        <Route path="purchase-invoices" element={protectedPage('purchase:view', <PurchaseInvoicesPage />)} />
        <Route path="categories" element={protectedPage('item:view', <Categories />)} />
        <Route path="ai" element={protectedPage('ai:view', <AIAssistant />)} />
        <Route path="users" element={protectedPage('user:view', <UsersAndRoles />)} />
        <Route path="settings" element={protectedPage('settings:view', <SettingsPage />)} />
        <Route path="warehouses" element={protectedPage('item:view', <Warehouses />)} />
        <Route path="warehouse-transfers" element={protectedPage('item:view', <WarehouseTransfers />)} />
        <Route path="opening-stock" element={protectedAnyPage(['item:edit', 'stock_adjustment:hpp'], <OpeningStockImport />)} />
        <Route path="item-usages" element={protectedPage('item_usage:view', <ItemUsages />)} />
        <Route path="help" element={<OnlineHelp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
