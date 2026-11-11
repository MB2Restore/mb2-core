import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import UpdateBanner from './components/UpdateBanner';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UpdateBanner />
    <App />
  </React.StrictMode>
);
