import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FaChevronDown, FaChevronUp, FaCode, FaCopy, FaCheck } from 'react-icons/fa';
import { useTheme } from '../../../shared/hooks/useTheme';

const CodeBlock = ({ language, code, isStreaming = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { isDarkMode } = useTheme();
  
  // Reset copied state after 2 seconds
  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);
  
  // Handle copy to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        setIsCopied(true);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };
  
  // Normalize language for syntax highlighter
  const normalizeLanguage = (lang) => {
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'java': 'java',
      'cs': 'csharp',
      'c': 'c',
      'cpp': 'cpp',
      'php': 'php',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'yaml': 'yaml',
      'markdown': 'markdown',
      'md': 'markdown',
      'sql': 'sql',
      'shell': 'bash',
      'bash': 'bash',
      'sh': 'bash',
    };
    
    return languageMap[lang.toLowerCase()] || lang.toLowerCase();
  };
  
  // Choose appropriate style based on theme
  const codeStyle = isDarkMode ? vscDarkPlus : prism;
  const normalizedLanguage = normalizeLanguage(language);
  
  // Determine if we should show the collapse control
  // Only add for longer code blocks that aren't streaming
  const showCollapseControl = !isStreaming && code.split('\n').length > 10;
  
  // Determine what code to show (either full or first few lines)
  const displayCode = isCollapsed 
    ? code.split('\n').slice(0, 3).join('\n') + (code.split('\n').length > 3 ? '\n// ...' : '')
    : code;
  
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-soft-sm dark:shadow-soft-dark-md">
      {/* Header with language and controls */}
      <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 flex items-center justify-between text-gray-700 dark:text-gray-300">
        <div className="flex items-center space-x-2">
          <FaCode className="h-3.5 w-3.5" />
          <span className="text-xs font-mono">{normalizedLanguage}</span>
          {isStreaming && (
            <span className="text-xs italic text-blue-500 dark:text-blue-400 animate-pulse ml-2">
              writing...
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {/* Copy button */}
          <button
            onClick={copyToClipboard}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <FaCheck className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <FaCopy className="h-3.5 w-3.5" />
            )}
          </button>
          
          {/* Collapse/Expand button (only for longer code blocks) */}
          {showCollapseControl && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={isCollapsed ? "Expand code" : "Collapse code"}
            >
              {isCollapsed ? (
                <FaChevronDown className="h-3.5 w-3.5" />
              ) : (
                <FaChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
      
      {/* Syntax highlighted code */}
      <SyntaxHighlighter
        language={normalizedLanguage}
        style={codeStyle}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          borderRadius: 0,
          maxHeight: isCollapsed ? '100px' : '400px',
          overflow: 'auto',
        }}
      >
        {displayCode}
      </SyntaxHighlighter>
      
      {/* Collapsed indicator */}
      {isCollapsed && (
        <div 
          className="text-center py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setIsCollapsed(false)}
        >
          Click to expand ({code.split('\n').length} lines)
        </div>
      )}
    </div>
  );
};

export default CodeBlock; 