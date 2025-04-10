import { io } from 'socket.io-client';
import { useAuth } from '../../../shared/hooks/useAuth';

// Initialize socket once, keep reference
let socket = null;

/**
 * Hook for managing Socket.IO connection
 * @returns {Object} Socket connection methods and instance
 */
export const useSocket = () => {
  const { user, firebaseUser } = useAuth();
  
  /**
   * Connect to Socket.IO server
   * @returns {Object|null} Socket instance or null if connection fails
   */
  const connectSocket = async () => {
    if (socket) return socket;
    
    try {
      // Use the Firebase auth token from current firebaseUser
      let token = '';
      if (firebaseUser) {
        token = await firebaseUser.getIdToken();
      } else if (user) {
        token = 'Bearer ' + user.id; // Fallback to a simple bearer token if no firebase user
      } else {
        throw new Error('No authenticated user found');
      }
      
      // Extract the base URL without any paths
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
      
      // Handle the URL parsing differently to support protocol-relative URLs (//domain.com)
      let socketUrl = apiBaseUrl;
      
      // If URL contains /api/v1 or other path components, remove them
      if (apiBaseUrl.includes('/api/')) {
        // For URLs like //192.168.1.102:5001/api/v1 or http://192.168.1.102:5001/api/v1
        const parts = apiBaseUrl.split('/api/');
        socketUrl = parts[0]; // Just get the server part without /api/...
      }
      
      // Ensure we have a protocol (needed for Socket.IO)
      if (socketUrl.startsWith('//')) {
        // Protocol-relative URL, add http: for local development
        socketUrl = 'http:' + socketUrl;
      } else if (!socketUrl.startsWith('http://') && !socketUrl.startsWith('https://')) {
        // No protocol at all, add http:// for local development
        socketUrl = 'http://' + socketUrl;
      }
      
      console.log('Connecting to Socket.IO at:', socketUrl);
      
      socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'], // Add polling as fallback
        autoConnect: true,
        path: '/socket.io' // Default Socket.IO path
      });
      
      socket.on('connect', () => {
        console.log('Socket connected successfully');
      });
      
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        socket = null;
      });
      
      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        socket = null;
      });
      
      return socket;
    } catch (error) {
      console.error('Error connecting to socket:', error);
      return null;
    }
  };
  
  /**
   * Disconnect from Socket.IO server
   */
  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };
  
  /**
   * Subscribe to Socket.IO events
   * @param {Object} events - Map of event names to callbacks
   * @returns {Function|null} Cleanup function or null if socket not connected
   */
  const subscribeToEvents = (events) => {
    if (!socket) return null;
    
    Object.entries(events).forEach(([event, callback]) => {
      socket.on(event, callback);
    });
    
    // Return cleanup function
    return () => {
      Object.keys(events).forEach(event => {
        socket.off(event);
      });
    };
  };
  
  return {
    connectSocket,
    disconnectSocket,
    subscribeToEvents,
    socket
  };
}; 