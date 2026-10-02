import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './verification.css';
import './app.css';

class AppErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('TemirTrace UI error:', error); }
  render() {
    if (this.state.error) return <main style={{ maxWidth: 720, margin: '60px auto', padding: 24, fontFamily: 'system-ui', color: '#17261f' }}><h1>TemirTrace could not start</h1><p>The demo hit an application error. Restart the local server and reload this page.</p><pre style={{ whiteSpace: 'pre-wrap', color: '#9e4436' }}>{this.state.error.message}</pre></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);
