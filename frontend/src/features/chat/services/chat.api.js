import apiClient from '../../../shared/services/apiClient';

// Chat Sessions
export const createChatSession = async (title = "New Chat", teamId = null) => {
  const response = await apiClient.post('/chats', { title, teamId });
  return response.data.data;
};

export const getChatSessions = async (limit = 10, skip = 0) => {
  const response = await apiClient.get('/chats', { params: { limit, skip } });
  return response.data.data;
};

export const getChatSession = async (sessionId) => {
  const response = await apiClient.get(`/chats/${sessionId}`);
  return response.data.data;
};

export const updateChatSession = async (sessionId, title) => {
  const response = await apiClient.patch(`/chats/${sessionId}`, { title });
  return response.data.data;
};

export const deleteChatSession = async (sessionId) => {
  const response = await apiClient.delete(`/chats/${sessionId}`);
  return response.data.data;
};

// Chat Messages
export const sendChatMessage = async (sessionId, promptText, selectedDatasetIds = []) => {
  const response = await apiClient.post(`/chats/${sessionId}/messages`, {
    promptText,
    selectedDatasetIds
  });
  return response.data.data;
};

export const getChatMessages = async (sessionId, limit = 50, skip = 0) => {
  const response = await apiClient.get(`/chats/${sessionId}/messages`, {
    params: { limit, skip }
  });
  return response.data.data;
};

export const getChatMessage = async (sessionId, messageId) => {
  const response = await apiClient.get(`/chats/${sessionId}/messages/${messageId}`);
  return response.data.data;
}; 