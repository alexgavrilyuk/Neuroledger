// frontend/src/shared/layouts/CenteredLayout.jsx
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';

const CenteredLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-grid-white/[0.2]" style={{ backgroundSize: '24px 24px' }}></div>
      </div>
      
      {/* Decorative blurs */}
      <div className="absolute top-20 -left-20 w-96 h-96 bg-blue-500 opacity-30 rounded-full mix-blend-screen filter blur-[128px]"></div>
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-purple-500 opacity-20 rounded-full mix-blend-screen filter blur-[128px]"></div>
      
      {/* Theme switcher - absolute positioned */}
      <div className="absolute top-5 right-5 z-50">
        <ThemeSwitcher />
      </div>
      
      {/* Main container */}
      <div className="w-full max-w-5xl relative z-10">
        <div className="flex flex-col lg:flex-row bg-white/10 dark:bg-gray-900/20 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          {/* Branding Section */}
          <div className="lg:w-5/12 p-6 sm:p-10 lg:p-12 flex flex-col">
            <div className="mb-8">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-300"></div>
                  <div className="relative bg-gradient-to-r from-blue-500 to-indigo-600 p-2 rounded-lg">
                    <svg 
                      className="h-8 w-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 48 48"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6"
                      />
                    </svg>
                  </div>
                </div>
                <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-indigo-100">NeuroLedger</span>
              </Link>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Financial insights <br/>powered by AI</h1>
            <p className="text-blue-100/80 mb-8">Unlock the full potential of your financial data with intelligent analysis and visualizations.</p>
            
            {/* Features */}
            <div className="space-y-4 mt-auto">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Instant Analysis</h3>
                  <p className="mt-1 text-sm text-blue-100/70">Get insights in seconds using natural language</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Interactive Reports</h3>
                  <p className="mt-1 text-sm text-blue-100/70">Data visualizations that reveal hidden patterns</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Secure & Private</h3>
                  <p className="mt-1 text-sm text-blue-100/70">Enterprise-grade security for your data</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Form Section */}
          <div className="lg:w-7/12 bg-white dark:bg-gray-800 p-6 sm:p-10 md:p-12">
            <div className="max-w-md mx-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CenteredLayout;