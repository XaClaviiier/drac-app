<?php
// ==========================================================
// ALL DATA - Load semua data sekaligus untuk aplikasi
// GET /api/all-data
// ==========================================================
if ($method !== 'GET') respondError('Method not allowed', 405);

try {
    $data = [];

    // Branches
    $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
    foreach ($rows as &$r) $r['isActive'] = (bool)$r['is_active'];
    $data['branches'] = $rows;

    // Roles
    $rows = $pdo->query("SELECT * FROM roles ORDER BY code")->fetchAll();
    foreach ($rows as &$r) {
        $r['isActive'] = (bool)$r['is_active'];
        $r['permissions'] = $r['permissions'] ? json_decode($r['permissions']) : [];
    }
    $data['roles'] = $rows;

    // Users (tanpa password)
    $rows = $pdo->query("SELECT u.*, r.name as role_name, b.name as branch_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id")->fetchAll();
    foreach ($rows as &$r) {
        unset($r['password']);
        $r['roleName'] = $r['role_name']; $r['roleId'] = $r['role_id'];
        $r['branchName'] = $r['branch_name']; $r['branchId'] = $r['branch_id'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['isOwner'] = (bool)($r['is_owner'] ?? false);
        $r['isProtected'] = (bool)($r['is_protected'] ?? false);
        $r['branchIds'] = getUserBranchIds($pdo, $r['id']);
        $r['lastLogin'] = $r['last_login']; $r['createdAt'] = $r['created_at'];
    }
    $data['users'] = $rows;

    // Customers
    $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
    foreach ($rows as &$r) {
        $r['customerCode']      = $r['customer_code'];
        $r['branchId']          = $r['branch_id'];
        $r['firstSeenBranchId'] = $r['first_seen_branch_id'] ?? $r['branch_id'];
        $r['createdAt']         = $r['created_at'];
    }
    $data['customers'] = $rows;

    // Vehicles
    $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
    foreach ($rows as &$r) {
        $r['plateNumber']       = $r['plate_number'];
        $r['customerRefId']     = $r['customer_id'];
        $r['customerId']        = $r['customer_code'] ?: $r['customer_id'];
        $r['customerName']      = $r['customer_name'];
        $r['registrationDate']  = $r['registration_date'];
        $r['branchId']          = $r['branch_id'];
        $r['firstSeenBranchId'] = $r['first_seen_branch_id'] ?? $r['branch_id'];
    }
    $data['vehicles'] = $rows;

    // Suppliers
    $rows = $pdo->query("SELECT * FROM suppliers ORDER BY code")->fetchAll();
    foreach ($rows as &$r) {
        $r['contactPerson'] = $r['contact_person'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['createdAt'] = $r['created_at'];
    }
    $data['suppliers'] = $rows;

    // Item Categories
    $rows = $pdo->query("SELECT * FROM item_categories ORDER BY code")->fetchAll();
    foreach ($rows as &$r) $r['isActive'] = (bool)$r['is_active'];
    $data['itemCategories'] = $rows;

    // Items (with group members)
    $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
    $stockRows = $pdo->query("
        SELECT w.branch_id, ws.item_id, SUM(ws.quantity) stock,
               SUM(ws.quantity-ws.reserved_quantity) sellable_stock
        FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id
        WHERE w.is_active=1 GROUP BY w.branch_id,ws.item_id
    ")->fetchAll();
    $stocksByItem = [];
    foreach ($stockRows as $stockRow) {
        $stocksByItem[$stockRow['item_id']][$stockRow['branch_id']] = [
            'stock' => (int)$stockRow['stock'],
            'sellableStock' => (int)$stockRow['sellable_stock'],
        ];
    }
    $groupMembersAll = $pdo->query("SELECT * FROM item_group_members")->fetchAll();
    $membersByGroup = [];
    foreach ($groupMembersAll as $m) {
        $membersByGroup[$m['group_item_id']][] = [
            'itemId' => $m['member_item_id'],
            'itemCode' => $m['member_code'],
            'itemName' => $m['member_name'],
            'itemType' => $m['member_type'],
            'qty' => (int)$m['qty'],
            'unitPrice' => (float)$m['unit_price'],
        ];
    }
    foreach ($rows as &$r) {
        $r['categoryId'] = $r['category_id'];
        $r['categoryName'] = $r['category_name'];
        $r['sellableStock'] = (int)$r['sellable_stock'];
        $r['purchasePrice'] = (float)$r['purchase_price'];
        $r['sellingPrice'] = (float)$r['selling_price'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['isQuickService'] = (bool)$r['is_quick_service'];
        $r['branchId'] = $r['branch_id'];
        $r['branchStocks'] = $stocksByItem[$r['id']] ?? [];
        $r['stock'] = array_sum(array_column($r['branchStocks'], 'stock'));
        $r['sellableStock'] = array_sum(array_column($r['branchStocks'], 'sellableStock'));
        if ($r['type'] === 'Group') {
            $r['groupMembers'] = $membersByGroup[$r['id']] ?? [];
        }
    }
    $data['items'] = $rows;

    // Gudang, saldo stok per gudang, dan histori mutasi.
    $warehouses = $pdo->query("SELECT w.*,b.name branch_name FROM warehouses w LEFT JOIN branches b ON b.id=w.branch_id COLLATE utf8mb4_unicode_ci ORDER BY b.name,w.is_default DESC,w.name")->fetchAll();
    foreach($warehouses as &$w){$w['branchId']=$w['branch_id'];$w['branchName']=$w['branch_name'];$w['isDefault']=(bool)$w['is_default'];$w['isSellable']=(bool)$w['is_sellable'];$w['isActive']=(bool)$w['is_active'];}
    $data['warehouses']=$warehouses;
    $warehouseStocks=$pdo->query("SELECT warehouse_id,item_id,quantity,reserved_quantity FROM warehouse_stocks")->fetchAll();
    foreach($warehouseStocks as &$s){$s['warehouseId']=$s['warehouse_id'];$s['itemId']=$s['item_id'];$s['quantity']=(int)$s['quantity'];$s['reservedQuantity']=(int)$s['reserved_quantity'];}
    $data['warehouseStocks']=$warehouseStocks;
    $movements=$pdo->query("SELECT m.*,i.name item_name,sw.name source_name,dw.name destination_name FROM stock_movements m JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id ORDER BY m.created_at DESC LIMIT 200")->fetchAll();
    foreach($movements as &$m){$m['itemId']=$m['item_id'];$m['itemName']=$m['item_name'];$m['sourceWarehouseId']=$m['source_warehouse_id'];$m['sourceName']=$m['source_name'];$m['destinationWarehouseId']=$m['destination_warehouse_id'];$m['destinationName']=$m['destination_name'];$m['movementType']=$m['movement_type'];$m['quantity']=(int)$m['quantity'];$m['createdAt']=$m['created_at'];}
    $data['stockMovements']=$movements;

    // Work Orders
    $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll();
    $allServices = $pdo->query("SELECT * FROM work_order_services")->fetchAll();
    $servicesByWO = [];
    foreach ($allServices as $s) {
        $servicesByWO[$s['wo_id']][] = [
            'id' => (string)$s['id'],
            'itemId' => $s['item_id'],
            'code' => $s['code'],
            'name' => $s['name'],
            'description' => $s['description'],
            'price' => (float)$s['price'],
            'qty' => (int)$s['qty'],
        ];
    }
    foreach ($rows as &$r) {
        $r['woNumber'] = $r['wo_number'];
        $r['customerRefId'] = $r['customer_ref_id'];
        $r['customerId'] = $r['customer_id'];
        $r['customerName'] = $r['customer_name'];
        $r['vehicleRefId'] = $r['vehicle_ref_id'];
        $r['plateNumber'] = $r['plate_number'];
        $r['vehicleInfo'] = $r['vehicle_info'];
        $r['branchId'] = $r['branch_id'];
        $r['invoiceId'] = $r['invoice_id'];
        $r['invoiceNumber'] = $r['invoice_number'];
        $r['total'] = (float)$r['total'];
        $r['findings']                = $r['findings'] ?? null;
        $r['estimateTotal']           = isset($r['estimate_total']) ? (float)$r['estimate_total'] : null;
        $r['approvedAt']              = $r['approved_at'] ?? null;
        $r['cancelReason']            = $r['cancel_reason'] ?? null;
        $r['statusLog']               = isset($r['status_log']) && $r['status_log'] ? json_decode($r['status_log'], true) : [];
        $r['continuedFromWoId']       = $r['continued_from_wo_id'] ?? null;
        $r['continuedFromWoNumber']   = $r['continued_from_wo_number'] ?? null;
        $r['continuedFromBranchName'] = $r['continued_from_branch_name'] ?? null;
        $r['continuedToWoId']         = $r['continued_to_wo_id'] ?? null;
        $r['continuedToWoNumber']     = $r['continued_to_wo_number'] ?? null;
        $r['continuedToBranchName']   = $r['continued_to_branch_name'] ?? null;
        $r['services']                = $servicesByWO[$r['id']] ?? [];
    }
    $data['workOrders'] = $rows;

    // Sales Invoices
    $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
    foreach ($rows as &$r) {
        $r['invoiceNumber'] = $r['invoice_number'];
        $r['customerRefId'] = $r['customer_ref_id'];
        $r['customerId'] = $r['customer_id'];
        $r['customerName'] = $r['customer_name'];
        $r['vehicleInfo'] = $r['vehicle_info'];
        $r['total'] = (float)$r['total'];
        $r['payment'] = (float)$r['payment'];
        $r['paymentMethod'] = $r['payment_method'] ?? 'Tunai';
        $r['age'] = (int)$r['age'];
        $r['woId'] = $r['wo_id'];
        $r['woNumber'] = $r['wo_number'];
        $r['branchId'] = $r['branch_id'];
    }
    $data['invoices'] = $rows;

    // Goods Receipts
    $rows = $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC")->fetchAll();
    $allItems = $pdo->query("SELECT * FROM goods_receipt_items")->fetchAll();
    $itemsByReceipt = [];
    foreach ($allItems as $i) {
        $itemsByReceipt[$i['receipt_id']][] = [
            'id' => (string)$i['id'],
            'itemId' => $i['item_id'],
            'itemCode' => $i['item_code'],
            'itemName' => $i['item_name'],
            'qty' => (int)$i['qty'],
            'unit' => $i['unit'],
            'qtyInvoiced' => (int)$i['qty_invoiced'],
        ];
    }
    foreach ($rows as &$r) {
        $r['receiptNumber'] = $r['receipt_number'];
        $r['supplierId'] = $r['supplier_id'];
        $r['supplierName'] = $r['supplier_name'];
        $r['doNumber'] = $r['do_number'];
        $r['branchId'] = $r['branch_id'];
        $r['receivedBy'] = $r['received_by'];
        $r['createdAt'] = $r['created_at'];
        $r['items'] = $itemsByReceipt[$r['id']] ?? [];
    }
    $data['goodsReceipts'] = $rows;

    // Purchase Invoices
    $rows = $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC")->fetchAll();
    $allPIItems = $pdo->query("SELECT * FROM purchase_invoice_items")->fetchAll();
    $allPayments = $pdo->query("SELECT * FROM purchase_payments")->fetchAll();
    $piItemsById = [];
    $paymentsById = [];
    foreach ($allPIItems as $i) {
        $piItemsById[$i['invoice_id']][] = [
            'id' => (string)$i['id'],
            'receiptId' => $i['receipt_id'],
            'receiptNumber' => $i['receipt_number'],
            'itemId' => $i['item_id'],
            'itemCode' => $i['item_code'],
            'itemName' => $i['item_name'],
            'qty' => (int)$i['qty'],
            'unit' => $i['unit'],
            'unitPrice' => (float)$i['unit_price'],
            'discount' => (float)$i['discount'],
            'subtotal' => (float)$i['subtotal'],
        ];
    }
    foreach ($allPayments as $p) {
        $paymentsById[$p['invoice_id']][] = [
            'id' => $p['id'],
            'paymentNumber' => $p['payment_number'],
            'date' => $p['date'],
            'amount' => (float)$p['amount'],
            'paymentMethod' => $p['payment_method'],
            'bankAccount' => $p['bank_account'],
            'notes' => $p['notes'],
        ];
    }
    foreach ($rows as &$r) {
        $r['invoiceNumber'] = $r['invoice_number'];
        $r['dueDate'] = $r['due_date'];
        $r['supplierId'] = $r['supplier_id'];
        $r['supplierName'] = $r['supplier_name'];
        $r['supplierInvoiceNumber'] = $r['supplier_invoice_number'];
        $r['subtotal'] = (float)$r['subtotal'];
        $r['discount'] = (float)$r['discount'];
        $r['tax'] = (float)$r['tax'];
        $r['total'] = (float)$r['total'];
        $r['paidAmount'] = (float)$r['paid_amount'];
        $r['branchId'] = $r['branch_id'];
        $r['createdAt'] = $r['created_at'];
        $r['items'] = $piItemsById[$r['id']] ?? [];
        $r['payments'] = $paymentsById[$r['id']] ?? [];
        $r['receiptIds'] = array_values(array_unique(array_map(function($x) { return $x['receiptId']; }, $r['items'])));
    }
    $data['purchaseInvoices'] = $rows;

    $settingsTable = $pdo->query("SHOW TABLES LIKE 'app_settings'")->fetch();
    if ($settingsTable) {
        $settingsRow = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
        if ($settingsRow) $data['settings'] = json_decode($settingsRow['settings_json'], true);
    }

    respondSuccess($data, 'All data loaded');
} catch (Exception $e) {
    respondError('Failed to load data', 500, $e->getMessage());
}
