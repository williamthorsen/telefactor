import { createContractClient, createTelefactorClient } from '@williamthorsen/telefactor/client';
import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.tsx';
import { notesContract } from './notes/notes-contract.ts';

import './styles.css';

const rootElement = document.querySelector('#root');
if (!rootElement) {
  throw new Error('Root mount target not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App client={createTelefactorClient()} notesClient={createContractClient(notesContract)} />
  </React.StrictMode>,
);
