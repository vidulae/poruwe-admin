// Poruwe admin — API endpoint configuration
window.PORUWE_API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
  ? 'http://localhost:4323'
  : 'https://poruwe-lk.onrender.com';
