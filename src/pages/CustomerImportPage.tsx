import { useNavigate } from 'react-router-dom';
import CustomerImport from '../components/CustomerImport';
import { useApp } from '../context/AppContext';

export default function CustomerImportPage() {
  const navigate = useNavigate();
  const { data, currentUser, hasPermission, resolveBranchId, refreshData } = useApp();
  const branches = data.branches.filter(branch => branch.isActive && (currentUser?.isOwner || hasPermission('all_branches') || branch.id === currentUser?.branchId || currentUser?.branchIds?.includes(branch.id)));
  return <div className="min-h-[calc(100vh-8rem)] p-4 lg:p-6"><CustomerImport branches={branches} defaultBranchId={resolveBranchId()} onClose={() => navigate('/customers')} onComplete={refreshData} embedded /></div>;
}
