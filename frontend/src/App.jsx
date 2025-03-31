// frontend/src/App.jsx
// ** UPDATED FILE **
import React from 'react';
import { AuthProvider } from './shared/contexts/AuthContext';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import AppRouter from './routes'; // Import the router configuration

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* AppRouter now handles all routing logic */}
        <AppRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;