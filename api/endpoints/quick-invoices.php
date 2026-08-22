<?php
if ($method !== 'POST') respondError('Method not allowed', 405);

respondError('Fitur transaksi cepat sudah dinonaktifkan. Gunakan import transaksi lama untuk transaksi historis.', 410);
