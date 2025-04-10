// Export existing dashboard components
import ChatInterface from './ChatInterface';
import MessageBubble from './MessageBubble';
import PromptInput from './PromptInput';
import ProgressIndicator from './ProgressIndicator';

// Export new chat components that were moved over
import ChatMessage from './ChatMessage';
import ChatDetail from './ChatDetail';
import ChatSessionList from './ChatSessionList';
import ChatSessionItem from './ChatSessionItem';
import ChatInput from './ChatInput';

export {
  // Existing dashboard components
  ChatInterface,
  MessageBubble,
  PromptInput,
  ProgressIndicator,
  
  // New chat components
  ChatMessage,
  ChatDetail,
  ChatSessionList,
  ChatSessionItem,
  ChatInput
}; 