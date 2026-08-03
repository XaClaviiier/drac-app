import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VehicleRegister from './pages/VehicleRegister';
import SalesInvoice from './pages/SalesInvoice';
import Customers from './pages/Customers';
import WorkOrders from './pages/WorkOrders';
import ItemsAndServices from './pages/ItemsAndServices';
import UsersAndRoles from './pages/UsersAndRoles';
import GoodsReceiptPage from './pages/GoodsReceipt';
import Suppliers from './pages/Suppliers';
import PurchaseInvoicesPage from './pages/PurchaseInvoices';
import AIAssistant from './pages/AIAssistant';
import Categories from './pages/Categories';
import SettingsPage from './pages/SettingsPage';
import Warehouses from './pages/Warehouses';
import WorkOrderReport from './pages/WorkOrderReport';
import ReportsIndex from './pages/ReportsIndex';
import CustomerPayments from './pages/CustomerPayments';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const location = useLocation();
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

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
        <Route path="vehicles" element={<VehicleRegister />} />
        <Route path="invoices" element={<SalesInvoice />} />
        <Route path="customer-payments" element={<CustomerPayments />} />
        <Route path="customers" element={<Customers />} />
        <Route path="workorders" element={<WorkOrders />} />
        <Route path="reports/workorders" element={<WorkOrderReport />} />
        <Route path="reports" element={<ReportsIndex />} />
        <Route path="items" element={<ItemsAndServices />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="receipts" element={<GoodsReceiptPage />} />
        <Route path="purchase-invoices" element={<PurchaseInvoicesPage />} />
        <Route path="categories" element={<Categories />} />
        <Route path="ai" element={<AIAssistant />} />
        <Route path="users" element={<UsersAndRoles />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="warehouses" element={<Warehouses />} />
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
