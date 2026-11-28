<?php
// Document references are stable. Stored labels are retained for unlinked historical rows.
const CUSTOMER_WORK_ORDER_SELECT = "SELECT w.*,
    COALESCE(c.name,w.customer_name) AS customerName,
    COALESCE(c.customer_code,w.customer_id) AS customerId, w.customer_ref_id AS customerRefId
    FROM work_orders w LEFT JOIN customers c ON c.id=w.customer_ref_id";

const CUSTOMER_VEHICLE_SELECT = "SELECT v.*,
    COALESCE(c.name,v.customer_name) AS customerName,
    COALESCE(c.customer_code,NULLIF(v.customer_code,''),v.customer_id) AS customerId,
    v.customer_id AS customerRefId
    FROM vehicles v LEFT JOIN customers c ON c.id=v.customer_id";

// An older invoice without its own reference may inherit it from its source WO in the same branch.
const INVOICE_CUSTOMER_JOIN = " LEFT JOIN work_orders w ON w.id=i.wo_id AND w.branch_id=i.branch_id
    LEFT JOIN customers c ON c.id=COALESCE(NULLIF(i.customer_ref_id,''),w.customer_ref_id)";
const INVOICE_CUSTOMER_FIELDS = "COALESCE(c.name,i.customer_name) AS customerName,
    COALESCE(c.customer_code,i.customer_id) AS customerId, COALESCE(c.id,i.customer_ref_id) AS customerRefId";
const CUSTOMER_INVOICE_SELECT = "SELECT i.*, " . INVOICE_CUSTOMER_FIELDS . " FROM sales_invoices i" . INVOICE_CUSTOMER_JOIN;
