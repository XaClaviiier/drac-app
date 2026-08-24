import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VehicleRegister from './pages/VehicleRegister';
import SalesInvoice from './pages/SalesInvoice';
import Customers from './pages/Customers';
import WorkOrders from './pages/WorkOrders';
import WorkOrderTimeline from './pages/WorkOrderTimeline';
import ItemsAndServices from './pages/ItemsAndServices';
import UsersAndRoles from './pages/UsersAndRoles';
import GoodsReceiptPage from './pages/GoodsReceipt';
import GoodsReceiptEntry from './pages/GoodsReceiptEntry';
import GoodsReceiptDetail from './pages/GoodsReceiptDetail';
import Suppliers from './pages/Suppliers';
import PurchaseInvoicesPage from './pages/PurchaseInvoices';
import AIAssistant from './pages/AIAssistant';
import Categories from './pages/Categories';
import SettingsPage from './pages/SettingsPage';
import Warehouses from './pages/Warehouses';
import WarehouseTransfers from './pages/WarehouseTransfers';
import WorkOrderReport from './pages/WorkOrderReport';
import ReportsIndex from './pages/ReportsIndex';
import CustomerPayments from './pages/CustomerPayments';
import BranchDeposits from './pages/BranchDeposits';
import CashAccounts from './pages/CashAccounts';
import ChartOfAccounts from './pages/ChartOfAccounts';
import PerformanceBonus from './pages/PerformanceBonus';
import SalesReport from './pages/SalesReport';
import PurchaseReport from './pages/PurchaseReport';
import InventoryReport from './pages/InventoryReport';
import CashBankReport from './pages/CashBankReport';
import HistoricalQuickEntry from './pages/HistoricalQuickEntry';
import OpeningStockImport from './pages/OpeningStockImport';
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

const protectedPage = (permission: Permission, page: React.ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

function AppRoutes() {
  const { currentUser } = useApp();

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
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
        <Route path="branch-deposits" element={protectedPage('report:view', <BranchDeposits />)} />
        <Route path="cash-accounts" element={protectedPage('report:view', <CashAccounts mode="cash" />)} />
        <Route path="bank-accounts" element={protectedPage('report:view', <CashAccounts mode="bank" />)} />
        <Route path="chart-of-accounts" element={protectedPage('report:view', <ChartOfAccounts />)} />
        <Route path="customers" element={protectedPage('customer:view', <Customers />)} />
        <Route path="workorders" element={protectedPage('wo:view', <WorkOrders />)} />
        <Route path="workorders/timeline" element={protectedPage('wo:view', <WorkOrderTimeline />)} />
        <Route path="historical-entry" element={protectedPage('invoice:create', <HistoricalQuickEntry />)} />
        <Route path="reports/workorders" element={protectedPage('report:view', <WorkOrderReport />)} />
        <Route path="reports/sales" element={protectedPage('report:view', <SalesReport />)} />
        <Route path="reports/purchases" element={protectedPage('report:view', <PurchaseReport />)} />
        <Route path="reports/inventory" element={protectedPage('report:view', <InventoryReport />)} />
        <Route path="reports/stock-count-sheet" element={protectedPage('item:view', <StockCountSheetReport />)} />
        <Route path="reports/stock-count-sheet-print" element={protectedPage('report:view', <StockCountSheetPrintReport />)} />
        <Route path="reports/cash-bank" element={protectedPage('report:view', <CashBankReport />)} />
        <Route path="reports" element={protectedPage('report:view', <ReportsIndex />)} />
        <Route path="performance-bonus" element={protectedPage('report:view', <PerformanceBonus />)} />
        <Route path="items" element={protectedPage('item:view', <ItemsAndServices />)} />
        <Route path="suppliers" element={protectedPage('supplier:view', <Suppliers />)} />
        <Route path="receipts" element={protectedPage('receipt:view', <GoodsReceiptPage />)} />
        <Route path="receipts/new" element={protectedPage('receipt:create', <GoodsReceiptEntry />)} />
        <Route path="receipts/view/:id" element={protectedPage('receipt:view', <GoodsReceiptDetail />)} />
        <Route path="purchase-invoices" element={protectedPage('purchase:view', <PurchaseInvoicesPage />)} />
        <Route path="categories" element={protectedPage('item:view', <Categories />)} />
        <Route path="ai" element={protectedPage('ai:view', <AIAssistant />)} />
        <Route path="users" element={protectedPage('user:view', <UsersAndRoles />)} />
        <Route path="settings" element={protectedPage('settings:view', <SettingsPage />)} />
        <Route path="warehouses" element={protectedPage('item:view', <Warehouses />)} />
        <Route path="warehouse-transfers" element={protectedPage('item:view', <WarehouseTransfers />)} />
        <Route path="opening-stock" element={protectedPage('item:edit', <OpeningStockImport />)} />
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
