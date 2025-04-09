// frontend/src/shared/components/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../../features/chat/context/ChatContext';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  UserIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  CircleStackIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowLeftOnRectangleIcon,
  HomeIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

const Sidebar = ({ onCollapse }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(true);
  const location = useLocation();
  const { user, actions } = useAuth();

  // Get chat sessions and chat context functions
  const {
    sessions,
    currentSession,
    setCurrentSession,
    createNewSession,
    loadSessions,
    loading: sessionsLoading
  } = useChat();

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Effect to notify parent component of collapse state changes
  useEffect(() => {
    if (onCollapse) {
      onCollapse(collapsed);
    }
  }, [collapsed, onCollapse]);

  // Toggle sidebar collapse
  const toggleCollapse = () => {
    setCollapsed(prev => !prev);
  };

  // Toggle sessions dropdown
  const toggleSessions = () => {
    setIsSessionsOpen(prev => !prev);
  };

  // Create a new chat session
  const handleCreateSession = async () => {
    await createNewSession();
  };

  // Function to highlight active link
  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  // Main navigation items
  const navItems = [
    { path: '/dashboard', icon: HomeIcon, label: 'Dashboard' },
    { path: '/account/profile', icon: UserIcon, label: 'Account' },
    { path: '/account/datasets', icon: CircleStackIcon, label: 'Datasets' },
    { path: '/account/teams', icon: UserGroupIcon, label: 'Teams' },
    { path: '/account/settings', icon: Cog6ToothIcon, label: 'Settings' },
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200/80 dark:border-gray-700/50 shadow-xl dark:shadow-2xl transition-all duration-300 ease-in-out ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo & App Name */}
      <div className="flex h-16 shrink-0 items-center border-b border-gray-200/60 dark:border-gray-700/40 px-4 bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-gray-800 dark:to-gray-800/90">
        <Link to="/dashboard" className={`flex items-center ${collapsed ? 'justify-center' : 'gap-x-3'}`}>
          <div className="relative">
            <div className="absolute -inset-1 bg-blue-100 dark:bg-blue-900/20 rounded-md blur opacity-40"></div>
            <svg className="relative h-8 w-auto text-blue-600 dark:text-blue-400 filter drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" />
            </svg>
          </div>
          {!collapsed && <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-blue-800 dark:from-white dark:to-blue-400">NeuroLedger</span>}
        </Link>
      </div>

      {/* Sidebar Content with scrolling */}
      <div className="flex-grow overflow-y-auto py-5 px-3 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-900/95">
        {/* Main Navigation */}
        <nav className="space-y-1 mb-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-x-3 py-2.5 px-3 rounded-lg transition-all duration-200 ${
                isActive(item.path)
                  ? 'bg-gradient-to-r from-blue-50 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 text-blue-700 dark:text-blue-300 font-medium shadow-sm'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/60 hover:translate-x-1'
              }`}
            >
              <div className={`${
                isActive(item.path)
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              } p-1.5 rounded-md shadow-sm transition-colors group-hover:text-blue-500`}>
                <item.icon className="h-5 w-5" />
              </div>
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Chat Sessions */}
        <div className="mb-6">
          <div className={`mb-2 ${collapsed ? "text-center" : "flex justify-between items-center"}`}>
            {!collapsed && (
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2">
                Chat Sessions
              </h3>
            )}
            <button
              onClick={collapsed ? handleCreateSession : toggleSessions}
              className="flex items-center justify-center h-6 w-6 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title={collapsed ? "New Chat" : isSessionsOpen ? "Collapse Sessions" : "Expand Sessions"}
            >
              {collapsed ? (
                <PlusIcon className="h-4 w-4" />
              ) : isSessionsOpen ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          {!collapsed && (
            <>
              <button
                onClick={handleCreateSession}
                className="w-full mb-3 py-2.5 px-4 flex items-center justify-center gap-x-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg"
              >
                <PlusIcon className="h-4 w-4" />
                <span>New Chat</span>
              </button>

              {isSessionsOpen && (
                <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200/60 dark:border-gray-700/40 bg-white dark:bg-gray-800/50 shadow-inner">
                  {sessionsLoading ? (
                    <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="inline-block animate-spin h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 dark:border-t-blue-400 rounded-full mr-2"></div>
                      Loading sessions...
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-6 px-2">
                      <div className="mb-2 mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <ChatBubbleLeftRightIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">No sessions yet</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create a new chat to get started</p>
                    </div>
                  ) : (
                    sessions.map((session, index) => (
                      <button
                        key={session._id}
                        onClick={() => setCurrentSession(session)}
                        className={`w-full text-left p-2.5 text-sm rounded-md transition-all duration-200 ${
                          currentSession?._id === session._id
                            ? 'bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        } ${index !== 0 ? 'border-t border-gray-100 dark:border-gray-700/30' : ''}`}
                      >
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 mr-3 h-8 w-8 flex items-center justify-center rounded-md ${
                            currentSession?._id === session._id
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}>
                            <ChatBubbleLeftRightIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium truncate ${
                              currentSession?._id === session._id
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {session.title}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {collapsed && (
            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={handleCreateSession}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white shadow-md transition-all duration-200 transform hover:scale-105"
                title="New Chat"
              >
                <PlusIcon className="h-4 w-4" />
              </button>

              <div className="w-full h-px bg-gray-200 dark:bg-gray-700 my-1"></div>

              {/* Simplified sessions list when collapsed */}
              {sessions.slice(0, 3).map((session) => (
                <button
                  key={session._id}
                  onClick={() => setCurrentSession(session)}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    currentSession?._id === session._id
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={session.title}
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                </button>
              ))}
              {sessions.length > 3 && (
                <div className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                  +{sessions.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collapse Control & Logout */}
      <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-gray-700/50 p-3 bg-gray-50 dark:bg-gray-800/80">
        <div className="flex items-center justify-between">
          <button
            onClick={toggleCollapse}
            className="flex items-center justify-center h-8 w-8 rounded-md bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-all duration-200 shadow-sm"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />}
          </button>

          {!collapsed && (
            <button
              onClick={actions?.logout}
              className="flex items-center justify-center px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-all duration-200 shadow-sm hover:shadow-md"
              title="Logout"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4 mr-1.5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          )}

          {collapsed && (
            <button
              onClick={actions?.logout}
              className="flex items-center justify-center h-8 w-8 rounded-md bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 shadow-sm"
              title="Logout"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;