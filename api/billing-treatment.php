<?php
/** Explicit free work; ordinary documents still require a positive total. */
function normalizeBillingTreatment($value): string {
    if ($value === null || $value === '') return 'normal';
    if (!is_string($value) || !in_array($value, ['normal', 'goodwill'], true)) {
        throw new InvalidArgumentException('Perlakuan tagihan tidak valid.');
    }
    return $value;
}

function validBillingTotal(float $total, string $treatment): bool {
    return is_finite($total) && ($treatment === 'goodwill' ? $total === 0.0 : $total > 0);
}

function assertGoodwillTotal(float $total, string $treatment): void {
    if ($treatment === 'goodwill' && !validBillingTotal($total, $treatment)) {
        throw new InvalidArgumentException('Gratis / Goodwill harus memiliki total Rp0. Ubah harga seluruh barang/jasa menjadi Rp0.');
    }
}

function ensureBillingTreatmentSchema(PDO $pdo): void {
    foreach (['work_orders', 'sales_invoices'] as $table) {
        ensureTableColumn($pdo, $table, 'billing_treatment', "VARCHAR(20) NOT NULL DEFAULT 'normal'");
    }
}
