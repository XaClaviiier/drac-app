import React from 'react';
import { createRoot } from 'react-dom/client';
import Customers from '../../src/pages/Customers';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Customers /></React.StrictMode>);
