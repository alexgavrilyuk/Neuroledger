// frontend/src/App.jsx
// ** UPDATED FILE **
import React from 'react';
import { AuthProvider } from './shared/contexts/AuthContext';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { ChatProvider } from './features/chat/context/ChatContext';
import AppRouter from './routes'; // Import the router configuration


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChatProvider>
          {/* AppRouter now handles all routing logic */}
          <AppRouter />
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;