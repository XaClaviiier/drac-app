import { useState } from 'react';
import { api } from '../../src/lib/apiClient';
export function useApp() {
  const [customers, setCustomers] = useState([]);
  return {
    data: { customers, vehicles: [], workOrders: [], invoices: [], branches: [{ id:'BR-TEST',name:'Cabang Fixture',isActive:true }], users:[], roles:[] },
    currentUser: { id:'test-user', branchId:'BR-TEST', branchIds:['BR-TEST'] },
    resolveBranchId: ()=>'BR-TEST',
    hasPermission: (permission: string)=>!location.search.includes('noCreate') && ['customer:create','customer:view'].includes(permission),
    refreshData: async ()=> { const response=await api.get('customers'); if(!response.success)throw new Error('Refresh failed');setCustomers(response.data); },
    addCustomer: async()=>{}, updateCustomer: async()=>{}, deleteCustomer: async()=>{}, generateCustomerCode:()=> 'PLG-FIXTURE',
  };
}
