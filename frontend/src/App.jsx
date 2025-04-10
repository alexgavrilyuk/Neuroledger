// frontend/src/App.jsx
import React from 'react';
import { AuthProvider } from './shared/contexts/AuthContext';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { ChatProvider } from './features/dashboard/context/ChatContext';
import AppRouter from './routes'; // Import the router configuration

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChatProvider>
          <AppRouter />
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;